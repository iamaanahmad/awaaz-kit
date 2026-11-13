import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { REMOTE_TABLES } from './contracts';
import {
  createSyncEngine,
  type EventSource,
  type SyncEngineStore,
  type SyncSettings,
} from './engine';
import { InMemoryRemote } from './in-memory-remote';
import type { PushMutation } from './push';
import { toRemoteRow, type MutationPayloadLike, type TranscriptSetting } from './remote-row';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const TRANSCRIPT_KEYS = ['rawTranscript', 'normalizedText'] as const;

// ---------- Generators ----------

/** Non-empty text, so leaked content is always detectable. */
const textArb = fc.string({ minLength: 1, maxLength: 40 });

const settingArb: fc.Arbitrary<TranscriptSetting | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant({ enabled: false } as TranscriptSetting),
  fc.constant({ enabled: true } as TranscriptSetting),
  fc.record({ enabled: fc.boolean(), at: fc.constant(T0.toISOString()) }),
);

interface Case {
  readonly kind: 'order' | 'bill' | 'bill_correction' | 'product' | 'customer';
  readonly raw: string;
  readonly normalized: string;
  readonly qty: readonly number[];
}

const caseArb: fc.Arbitrary<Case> = fc.record({
  kind: fc.constantFrom('order', 'bill', 'bill_correction', 'product', 'customer'),
  raw: textArb,
  normalized: textArb,
  qty: fc.array(fc.integer({ min: 1, max: 10_000 }), { maxLength: 3 }),
});

function payloadOf(c: Case): MutationPayloadLike {
  const at = T0.toISOString();
  switch (c.kind) {
    case 'product':
      return {
        kind: 'product',
        product: {
          id: 'p1',
          shopId: 'local',
          name: 'Atta',
          aliases: [],
          unit: 'kg',
          pricePaise: 100,
          active: true,
          updatedAt: at,
          deletedAt: null,
        },
      };
    case 'customer':
      return {
        kind: 'customer',
        customer: {
          id: 'c1',
          shopId: 'local',
          name: 'Demo',
          isSample: true,
          updatedAt: at,
          deletedAt: null,
        },
      };
    case 'order':
      return {
        kind: 'order',
        order: {
          id: 'o1',
          localNumber: 'O-1',
          customerId: null,
          walkIn: true,
          status: 'confirmed',
          fulfillment: 'pickup',
          note: null,
          totalEstimatePaise: 0,
          rawTranscript: c.raw,
          normalizedText: c.normalized,
          createdAt: at,
        },
        items: c.qty.map((q, index) => ({
          index,
          productId: null,
          nameSnapshot: `Item ${index}`,
          qtyMilli: q,
          unit: 'kg' as const,
          unitPricePaise: null,
          lineTotalPaise: null,
          resolutionStatus: 'confirmed' as const,
        })),
      };
    case 'bill':
    case 'bill_correction':
      return {
        kind: c.kind,
        bill: {
          id: 'b1',
          receiptNumber: 'RC-1',
          kind: c.kind === 'bill' ? 'sale' : 'correction',
          correctsBillId: null,
          customerId: null,
          status: 'finalized',
          subtotalPaise: 100,
          discountPaise: 0,
          taxPaise: 0,
          totalPaise: 100,
          rawTranscript: c.raw,
          normalizedText: c.normalized,
          createdAt: at,
          finalizedAt: at,
        },
        items: c.qty.map((q, index) => ({
          index,
          productId: null,
          nameSnapshot: `Item ${index}`,
          qtyMilli: q,
          unit: 'kg' as const,
          unitPricePaise: 100,
          lineTotalPaise: 100,
        })),
      };
  }
}

const hasHeaderWithTranscripts = (c: Case): boolean =>
  c.kind === 'order' || c.kind === 'bill' || c.kind === 'bill_correction';

// ---------- Engine harness ----------

interface M extends PushMutation {
  payload: MutationPayloadLike;
  state: 'pending' | 'synced';
}

const noEvents: EventSource = { subscribe: () => () => undefined };

