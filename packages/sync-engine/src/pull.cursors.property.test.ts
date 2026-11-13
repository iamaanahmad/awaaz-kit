import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { SyncError, type PullCursor, type RemoteTable, type SyncRemote } from './contracts';
import { InMemoryRemote } from './in-memory-remote';
import { pull, type PullStore } from './pull';
import { buildPermissions } from './remote-row';

const T0 = Date.UTC(2026, 0, 1);

// ---------- Generators (valid input space only) ----------

interface Scenario {
  readonly ids: string[];
  /** Millisecond increments between consecutive remote writes (0 produces timestamp ties). */
  readonly steps: number[];
  readonly pageSize: number;
  /** 1-based call numbers (counted across the whole test) at which a fault is injected. */
  readonly faults: { readonly kind: 'remote' | 'apply'; readonly at: number }[];
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .uniqueArray(fc.stringMatching(/^[a-z0-9]{1,6}$/), { minLength: 1, maxLength: 14 })
  .chain((ids) =>
    fc.record({
      ids: fc.constant(ids),
      steps: fc.array(fc.integer({ min: 0, max: 2 }), {
        minLength: ids.length,
        maxLength: ids.length,
      }),
      pageSize: fc.integer({ min: 1, max: 5 }),
      faults: fc.array(
        fc.record({
          kind: fc.constantFrom('remote' as const, 'apply' as const),
          at: fc.integer({ min: 1, max: 12 }),
        }),
        { maxLength: 4 },
      ),
    }),
  );

// ---------- Helpers ----------

const keyOf = (c: PullCursor): string => `${c.updatedAt}|${c.rowId}`;
const lessOrEqual = (a: PullCursor, b: PullCursor): boolean =>
  a.updatedAt < b.updatedAt || (a.updatedAt === b.updatedAt && a.rowId <= b.rowId);

const productData = (shop: string, id: string, i: number) => ({
  shopId: shop,
  name: `name-${id}`,
  aliases: [],
  unit: 'kg',
  pricePaise: 100 + i,
  active: true,
  deletedAt: null,
  deviceId: 'dev-b',
  clientUpdatedAt: '2026-01-02T00:00:00.000Z',
});

/** In-memory local store that records every cursor write, atomically per page. */
function trackingStore(applyFault: () => boolean) {
  const cursors = new Map<RemoteTable, PullCursor>();
  const records = new Map<string, Record<string, unknown>>();
  const cursorWrites: { table: RemoteTable; cursor: PullCursor }[] = [];
  const store: PullStore = {
    getCursor: async (t) => cursors.get(t) ?? null,
    lookup: async (_t, id) => {
      const rec = records.get(id);
      return rec
        ? {
            updatedAt: String(rec['clientUpdatedAt']),
            deviceId: String(rec['deviceId']),
          }
        : undefined;
    },
    applyPage: async (t, changes, cursor) => {
      // A crash before the transaction commits leaves neither records nor cursor.
      if (applyFault()) throw new SyncError('server', 'injected apply failure');
      for (const c of changes) {
        if (c.type === 'apply_catalog') records.set(c.rowId, c.data);
      }
      if (cursor) {
        cursors.set(t, cursor);
        cursorWrites.push({ table: t, cursor });
      }
    },
  };
  return { store, cursors, records, cursorWrites };
}

describe('Pull cursors', () => {
  // Feature: awaaz-kit, Property 38: Pull cursors are monotonic and resumable
  it('Property 38: Pull cursors are monotonic and resumable. **Validates: Requirements 16.11**', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async (sc) => {
        // Remote with scripted, non-decreasing $updatedAt values (ties allowed).
        let tick = 0;
        const stamps: string[] = [];
        let acc = T0;
        for (const s of sc.steps) {
          acc += s;
          stamps.push(new Date(acc).toISOString());
        }
        const remote = new InMemoryRemote({ now: () => stamps[tick++] ?? stamps[stamps.length - 1]! });
        const { remoteShopId: shop } = await remote.ensureShopTeam({ shopId: 's', name: 'Shop' });
        for (const [i, id] of sc.ids.entries()) {
          await remote.upsertGuarded(
            'products',
            id,
            productData(shop, id, i),
            buildPermissions('products', shop),
          );
        }

        // Independent oracle: naive expected state straight from the generated input.
        const expectedRecords = new Map(
          sc.ids.map((id, i) => [id, productData(shop, id, i)] as const),
        );
        const order = sc.ids
          .map((id, i) => ({ updatedAt: stamps[i]!, rowId: id }))
          .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
        const expectedCursor = order[order.length - 1]!;

        const deps = (r: SyncRemote, s: PullStore) => ({
          remote: r,
          store: s,
          remoteShopId: shop,
          deviceId: 'dev-a',
          now: () => new Date('2026-02-01T00:00:00.000Z'),
          pageSize: sc.pageSize,
        });

        // Uninterrupted reference pull.
        const ref = trackingStore(() => false);
        const refRes = await pull(deps(remote, ref.store));
        expect(refRes.stoppedBy).toBeNull();

        // Interrupted pull: faults at scripted call numbers, then resume until clean.
        let remoteCalls = 0;
        let applyCalls = 0;
        const faulty: SyncRemote = {
          ensureShopTeam: (l) => remote.ensureShopTeam(l),
          signedIn: () => remote.signedIn(),
          createOnce: (...a) => remote.createOnce(...a),
          upsertGuarded: (...a) => remote.upsertGuarded(...a),
          pull: async (...a) => {
            remoteCalls += 1;
            if (sc.faults.some((f) => f.kind === 'remote' && f.at === remoteCalls)) {
              throw new SyncError('network', 'injected network failure');
            }
            return remote.pull(...a);
          },
        } as SyncRemote;
        const run = trackingStore(() => {
          applyCalls += 1;
          return sc.faults.some((f) => f.kind === 'apply' && f.at === applyCalls);
        });

        const startedWith: (PullCursor | null)[] = [];
        for (let attempt = 0; attempt < 20; attempt++) {
          startedWith.push(await run.store.getCursor('products'));
          const res = await pull(deps(faulty, run.store));
          if (res.stoppedBy === null) break;
        }

        // Same final local state as the uninterrupted pull and as the oracle.
        expect(run.records).toEqual(ref.records);
        expect(run.records).toEqual(expectedRecords);
        expect(run.cursors.get('products')).toEqual(expectedCursor);
        expect(ref.cursors.get('products')).toEqual(expectedCursor);

        // The stored cursor never moves backwards.
        const seq = run.cursorWrites.filter((w) => w.table === 'products').map((w) => w.cursor);
        for (let i = 1; i < seq.length; i++) {
          expect(lessOrEqual(seq[i - 1]!, seq[i]!)).toBe(true);
        }
        const seen = startedWith.filter((c): c is PullCursor => c !== null);
        for (let i = 1; i < seen.length; i++) {
          expect(lessOrEqual(seen[i - 1]!, seen[i]!)).toBe(true);
        }
      }),
    );
  });
});
