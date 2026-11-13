import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { SyncError, type SyncRemote } from './contracts';
import { createSyncEngine, type EventSource, type SyncEngineStore, type Timers } from './engine';
import type { PushMutation } from './push';
import type { MutationPayloadLike } from './remote-row';

const T0 = new Date('2026-01-01T00:00:00.000Z');

interface M extends PushMutation {
  payload: MutationPayloadLike;
  state: 'pending' | 'failed';
  nextAttemptAt: string;
  lastError: string | null;
}

// ---------- Generators ----------

const mutationArb = fc.record({
  attempts: fc.integer({ min: 0, max: 8 }),
  state: fc.constantFrom('pending' as const, 'failed' as const),
  price: fc.integer({ min: 0, max: 100_000 }),
  lastError: fc.option(fc.constantFrom('network', 'server'), { nil: null }),
});

/** How the remote reports the session when asked. */
const sessionArb = fc.constantFrom('signed_in', 'signed_out', 'auth_error');

const scenarioArb = fc.record({
  mutations: fc.array(mutationArb, { maxLength: 8 }),
  optedIn: fc.boolean(),
  online: fc.boolean(),
  session: sessionArb,
  hasShop: fc.boolean(),
});

interface MutationSpec {
  attempts: number;
  state: 'pending' | 'failed';
  price: number;
  lastError: string | null;
}

function buildMutations(specs: MutationSpec[]): M[] {
  return specs.map((s, i) => ({
    mutationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    attempts: s.attempts,
    state: s.state,
    nextAttemptAt: T0.toISOString(),
    lastError: s.lastError,
    payload: {
      kind: 'product',
      product: {
        id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
        shopId: 'local-shop',
        name: `P${i}`,
        aliases: [],
        unit: 'kg',
        pricePaise: s.price,
        active: true,
        updatedAt: T0.toISOString(),
        deletedAt: null,
      },
    },
  }));
}

const noEvents: EventSource = { subscribe: () => () => undefined };
const noTimers: Timers = { setInterval: () => 0, clearInterval: () => undefined };

describe('sync gating', () => {
  // Feature: awaaz-kit, Property 36: Nothing leaves the device without opt-in, sign-in and connectivity
  // **Validates: Requirements 16.1, 16.2, 18.2, 18.3**
  it('Property 36: no remote business calls and unchanged Outbox unless opted in, signed in and online', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async (sc) => {
        const mutations = buildMutations(sc.mutations);
        const before = structuredClone(mutations);

        const calls: string[] = [];
        const storeWrites: string[] = [];
        const remote: SyncRemote = {
          async signedIn() {
            calls.push('signedIn');
            if (sc.session === 'auth_error') throw new SyncError('auth', 'expired');
            return sc.session === 'signed_in' ? { userId: 'u1' } : null;
          },
          async ensureShopTeam() {
            calls.push('ensureShopTeam');
            return { remoteShopId: 'team-1' };
          },
          async createOnce() {
            calls.push('createOnce');
            return 'created';
          },
          async upsertGuarded() {
            calls.push('upsertGuarded');
            return 'written';
          },
          async pull() {
            calls.push('pull');
            return { rows: [], next: null };
          },
        };

        const store: SyncEngineStore<M> = {
          getSettings: async () => ({
            optedIn: sc.optedIn,
            shop: sc.hasShop ? { id: 'local-shop', name: 'Shop' } : null,
            deviceId: 'dev-1',
          }),
          push: {
            listDue: async (_now, limit) =>
              mutations.filter((m) => m.state === 'pending').slice(0, limit),
            markSyncing: async () => void storeWrites.push('markSyncing'),
            markSynced: async (m) => {
              storeWrites.push('markSynced');
              void m;
            },
            markRetry: async () => void storeWrites.push('markRetry'),
            markFailed: async () => void storeWrites.push('markFailed'),
          },
          pull: {
            getCursor: async () => null,
            lookup: async () => undefined,
            applyPage: async () => void storeWrites.push('applyPage'),
          },
          countPending: async () => mutations.filter((m) => m.state === 'pending').length,
          countFailed: async () => mutations.filter((m) => m.state === 'failed').length,
          getLastSyncedAt: async () => null,
        };

        const engine = createSyncEngine<M>({
          store,
          remote,
          clock: { now: () => T0 },
          random: () => 0,
          env: {
            isOnline: () => sc.online,
            onlineEvents: noEvents,
            visibility: noEvents,
            timers: noTimers,
          },
        });

        const report = await engine.syncNow();

        // Independent oracle: the three gates, written out directly.
        const mayReachBackend =
          sc.optedIn && sc.online && sc.session === 'signed_in' && sc.hasShop;
        const businessCalls = calls.filter((c) => c !== 'signedIn');

        if (!mayReachBackend) {
          expect(businessCalls).toEqual([]);
          expect(storeWrites).toEqual([]);
          expect(report.ran).toBe(false);
          // Every Mutation stays in the Outbox, unchanged.
          expect(mutations).toEqual(before);
        }
        // Without opt-in or connectivity the engine must not even probe the backend.
        if (!sc.optedIn || !sc.online) {
          expect(calls).toEqual([]);
        }
        // Sanity: when all gates are open and work exists, the engine does reach the remote.
        if (mayReachBackend) {
          expect(report.ran).toBe(true);
          expect(calls).toContain('ensureShopTeam');
        }
      }),
    );
  });
});