function engineFor(
  mutations: M[],
  remote: InMemoryRemote,
  settings: SyncSettings,
) {
  const store: SyncEngineStore<M> = {
    getSettings: async () => settings,
    push: {
      listDue: async (_now, limit) => mutations.filter((m) => m.state === 'pending').slice(0, limit),
      markSyncing: async () => undefined,
      markSynced: async (m) => {
        mutations.find((x) => x.mutationId === m.mutationId)!.state = 'synced';
      },
      markRetry: async () => undefined,
      markFailed: async () => undefined,
    },
    pull: {
      getCursor: async () => null,
      lookup: async () => undefined,
      applyPage: async () => undefined,
    },
    countPending: async () => mutations.filter((m) => m.state === 'pending').length,
    countFailed: async () => 0,
    getLastSyncedAt: async () => null,
  };
  return createSyncEngine<M>({
    store,
    remote,
    clock: { now: () => T0 },
    random: () => 0,
    env: {
      isOnline: () => true,
      onlineEvents: noEvents,
      visibility: noEvents,
      timers: { setInterval: () => 0, clearInterval: () => undefined },
    },
  });
}

async function remoteDump(remote: InMemoryRemote): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  // Idempotent: resolves the same team id the engine used for 'local-shop'.
  const { remoteShopId } = await remote.ensureShopTeam({ shopId: 'local-shop', name: 'Shop' });
  for (const table of REMOTE_TABLES) {
    const { rows } = await remote.pull(table, remoteShopId, null, 100_000);
    all.push(...rows);
  }
  return all;
}

describe('transcript exclusion', () => {
  // Feature: awaaz-kit, Property 41: Transcripts are excluded from remote rows unless enabled
  // **Validates: Requirements 16.19, 16.20**
  it('Property 41: toRemoteRow includes transcripts iff syncTranscripts.enabled', () =>
    assertProperty(
      fc.property(caseArb, settingArb, (c, setting) => {
        const writes = toRemoteRow(
          { mutationId: '00000000-0000-4000-8000-000000000001', payload: payloadOf(c) },
          { remoteShopId: 'team-1', deviceId: 'dev-1', syncTranscripts: setting },
        );
        // Oracle: only an explicit `enabled: true` opts in; absent setting means disabled.
        const expectIncluded = setting !== undefined && setting.enabled === true;

        for (const w of writes) {
          for (const key of TRANSCRIPT_KEYS) {
            const shouldHave =
              expectIncluded && hasHeaderWithTranscripts(c) && (w.table === 'orders' || w.table === 'bills');
            expect(key in w.data).toBe(shouldHave);
            if (shouldHave) expect(w.data[key]).toBe(key === 'rawTranscript' ? c.raw : c.normalized);
          }
        }
      }),
    ));

  // Feature: awaaz-kit, Property 41 (engine gating half): Transcripts are excluded from remote rows unless enabled
  // 50 runs: each run drives a full engine pass against the in-memory remote.
  // **Validates: Requirements 16.19, 16.20**
  it('Property 41: engine sends nothing when not opted in, and no transcripts unless enabled', async () => {
    await assertProperty(
      fc.asyncProperty(
        fc.array(caseArb, { minLength: 1, maxLength: 5 }),
        fc.boolean(),
        settingArb,
        async (cases, optedIn, setting) => {
          const mutations: M[] = cases.map((c, i) => ({
            mutationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
            payload: payloadOf(c),
            attempts: 0,
            state: 'pending',
          }));
          const remote = new InMemoryRemote({ userId: 'user-1', now: () => T0.toISOString() });
          const engine = engineFor(mutations, remote, {
            optedIn,
            syncTranscripts: setting,
            shop: { id: 'local-shop', name: 'Shop' },
            deviceId: 'dev-1',
          });

          const report = await engine.syncNow();
          const rows = await remoteDump(remote);

          if (!optedIn) {
            expect(report.skipped).toBe('not_opted_in');
            expect(rows).toHaveLength(0);
            expect(mutations.every((m) => m.state === 'pending')).toBe(true);
            return;
          }
          expect(rows.length).toBeGreaterThan(0);
          const enabled = setting?.enabled === true;
          for (const row of rows) {
            const leaked = TRANSCRIPT_KEYS.some((k) => k in row);
            if (!enabled) expect(leaked).toBe(false);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
