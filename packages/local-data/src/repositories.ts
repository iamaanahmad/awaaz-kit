import { liveQuery } from 'dexie';
import type { AwaazDb } from './schema.js';
import {
  AuditEventRecordSchema,
  CustomerRecordSchema,
  MutationSchema,
  ProductRecordSchema,
  ShopRecordSchema,
  type AuditEventRecord,
  type BillItemRecord,
  type BillRecord,
  type ConflictInfo,
  type CustomerRecord,
  type Mutation,
  type MutationState,
  type OrderItemRecord,
  type OrderRecord,
  type ProductRecord,
  type ShopRecord,
  type SyncState,
} from './records.js';

/**
 * Repositories return plain objects and expose `liveQuery` wrappers for reactive
 * reads, so UI code never imports Dexie (Req 15.3).
 */

export interface LiveQuery<T> {
  subscribe(observer: { next?: (value: T) => void; error?: (error: unknown) => void }): {
    unsubscribe(): void;
  };
}

function live<T>(querier: () => T | Promise<T>): LiveQuery<T> {
  return {
    subscribe(observer) {
      const sub = liveQuery(querier).subscribe({
        next: (v) => observer.next?.(v),
        error: (e) => observer.error?.(e),
      });
      return { unsubscribe: () => sub.unsubscribe() };
    },
  };
}

export interface RepoDeps {
  now(): Date;
  newId(): string;
}

export interface ShopRepo {
  get(id: string): Promise<ShopRecord | undefined>;
  list(): Promise<ShopRecord[]>;
  /** Insert or replace a shop row after validation. */
  put(shop: ShopRecord): Promise<void>;
  watch(id: string): LiveQuery<ShopRecord | undefined>;
  watchAll(): LiveQuery<ShopRecord[]>;
}

export interface ProductRepo {
  get(id: string): Promise<ProductRecord | undefined>;
  /** Active, non-deleted products of a shop, sorted by name. */
  listActive(shopId: string): Promise<ProductRecord[]>;
  /** All rows including inactive and soft-deleted (sync, export). */
  listAll(shopId: string): Promise<ProductRecord[]>;
  put(product: ProductRecord): Promise<void>;
  bulkPut(products: ProductRecord[]): Promise<void>;
  /** Soft delete: sets `deletedAt` and `active: false`. */
  softDelete(id: string): Promise<void>;
  watchActive(shopId: string): LiveQuery<ProductRecord[]>;
}

export interface CustomerRepo {
  get(id: string): Promise<CustomerRecord | undefined>;
  list(shopId: string): Promise<CustomerRecord[]>;
  listAll(shopId: string): Promise<CustomerRecord[]>;
  put(customer: CustomerRecord): Promise<void>;
  bulkPut(customers: CustomerRecord[]): Promise<void>;
  softDelete(id: string): Promise<void>;
  watch(shopId: string): LiveQuery<CustomerRecord[]>;
}

export interface OrderWithItems {
  order: OrderRecord;
  items: OrderItemRecord[];
}

/** Orders are created only through `commitConfirmed`; this repo reads and updates sync state. */
export interface OrderRepo {
  get(id: string): Promise<OrderRecord | undefined>;
  getWithItems(id: string): Promise<OrderWithItems | undefined>;
  /** Newest first. */
  list(shopId: string, limit?: number): Promise<OrderRecord[]>;
  setSyncState(id: string, state: SyncState, conflict?: ConflictInfo): Promise<void>;
  watch(id: string): LiveQuery<OrderWithItems | undefined>;
  watchRecent(shopId: string, limit?: number): LiveQuery<OrderRecord[]>;
}

export interface BillWithItems {
  bill: BillRecord;
  items: BillItemRecord[];
}

/**
 * Bills are created only through `commitConfirmed`. There is deliberately no
 * update method for bill content: finalized bills are immutable (Req 13.13).
 * Only the sync bookkeeping fields can change.
 */
