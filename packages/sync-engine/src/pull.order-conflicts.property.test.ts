import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import type { PullCursor, RemoteRow, RemoteTable, SyncRemote } from './contracts';
import { pull, type LocalSnapshot, type PullStore } from './pull';

const SHOP = 'team-1';
const THIS_DEVICE = 'this-device';
const ORDER_ROW_ID = '00000000-0000-4000-9000-0000000000a1';
const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const NOW = '2026-06-01T00:00:00.000Z';

interface LocalOrder {
  fields: {
    localNumber: string;
    customerId: string | null;
    walkIn: boolean;
    fulfillment: 'delivery' | 'pickup';
    note: string | null;
    totalEstimatePaise: number;
    status: 'confirmed' | 'cancelled';
  };
  updatedAt: string;
  syncState: 'pending' | 'synced' | 'conflict';
  conflict: unknown;
}

const orderFieldsArb = fc.record({
  localNumber: fc.stringMatching(/^[A-Z0-9-]{1,8}$/),
  customerId: fc.option(fc.uuid(), { nil: null }),
  walkIn: fc.boolean(),
  fulfillment: fc.constantFrom('delivery', 'pickup' as const),
  note: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  totalEstimatePaise: fc.nat({ max: 10_000_000 }),
  status: fc.constantFrom('confirmed', 'cancelled' as const),
});

const scenarioArb = fc.record({
  local: orderFieldsArb,
  remoteFields: orderFieldsArb,
  localOffsetMs: fc.integer({ min: 0, max: 1_000_000 }),
  // Strictly later remote timestamp.
  laterByMs: fc.integer({ min: 1, max: 1_000_000 }),
  syncState: fc.constantFrom('pending', 'synced' as const),
  remoteDevice: fc.constantFrom('dev-a', 'dev-b', 'z-device'),
});

const iso = (ms: number): string => new Date(T0 + ms).toISOString();

function singleOrderRemote(row: RemoteRow): SyncRemote {
  const unused = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    signedIn: async () => ({ userId: 'u' }),
    ensureShopTeam: async () => ({ remoteShopId: SHOP }),
    createOnce: unused,
    upsertGuarded: unused,
    pull: async (table: RemoteTable, _s: string, cursor: PullCursor | null) =>
      table === 'orders' && cursor === null
        ? { rows: [row], next: { updatedAt: row.$updatedAt, rowId: row.$id } }
        : { rows: [], next: null },
  };
}

describe('pull order conflicts', () => {
  // Feature: awaaz-kit, Property 40: A newer remote order never overwrites the local order
  // **Validates: Requirements 16.12**
  it('Property 40: a newer remote order leaves local fields unchanged and records a conflict', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async (s) => {
        const remoteUpdatedAt = iso(s.localOffsetMs + s.laterByMs);
        const row: RemoteRow = {
          $id: ORDER_ROW_ID,
          $updatedAt: remoteUpdatedAt,
          shopId: SHOP,
          ...s.remoteFields,
          mutationId: 'm-remote',
          deviceId: s.remoteDevice,
          clientCreatedAt: remoteUpdatedAt,
        };

        const local: LocalOrder = {
          fields: { ...s.local },
          updatedAt: iso(s.localOffsetMs),
          syncState: s.syncState,
          conflict: null,
        };
        const before = structuredClone(local.fields);
        const localUpdatedBefore = local.updatedAt;

        const store: PullStore = {
          getCursor: async () => null,
          lookup: async (t, id): Promise<LocalSnapshot | undefined> =>
            t === 'orders' && id === ORDER_ROW_ID ? { updatedAt: local.updatedAt } : undefined,
          applyPage: async (table, changes) => {
            if (table !== 'orders') return;
            for (const c of changes) {
              // Only the conflict change is a legitimate outcome; anything else
              // that touches the existing order is applied so the test can see it.
              if (c.type === 'conflict') {
                local.syncState = 'conflict';
                local.conflict = c.conflict;
              } else if (c.rowId === ORDER_ROW_ID) {
                local.fields = { ...local.fields, ...(c.data as Partial<LocalOrder['fields']>) };
                local.updatedAt = remoteUpdatedAt;
              }
            }
          },
        };

        const result = await pull({
          remote: singleOrderRemote(row),
          store,
          remoteShopId: SHOP,
          deviceId: THIS_DEVICE,
          now: () => new Date(NOW),
        });

        expect(result.stoppedBy).toBeNull();
        expect(local.fields).toEqual(before);
        expect(local.updatedAt).toBe(localUpdatedBefore);
        expect(local.syncState).toBe('conflict');
        expect(local.conflict).toMatchObject({
          table: 'orders',
          rowId: ORDER_ROW_ID,
          localUpdatedAt: localUpdatedBefore,
          remoteUpdatedAt,
          remoteDeviceId: s.remoteDevice,
        });
        expect(result.conflicts).toBe(1);
      }),
    );
  });
});
