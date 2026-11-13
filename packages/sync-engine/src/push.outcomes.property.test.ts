import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import {
  backoffInputArb,
  faultAt,
  faultPlanArb,
  type FaultPlan,
} from '../../../tests/property/arbitraries/faults';
import { SyncError, type SyncRemote } from './contracts';
import {
  backoffDelayMs,
  push,
  type MutationFailure,
  type PushMutation,
  type PushStore,
} from './push';
import type { MutationPayloadLike } from './remote-row';

const settings = { remoteShopId: 'team-1', deviceId: 'dev-1' } as const;

// Literal constants from the design (Backoff section), deliberately not imported.
const BASE_MS = 2_000;
const CAP_MS = 300_000;
const JITTER = 0.2;

// ---------- Generators ----------

/** Product Mutations make 1 remote write; order Mutations with k items make k + 1. */
const specArb = fc.oneof(
  fc.constant({ kind: 'product' as const, items: 0 }),
  fc.record({ kind: fc.constant('order' as const), items: fc.integer({ min: 1, max: 3 }) }),
);

const scenarioArb = fc.record({
  specs: fc.array(specArb, { minLength: 1, maxLength: 8 }),
  attempts: fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 8, maxLength: 8 }),
  plan: faultPlanArb(12),
  jitter: fc.double({ min: 0, max: 0.999999, noNaN: true }),
  nowMs: fc.integer({ min: 1_704_067_200_000, max: 1_893_456_000_000 }),
});

