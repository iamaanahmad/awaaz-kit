import Dexie, { type Table } from 'dexie';
import type {
  AuditEventRecord,
  BillItemRecord,
  BillRecord,
  CustomerRecord,
  Mutation,
  OrderItemRecord,
  OrderRecord,
  ProductRecord,
  ShopRecord,
  SyncMetaRecord,
} from './records.js';

export const DB_NAME = 'awaaz-kit';
export const DB_VERSION = 1;

/** Dexie index strings for version 1 (`&` unique, `[a+b]` compound). */
export const DB_V1_STORES = {
  shops: 'id, name',
  products: 'id, shopId, [shopId+active], updatedAt, deletedAt',
  customers: 'id, shopId, name, updatedAt, deletedAt',
  orders: 'id, shopId, &[shopId+localNumber], status, syncState, createdAt, [shopId+createdAt]',
  orderItems: 'id, orderId',
  bills:
    'id, shopId, &[shopId+receiptNumber], kind, status, syncState, finalizedAt, correctsBillId, [shopId+finalizedAt]',
  billItems: 'id, billId',
  outbox:
    'mutationId, state, nextAttemptAt, [state+nextAttemptAt], entityType, entityId, createdAt',
  syncMeta: 'key',
  auditEvents: 'id, entityType, entityId, createdAt',
} as const;

/** Thrown when a write targets a finalized bill's content (Req 13.13). */
export class ImmutableRecordError extends Error {
  readonly table: 'bills' | 'billItems';
  readonly recordId: string;

  constructor(table: ImmutableRecordError['table'], recordId: string) {
    super(`Finalized bill data is immutable (${table}/${recordId}).`);
    this.name = 'ImmutableRecordError';
    this.table = table;
    this.recordId = recordId;
  }
}

/** Sync bookkeeping fields that may change on a finalized bill. */
const FINALIZED_BILL_MUTABLE_FIELDS = ['syncState', 'conflict'] as const;

function isMutableBookkeepingKey(key: string): boolean {
  return FINALIZED_BILL_MUTABLE_FIELDS.some((f) => key === f || key.startsWith(`${f}.`));
}

export class AwaazDb extends Dexie {
  shops!: Table<ShopRecord, string>;
  products!: Table<ProductRecord, string>;
  customers!: Table<CustomerRecord, string>;
  orders!: Table<OrderRecord, string>;
  orderItems!: Table<OrderItemRecord, string>;
  bills!: Table<BillRecord, string>;
  billItems!: Table<BillItemRecord, string>;
  outbox!: Table<Mutation, string>;
  syncMeta!: Table<SyncMetaRecord, string>;
  auditEvents!: Table<AuditEventRecord, string>;

  constructor(
    name: string = DB_NAME,
    options?: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange },
  ) {
    super(name, options);
    this.version(DB_VERSION).stores(DB_V1_STORES);

    // Finalized bills are immutable except syncState/conflict (Req 13.13).
    this.bills.hook('updating', (modifications, primKey, obj) => {
      if (obj.status !== 'finalized') return;
      const keys = Object.keys(modifications as Record<string, unknown>);
      if (keys.every(isMutableBookkeepingKey)) return;
      throw new ImmutableRecordError('bills', String(primKey));
    });
    // Bill items are only written with a finalized bill and never edited.
    this.billItems.hook('updating', (modifications, primKey) => {
      if (Object.keys(modifications as Record<string, unknown>).length === 0) return;
      throw new ImmutableRecordError('billItems', String(primKey));
    });
    // Finalized bills and their items cannot be deleted. Bill items only exist under a
    // finalized bill (written in the same commit), so every item delete is rejected.
    // Only the user-confirmed admin purge (clearAll) may bypass this, via `purgeAllTables()`.
    this.bills.hook('deleting', (primKey, obj) => {
      if (this.purging || obj.status !== 'finalized') return;
      throw new ImmutableRecordError('bills', String(primKey));
    });
    this.billItems.hook('deleting', (primKey) => {
      if (this.purging) return;
      throw new ImmutableRecordError('billItems', String(primKey));
    });
  }

  private purging = false;

  /**
   * Empties every table. Used only by the admin "clear local data" flow (Req 15.9), which the user
   * has already confirmed. Must be called inside a rw transaction over all tables.
   */
  async purgeAllTables(): Promise<void> {
    this.purging = true;
    try {
      await Promise.all(this.tables.map((t) => t.clear()));
    } finally {
      this.purging = false;
    }
  }
}
