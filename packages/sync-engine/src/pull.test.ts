import { describe, expect, it } from 'vitest';
import { SyncError, type PullCursor, type RemoteTable } from './contracts';
import { InMemoryRemote } from './in-memory-remote';
import { catalogWinner, pull, type LocalSnapshot, type PullChange, type PullStore } from './pull';
import { buildPermissions } from './remote-row';

let clock = 0;
const remote = (): InMemoryRemote =>
  new InMemoryRemote({
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString(),
  });

function memoryStore(local: Record<string, LocalSnapshot> = {}) {
  const cursors = new Map<RemoteTable, PullCursor>();
  const applied: PullChange[] = [];
  let syncedAt: string | null = null;
  const store: PullStore = {
    getCursor: async (t) => cursors.get(t) ?? null,
    lookup: async (_t, id) => local[id],
    applyPage: async (t, changes, cursor, at) => {
      applied.push(...changes);
      if (cursor) cursors.set(t, cursor);
      syncedAt = at;
    },
  };
  return { store, cursors, applied, syncedAt: () => syncedAt };
}

async function setup() {
  const r = remote();
  const { remoteShopId } = await r.ensureShopTeam({ shopId: 's', name: 'Shop' });
  return { r, shop: remoteShopId };
}

const product = (shop: string, over: Record<string, unknown> = {}) => ({
  shopId: shop,
  name: 'Atta',
  aliases: [],
  unit: 'kg',
  pricePaise: 4000,
  active: true,
  deletedAt: null,
  deviceId: 'dev-b',
  clientUpdatedAt: '2026-01-02T00:00:00.000Z',
  ...over,
});

const base = (store: PullStore, r: InMemoryRemote, shop: string) => ({
  remote: r,
  store,
  remoteShopId: shop,
  deviceId: 'dev-a',
  now: () => new Date('2026-02-01T00:00:00.000Z'),
});

describe('catalogWinner', () => {
  it('newer wins, tie-breaks on deviceId, identical keeps local', () => {
    const t1 = '2026-01-01T00:00:00.000Z';
    const t2 = '2026-01-02T00:00:00.000Z';
    expect(catalogWinner({ updatedAt: t1, deviceId: 'a' }, { updatedAt: t2, deviceId: 'a' })).toBe(
      'remote',
    );
    expect(catalogWinner({ updatedAt: t2, deviceId: 'a' }, { updatedAt: t1, deviceId: 'z' })).toBe(
      'local',
    );
    expect(catalogWinner({ updatedAt: t1, deviceId: 'a' }, { updatedAt: t1, deviceId: 'b' })).toBe(
      'remote',
    );
    expect(catalogWinner({ updatedAt: t1, deviceId: 'b' }, { updatedAt: t1, deviceId: 'a' })).toBe(
      'local',
    );
    expect(catalogWinner({ updatedAt: t1, deviceId: 'a' }, { updatedAt: t1, deviceId: 'a' })).toBe(
      'local',
    );
  });
});

describe('pull', () => {
  it('inserts unknown catalog rows, stores cursor and sync time', async () => {
    const { r, shop } = await setup();
    await r.upsertGuarded(
      'products',
      'p1',
      { ...product(shop) },
      buildPermissions('products', shop),
    );
    const m = memoryStore();
    const res = await pull(base(m.store, r, shop));
    expect(res.applied).toBe(1);
    expect(m.applied[0]?.type).toBe('apply_catalog');
    expect(m.cursors.get('products')?.rowId).toBe('p1');
    expect(m.syncedAt()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('resumes from the cursor and pages through all rows', async () => {
    const { r, shop } = await setup();
    for (const id of ['p1', 'p2', 'p3']) {
      await r.upsertGuarded('products', id, product(shop), buildPermissions('products', shop));
    }
    const m = memoryStore();
    const first = await pull({ ...base(m.store, r, shop), pageSize: 2 });
    expect(first.applied).toBe(3);
    expect(first.pages).toBeGreaterThanOrEqual(2);
    const second = await pull(base(m.store, r, shop));
    expect(second.applied).toBe(0);
    expect(second.pages).toBe(0);
  });

  it('applies catalog LWW: older remote is skipped, newer applied', async () => {
    const { r, shop } = await setup();
    await r.upsertGuarded('products', 'p1', product(shop), buildPermissions('products', shop));
    const newer = memoryStore({ p1: { updatedAt: '2026-01-03T00:00:00.000Z' } });
    expect((await pull(base(newer.store, r, shop))).skipped).toBe(1);
    const older = memoryStore({ p1: { updatedAt: '2026-01-01T00:00:00.000Z' } });
    expect((await pull(base(older.store, r, shop))).applied).toBe(1);
  });

  it('keeps a local order and records a conflict for a newer remote order', async () => {
    const { r, shop } = await setup();
    const order = {
      shopId: shop,
      localNumber: 'O-1',
      walkIn: true,
      fulfillment: 'pickup',
      totalEstimatePaise: 100,
      status: 'confirmed',
      mutationId: 'o1',
      deviceId: 'dev-b',
      clientCreatedAt: '2026-01-01T00:00:00.000Z',
    };
    await r.createOnce('orders', 'o1', order, buildPermissions('orders', shop));
    const m = memoryStore({ o1: { updatedAt: '2000-01-01T00:00:00.000Z' } });
    const res = await pull(base(m.store, r, shop));
    expect(res.conflicts).toBe(1);
    expect(m.applied[0]?.type).toBe('conflict');
    // Own device writes are not conflicts.
    const own = memoryStore({ o1: { updatedAt: '2000-01-01T00:00:00.000Z' } });
    const res2 = await pull({ ...base(own.store, r, shop), deviceId: 'dev-b' });
    expect(res2.conflicts).toBe(0);
  });

  it('never overwrites a local bill but inserts unknown corrections', async () => {
    const { r, shop } = await setup();
    const bill = (id: string, kind: string) => ({
      shopId: shop,
      receiptNumber: id,
      kind,
      status: 'finalized',
      subtotalPaise: 1,
      discountPaise: 0,
      taxPaise: 0,
      totalPaise: 1,
      mutationId: id,
      deviceId: 'dev-b',
      finalizedAt: '2026-01-01T00:00:00.000Z',
      clientCreatedAt: '2026-01-01T00:00:00.000Z',
    });
    await r.createOnce('bills', 'b1', bill('b1', 'sale'), buildPermissions('bills', shop));
    await r.createOnce('bills', 'b2', bill('b2', 'correction'), buildPermissions('bills', shop));
    const m = memoryStore({ b1: { updatedAt: '2000-01-01T00:00:00.000Z' } });
    const res = await pull(base(m.store, r, shop));
    expect(res.skipped).toBe(1);
    expect(m.applied).toHaveLength(1);
    expect(m.applied[0]).toMatchObject({ type: 'insert', rowId: 'b2' });
  });

  it('ignores invalid rows but still advances the cursor', async () => {
    const { r, shop } = await setup();
    await r.upsertGuarded(
      'products',
      'bad',
      { ...product(shop), name: '' },
      buildPermissions('products', shop),
    );
    const m = memoryStore();
    const res = await pull(base(m.store, r, shop));
    expect(res.invalid).toBe(1);
    expect(m.cursors.get('products')?.rowId).toBe('bad');
  });

  it('stops with the error kind and leaves cursors untouched on remote failure', async () => {
    const { r, shop } = await setup();
    r.failNext(new SyncError('network', 'offline'));
    const m = memoryStore();
    const res = await pull(base(m.store, r, shop));
    expect(res.stoppedBy).toBe('network');
    expect(m.cursors.size).toBe(0);
  });
});
