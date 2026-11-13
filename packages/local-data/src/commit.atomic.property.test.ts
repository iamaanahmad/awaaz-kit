import { confirm, createUserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import {
  commitConfirmed,
  openDb,
  type AuditEventRecord,
  type BillBundle,
  type BillRecord,
  type CorrectionBundle,
  type OrderBundle,
  type ShopRecord,
} from './index.js';
import type { AwaazDb } from './schema.js';

const T = '2025-01-01T00:00:00.000Z';
let dbCounter = 0;

// ---------------------------------------------------------------------------
// Fault plans: one injected failure at the n-th write to one store.
// Faults are injected with Dexie hooks, which run inside the commit transaction
// for every write path (add, bulkAdd, put). A throw aborts the transaction.
// ---------------------------------------------------------------------------

type FaultStore = 'shops' | 'orders' | 'orderItems' | 'bills' | 'billItems' | 'auditEvents' | 'outbox';
type FaultPlan = { store: FaultStore; occurrence: number } | null;

const STORES_BY_KIND: Record<'order' | 'bill' | 'correction', FaultStore[]> = {
  order: ['shops', 'orders', 'orderItems', 'auditEvents', 'outbox'],
  bill: ['shops', 'bills', 'billItems', 'auditEvents', 'outbox'],
  // Corrections carry no item rows, so there is no billItems write to fail.
  correction: ['shops', 'bills', 'auditEvents', 'outbox'],
};

class InjectedFault extends Error {
  constructor(store: string) {
    super(`injected fault in ${store}`);
    this.name = 'InjectedFault';
  }
}

function installFault(db: AwaazDb, plan: FaultPlan): { fired: () => boolean; remove: () => void } {
  let seen = 0;
  let fired = false;
  const removers: Array<() => void> = [];
  if (plan) {
    const table = db[plan.store];
    const check = (): void => {
      if (seen++ === plan.occurrence) {
        fired = true;
        throw new InjectedFault(plan.store);
      }
    };
    if (plan.store === 'shops') {
      // The shop row exists already, so the counter bump is an update.
      const fn = (): void => check();
      table.hook('updating', fn as never);
      removers.push(() => table.hook('updating').unsubscribe(fn as never));
    } else {
      const fn = (): void => check();
      table.hook('creating', fn as never);
      removers.push(() => table.hook('creating').unsubscribe(fn as never));
    }
  }
  return { fired: () => fired, remove: () => removers.forEach((r) => r()) };
}

// ---------------------------------------------------------------------------
// Generators: stay inside the valid input space.
// ---------------------------------------------------------------------------

type Scenario = {
  kind: 'order' | 'bill' | 'correction';
  id: string;
  itemCount: number;
  unitPricePaise: number;
  qtyMilli: number;
  seq: number;
  preexisting: number;
  fault: FaultPlan;
};

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    kind: fc.constantFrom('order' as const, 'bill' as const, 'correction' as const),
    id: fc.uuid(),
    itemCount: fc.integer({ min: 1, max: 4 }),
    unitPricePaise: fc.integer({ min: 1, max: 100_000 }),
    qtyMilli: fc.integer({ min: 1, max: 50_000 }),
    seq: fc.integer({ min: 1, max: 9_000 }),
    preexisting: fc.integer({ min: 0, max: 2 }),
    faultChoice: fc.boolean(),
    faultStorePick: fc.nat(),
    faultOccurrencePick: fc.nat(),
  })
  .map((r) => {
    const stores = STORES_BY_KIND[r.kind];
    const store = stores[r.faultStorePick % stores.length]!;
    const writes = store === 'orderItems' || store === 'billItems' ? r.itemCount : 1;
    const fault: FaultPlan = r.faultChoice
      ? { store, occurrence: r.faultOccurrencePick % writes }
      : null;
    return {
      kind: r.kind,
      id: r.id,
      itemCount: r.itemCount,
      unitPricePaise: r.unitPricePaise,
      qtyMilli: r.qtyMilli,
      seq: r.seq,
      preexisting: r.preexisting,
      fault,
    };
  });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const audit = (id: string, entityId: string, entityType: 'order' | 'bill'): AuditEventRecord => ({
  id,
  entityType,
  entityId,
  action: 'confirm',
  actor: 'local_user',
  createdAt: T,
  metadata: {},
});

