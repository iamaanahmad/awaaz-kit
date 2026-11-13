/**
 * Pull algorithm: reads remote changes per table with a resumable cursor,
 * validates rows, and decides how each applies locally.
 *
 * Rules:
 * - Catalog (products, customers): last-write-wins on `clientUpdatedAt`, with
 *   `deviceId` as a deterministic tie-break so every device converges (Req 16.13).
 * - Orders: a newer remote order never overwrites the local one; the local row
 *   is kept and a `conflict` is recorded (Req 16.12).
 * - Bills and bill items: a local finalized Bill is never overwritten; unknown
 *   remote bills, including corrections, are inserted (Req 16.14).
 * - The cursor is persisted in the same `applyPage` call that applies the page,
 *   so a crash resumes from the last applied page (Req 16.11).
 */
import {
  SyncError,
  type PullCursor,
  type RemoteRow,
  type RemoteTable,
  type SyncErrorKind,
  type SyncRemote,
} from './contracts';
import { parseRemoteRow } from './remote-row';

export const PULL_PAGE_SIZE = 50;

/** Children before headers, mirroring push order. */
export const PULL_TABLE_ORDER: readonly RemoteTable[] = [
  'products',
  'customers',
  'order_items',
  'orders',
  'bill_items',
  'bills',
];

const CATALOG_TABLES: ReadonlySet<RemoteTable> = new Set(['products', 'customers']);
const BILL_TABLES: ReadonlySet<RemoteTable> = new Set(['bills', 'bill_items']);

/** What the local database knows about a record with a given remote row id. */
export interface LocalSnapshot {
  readonly updatedAt: string;
  /** Device that last wrote the local record. Defaults to this device. */
  readonly deviceId?: string | undefined;
}

export interface ConflictMetadata {
  readonly table: RemoteTable;
  readonly rowId: string;
  readonly localUpdatedAt: string;
  readonly remoteUpdatedAt: string;
  readonly remoteDeviceId: string | null;
  readonly detectedAt: string;
}

export type PullChange =
  /** Overwrite the local catalog record with the remote values. */
  | {
      readonly type: 'apply_catalog';
      readonly table: RemoteTable;
      readonly rowId: string;
      readonly data: Record<string, unknown>;
    }
  /** Insert a record that does not exist locally (orders, bills, corrections, items). */
  | {
      readonly type: 'insert';
      readonly table: RemoteTable;
      readonly rowId: string;
      readonly data: Record<string, unknown>;
    }
  /** Keep the local record, set its Sync_State to `conflict` and store metadata. */
  | { readonly type: 'conflict'; readonly conflict: ConflictMetadata };

export interface PullStore {
  getCursor(table: RemoteTable): Promise<PullCursor | null>;
  /** Looks up a local record by its remote row id. */
  lookup(table: RemoteTable, rowId: string): Promise<LocalSnapshot | undefined>;
  /**
   * One local transaction: applies `changes`, writes the table cursor (when not
   * null) and the last successful sync time.
   */
  applyPage(
    table: RemoteTable,
    changes: readonly PullChange[],
    cursor: PullCursor | null,
    syncedAt: string,
  ): Promise<void>;
}

export interface PullDeps {
  readonly remote: SyncRemote;
  readonly store: PullStore;
  readonly remoteShopId: string;
  readonly deviceId: string;
  readonly now: () => Date;
  readonly pageSize?: number | undefined;
}

export interface PullResult {
  readonly applied: number;
  readonly conflicts: number;
  readonly skipped: number;
  /** Rows that failed Zod validation and were ignored. */
  readonly invalid: number;
  readonly pages: number;
  readonly stoppedBy: SyncErrorKind | null;
}

export type CatalogWinner = 'remote' | 'local';

/**
 * Catalog last-write-wins. Newer `updatedAt` wins; on equal timestamps the
 * greater `deviceId` wins, so both sides pick the same winner. Identical
 * timestamp and device means the same write: keep local.
 */
