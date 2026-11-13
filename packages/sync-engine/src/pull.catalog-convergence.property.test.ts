import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import type { PullCursor, RemoteRow, RemoteTable, SyncRemote } from './contracts';
import { pull, type LocalSnapshot, type PullStore } from './pull';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const SHOP = 'team-1';
const ROW_ID = '00000000-0000-4000-9000-000000000001';

interface Update {
  readonly offsetMs: number;
  readonly deviceId: string;
  readonly name: string;
}

// Few distinct offsets and devices so timestamp ties are frequent. Pairs are unique,
// so the winner is unambiguous.
const updatesArb = fc
  .uniqueArray(
    fc.record({
      offsetMs: fc.integer({ min: 0, max: 3 }),
      deviceId: fc.constantFrom('dev-a', 'dev-b', 'dev-c', 'dev-d'),
    }),
    { minLength: 1, maxLength: 10, selector: (u) => `${u.offsetMs}/${u.deviceId}` },
  )
  .map((us): Update[] => us.map((u, i) => ({ ...u, name: `Name ${i}` })));

// Several shuffles of the same update set, with some duplicate redeliveries.
const scenarioArb = updatesArb.chain((updates) =>
  fc.record({
    updates: fc.constant(updates),
    orders: fc.array(
      fc
        .array(fc.nat({ max: updates.length - 1 }), { maxLength: 4 })
        .chain((dups) =>
          fc.shuffledSubarray(updates, { minLength: updates.length, maxLength: updates.length }).map(
            (perm) => [...perm, ...dups.map((i) => updates[i]!)],
          ),
        ),
      { minLength: 2, maxLength: 4 },
    ),
  }),
);

const clientAt = (u: Update): string => new Date(T0 + u.offsetMs).toISOString();

function rowFor(u: Update): RemoteRow {
  return {
    $id: ROW_ID,
    $updatedAt: '2026-02-01T00:00:00.000Z',
    shopId: SHOP,
    name: u.name,
    aliases: [],
    unit: 'kg',
    pricePaise: 100,
    active: true,
    deletedAt: null,
    deviceId: u.deviceId,
    clientUpdatedAt: clientAt(u),
  };
}

/** Remote that serves one scripted products row per pull call. */
function singleRowRemote(row: RemoteRow): SyncRemote {
  const unused = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    signedIn: async () => ({ userId: 'u' }),
    ensureShopTeam: async () => ({ remoteShopId: SHOP }),
    createOnce: unused,
    upsertGuarded: unused,
    pull: async (table: RemoteTable, _s: string, cursor: PullCursor | null) =>
      table === 'products' && cursor === null
        ? { rows: [row], next: { updatedAt: row.$updatedAt, rowId: row.$id } }
        : { rows: [], next: null },
  };
}

// ---------- Oracle: independent maximum over (clientUpdatedAt, deviceId) ----------

function oracleWinner(updates: readonly Update[]): Update {
  let best = updates[0]!;
  for (const u of updates) {
    if (u.offsetMs > best.offsetMs || (u.offsetMs === best.offsetMs && u.deviceId > best.deviceId)) {
      best = u;
    }
  }
  return best;
}

interface LocalProduct {
  name: string;
  updatedAt: string;
  deviceId: string;
}

async function applyInOrder(order: readonly Update[]): Promise<LocalProduct | undefined> {
  let local: LocalProduct | undefined;
  const store: PullStore = {
    // Fresh cursor each pull: every delivery is a full re-read of the one remote row.
    getCursor: async () => null,
    lookup: async (_t, id): Promise<LocalSnapshot | undefined> =>
      id === ROW_ID && local
        ? { updatedAt: local.updatedAt, deviceId: local.deviceId }
        : undefined,
    applyPage: async (table, changes) => {
      if (table !== 'products') return;
      for (const c of changes) {
        if (c.type !== 'apply_catalog') continue;
        local = {
          name: String(c.data['name']),
          updatedAt: String(c.data['clientUpdatedAt']),
          deviceId: String(c.data['deviceId']),
        };
      }
    },
  };
  for (const u of order) {
    await pull({
      remote: singleRowRemote(rowFor(u)),
      store,
      remoteShopId: SHOP,
      deviceId: 'this-device',
      now: () => new Date('2026-03-01T00:00:00.000Z'),
    });
  }
  return local;
}

describe('pull catalog convergence', () => {
  // Feature: awaaz-kit, Property 39: Catalog last-write-wins converges in any order
  // **Validates: Requirements 16.13**
  it('Property 39: any application order ends at the greatest clientUpdatedAt, ties by deviceId', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async ({ updates, orders }) => {
        const winner = oracleWinner(updates);
        for (const order of orders) {
          const local = await applyInOrder(order);
          expect(local).toEqual({
            name: winner.name,
            updatedAt: clientAt(winner),
            deviceId: winner.deviceId,
          });
        }
      }),
    );
  });
});