function makeShop(seq: number): ShopRecord {
  return {
    id: 's1',
    name: 'Shop',
    currency: 'INR',
    locale: 'en-IN',
    isDemo: false,
    nextOrderSeq: seq,
    nextReceiptSeq: seq,
    remoteShopId: null,
    createdAt: T,
    updatedAt: T,
    syncVersion: 0,
  };
}

function makeBillRow(id: string, over: Partial<BillRecord> = {}): BillRecord {
  return {
    id,
    shopId: 's1',
    kind: 'sale',
    correctsBillId: null,
    customerId: null,
    status: 'finalized',
    subtotalPaise: 500,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: 500,
    rawTranscript: '',
    normalizedText: '',
    mutationId: `m-${id}`,
    createdAt: T,
    finalizedAt: T,
    receiptNumber: 'R-0000',
    syncState: 'local_only',
    ...over,
  } as BillRecord;
}

type AnyBundle = OrderBundle | BillBundle | CorrectionBundle;

function makeBundle(s: Scenario): AnyBundle {
  const lineTotalPaise = Math.round((s.unitPricePaise * s.qtyMilli) / 1000);
  const idx = Array.from({ length: s.itemCount }, (_, i) => i);
  if (s.kind === 'order') {
    return {
      kind: 'order',
      order: {
        id: s.id,
        shopId: 's1',
        customerId: null,
        walkIn: true,
        status: 'confirmed',
        fulfillment: 'pickup',
        note: null,
        totalEstimatePaise: lineTotalPaise * s.itemCount,
        rawTranscript: '',
        normalizedText: '',
        extraction: null,
        mutationId: `m-${s.id}`,
        createdAt: T,
      },
      items: idx.map((i) => ({
        id: `${s.id}-i${i}`,
        orderId: s.id,
        index: i,
        productId: 'p1',
        nameSnapshot: 'Atta',
        qtyMilli: s.qtyMilli,
        unit: 'kg',
        unitPricePaise: s.unitPricePaise,
        lineTotalPaise,
        resolutionStatus: 'confirmed',
      })),
      auditEvent: audit(`a-${s.id}`, s.id, 'order'),
    } as OrderBundle;
  }
  const items = idx.map((i) => ({
    id: `${s.id}-i${i}`,
    billId: s.id,
    index: i,
    productId: 'p1',
    nameSnapshot: 'Atta',
    qtyMilli: s.qtyMilli,
    unit: 'kg',
    unitPricePaise: s.unitPricePaise,
    lineTotalPaise,
  }));
  const total = lineTotalPaise * s.itemCount;
  const base = {
    id: s.id,
    shopId: 's1',
    kind: 'sale' as const,
    correctsBillId: null,
    customerId: null,
    status: 'finalized' as const,
    subtotalPaise: total,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: total,
    rawTranscript: '',
    normalizedText: '',
    mutationId: `m-${s.id}`,
    createdAt: T,
    finalizedAt: T,
  };
  if (s.kind === 'bill') {
    return {
      kind: 'bill',
      bill: base,
      items,
      auditEvent: audit(`a-${s.id}`, s.id, 'bill'),
    } as BillBundle;
  }
  return {
    kind: 'correction',
    bill: { ...base, kind: 'void' as const, correctsBillId: 'orig' },
    items: [],
    auditEvent: audit(`a-${s.id}`, s.id, 'bill'),
  } as CorrectionBundle;
}