export function catalogWinner(
  local: { updatedAt: string; deviceId: string },
  remote: { updatedAt: string; deviceId: string },
): CatalogWinner {
  const lt = Date.parse(local.updatedAt);
  const rt = Date.parse(remote.updatedAt);
  if (lt !== rt && !Number.isNaN(lt) && !Number.isNaN(rt)) return rt > lt ? 'remote' : 'local';
  if (local.updatedAt !== remote.updatedAt && (Number.isNaN(lt) || Number.isNaN(rt))) {
    return remote.updatedAt > local.updatedAt ? 'remote' : 'local';
  }
  return remote.deviceId > local.deviceId ? 'remote' : 'local';
}

type Decision = PullChange | 'skip';

async function decide(
  table: RemoteTable,
  row: RemoteRow,
  data: Record<string, unknown>,
  deps: PullDeps,
): Promise<Decision> {
  const local = await deps.store.lookup(table, row.$id);
  const remoteDevice = typeof data['deviceId'] === 'string' ? data['deviceId'] : null;

  if (CATALOG_TABLES.has(table)) {
    if (!local) return { type: 'apply_catalog', table, rowId: row.$id, data };
    const winner = catalogWinner(
      { updatedAt: local.updatedAt, deviceId: local.deviceId ?? deps.deviceId },
      { updatedAt: String(data['clientUpdatedAt']), deviceId: remoteDevice ?? '' },
    );
    return winner === 'remote' ? { type: 'apply_catalog', table, rowId: row.$id, data } : 'skip';
  }

  if (!local) return { type: 'insert', table, rowId: row.$id, data };

  // Finalized bills and their items are immutable: never overwritten.
  if (BILL_TABLES.has(table)) return 'skip';

  if (table === 'orders') {
    // Our own pushed write comes back with a newer server timestamp; ignore it.
    if (remoteDevice === deps.deviceId) return 'skip';
    if (row.$updatedAt > local.updatedAt) {
      return {
        type: 'conflict',
        conflict: {
          table,
          rowId: row.$id,
          localUpdatedAt: local.updatedAt,
          remoteUpdatedAt: row.$updatedAt,
          remoteDeviceId: remoteDevice,
          detectedAt: deps.now().toISOString(),
        },
      };
    }
  }
  return 'skip';
}

/** Pulls every table, page by page. Never throws for remote errors. */
export async function pull(deps: PullDeps): Promise<PullResult> {
  const pageSize = deps.pageSize ?? PULL_PAGE_SIZE;
  let applied = 0;
  let conflicts = 0;
  let skipped = 0;
  let invalid = 0;
  let pages = 0;

  for (const table of PULL_TABLE_ORDER) {
    let cursor = await deps.store.getCursor(table);
    for (;;) {
      let page: { rows: RemoteRow[]; next: PullCursor | null };
      try {
        page = await deps.remote.pull(table, deps.remoteShopId, cursor, pageSize);
      } catch (e) {
        const kind = e instanceof SyncError ? e.kind : 'server';
        return { applied, conflicts, skipped, invalid, pages, stoppedBy: kind };
      }
      if (page.rows.length === 0) break;

      const changes: PullChange[] = [];
      for (const row of page.rows) {
        const parsed = parseRemoteRow(table, row);
        if (!parsed.ok || parsed.data['shopId'] !== deps.remoteShopId) {
          invalid += 1;
          continue;
        }
        const decision = await decide(table, row, parsed.data, deps);
        if (decision === 'skip') {
          skipped += 1;
        } else {
          changes.push(decision);
          if (decision.type === 'conflict') conflicts += 1;
          else applied += 1;
        }
      }

      // Only move the cursor forward; a non-advancing cursor ends the table.
      const next = page.next;
      const advances =
        next !== null &&
        (cursor === null ||
          next.updatedAt > cursor.updatedAt ||
          (next.updatedAt === cursor.updatedAt && next.rowId > cursor.rowId));
      try {
        await deps.store.applyPage(
          table,
          changes,
          advances ? next : null,
          deps.now().toISOString(),
        );
      } catch (e) {
        const kind = e instanceof SyncError ? e.kind : 'server';
        return { applied, conflicts, skipped, invalid, pages, stoppedBy: kind };
      }
      pages += 1;
      if (!advances) break;
      cursor = next;
    }
  }
  return { applied, conflicts, skipped, invalid, pages, stoppedBy: null };
}
