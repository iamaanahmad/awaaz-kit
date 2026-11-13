import { META_KEYS, type Toggle } from './admin.js';
import type {
  BillItemRecord,
  BillRecord,
  CustomerRecord,
  Mutation,
  OrderItemRecord,
  OrderRecord,
  ProductRecord,
} from './records.js';
import type { AwaazDb } from './schema.js';

/**
 * Adapter from local-data to the sync engine's ports.
 *
 * The port shapes below are declared structurally so this package never imports
 * `@awaaz-kit/sync-engine` (dependency rules, Req 15.3). The result of
 * `createSyncStore` is assignable to the engine's `SyncEngineStore`. Both apps
 * share this one adapter.
 */

export type SyncTable =
  'products' | 'customers' | 'orders' | 'order_items' | 'bills' | 'bill_items';

export interface SyncPullCursor {
  readonly updatedAt: string;
  readonly rowId: string;
}

export interface SyncMutationFailure {
  readonly kind: 'network' | 'validation' | 'auth' | 'permission' | 'server';
  readonly message: string;
  readonly at: string;
}

export interface SyncPushStore {
  listDue(now: Date, limit: number): Promise<Mutation[]>;
  markSyncing(mutationId: string): Promise<void>;
  markSynced(mutation: Mutation): Promise<void>;
  markRetry(
    mutationId: string,
    patch: { attempts: number; nextAttemptAt: string; lastError: SyncMutationFailure },
  ): Promise<void>;
  markFailed(
    mutation: Mutation,
    patch: { attempts: number; lastError: SyncMutationFailure },
  ): Promise<void>;
}

export type SyncPullChange =
  | {
      readonly type: 'apply_catalog';
      readonly table: SyncTable;
      readonly rowId: string;
      readonly data: Record<string, unknown>;
    }
  | {
      readonly type: 'insert';
      readonly table: SyncTable;
      readonly rowId: string;
      readonly data: Record<string, unknown>;
    }
  | {
      readonly type: 'conflict';
      readonly conflict: {
        readonly table: SyncTable;
        readonly rowId: string;
        readonly localUpdatedAt: string;
        readonly remoteUpdatedAt: string;
        readonly remoteDeviceId: string | null;
        readonly detectedAt: string;
      };
    };

export interface SyncPullStore {
  getCursor(table: SyncTable): Promise<SyncPullCursor | null>;
  lookup(
    table: SyncTable,
    rowId: string,
  ): Promise<{ updatedAt: string; deviceId?: string | undefined } | undefined>;
  applyPage(
    table: SyncTable,
    changes: readonly SyncPullChange[],
    cursor: SyncPullCursor | null,
    syncedAt: string,
  ): Promise<void>;
}

export interface SyncStoreSettings {
  readonly optedIn: boolean;
  readonly syncTranscripts?: { readonly enabled: boolean; readonly at?: string } | undefined;
  readonly shop: { readonly id: string; readonly name: string } | null;
  readonly deviceId: string;
}

export interface SyncStore {
  getSettings(): Promise<SyncStoreSettings>;
  readonly push: SyncPushStore;
  readonly pull: SyncPullStore;
  countPending(): Promise<number>;
  countFailed(): Promise<number>;
  getLastSyncedAt(): Promise<string | null>;
  resolveBillRowId(localBillId: string): string | undefined;
}

export const LAST_SYNC_KEY = 'lastSuccessfulSyncAt';
export const pullCursorKey = (table: SyncTable): string => `pullCursor:${table}`;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Gives an incoming number a unique suffix when this device already uses it (numbers are unique per shop). */
function dedupe(number: string, taken: boolean, rowId: string): string {
  return taken ? `${number}-${rowId.slice(0, 4)}` : number;
}