export interface BillRepo {
  get(id: string): Promise<BillRecord | undefined>;
  getWithItems(id: string): Promise<BillWithItems | undefined>;
  /** Newest first by finalization time. */
  list(shopId: string, limit?: number): Promise<BillRecord[]>;
  /** Void/correction rows that point at a bill. */
  listCorrections(billId: string): Promise<BillRecord[]>;
  /** Touches only `syncState` and `conflict`. */
  setSyncState(id: string, state: SyncState, conflict?: ConflictInfo): Promise<void>;
  watch(id: string): LiveQuery<BillWithItems | undefined>;
  watchRecent(shopId: string, limit?: number): LiveQuery<BillRecord[]>;
}

export interface OutboxRepo {
  get(mutationId: string): Promise<Mutation | undefined>;
  /** Mutations in `pending` state whose `nextAttemptAt` is due, in creation order. */
  listDue(now: Date, limit?: number): Promise<Mutation[]>;
  /** All mutations that are not `synced`, in creation order. */
  listUnsynced(): Promise<Mutation[]>;
  enqueue(mutation: Mutation): Promise<void>;
  setState(mutationId: string, state: MutationState): Promise<void>;
  /** Replaces the mutable bookkeeping fields. */
  update(
    mutationId: string,
    patch: Partial<Pick<Mutation, 'attempts' | 'nextAttemptAt' | 'state' | 'lastError'>>,
  ): Promise<void>;
  /** Number of mutations not yet synced (pending, syncing or failed). */
  countUnsynced(): Promise<number>;
  watchCountUnsynced(): LiveQuery<number>;
}

export interface SyncMetaRepo {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  watch<T = unknown>(key: string): LiveQuery<T | undefined>;
}

export interface AuditRepo {
  add(event: AuditEventRecord): Promise<void>;
  listForEntity(entityType: string, entityId: string): Promise<AuditEventRecord[]>;
  listRecent(limit?: number): Promise<AuditEventRecord[]>;
}

export interface Repositories {
  shops: ShopRepo;
  products: ProductRepo;
  customers: CustomerRepo;
  orders: OrderRepo;
  bills: BillRepo;
  outbox: OutboxRepo;
  meta: SyncMetaRepo;
  audit: AuditRepo;
}

