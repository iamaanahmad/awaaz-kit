import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  createRepositories,
  openDb,
  type Mutation,
  type OrderRecord,
  type ProductRecord,
  type ShopRecord,
} from './index.js';

const T = '2025-01-01T00:00:00.000Z';
let n = 0;
const deps = { now: () => new Date(T), newId: () => `id-${++n}` };

async function setup() {
  const db = await openDb({ name: `t-${++n}`, indexedDB: new IDBFactory() });
  return { db, repos: createRepositories(db, deps) };
}

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
const product = (id: string, over: Partial<ProductRecord> = {}): ProductRecord => ({
  id,
  shopId: 's1',
  name: id,
  aliases: [],
  unit: 'kg',
  pricePaise: 100,
  active: true,
  updatedAt: T,
  deletedAt: null,
  ...over,
});
const mutation = (id: string, over: Partial<Mutation> = {}): Mutation => ({
  mutationId: id,
  entityType: 'product',
  entityId: 'p1',
  operation: 'upsert',
  payload: { kind: 'product', product: product('p1') },
  createdAt: T,
  attempts: 0,
  nextAttemptAt: T,
  state: 'pending',
  lastError: null,
  ...over,
});

describe('repositories', () => {
  it('round-trips shops and filters inactive/deleted products', async () => {
    const { db, repos } = await setup();
    await repos.shops.put(shop);
    expect(await repos.shops.get('s1')).toEqual(shop);
    await repos.products.bulkPut([product('b'), product('a'), product('c', { active: false })]);
    await repos.products.softDelete('b');
    expect((await repos.products.listActive('s1')).map((p) => p.id)).toEqual(['a']);
    expect(await repos.products.listAll('s1')).toHaveLength(3);
    db.close();
  });

  it('rejects invalid records at the boundary', async () => {
    const { db, repos } = await setup();
    await expect(repos.products.put({ ...product('x'), pricePaise: -1 })).rejects.toThrow();
    db.close();
  });

  it('emits live query updates', async () => {
    const { db, repos } = await setup();
    const seen: number[] = [];
    const sub = repos.products.watchActive('s1').subscribe({ next: (v) => seen.push(v.length) });
    // Wait on the observable's state, not fixed sleeps, so a loaded machine cannot race it.
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 5000 });
    await repos.products.put(product('a'));
    await vi.waitFor(() => expect(seen.at(-1)).toBe(1), { timeout: 5000 });
    sub.unsubscribe();
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(1);
    db.close();
  });

  it('outbox lists due mutations and counts unsynced', async () => {
    const { db, repos } = await setup();
    await repos.outbox.enqueue(mutation('m1'));
    await repos.outbox.enqueue(mutation('m2', { nextAttemptAt: '2030-01-01T00:00:00.000Z' }));
    await repos.outbox.enqueue(mutation('m3', { state: 'synced' }));
    expect((await repos.outbox.listDue(new Date(T))).map((m) => m.mutationId)).toEqual(['m1']);
    expect(await repos.outbox.countUnsynced()).toBe(2);
    await repos.outbox.update('m1', { attempts: 1, state: 'failed' });
    expect((await repos.outbox.get('m1'))?.attempts).toBe(1);
    db.close();
  });

  it('meta get/set/delete', async () => {
    const { db, repos } = await setup();
    await repos.meta.set('deviceId', 'd1');
    expect(await repos.meta.get('deviceId')).toBe('d1');
    await repos.meta.delete('deviceId');
    expect(await repos.meta.get('deviceId')).toBeUndefined();
    db.close();
  });

  it('orders list newest first and update only sync state; bills expose no content update', async () => {
    const { db, repos } = await setup();
    const order = (id: string, createdAt: string): OrderRecord => ({
      id,
      shopId: 's1',
      localNumber: id,
      customerId: null,
      walkIn: true,
      status: 'confirmed',
      fulfillment: 'pickup',
      note: null,
      totalEstimatePaise: 0,
      rawTranscript: '',
      normalizedText: '',
      extraction: null,
      mutationId: `m-${id}`,
      syncState: 'pending',
      createdAt,
      updatedAt: createdAt,
    });
    await db.orders.bulkAdd([order('o1', '2025-01-01'), order('o2', '2025-01-02')]);
    expect((await repos.orders.list('s1')).map((o) => o.id)).toEqual(['o2', 'o1']);
    await repos.orders.setSyncState('o1', 'synced');
    expect((await repos.orders.get('o1'))?.syncState).toBe('synced');
    expect(Object.keys(repos.bills).filter((k) => /^(put|update|save|delete)/.test(k))).toEqual([]);
    db.close();
  });
});
