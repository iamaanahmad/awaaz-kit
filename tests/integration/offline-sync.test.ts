import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  createRepositories,
  createSettingsRepo,
  openDb,
  type Mutation,
  type OrderRecord,
  type ShopRecord,
} from '../../packages/local-data/src/index';
import { createSyncStore } from '../../packages/local-data/src/sync-store';
import { SyncError, type RemoteTable } from '../../packages/sync-engine/src/contracts';
import {
  createSyncEngine,
  type EventSource,
  type Timers,
} from '../../packages/sync-engine/src/engine';
import { InMemoryRemote } from '../../packages/sync-engine/src/in-memory-remote';

// Feature: awaaz-kit, offline and sync integration (outbox -> SyncEngine -> InMemoryRemote)
// **Validates: Requirements 19.4, 19.10, 19.11**

const T = '2025-01-01T00:00:00.000Z';
const T0 = Date.parse('2025-01-02T00:00:00.000Z');
const TRANSCRIPT = 'do kilo chawal';
let seq = 0;

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
  totalEstimatePaise: 1000,
  rawTranscript: TRANSCRIPT,
  normalizedText: '2 kg chawal',
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
  qtyMilli: 2000,
  unit: 'kg' as const,
  unitPricePaise: 500,
  lineTotalPaise: 1000,
  resolutionStatus: 'confirmed' as const,
};
const mutation: Mutation = {
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
};

/** Remote whose order write lands but whose acknowledgement is lost once. */
class LostAckRemote extends InMemoryRemote {
  lostAcks = 0;
  override async createOnce(
    table: RemoteTable,
    rowId: string,
    data: object,
    perm: Parameters<InMemoryRemote['createOnce']>[3],
  ) {
    const result = await super.createOnce(table, rowId, data, perm);
    if (table === 'orders' && this.lostAcks > 0) {
      this.lostAcks -= 1;
      throw new SyncError('network', 'ack lost');
    }
    return result;
  }
}