export function createSyncStore(db: AwaazDb, opts: { now?: () => Date } = {}): SyncStore {
  const now = opts.now ?? (() => new Date());
  const billRowIds = new Map<string, string>();

  const readMeta = async <T>(key: string): Promise<T | undefined> =>
    (await db.syncMeta.get(key))?.value as T | undefined;

  const findOrder = async (rowId: string): Promise<OrderRecord | undefined> =>
    (await db.orders.get(rowId)) ?? (await db.orders.filter((o) => o.mutationId === rowId).first());
  const findBill = async (rowId: string): Promise<BillRecord | undefined> =>
    (await db.bills.get(rowId)) ?? (await db.bills.filter((b) => b.mutationId === rowId).first());

  /** Updates the record's syncState (orders and bills only; catalog rows have none). */
  async function setRecordState(m: Mutation, state: OrderRecord['syncState']): Promise<void> {
    if (m.payload.kind === 'order') await db.orders.update(m.entityId, { syncState: state });
    else if (m.payload.kind === 'bill' || m.payload.kind === 'bill_correction') {
      await db.bills.update(m.entityId, { syncState: state });
    }
  }

  const push: SyncPushStore = {
    async listDue(at, limit) {
      const rows = await db.outbox
        .where('[state+nextAttemptAt]')
        .between(['pending', ''], ['pending', at.toISOString()], true, true)
        .toArray();
      rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      const due = rows.slice(0, limit);
      // The engine resolves correction targets synchronously, so load them here.
      for (const m of due) {
        if (m.payload.kind !== 'bill_correction') continue;
        const target = m.payload.bill.correctsBillId;
        if (target === null || billRowIds.has(target)) continue;
        const original = await db.bills.get(target);
        if (original) billRowIds.set(target, original.mutationId);
      }
      return due;
    },
    async markSyncing(mutationId) {
      await db.transaction('rw', db.outbox, db.orders, db.bills, async () => {
        const m = await db.outbox.get(mutationId);
        if (!m) return;
        await db.outbox.update(mutationId, { state: 'syncing' });
        await setRecordState(m, 'syncing');
      });
    },
    async markSynced(mutation) {
      await db.transaction('rw', db.outbox, db.orders, db.bills, db.syncMeta, async () => {
        await db.outbox.update(mutation.mutationId, { state: 'synced', lastError: null });
        await setRecordState(mutation, 'synced');
        await db.syncMeta.put({ key: LAST_SYNC_KEY, value: now().toISOString() });
      });
    },
    async markRetry(mutationId, patch) {
      await db.transaction('rw', db.outbox, db.orders, db.bills, async () => {
        const m = await db.outbox.get(mutationId);
        await db.outbox.update(mutationId, {
          state: 'pending',
          attempts: patch.attempts,
          nextAttemptAt: patch.nextAttemptAt,
          lastError: patch.lastError,
        });
        if (m) await setRecordState(m, 'pending');
      });
    },
    async markFailed(mutation, patch) {
      await db.transaction('rw', db.outbox, db.orders, db.bills, async () => {
        await db.outbox.update(mutation.mutationId, {
          state: 'failed',
          attempts: patch.attempts,
          lastError: patch.lastError,
        });
        await setRecordState(mutation, 'failed');
      });
    },
  };

  const pull: SyncPullStore = {
    async getCursor(table) {
      return (await readMeta<SyncPullCursor | null>(pullCursorKey(table))) ?? null;
    },
    async lookup(table, rowId) {
      switch (table) {
        case 'products': {
          const r = await db.products.get(rowId);
          return r && { updatedAt: r.updatedAt };
        }
        case 'customers': {
          const r = await db.customers.get(rowId);
          return r && { updatedAt: r.updatedAt };
        }
        case 'orders': {
          const r = await findOrder(rowId);
          return r && { updatedAt: r.updatedAt };
        }
        case 'bills': {
          const r = await findBill(rowId);
          return r && { updatedAt: r.finalizedAt ?? r.createdAt };
        }
        case 'order_items':
          return (await db.orderItems.get(rowId)) ? { updatedAt: '' } : undefined;
        case 'bill_items':
          return (await db.billItems.get(rowId)) ? { updatedAt: '' } : undefined;
      }
    },
    async applyPage(table, changes, cursor, syncedAt) {
      await db.transaction(
        'rw',
        [db.products, db.customers, db.orders, db.orderItems, db.bills, db.billItems, db.syncMeta],
        async () => {
          const shopId = (await readMeta<string>(META_KEYS.activeShopId)) ?? '';
          for (const change of changes) {
            if (change.type === 'conflict') {
              const c = change.conflict;
              const order = await findOrder(c.rowId);
              if (order) {
                await db.orders.update(order.id, {
                  syncState: 'conflict',
                  conflict: {
                    detectedAt: c.detectedAt,
                    remoteUpdatedAt: c.remoteUpdatedAt,
                    message: "Changed on another device. This device's copy was kept.",
                  },
                });
              }
              continue;
            }
            await applyChange(change, shopId);
          }
          if (cursor) await db.syncMeta.put({ key: pullCursorKey(table), value: cursor });
          await db.syncMeta.put({ key: LAST_SYNC_KEY, value: syncedAt });
        },
      );
    },
  };

  async function applyChange(
    change: Extract<SyncPullChange, { type: 'apply_catalog' | 'insert' }>,
    shopId: string,
  ): Promise<void> {
    const { rowId, data: d } = change;
    switch (change.table) {
      case 'products': {
        const brand = optStr(d['brand']);
        const rec: ProductRecord = {
          id: rowId,
          shopId,
          name: str(d['name']),
          aliases: Array.isArray(d['aliases']) ? (d['aliases'] as string[]) : [],
          ...(brand === undefined ? {} : { brand }),
          unit: d['unit'] as ProductRecord['unit'],
          pricePaise: num(d['pricePaise']),
          active: d['active'] === true,
          updatedAt: str(d['clientUpdatedAt']),
          deletedAt: strOrNull(d['deletedAt']),
        };
        await db.products.put(rec);
        return;
      }
      case 'customers': {
        const phone = optStr(d['phone']);
        const notes = optStr(d['notes']);
        const rec: CustomerRecord = {
          id: rowId,
          shopId,
          name: str(d['name']),
          ...(phone === undefined ? {} : { phone }),
          ...(notes === undefined ? {} : { notes }),
          isSample: d['isSample'] === true,
          updatedAt: str(d['clientUpdatedAt']),
          deletedAt: strOrNull(d['deletedAt']),
        };
        await db.customers.put(rec);
        return;
      }
      case 'orders': {
        if (await findOrder(rowId)) return;
        const taken = await db.orders
          .where('[shopId+localNumber]')
          .equals([shopId, str(d['localNumber'])])
          .first();
        const created = str(d['clientCreatedAt']);
        const rec: OrderRecord = {
          id: rowId,
          shopId,
          localNumber: dedupe(str(d['localNumber']), taken !== undefined, rowId),
          customerId: strOrNull(d['customerId']),
          walkIn: d['walkIn'] === true,
          status: d['status'] as OrderRecord['status'],
          fulfillment: d['fulfillment'] as OrderRecord['fulfillment'],
          note: strOrNull(d['note']),
          totalEstimatePaise: num(d['totalEstimatePaise']),
          rawTranscript: str(d['rawTranscript']),
          normalizedText: str(d['normalizedText']),
          extraction: null,
          mutationId: str(d['mutationId']),
          syncState: 'synced',
          createdAt: created,
          updatedAt: created,
        };
        await db.orders.add(rec);
        return;
      }
      case 'order_items': {
        const parent = await findOrder(str(d['orderRowId']));
        const index = num(d['index']);
        if (parent && parent.id !== rowId) {
          // Our own order's items come back from the server; they already exist locally.
          const own = await db.orderItems
            .where('orderId')
            .equals(parent.id)
            .filter((i) => i.index === index)
            .first();
          if (own) return;
        }
        const rec: OrderItemRecord = {
          id: rowId,
          orderId: parent?.id ?? str(d['orderRowId']),
          index,
          productId: strOrNull(d['productId']),
          nameSnapshot: str(d['nameSnapshot']),
          qtyMilli: num(d['qtyMilli']),
          unit: d['unit'] as OrderItemRecord['unit'],
          unitPricePaise: numOrNull(d['unitPricePaise']),
          lineTotalPaise: numOrNull(d['lineTotalPaise']),
          resolutionStatus: d['resolutionStatus'] as OrderItemRecord['resolutionStatus'],
        };
        await db.orderItems.put(rec);
        return;
      }
      case 'bills': {
        if (await findBill(rowId)) return;
        const taken = await db.bills
          .where('[shopId+receiptNumber]')
          .equals([shopId, str(d['receiptNumber'])])
          .first();
        const targetRow = optStr(d['correctsBillRowId']);
        const target = targetRow ? await findBill(targetRow) : undefined;
        const rec: BillRecord = {
          id: rowId,
          shopId,
          receiptNumber: dedupe(str(d['receiptNumber']), taken !== undefined, rowId),
          kind: d['kind'] as BillRecord['kind'],
          correctsBillId: targetRow ? (target?.id ?? targetRow) : null,
          customerId: strOrNull(d['customerId']),
          status: 'finalized',
          subtotalPaise: num(d['subtotalPaise']),
          discountPaise: num(d['discountPaise']),
          taxPaise: num(d['taxPaise']),
          totalPaise: num(d['totalPaise']),
          rawTranscript: str(d['rawTranscript']),
          normalizedText: str(d['normalizedText']),
          mutationId: str(d['mutationId']),
          syncState: 'synced',
          createdAt: str(d['clientCreatedAt']),
          finalizedAt: str(d['finalizedAt']),
        };
        await db.bills.add(rec);
        return;
      }
      case 'bill_items': {
        const parent = await findBill(str(d['billRowId']));
        const index = num(d['index']);
        if (parent && parent.id !== rowId) {
          const own = await db.billItems
            .where('billId')
            .equals(parent.id)
            .filter((i) => i.index === index)
            .first();
          if (own) return;
        }
        const rec: BillItemRecord = {
          id: rowId,
          billId: parent?.id ?? str(d['billRowId']),
          index,
          productId: strOrNull(d['productId']),
          nameSnapshot: str(d['nameSnapshot']),
          qtyMilli: num(d['qtyMilli']),
          unit: d['unit'] as BillItemRecord['unit'],
          unitPricePaise: num(d['unitPricePaise']),
          lineTotalPaise: num(d['lineTotalPaise']),
        };
        await db.billItems.put(rec);
        return;
      }
    }
  }

  return {
    async getSettings() {
      const [optIn, transcripts, activeShopId, storedDevice] = await Promise.all([
        readMeta<Toggle>(META_KEYS.syncOptIn),
        readMeta<Toggle>(META_KEYS.syncTranscripts),
        readMeta<string>(META_KEYS.activeShopId),
        readMeta<string>(META_KEYS.deviceId),
      ]);
      const shop = activeShopId ? await db.shops.get(activeShopId) : undefined;
      let deviceId = storedDevice;
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        await db.syncMeta.put({ key: META_KEYS.deviceId, value: deviceId });
      }
      return {
        optedIn: optIn?.enabled === true,
        // Transcripts never sync unless explicitly enabled (Req 16.20).
        syncTranscripts:
          transcripts?.enabled === true
            ? { enabled: true, at: transcripts.at }
            : { enabled: false },
        shop: shop ? { id: shop.id, name: shop.name } : null,
        deviceId,
      };
    },
    push,
    pull,
    async countPending() {
      return db.outbox.where('state').anyOf('pending', 'syncing').count();
    },
    countFailed: () => db.outbox.where('state').equals('failed').count(),
    async getLastSyncedAt() {
      return (await readMeta<string>(LAST_SYNC_KEY)) ?? null;
    },
    resolveBillRowId: (localBillId) => billRowIds.get(localBillId),
  };
}