const mutationIdOf = (i: number): string =>
  `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

function payloadFor(spec: { kind: 'product' | 'order'; items: number }, i: number): MutationPayloadLike {
  const ts = new Date(1_700_000_000_000 + i * 1000).toISOString();
  if (spec.kind === 'product') {
    return {
      kind: 'product',
      product: {
        id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
        shopId: 'local-shop',
        name: `Product ${i}`,
        aliases: [],
        unit: 'kg',
        pricePaise: 100,
        active: true,
        updatedAt: ts,
        deletedAt: null,
      },
    };
  }
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
      createdAt: ts,
    },
    items: Array.from({ length: spec.items }, (_, index) => ({
      index,
      productId: null,
      nameSnapshot: `Item ${index}`,
      qtyMilli: 1000,
      unit: 'kg',
      unitPricePaise: null,
      lineTotalPaise: null,
      resolutionStatus: 'confirmed' as const,
    })),
  };
}

// ---------- Test doubles ----------

/** A remote whose n-th write call follows the fault plan. `stale` is a lost race, i.e. success. */
function scriptedRemote(plan: FaultPlan): SyncRemote {
  let call = 0;
  const step = (): 'ok' | 'stale' => {
    const s = faultAt(plan, call++);
    if (s.kind === 'error') throw new SyncError(s.errorKind, 'injected');
    return s.kind;
  };
  return {
    signedIn: async () => ({ userId: 'u' }),
    ensureShopTeam: async () => ({ remoteShopId: 'team-1' }),
    pull: async () => ({ rows: [], next: null }),
    createOnce: async () => (step() === 'stale' ? 'already_exists' : 'created'),
    upsertGuarded: async () => (step() === 'stale' ? 'stale' : 'written'),
  };
}

type Status = 'pending' | 'synced' | 'failed';
interface Row {
  status: Status;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: MutationFailure | null;
  recordSyncState: 'pending' | 'synced' | 'failed';
}

function makeStore(mutations: PushMutation[]): { store: PushStore; rows: Map<string, Row> } {
  const rows = new Map<string, Row>(
    mutations.map((m) => [
      m.mutationId,
      {
        status: 'pending',
        attempts: m.attempts,
        nextAttemptAt: null,
        lastError: null,
        recordSyncState: 'pending',
      },
    ]),
  );
  const row = (id: string): Row => rows.get(id)!;
  const store: PushStore = {
    listDue: async (_now, limit) =>
      mutations.filter((m) => row(m.mutationId).status === 'pending').slice(0, limit),
    markSyncing: async () => undefined,
    markSynced: async (m) => {
      row(m.mutationId).status = 'synced';
      row(m.mutationId).recordSyncState = 'synced';
    },
    markRetry: async (id, patch) => {
      Object.assign(row(id), patch);
    },
    markFailed: async (m, patch) => {
      const r = row(m.mutationId);
      r.status = 'failed';
      r.recordSyncState = 'failed';
      r.attempts = patch.attempts;
      r.lastError = patch.lastError;
    },
  };
  return { store, rows };
}

// ---------- Oracle ----------

interface Expected {
  status: Status;
  retry: boolean;
  touched: boolean;
}

/** Walks the fault plan call by call, independently of the push implementation. */
function expectedOutcomes(
  specs: readonly { items: number }[],
  plan: FaultPlan,
): Expected[] {
  const out: Expected[] = specs.map(() => ({ status: 'pending', retry: false, touched: false }));
  let call = 0;
  for (let i = 0; i < specs.length; i += 1) {
    const writes = specs[i]!.items + 1;
    let outcome: 'ok' | 'terminal' | 'retry' = 'ok';
    for (let w = 0; w < writes; w += 1) {
      const s = faultAt(plan, call++);
      if (s.kind !== 'error') continue;
      outcome = s.errorKind === 'validation' || s.errorKind === 'permission' ? 'terminal' : 'retry';
      break;
    }
    out[i]!.touched = true;
    if (outcome === 'ok') out[i]!.status = 'synced';
    else if (outcome === 'terminal') out[i]!.status = 'failed';
    else {
      out[i]!.retry = true;
      break; // a retryable failure ends the pass; later Mutations are not attempted
    }
  }
  return out;
}

describe('push outcomes and backoff', () => {
  // Feature: awaaz-kit, Property 37: Push outcomes update state and backoff correctly
  // **Validates: Requirements 16.5, 16.6**
  it('Property 37: accepted -> synced; failed stays in outbox with attempts+1, lastError and bounded backoff; delay non-decreasing', async () => {
    // Part 1: outcomes against a scripted fake remote.
    await assertProperty(
      fc.asyncProperty(scenarioArb, async ({ specs, attempts, plan, jitter, nowMs }) => {
        const mutations: PushMutation[] = specs.map((s, i) => ({
          mutationId: mutationIdOf(i),
          payload: payloadFor(s, i),
          attempts: attempts[i]!,
        }));
        const { store, rows } = makeStore(mutations);

        await push({
          remote: scriptedRemote(plan),
          store,
          settings,
          now: () => new Date(nowMs),
          random: () => jitter,
        });

        const expected = expectedOutcomes(specs, plan);
        expected.forEach((exp, i) => {
          const r = rows.get(mutationIdOf(i))!;
          expect(r.status).toBe(exp.status);
          if (exp.status === 'synced') {
            expect(r.recordSyncState).toBe('synced');
            expect(r.lastError).toBeNull();
            expect(r.attempts).toBe(attempts[i]);
          } else if (exp.touched) {
            // Failed or retrying: retained, attempts + 1, lastError set.
            expect(r.attempts).toBe(attempts[i]! + 1);
            expect(r.lastError).not.toBeNull();
            expect(r.lastError!.message.length).toBeGreaterThan(0);
            if (exp.retry) {
              expect(r.recordSyncState).toBe('pending');
              const next = Date.parse(r.nextAttemptAt!);
              expect(next).toBeGreaterThanOrEqual(nowMs);
              expect(next).toBeLessThanOrEqual(nowMs + CAP_MS);
              const delay = Math.min(CAP_MS, BASE_MS * 2 ** attempts[i]!) * (1 - JITTER * jitter);
              expect(Math.abs(next - nowMs - delay)).toBeLessThan(1);
            } else {
              expect(r.recordSyncState).toBe('failed');
            }
          } else {
            // Never attempted this pass: untouched.
            expect(r.attempts).toBe(attempts[i]);
            expect(r.lastError).toBeNull();
            expect(r.status).toBe('pending');
          }
        });
      }),
    );

    // Part 2: the delay function is bounded and non-decreasing in attempts for fixed jitter.
    await assertProperty(
      fc.property(backoffInputArb, ({ attempts, jitter }) => {
        const at = (n: number): number => backoffDelayMs(n, () => jitter);
        expect(at(attempts)).toBeGreaterThan(0);
        expect(at(attempts)).toBeLessThanOrEqual(CAP_MS);
        expect(at(attempts + 1)).toBeGreaterThanOrEqual(at(attempts));
      }),
    );
  });
});