export function createRepositories(db: AwaazDb, deps: RepoDeps): Repositories {
  const nowIso = () => deps.now().toISOString();

  const shops: ShopRepo = {
    get: (id) => db.shops.get(id),
    list: () => db.shops.orderBy('name').toArray(),
    async put(shop) {
      await db.shops.put(ShopRecordSchema.parse(shop));
    },
    watch: (id) => live(() => db.shops.get(id)),
    watchAll: () => live(() => db.shops.orderBy('name').toArray()),
  };

  const activeProducts = async (shopId: string) => {
    // Booleans are not valid IndexedDB keys, so filter in memory.
    const all = await db.products.where('shopId').equals(shopId).toArray();
    return all
      .filter((p) => p.active && p.deletedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const products: ProductRepo = {
    get: (id) => db.products.get(id),
    listActive: activeProducts,
    listAll: (shopId) => db.products.where('shopId').equals(shopId).toArray(),
    async put(product) {
      await db.products.put(ProductRecordSchema.parse(product));
    },
    async bulkPut(rows) {
      await db.products.bulkPut(rows.map((r) => ProductRecordSchema.parse(r)));
    },
    async softDelete(id) {
      const at = nowIso();
      await db.products.update(id, { deletedAt: at, active: false, updatedAt: at });
    },
    watchActive: (shopId) => live(() => activeProducts(shopId)),
  };

  const liveCustomers = async (shopId: string) => {
    const all = await db.customers.where('shopId').equals(shopId).toArray();
    return all.filter((c) => c.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name));
  };

  const customers: CustomerRepo = {
    get: (id) => db.customers.get(id),
    list: liveCustomers,
    listAll: (shopId) => db.customers.where('shopId').equals(shopId).toArray(),
    async put(customer) {
      await db.customers.put(CustomerRecordSchema.parse(customer));
    },
    async bulkPut(rows) {
      await db.customers.bulkPut(rows.map((r) => CustomerRecordSchema.parse(r)));
    },
    async softDelete(id) {
      const at = nowIso();
      await db.customers.update(id, { deletedAt: at, updatedAt: at });
    },
    watch: (shopId) => live(() => liveCustomers(shopId)),
  };

  const orderWithItems = async (id: string): Promise<OrderWithItems | undefined> => {
    const order = await db.orders.get(id);
    if (!order) return undefined;
    const items = await db.orderItems.where('orderId').equals(id).sortBy('index');
    return { order, items };
  };
  const recentOrders = (shopId: string, limit = 50) =>
    db.orders
      .where('[shopId+createdAt]')
      .between([shopId, ''], [shopId, '\uffff'])
      .reverse()
      .limit(limit)
      .toArray();

  const orders: OrderRepo = {
    get: (id) => db.orders.get(id),
    getWithItems: orderWithItems,
    list: (shopId, limit) => recentOrders(shopId, limit),
    async setSyncState(id, state, conflict) {
      await db.orders
        .where('id')
        .equals(id)
        .modify((o) => {
          o.syncState = state;
          if (conflict) o.conflict = conflict;
          else delete o.conflict;
        });
    },
    watch: (id) => live(() => orderWithItems(id)),
    watchRecent: (shopId, limit) => live(() => recentOrders(shopId, limit)),
  };

  const billWithItems = async (id: string): Promise<BillWithItems | undefined> => {
    const bill = await db.bills.get(id);
    if (!bill) return undefined;
    const items = await db.billItems.where('billId').equals(id).sortBy('index');
    return { bill, items };
  };
  const recentBills = (shopId: string, limit = 50) =>
    db.bills
      .where('[shopId+finalizedAt]')
      .between([shopId, ''], [shopId, '\uffff'])
      .reverse()
      .limit(limit)
      .toArray();

  const bills: BillRepo = {
    get: (id) => db.bills.get(id),
    getWithItems: billWithItems,
    list: (shopId, limit) => recentBills(shopId, limit),
    listCorrections: (billId) => db.bills.where('correctsBillId').equals(billId).toArray(),
    async setSyncState(id, state, conflict) {
      await db.bills
        .where('id')
        .equals(id)
        .modify((b) => {
          b.syncState = state;
          if (conflict) b.conflict = conflict;
          else delete b.conflict;
        });
    },
    watch: (id) => live(() => billWithItems(id)),
    watchRecent: (shopId, limit) => live(() => recentBills(shopId, limit)),
  };

  const unsynced = async () => {
    const rows = await db.outbox.where('state').anyOf('pending', 'syncing', 'failed').toArray();
    return rows.sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
  };

  const outbox: OutboxRepo = {
    get: (id) => db.outbox.get(id),
    async listDue(now, limit) {
      const iso = now.toISOString();
      const rows = await db.outbox
        .where('[state+nextAttemptAt]')
        .between(['pending', ''], ['pending', iso], true, true)
        .toArray();
      rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      return limit === undefined ? rows : rows.slice(0, limit);
    },
    listUnsynced: unsynced,
    async enqueue(mutation) {
      await db.outbox.put(MutationSchema.parse(mutation));
    },
    async setState(mutationId, state) {
      await db.outbox.update(mutationId, { state });
    },
    async update(mutationId, patch) {
      await db.outbox.update(mutationId, patch);
    },
    countUnsynced: async () => (await unsynced()).length,
    watchCountUnsynced: () => live(async () => (await unsynced()).length),
  };

  const meta: SyncMetaRepo = {
    async get<T>(key: string) {
      return (await db.syncMeta.get(key))?.value as T | undefined;
    },
    async set(key, value) {
      await db.syncMeta.put({ key, value });
    },
    async delete(key) {
      await db.syncMeta.delete(key);
    },
    watch: <T>(key: string) =>
      live(async () => (await db.syncMeta.get(key))?.value as T | undefined),
  };

  const audit: AuditRepo = {
    async add(event) {
      await db.auditEvents.put(AuditEventRecordSchema.parse(event));
    },
    listForEntity: (entityType, entityId) =>
      db.auditEvents
        .where('entityId')
        .equals(entityId)
        .filter((e) => e.entityType === entityType)
        .sortBy('createdAt'),
    listRecent: (limit = 50) =>
      db.auditEvents.orderBy('createdAt').reverse().limit(limit).toArray(),
  };

  return { shops, products, customers, orders, bills, outbox, meta, audit };
}