function mint(bundle: AnyBundle) {
  const adapter = {
    id: 'order' as const,
    parse: () => bundle,
    validate: () => [],
    canConfirm: () => true,
    toBundle: () => bundle,
  };
  const ev = createUserConfirmationEvidence(
    { isTrusted: true, type: 'click' },
    1,
    () => new Date(T),
  );
  return confirm(adapter as never, bundle, ev) as never as Parameters<typeof commitConfirmed>[1];
}

async function seed(db: AwaazDb, s: Scenario): Promise<void> {
  await db.shops.put(makeShop(s.seq));
  // Unrelated finalized bills / existing audit rows so "unchanged" is non-trivial.
  for (let i = 0; i < s.preexisting; i++) {
    await db.bills.add(makeBillRow(`pre-${i}`, { receiptNumber: `R-${i}`, mutationId: `m-pre-${i}` }));
  }
  if (s.kind === 'correction') {
    await db.bills.add(makeBillRow('orig', { receiptNumber: 'R-orig', mutationId: 'm-orig' }));
  }
}

/** Raw snapshot of every store, sorted by primary key, independent of commit code. */
async function snapshot(db: AwaazDb): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    const rows = await table.toArray();
    const keyPath = table.schema.primKey.keyPath;
    const key = (r: unknown): string => String((r as Record<string, unknown>)[String(keyPath)]);
    out[table.name] = rows.sort((a, b) => key(a).localeCompare(key(b)));
  }
  return out;
}

const pad4 = (n: number): string => '0000'.slice(String(n).length) + String(n);

describe('commitConfirmed atomicity (property)', () => {
  // Feature: awaaz-kit, Property 28: Confirmation commits atomically
  // **Validates: Requirements 15.5, 15.6**
  it('Property 28: any single injected failure leaves no partial rows; no failure writes everything together', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async (s) => {
        const db = await openDb({ name: `atomic-${++dbCounter}`, indexedDB: new IDBFactory() });
        try {
          await seed(db, s);
          const before = await snapshot(db);
          const bundle = makeBundle(s);
          const action = mint(bundle);

          const fault = installFault(db, s.fault);
          let result: Awaited<ReturnType<typeof commitConfirmed>> | undefined;
          let error: unknown;
          try {
            result = await commitConfirmed(db, action);
          } catch (e) {
            error = e;
          } finally {
            fault.remove();
          }
          const after = await snapshot(db);

          if (s.fault) {
            // The plan must really have hit a write, or the property would be vacuous.
            expect(fault.fired()).toBe(true);
            // Result reports failure, and every store (incl. shop counters) is byte-for-byte unchanged.
            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(after).toEqual(before);
            return;
          }

          // No fault: all rows land together, counted by an oracle independent of commit code.
          expect(error).toBeUndefined();
          expect(result?.status).toBe('created');
          const isOrder = s.kind === 'order';
          const expectedNumber = `${isOrder ? 'ORD' : 'R'}-${pad4(s.seq)}`;
          expect(result?.number).toBe(expectedNumber);

          const grow = (name: string, by: number): void => {
            expect(after[name]!.length).toBe(before[name]!.length + by);
          };
          grow('orders', isOrder ? 1 : 0);
          grow('orderItems', isOrder ? s.itemCount : 0);
          grow('bills', isOrder ? 0 : 1);
          grow('billItems', isOrder || s.kind === 'correction' ? 0 : s.itemCount);
          grow('auditEvents', 1);
          grow('outbox', 1);

          const shopAfter = after.shops![0] as ShopRecord;
          expect(shopAfter.nextOrderSeq).toBe(isOrder ? s.seq + 1 : s.seq);
          expect(shopAfter.nextReceiptSeq).toBe(isOrder ? s.seq : s.seq + 1);

          const outbox = after.outbox![0] as { mutationId: string; entityId: string; state: string };
          expect(outbox).toMatchObject({
            mutationId: `m-${s.id}`,
            entityId: s.id,
            state: 'pending',
          });
        } finally {
          db.close();
        }
      }),
      // Each run opens a fresh fake-indexeddb database; 100 runs stay fast in-memory.
    );
  }, 60_000);
});
