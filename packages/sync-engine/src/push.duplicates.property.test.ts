import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import {
  REMOTE_TABLES,
  SyncError,
  type RemoteTable,
  type RowPermissions,
  type SyncRemote,
} from './contracts';
import { InMemoryRemote } from './in-memory-remote';
import { push, type PushMutation, type PushStore } from './push';
import {
  toRemoteRow,
  type BillItemLike,
  type MutationPayloadLike,
  type OrderItemLike,
} from './remote-row';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const settings = { remoteShopId: 'team-1', deviceId: 'dev-1' } as const;

// ---------- Generators (stay inside the valid input space) ----------

type Spec =
  | { kind: 'product'; entity: number; price: number }
  | { kind: 'order'; qty: number[] }
  | { kind: 'bill'; qty: number[] };

const specArb: fc.Arbitrary<Spec> = fc.oneof(
  fc.record({
    kind: fc.constant('product' as const),
    entity: fc.integer({ min: 0, max: 2 }),
    price: fc.integer({ min: 0, max: 100_000 }),
  }),
  fc.record({
    kind: fc.constant('order' as const),
    qty: fc.array(fc.integer({ min: 1, max: 10_000 }), { maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('bill' as const),
    qty: fc.array(fc.integer({ min: 1, max: 10_000 }), { maxLength: 3 }),
  }),
);

interface Delivery {
  readonly pick: number;
  /** Zero-based remote call index at which a network error is injected, or null. */
  readonly failAt: number | null;
}

const scenarioArb = fc
  .tuple(
    fc.array(specArb, { minLength: 1, maxLength: 8 }),
    fc.array(
      fc.record({
        pick: fc.nat(),
        failAt: fc.option(fc.integer({ min: 0, max: 4 }), { nil: null }),
      }),
      { minLength: 1, maxLength: 24 },
    ),
  )
  .map(([specs, deliveries]) => ({ specs, deliveries: deliveries as Delivery[] }));

const iso = (i: number): string => new Date(T0.getTime() + (i + 1) * 1000).toISOString();
const mutationIdOf = (i: number): string =>
  `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

function payloadFor(spec: Spec, i: number): MutationPayloadLike {
  switch (spec.kind) {
    case 'product':
      return {
        kind: 'product',
        product: {
          id: `00000000-0000-4000-9000-${String(spec.entity).padStart(12, '0')}`,
          shopId: 'local-shop',
          name: `Product ${i}`,
          aliases: [],
          unit: 'kg',
          pricePaise: spec.price,
          active: true,
          // Distinct per mutation so last-write-wins converges in any order.
          updatedAt: iso(i),
          deletedAt: null,
        },
      };
    case 'order':
      return {
        kind: 'order',
        order: {
          id: `o${i}`,
          localNumber: `O-${i}`,
          customerId: null,
          walkIn: true,
          status: 'confirmed',
          fulfillment: 'pickup',
          note: null,
          totalEstimatePaise: 0,
          rawTranscript: '',
          normalizedText: '',
          createdAt: iso(i),
        },
        items: spec.qty.map((q, index): OrderItemLike => ({
          index,
          productId: null,
          nameSnapshot: `Item ${index}`,
          qtyMilli: q,
          unit: 'kg',
          unitPricePaise: null,
          lineTotalPaise: null,
          resolutionStatus: 'confirmed',
        })),
      };
    case 'bill':
      return {
        kind: 'bill',
        bill: {
          id: `b${i}`,
          receiptNumber: `RC-${i}`,
          kind: 'sale',
          correctsBillId: null,
          customerId: null,
          status: 'finalized',
          subtotalPaise: 100,
          discountPaise: 0,
          taxPaise: 0,
          totalPaise: 100,
          rawTranscript: '',
          normalizedText: '',
          createdAt: iso(i),
          finalizedAt: iso(i),
        },
        items: spec.qty.map((q, index): BillItemLike => ({
          index,
          productId: null,
          nameSnapshot: `Item ${index}`,
          qtyMilli: q,
          unit: 'kg',
          unitPricePaise: 100,
          lineTotalPaise: 100,
        })),
      };
  }
}

// ---------- Oracle: naive remote model that applies each Mutation exactly once ----------

type Snapshot = Record<string, Record<string, unknown>>;

function naiveModel(mutations: readonly PushMutation[]): Snapshot {
  const state = new Map<string, Record<string, unknown>>();
  for (const m of mutations) {
    for (const w of toRemoteRow(m, settings)) {
      const key = `${w.table}/${w.rowId}`;
      const existing = state.get(key);
      if (w.mode === 'create') {
        if (!existing) state.set(key, { ...w.data });
      } else if (
        !existing ||
        (w.data['clientUpdatedAt'] as string) >= (existing['clientUpdatedAt'] as string)
      ) {
        state.set(key, { ...w.data });
      }
    }
  }
  return Object.fromEntries([...state.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

async function snapshotOf(remote: InMemoryRemote): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const table of REMOTE_TABLES) {
    const { rows } = await remote.pull(table, settings.remoteShopId, null, 100_000);
    for (const row of rows) {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) if (!k.startsWith('$')) data[k] = v;
      out[`${table}/${String(row['$id'])}`] = data;
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

// ---------- Delivery through push ----------

/** Wraps a remote and throws a network error at the n-th write call of one push pass. */
function flaky(inner: SyncRemote, failAt: number | null): SyncRemote {
  let calls = 0;
  const gate = (): void => {
    if (failAt !== null && calls++ === failAt) throw new SyncError('network', 'injected');
  };
  return {
    signedIn: () => inner.signedIn(),
    ensureShopTeam: (l) => inner.ensureShopTeam(l),
    pull: (t, s, c, l) => inner.pull(t, s, c, l),
    createOnce: async (t: RemoteTable, id: string, d: object, p: RowPermissions) => {
      gate();
      return inner.createOnce(t, id, d, p);
    },
    upsertGuarded: async (t, id, d, p) => {
      gate();
      return inner.upsertGuarded(t, id, d, p);
    },
  };
}

async function deliver(
  remote: SyncRemote,
  mutation: PushMutation,
  failAt: number | null,
): Promise<void> {
  let pending = true;
  const store: PushStore<PushMutation> = {
    listDue: async () => (pending ? [mutation] : []),
    markSyncing: async () => undefined,
    markSynced: async () => {
      pending = false;
    },
    markRetry: async () => undefined,
    markFailed: async () => {
      pending = false;
    },
  };
  await push({
    remote: flaky(remote, failAt),
    store,
    settings,
    now: () => T0,
    random: () => 0,
  });
}

describe('push duplicate deliveries', () => {
  // Feature: awaaz-kit, Property 35: Duplicate deliveries leave one remote entity per Mutation
  // **Validates: Requirements 16.4, 16.18**
  it('Property 35: duplicate, retried and reordered deliveries equal single delivery', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async ({ specs, deliveries }) => {
        const mutations: PushMutation[] = specs.map((s, i) => ({
          mutationId: mutationIdOf(i),
          payload: payloadFor(s, i),
          attempts: 0,
        }));

        const remote = new InMemoryRemote({ now: () => T0.toISOString() });
        await remote.ensureShopTeam({ shopId: 'local-shop', name: 'Shop' });

        // Arbitrary order, duplicates and injected failures (including mid-Mutation).
        for (const d of deliveries) {
          await deliver(remote, mutations[d.pick % mutations.length]!, d.failAt);
        }
        // Retry pass so every Mutation has been delivered successfully at least once.
        for (const m of mutations) await deliver(remote, m, null);

        const actual = await snapshotOf(remote);
        const expected = naiveModel(mutations);
        expect(actual).toEqual(expected);

        // One remote header per order/bill Mutation.
        const headers = mutations.filter((m) => m.payload.kind !== 'product').length;
        const counted = remote.count('orders') + remote.count('bills');
        expect(counted).toBe(headers);
      }),
    );
  });
});
