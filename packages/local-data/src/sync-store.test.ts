import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  createRepositories,
  createSettingsRepo,
  openDb,
  type Mutation,
  type OrderRecord,
  type ShopRecord,
} from './index.js';
import { createSyncStore } from './sync-store.js';

const T = '2025-01-01T00:00:00.000Z';
const LATER = '2025-01-02T00:00:00.000Z';
let n = 0;
const deps = { now: () => new Date(T), newId: () => `id-${++n}` };

const shop: ShopRecord = {
  id: 's1',
  name: 'Shop',
  currency: 'INR',
  locale: 'en-IN',
  isDemo: false,
  nextOrderSeq: 1,
  nextReceiptSeq: 1,
  remoteShopId: null,
  createdAt: T,
  updatedAt: T,
  syncVersion: 0,
};

const order: OrderRecord = {
  id: 'o1',
  shopId: 's1',
  localNumber: 'ORD-0001',
  customerId: null,
  walkIn: true,
  status: 'confirmed',
  fulfillment: 'pickup',
  note: null,
  totalEstimatePaise: 500,
  rawTranscript: 'hi',
  normalizedText: 'hi',
  extraction: null,
  mutationId: 'm1',
  syncState: 'local_only',
  createdAt: T,
  updatedAt: T,
};
const item = {
  id: 'i1',
  orderId: 'o1',
  index: 0,
  productId: null,
  nameSnapshot: 'Rice',
  qtyMilli: 1000,
  unit: 'kg' as const,
  unitPricePaise: 500,
  lineTotalPaise: 500,
  resolutionStatus: 'confirmed' as const,
};

const orderMutation = (over: Partial<Mutation> = {}): Mutation => ({
  mutationId: 'm1',
  entityType: 'order',
  entityId: 'o1',
  operation: 'create',
  payload: { kind: 'order', order, items: [item] },
  createdAt: T,
  attempts: 0,
  nextAttemptAt: T,
  state: 'pending',
  lastError: null,
  ...over,
});

async function setup() {
  const db = await openDb({ name: `sync-${++n}`, indexedDB: new IDBFactory() });
  const repos = createRepositories(db, deps);
  const settings = createSettingsRepo(db, deps);
  await repos.shops.put(shop);
  await settings.setActiveShopId('s1');
  await db.orders.add(order);
  await db.orderItems.add(item);
  await db.outbox.add(orderMutation());
  const store = createSyncStore(db, { now: () => new Date(LATER) });
  return { db, repos, settings, store };
}

