import { describe, expect, it } from 'vitest';
import { SyncError } from './contracts';
import { InMemoryRemote } from './in-memory-remote';
import {
  BACKOFF_CAP_MS,
  backoffDelayMs,
  push,
  type MutationFailure,
  type PushMutation,
  type PushStore,
} from './push';
import type { BillLike, MutationPayloadLike } from './remote-row';

interface TestMutation extends PushMutation {
  state: 'pending' | 'syncing' | 'synced' | 'failed';
  nextAttemptAt: string;
  lastError: MutationFailure | null;
  createdAt: string;
}

const T0 = new Date('2026-01-01T00:00:00.000Z');

function product(id: string, updatedAt = '2026-01-01T00:00:00.000Z'): MutationPayloadLike {
  return {
    kind: 'product',
    product: {
      id,
      shopId: 'local-shop',
      name: `P ${id}`,
      aliases: [],
      unit: 'kg',
      pricePaise: 100,
      active: true,
      updatedAt,
      deletedAt: null,
    },
  };
}

const bill = (id: string, kind: BillLike['kind'], corrects: string | null): BillLike => ({
  id,
  receiptNumber: `RC-${id}`,
  kind,
  correctsBillId: corrects,
  customerId: null,
  status: 'finalized',
  subtotalPaise: 100,
  discountPaise: 0,
  taxPaise: 0,
  totalPaise: 100,
  rawTranscript: '',
  normalizedText: '',
  createdAt: T0.toISOString(),
  finalizedAt: T0.toISOString(),
});

function makeStore(mutations: TestMutation[]): PushStore<TestMutation> & { synced: string[] } {
  const synced: string[] = [];
  const find = (id: string) => mutations.find((m) => m.mutationId === id)!;
  return {
    synced,
    async listDue(now, limit) {
      return mutations
        .filter((m) => m.state === 'pending' && m.nextAttemptAt <= now.toISOString())
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit);
    },
    async markSyncing(id) {
      find(id).state = 'syncing';
    },
    async markSynced(m) {
      find(m.mutationId).state = 'synced';
      synced.push(m.mutationId);
    },
    async markRetry(id, patch) {
      Object.assign(find(id), patch, { state: 'pending' });
    },
    async markFailed(m, patch) {
      Object.assign(find(m.mutationId), patch, { state: 'failed' });
    },
  };
}

const mut = (id: string, n: number, payload: MutationPayloadLike): TestMutation => ({
  mutationId: id,
  payload,
  attempts: 0,
  state: 'pending',
  nextAttemptAt: T0.toISOString(),
  lastError: null,
  createdAt: new Date(T0.getTime() + n).toISOString(),
});

const settings = { remoteShopId: 'team-1', deviceId: 'dev-1' };

function setup(mutations: TestMutation[]) {
  const remote = new InMemoryRemote();
  // First team created by the remote is `team-1`; the signed-in user becomes its owner.
  void remote.ensureShopTeam({ shopId: 'local-shop', name: 'Shop' });
  const store = makeStore(mutations);
  const run = (extra: Partial<Parameters<typeof push>[0]> = {}) =>
    push({ remote, store, settings, now: () => T0, random: () => 0, ...extra } as never);
  return { remote, store, run };
}

describe('push', () => {
  it('syncs all due mutations in batches and marks them synced', async () => {
    const ms = Array.from({ length: 25 }, (_, i) => mut(`m${i}`, i, product(`p${i}`)));
    const { remote, store, run } = setup(ms);
    const r = await run();
    expect(r).toMatchObject({ synced: 25, retried: 0, failed: 0, stoppedBy: null });
    expect(store.synced).toEqual(ms.map((m) => m.mutationId));
    expect(remote.count('products')).toBe(25);
  });

  it('is idempotent when a mutation is delivered twice', async () => {
    const m = mut('m1', 0, { kind: 'bill', bill: bill('b1', 'sale', null), items: [] });
    const { remote, run } = setup([m]);
    await run();
    m.state = 'pending';
    await run();
    expect(remote.count('bills')).toBe(1);
  });

  it('keeps the mutation pending with backoff on network errors and stops the run', async () => {
    const ms = [mut('m1', 0, product('p1')), mut('m2', 1, product('p2'))];
    const { remote, run } = setup(ms);
    remote.failNext(new SyncError('network', 'offline'));
    const r = await run({ random: () => 0.5 } as never);
    expect(r).toMatchObject({ synced: 0, retried: 1, stoppedBy: 'network' });
    expect(ms[0]).toMatchObject({ state: 'pending', attempts: 1 });
    expect(ms[0]!.lastError?.kind).toBe('network');
    // delay = 2s * 2^0 * (1 - 0.2 * 0.5) = 1.8 s
    expect(new Date(ms[0]!.nextAttemptAt).getTime() - T0.getTime()).toBeCloseTo(1800, 5);
    expect(ms[1]!.state).toBe('pending');
  });

  it('marks validation and permission errors failed and continues', async () => {
    const ms = [mut('m1', 0, product('p1')), mut('m2', 1, product('p2'))];
    const { remote, run } = setup(ms);
    remote.failNext(new SyncError('permission', 'denied'));
    const r = await run();
    expect(r).toMatchObject({ synced: 1, failed: 1, stoppedBy: null });
    expect(ms[0]).toMatchObject({ state: 'failed', attempts: 1 });
    expect(ms[1]!.state).toBe('synced');
  });

  it('passes resolveBillRowId through to corrections', async () => {
    const m = mut('m-corr', 0, {
      kind: 'bill_correction',
      bill: bill('b2', 'correction', 'local-b1'),
      items: [],
    });
    const { remote, run } = setup([m]);
    await run({ resolveBillRowId: (id: string) => (id === 'local-b1' ? 'remote-b1' : undefined) });
    const rows = (await remote.pull('bills', 'team-1', null, 10)).rows;
    expect(rows[0]?.['correctsBillRowId']).toBe('remote-b1');
  });
});

describe('backoffDelayMs', () => {
  it('doubles from 2 s, caps at 5 min and applies jitter', () => {
    expect(backoffDelayMs(0, () => 0)).toBe(2000);
    expect(backoffDelayMs(3, () => 0)).toBe(16000);
    expect(backoffDelayMs(20, () => 0)).toBe(BACKOFF_CAP_MS);
    expect(backoffDelayMs(20, () => 0.5)).toBeCloseTo(BACKOFF_CAP_MS * 0.9, 5);
  });
});
