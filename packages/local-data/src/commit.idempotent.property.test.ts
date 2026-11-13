import { confirm, createUserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import {
  commitConfirmed,
  openDb,
  type AuditEventRecord,
  type BillBundle,
  type OrderBundle,
  type ShopRecord,
} from './index.js';
import type { AwaazDb } from './schema.js';

const T = '2025-01-01T00:00:00.000Z';
let dbCounter = 0;

type Scenario = {
  kind: 'order' | 'bill';
  id: string;
  itemCount: number;
  unitPricePaise: number;
  qtyMilli: number;
  seq: number;
  repeats: number;
  concurrent: boolean;
};

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  kind: fc.constantFrom('order' as const, 'bill' as const),
  id: fc.uuid(),
  itemCount: fc.integer({ min: 1, max: 4 }),
  unitPricePaise: fc.integer({ min: 1, max: 100_000 }),
  qtyMilli: fc.integer({ min: 1, max: 50_000 }),
  seq: fc.integer({ min: 1, max: 9_000 }),
  repeats: fc.integer({ min: 1, max: 6 }),
  concurrent: fc.boolean(),
});

const audit = (id: string, entityType: 'order' | 'bill'): AuditEventRecord => ({
  id: `a-${id}`,
  entityType,
  entityId: id,
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

function makeBundle(s: Scenario): OrderBundle | BillBundle {
  const lineTotalPaise = Math.round((s.unitPricePaise * s.qtyMilli) / 1000);
  const idx = Array.from({ length: s.itemCount }, (_, i) => i);
  const total = lineTotalPaise * s.itemCount;
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
        totalEstimatePaise: total,
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
      auditEvent: audit(s.id, 'order'),
    } as OrderBundle;
  }
  return {
    kind: 'bill',
    bill: {
      id: s.id,
      shopId: 's1',
      kind: 'sale',
      correctsBillId: null,
      customerId: null,
      status: 'finalized',
      subtotalPaise: total,
      discountPaise: 0,
      taxPaise: 0,
      totalPaise: total,
      rawTranscript: '',
      normalizedText: '',
      mutationId: `m-${s.id}`,
      createdAt: T,
      finalizedAt: T,
    },
    items: idx.map((i) => ({
      id: `${s.id}-i${i}`,
      billId: s.id,
      index: i,
      productId: 'p1',
      nameSnapshot: 'Atta',
      qtyMilli: s.qtyMilli,
      unit: 'kg',
      unitPricePaise: s.unitPricePaise,
      lineTotalPaise,
    })),
    auditEvent: audit(s.id, 'bill'),
  } as BillBundle;
}

/** The same ConfirmedAction value is submitted every time (double-click / retry). */
function mint(bundle: OrderBundle | BillBundle) {
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

const pad4 = (n: number): string => '0000'.slice(String(n).length) + String(n);

describe('commitConfirmed idempotency (property)', () => {
  // Feature: awaaz-kit, Property 21: Confirming the same draft repeatedly creates one record
  // **Validates: Requirements 11.8**
  it('Property 21: n sequential or concurrent commits of one ConfirmedAction create one record, one outbox row, one audit event, one counter increment', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async (s) => {
        const db: AwaazDb = await openDb({
          name: `idem-${++dbCounter}`,
          indexedDB: new IDBFactory(),
        });
        try {
          await db.shops.put(makeShop(s.seq));
          const action = mint(makeBundle(s));

          const results = s.concurrent
            ? await Promise.all(Array.from({ length: s.repeats }, () => commitConfirmed(db, action)))
            : await (async () => {
                const out: Awaited<ReturnType<typeof commitConfirmed>>[] = [];
                for (let i = 0; i < s.repeats; i++) out.push(await commitConfirmed(db, action));
                return out;
              })();

          const isOrder = s.kind === 'order';
          const expectedNumber = `${isOrder ? 'ORD' : 'R'}-${pad4(s.seq)}`;

          // Exactly one call created; every other call reports the same record without writing.
          expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
          for (const r of results) {
            expect(r.recordId).toBe(s.id);
            expect(r.number).toBe(expectedNumber);
          }

          // Oracle: raw store counts, independent of commit code.
          expect(await db.orders.count()).toBe(isOrder ? 1 : 0);
          expect(await db.orderItems.count()).toBe(isOrder ? s.itemCount : 0);
          expect(await db.bills.count()).toBe(isOrder ? 0 : 1);
          expect(await db.billItems.count()).toBe(isOrder ? 0 : s.itemCount);
          expect(await db.auditEvents.count()).toBe(1);
          expect(await db.outbox.count()).toBe(1);

          const shop = (await db.shops.get('s1')) as ShopRecord;
          expect(shop.nextOrderSeq).toBe(isOrder ? s.seq + 1 : s.seq);
          expect(shop.nextReceiptSeq).toBe(isOrder ? s.seq : s.seq + 1);
        } finally {
          db.close();
        }
      }),
    );
  }, 60_000);
});