const emitter = (): EventSource & { fire(): void } => {
  const ls = new Set<() => void>();
  return {
    subscribe: (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    fire: () => ls.forEach((l) => l()),
  };
};

async function setup() {
  const db = await openDb({ name: `offline-sync-${++seq}`, indexedDB: new IDBFactory() });
  const deps = { now: () => new Date(T), newId: () => `id-${++seq}` };
  const settings = createSettingsRepo(db, deps);
  await createRepositories(db, deps).shops.put(shop);
  await settings.setActiveShopId('s1');
  // The atomic commit result: record, items and outbox Mutation.
  await db.orders.add(order);
  await db.orderItems.add(item);
  await db.outbox.add(mutation);

  const remote = new LostAckRemote({ userId: null });
  const clock = { ms: T0 };
  const net = { online: false };
  const onlineEvents = emitter();
  const timers: Timers = { setInterval: () => 1, clearInterval: () => undefined };
  const store = createSyncStore(db, { now: () => new Date(clock.ms) });
  const engine = createSyncEngine({
    store,
    remote,
    clock: { now: () => new Date(clock.ms) },
    random: () => 0,
    env: { isOnline: () => net.online, onlineEvents, visibility: emitter(), timers },
  });
  const goOnline = async () => {
    net.online = true;
    onlineEvents.fire();
    return engine.syncNow();
  };
  const remoteOrders = async () =>
    (await remote.pull('orders', 'team-1', null, 50)).rows as Array<Record<string, unknown>>;
  return { db, settings, remote, clock, net, engine, store, goOnline, remoteOrders };
}

describe('offline commit and sync (local-data + sync-engine + InMemoryRemote)', () => {
  it('keeps an offline commit pending and sends nothing until opt-in, sign-in and online', async () => {
    const t = await setup();
    t.engine.start();
    await t.engine.syncNow();

    // Offline, not opted in: still pending, still local.
    expect(await t.store.countPending()).toBe(1);
    expect(t.remote.count('orders')).toBe(0);

    // Online alone is not enough.
    expect((await t.goOnline()).skipped).toBe('not_opted_in');
    expect(t.remote.count('orders')).toBe(0);

    // Opted in but signed out: paused, Mutation retained.
    await t.settings.setSyncOptIn(true);
    expect((await t.engine.syncNow()).skipped).toBe('not_signed_in');
    expect(t.remote.count('orders')).toBe(0);
    expect((await t.db.outbox.get('m1'))?.state).toBe('pending');
    expect((await t.db.orders.get('o1'))?.syncState).toBe('local_only');

    // Sign in: pushed exactly once.
    t.remote.setUser('user-1');
    const report = await t.engine.syncNow();
    expect(report.push?.synced).toBe(1);
    expect(t.remote.count('orders')).toBe(1);
    expect(t.remote.count('order_items')).toBe(1);
    expect((await t.db.outbox.get('m1'))?.state).toBe('synced');
    expect((await t.db.orders.get('o1'))?.syncState).toBe('synced');
    expect(await t.store.countPending()).toBe(0);

    // A further run sends nothing new.
    expect((await t.engine.syncNow()).push?.synced).toBe(0);
    expect(t.remote.count('orders')).toBe(1);
    t.engine.stop();
  });

  it('creates one remote entity when a lost acknowledgement forces a duplicate retry', async () => {
    const t = await setup();
    await t.settings.setSyncOptIn(true);
    t.remote.setUser('user-1');
    t.remote.lostAcks = 1;

    const first = await t.goOnline();
    expect(first.push).toMatchObject({ synced: 0, retried: 1 });
    expect(t.remote.count('orders')).toBe(1); // the write landed
    expect((await t.db.outbox.get('m1'))?.state).toBe('pending');

    t.clock.ms += 10 * 60_000; // past the backoff
    const second = await t.engine.syncNow();
    expect(second.push?.synced).toBe(1);
    expect(t.remote.count('orders')).toBe(1);
    expect(t.remote.count('order_items')).toBe(1);

    // Replaying the already-synced Mutation is also a no-op remotely.
    await t.db.outbox.update('m1', { state: 'pending', nextAttemptAt: T });
    await t.engine.syncNow();
    expect(t.remote.count('orders')).toBe(1);
    expect(t.remote.count('order_items')).toBe(1);
  });

  it('keeps the Mutation after retryable and terminal failures, without payload in lastError', async () => {
    const t = await setup();
    await t.settings.setSyncOptIn(true);
    t.net.online = true;

    // Retryable: the remote rejects the write with a network error after sign-in check.
    t.remote.setUser('user-1');
    t.remote.lostAcks = 1;
    await t.engine.syncNow();
    const retry = await t.db.outbox.get('m1');
    expect(retry?.state).toBe('pending');
    expect(retry?.attempts).toBe(1);
    expect(retry?.lastError?.kind).toBe('network');
    expect(JSON.stringify(retry?.lastError)).not.toContain(TRANSCRIPT);

    // Terminal: permission failure marks failed but retains the Mutation.
    t.clock.ms += 10 * 60_000;
    const original = t.remote.createOnce.bind(t.remote);
    t.remote.createOnce = async (table, rowId, data, perm) => {
      if (table === 'orders') throw new SyncError('permission', 'denied');
      return original(table, rowId, data, perm);
    };
    await t.engine.syncNow();
    const failed = await t.db.outbox.get('m1');
    expect(failed?.state).toBe('failed');
    expect(failed?.payload.kind).toBe('order');
    expect(await t.store.countFailed()).toBe(1);
    expect((await t.db.orders.get('o1'))?.syncState).toBe('failed');
    expect(JSON.stringify(failed?.lastError)).not.toContain(TRANSCRIPT);
  });

  it('excludes transcripts from remote rows by default and includes them only when enabled', async () => {
    const t = await setup();
    await t.settings.setSyncOptIn(true);
    t.remote.setUser('user-1');
    await t.goOnline();

    const [row] = await t.remoteOrders();
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty('rawTranscript');
    expect(row).not.toHaveProperty('normalizedText');
    expect(JSON.stringify(row)).not.toContain(TRANSCRIPT);

    // Enabled explicitly: a new order carries them.
    await t.settings.setSyncTranscripts(true);
    const second = {
      ...order,
      id: 'o2',
      localNumber: 'ORD-0002',
      mutationId: 'm2',
    };
    await t.db.orders.add(second);
    await t.db.outbox.add({
      ...mutation,
      mutationId: 'm2',
      entityId: 'o2',
      payload: { kind: 'order', order: second, items: [] },
      createdAt: '2025-01-01T00:00:01.000Z',
    });
    await t.engine.syncNow();
    const rows = await t.remoteOrders();
    expect(rows).toHaveLength(2);
    const withText = rows.filter((r) => r['rawTranscript'] === TRANSCRIPT);
    expect(withText).toHaveLength(1);
  });
});
