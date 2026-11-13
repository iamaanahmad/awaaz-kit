import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../setup/fast-check';
import { openDb, type OrderRecord } from '../../packages/local-data/src/index';
import { createSyncStore } from '../../packages/local-data/src/sync-store';
import { pull } from '../../packages/sync-engine/src/pull';
import type { PullCursor, RemoteRow, RemoteTable, SyncRemote } from '../../packages/sync-engine/src/contracts';

// Cross-package on purpose: sync-engine (decision) + local-data (apply) are wired together
// through the structural store port, exactly as the apps do. Lives in tests/ because
// sync-engine must not import local-data.

const SHOP = 'team-1';
const LOCAL_SHOP = 'shop-1';
const THIS_DEVICE = 'this-device';
const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

interface Scenario {
  readonly localOffsetMs: number;
  readonly remoteDeltaMs: number; // > 0: remote strictly later
  readonly syncState: OrderRecord['syncState'];
  readonly localNumber: string;
  readonly status: OrderRecord['status'];
  readonly fulfillment: OrderRecord['fulfillment'];
  readonly note: string | null;
  readonly totalEstimatePaise: number;
  readonly walkIn: boolean;
  readonly remoteDevice: string;
  readonly remoteNumber: string;
  readonly remoteStatus: OrderRecord['status'];
  readonly remoteNote: string | null;
  readonly remoteTotal: number;
  readonly remoteFulfillment: OrderRecord['fulfillment'];
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  localOffsetMs: fc.integer({ min: 0, max: 1_000_000 }),
  remoteDeltaMs: fc.integer({ min: 1, max: 1_000_000 }),
  syncState: fc.constantFrom<OrderRecord['syncState']>('local_only', 'pending', 'synced', 'failed'),
  localNumber: fc.integer({ min: 1, max: 9999 }).map((n) => `ORD-${n}`),
  status: fc.constantFrom<OrderRecord['status']>('confirmed', 'cancelled'),
  fulfillment: fc.constantFrom<OrderRecord['fulfillment']>('delivery', 'pickup'),
  note: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  totalEstimatePaise: fc.integer({ min: 0, max: 10_000_000 }),
  walkIn: fc.boolean(),
  remoteDevice: fc.constantFrom('dev-a', 'dev-b'),
  remoteNumber: fc.integer({ min: 1, max: 9999 }).map((n) => `REM-${n}`),
  remoteStatus: fc.constantFrom<OrderRecord['status']>('confirmed', 'cancelled'),
  remoteNote: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  remoteTotal: fc.integer({ min: 0, max: 10_000_000 }),
  remoteFulfillment: fc.constantFrom<OrderRecord['fulfillment']>('delivery', 'pickup'),
});

let dbCounter = 0;
const ROW_ID = '00000000-0000-4000-9000-0000000000a1';

describe('order conflicts', () => {
  // Feature: awaaz-kit, Property 40: A newer remote order never overwrites the local order
  // **Validates: Requirements 16.12**
  it('Property 40: a newer remote order leaves local fields unchanged and records a conflict', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async (s) => {
        const db = await openDb({ name: `conflict-${++dbCounter}`, indexedDB: new IDBFactory() });
        try {
          const localUpdatedAt = iso(T0 + s.localOffsetMs);
          const remoteUpdatedAt = iso(T0 + s.localOffsetMs + s.remoteDeltaMs);
          const local: OrderRecord = {
            id: ROW_ID,
            shopId: LOCAL_SHOP,
            localNumber: s.localNumber,
            customerId: null,
            walkIn: s.walkIn,
            status: s.status,
            fulfillment: s.fulfillment,
            note: s.note,
            totalEstimatePaise: s.totalEstimatePaise,
            rawTranscript: 'local raw',
            normalizedText: 'local normalized',
            extraction: null,
            mutationId: ROW_ID,
            syncState: s.syncState,
            createdAt: localUpdatedAt,
            updatedAt: localUpdatedAt,
          };
          await db.orders.add(local);

          const row: RemoteRow = {
            $id: ROW_ID,
            $updatedAt: remoteUpdatedAt,
            shopId: SHOP,
            localNumber: s.remoteNumber,
            walkIn: !s.walkIn,
            fulfillment: s.remoteFulfillment,
            note: s.remoteNote,
            totalEstimatePaise: s.remoteTotal,
            status: s.remoteStatus,
            mutationId: ROW_ID,
            deviceId: s.remoteDevice,
            clientCreatedAt: remoteUpdatedAt,
          };
          const unused = async (): Promise<never> => {
            throw new Error('not used');
          };
          const remote: SyncRemote = {
            signedIn: async () => ({ userId: 'u' }),
            ensureShopTeam: async () => ({ remoteShopId: SHOP }),
            createOnce: unused,
            upsertGuarded: unused,
            pull: async (table: RemoteTable, _s: string, cursor: PullCursor | null) =>
              table === 'orders' && cursor === null
                ? { rows: [row], next: { updatedAt: row.$updatedAt, rowId: row.$id } }
                : { rows: [], next: null },
          };

          const result = await pull({
            remote,
            store: createSyncStore(db).pull,
            remoteShopId: SHOP,
            deviceId: THIS_DEVICE,
            now: () => new Date('2027-01-01T00:00:00.000Z'),
          });

          const after = await db.orders.get(ROW_ID);
          // Oracle: independent expectation built from the inputs, not from pull().
          const strip = (o: OrderRecord): Record<string, unknown> => {
            const copy: Record<string, unknown> = { ...o };
            delete copy['syncState'];
            delete copy['conflict'];
            return copy;
          };
          expect(result.stoppedBy).toBeNull();
          expect(strip(after as OrderRecord)).toEqual(strip(local));
          expect(after?.syncState).toBe('conflict');
          expect(after?.conflict?.remoteUpdatedAt).toBe(remoteUpdatedAt);
          expect(await db.orders.count()).toBe(1);
        } finally {
          db.close();
        }
      }),
    );
  });
});
