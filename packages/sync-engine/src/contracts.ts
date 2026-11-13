/** Sync transport contracts. Implemented by AppwriteRemote and InMemoryRemote. */

export const REMOTE_TABLES = [
  'products',
  'customers',
  'orders',
  'order_items',
  'bills',
  'bill_items',
] as const;

export type RemoteTable = (typeof REMOTE_TABLES)[number];

/** Appwrite-style permission strings, e.g. `read(team:abc)`. */
export interface RowPermissions {
  readonly read: readonly string[];
  readonly update: readonly string[];
  readonly delete: readonly string[];
}

export interface PullCursor {
  /** `$updatedAt` of the last applied row. */
  readonly updatedAt: string;
  /** Row id of the last applied row (tie-break for equal timestamps). */
  readonly rowId: string;
}

export interface RemoteRow {
  readonly $id: string;
  readonly $updatedAt: string;
  readonly [key: string]: unknown;
}

export type SyncErrorKind = 'network' | 'validation' | 'auth' | 'permission' | 'server';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;

  constructor(kind: SyncErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SyncError';
    this.kind = kind;
  }
}

export interface SyncRemote {
  signedIn(): Promise<{ userId: string } | null>;
  ensureShopTeam(local: { shopId: string; name: string }): Promise<{ remoteShopId: string }>;
  createOnce(
    table: RemoteTable,
    rowId: string,
    data: object,
    perm: RowPermissions,
  ): Promise<'created' | 'already_exists'>;
  upsertGuarded(
    table: RemoteTable,
    rowId: string,
    data: Record<string, unknown> & { clientUpdatedAt: string },
    perm: RowPermissions,
  ): Promise<'written' | 'stale'>;
  pull(
    table: RemoteTable,
    shopId: string,
    cursor: PullCursor | null,
    limit: number,
  ): Promise<{ rows: RemoteRow[]; next: PullCursor | null }>;
}