describe('createSyncStore', () => {
  it('defaults to not opted in with transcripts off, then reflects settings', async () => {
    const { store, settings } = await setup();
    const first = await store.getSettings();
    expect(first.optedIn).toBe(false);
    expect(first.syncTranscripts?.enabled).toBe(false);
    expect(first.shop).toEqual({ id: 's1', name: 'Shop' });
    await settings.setSyncOptIn(true);
    await settings.setSyncTranscripts(true);
    const next = await store.getSettings();
    expect(next.optedIn).toBe(true);
    expect(next.syncTranscripts?.enabled).toBe(true);
    expect(next.deviceId).toBe(first.deviceId);
  });

  it('walks the push lifecycle and keeps record syncState in step', async () => {
    const { store, db } = await setup();
    expect(await store.countPending()).toBe(1);
    const due = await store.push.listDue(new Date(T), 10);
    expect(due.map((m) => m.mutationId)).toEqual(['m1']);

    await store.push.markSyncing('m1');
    expect((await db.orders.get('o1'))?.syncState).toBe('syncing');

    const lastError = { kind: 'network' as const, message: 'x', at: T };
    await store.push.markRetry('m1', { attempts: 1, nextAttemptAt: LATER, lastError });
    expect((await db.outbox.get('m1'))?.state).toBe('pending');
    expect(await store.push.listDue(new Date(T), 10)).toHaveLength(0);

    await store.push.markSynced(due[0]!);
    expect((await db.outbox.get('m1'))?.state).toBe('synced');
    expect((await db.orders.get('o1'))?.syncState).toBe('synced');
    expect(await store.countPending()).toBe(0);
    expect(await store.getLastSyncedAt()).toBe(LATER);
  });

  it('marks terminal failures as failed and counts them', async () => {
    const { store, db } = await setup();
    const [m] = await store.push.listDue(new Date(T), 10);
    await store.push.markFailed(m!, {
      attempts: 1,
      lastError: { kind: 'validation', message: 'bad', at: T },
    });
    expect(await store.countFailed()).toBe(1);
    expect((await db.orders.get('o1'))?.syncState).toBe('failed');
  });

  it('applies pulled catalog rows, persists cursor and last sync together', async () => {
    const { store, db } = await setup();
    const data = {
      shopId: 'r1',
      name: 'Atta',
      aliases: ['flour'],
      unit: 'kg',
      pricePaise: 400,
      active: true,
      deletedAt: null,
      clientUpdatedAt: LATER,
    };
    const cursor = { updatedAt: LATER, rowId: 'p9' };
    await store.pull.applyPage(
      'products',
      [{ type: 'apply_catalog', table: 'products', rowId: 'p9', data }],
      cursor,
      LATER,
    );
    expect(await db.products.get('p9')).toMatchObject({
      shopId: 's1',
      name: 'Atta',
      updatedAt: LATER,
      deletedAt: null,
    });
    expect(await store.pull.getCursor('products')).toEqual(cursor);
    expect(await store.pull.lookup('products', 'p9')).toEqual({ updatedAt: LATER });
    expect(await store.getLastSyncedAt()).toBe(LATER);
  });

  it('does not duplicate our own order or items when they come back, and flags conflicts', async () => {
    const { store, db } = await setup();
    const itemData = {
      shopId: 'r1',
      orderRowId: 'm1',
      index: 0,
      nameSnapshot: 'Rice',
      qtyMilli: 1000,
      unit: 'kg',
      resolutionStatus: 'confirmed',
    };
    await store.pull.applyPage(
      'order_items',
      [{ type: 'insert', table: 'order_items', rowId: 'uuid-item', data: itemData }],
      null,
      LATER,
    );
    expect(await db.orderItems.count()).toBe(1);
    expect(await store.pull.lookup('orders', 'm1')).toEqual({ updatedAt: T });

    await store.pull.applyPage(
      'orders',
      [
        {
          type: 'conflict',
          conflict: {
            table: 'orders',
            rowId: 'm1',
            localUpdatedAt: T,
            remoteUpdatedAt: LATER,
            remoteDeviceId: 'd2',
            detectedAt: LATER,
          },
        },
      ],
      null,
      LATER,
    );
    const o = await db.orders.get('o1');
    expect(o?.syncState).toBe('conflict');
    expect(o?.conflict?.remoteUpdatedAt).toBe(LATER);
  });

  it('inserts a remote order with items and avoids a localNumber collision', async () => {
    const { store, db } = await setup();
    const itemData = {
      shopId: 'r1',
      orderRowId: 'm2',
      index: 0,
      nameSnapshot: 'Dal',
      qtyMilli: 2000,
      unit: 'kg',
      resolutionStatus: 'confirmed',
    };
    const orderData = {
      shopId: 'r1',
      localNumber: 'ORD-0001',
      walkIn: true,
      fulfillment: 'pickup',
      totalEstimatePaise: 900,
      status: 'confirmed',
      mutationId: 'm2',
      deviceId: 'd2',
      clientCreatedAt: LATER,
    };
    await store.pull.applyPage(
      'order_items',
      [{ type: 'insert', table: 'order_items', rowId: 'item-2', data: itemData }],
      null,
      LATER,
    );
    await store.pull.applyPage(
      'orders',
      [{ type: 'insert', table: 'orders', rowId: 'm2', data: orderData }],
      null,
      LATER,
    );
    const got = await db.orders.get('m2');
    expect(got).toMatchObject({ shopId: 's1', syncState: 'synced', rawTranscript: '' });
    expect(got?.localNumber).not.toBe('ORD-0001');
    expect(await db.orderItems.where('orderId').equals('m2').count()).toBe(1);
  });

  it('inserts remote corrections pointing at the local original and resolves row ids', async () => {
    const { store, db } = await setup();
    const bill = {
      shopId: 'r1',
      receiptNumber: 'R-0001',
      kind: 'sale',
      status: 'finalized',
      subtotalPaise: 100,
      discountPaise: 0,
      taxPaise: 0,
      totalPaise: 100,
      mutationId: 'bm1',
      deviceId: 'd2',
      finalizedAt: LATER,
      clientCreatedAt: LATER,
    };
    await store.pull.applyPage(
      'bills',
      [{ type: 'insert', table: 'bills', rowId: 'bm1', data: bill }],
      null,
      LATER,
    );
    await store.pull.applyPage(
      'bills',
      [
        {
          type: 'insert',
          table: 'bills',
          rowId: 'bm2',
          data: {
            ...bill,
            receiptNumber: 'R-0002',
            kind: 'void',
            mutationId: 'bm2',
            correctsBillRowId: 'bm1',
          },
        },
      ],
      null,
      LATER,
    );
    expect((await db.bills.get('bm2'))?.correctsBillId).toBe('bm1');

    // A local correction of a bill whose mutationId differs from its id.
    const original = {
      ...(await db.bills.get('bm1'))!,
      id: 'b-local',
      mutationId: 'bm-orig',
      receiptNumber: 'R-0009',
    };
    await db.bills.add(original);
    const correction = {
      ...original,
      id: 'b-corr',
      mutationId: 'bm-corr',
      receiptNumber: 'R-0010',
      kind: 'correction' as const,
      correctsBillId: 'b-local',
    };
    await db.bills.add(correction);
    await db.outbox.add({
      mutationId: 'bm-corr',
      entityType: 'bill_correction',
      entityId: 'b-corr',
      operation: 'create',
      payload: { kind: 'bill_correction', bill: correction, items: [] },
      createdAt: LATER,
      attempts: 0,
      nextAttemptAt: T,
      state: 'pending',
      lastError: null,
    });
    expect(store.resolveBillRowId('b-local')).toBeUndefined();
    await store.push.listDue(new Date(LATER), 10);
    expect(store.resolveBillRowId('b-local')).toBe('bm-orig');
  });
});
