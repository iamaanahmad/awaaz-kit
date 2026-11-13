import { confirm, createUserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import {
  commitConfirmed,
  openDb,
  type AuditEventRecord,
  type BillBundle,
  type CorrectionBundle,
  type ShopRecord,
} from './index.js';
import type { AwaazDb } from './schema.js';

const T = '2025-01-01T00:00:00.000Z';
let dbCounter = 0;

type Scenario = {
  billId: string;
  itemCount: number;
  unitPricePaise: number;
  qtyMilli: number;
  correctionKind: 'void' | 'correction';
  correctionId: string;
  attempt: 'update_bill' | 'update_item' | 'put_bill' | 'delete_bill' | 'delete_item' | 'bulk_delete';
  field: 'totalPaise' | 'subtotalPaise' | 'discountPaise' | 'status' | 'customerId' | 'kind';
  newValue: number;
  syncState: 'pending' | 'synced' | 'failed' | 'conflict';
};

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  billId: fc.uuid().map((u) => `b${u.slice(1)}`),
  itemCount: fc.integer({ min: 1, max: 4 }),
  unitPricePaise: fc.integer({ min: 1, max: 100_000 }),
  qtyMilli: fc.integer({ min: 1, max: 50_000 }),
  correctionKind: fc.constantFrom('void' as const, 'correction' as const),
  correctionId: fc.uuid().map((u) => `c${u.slice(1)}`),
  attempt: fc.constantFrom(
    'update_bill' as const,
    'update_item' as const,
    'put_bill' as const,
    'delete_bill' as const,
    'delete_item' as const,
    'bulk_delete' as const,
  ),
  field: fc.constantFrom(
    'totalPaise' as const,
    'subtotalPaise' as const,
    'discountPaise' as const,
    'status' as const,
    'customerId' as const,
    'kind' as const,
  ),
  newValue: fc.integer({ min: 0, max: 1_000_000 }),
  syncState: fc.constantFrom('pending' as const, 'synced' as const, 'failed' as const, 'conflict' as const),
});

const audit = (id: string): AuditEventRecord => ({
  id: `a-${id}`,
  entityType: 'bill',
  entityId: id,
  action: 'confirm',
  actor: 'local_user',
  createdAt: T,
  metadata: {},
});

const shop: ShopRecord = {
  id: 's1',
  name: 'Shop',
  currency: 'INR',
  locale: 'en-IN',
  isDemo: false,
  nextOrderSeq: 1,
  nextReceiptSeq: 1,
  remoteShopId: null,
  createdAt: T,
  updatedAt: T,
  syncVersion: 0,
};

function items(billId: string, s: Scenario, prefix: string) {
  const lineTotalPaise = Math.round((s.unitPricePaise * s.qtyMilli) / 1000);
  return Array.from({ length: s.itemCount }, (_, i) => ({
    id: `${prefix}-i${i}`,
    billId,
    index: i,
    productId: 'p1',
    nameSnapshot: 'Atta',
    qtyMilli: s.qtyMilli,
    unit: 'kg',
    unitPricePaise: s.unitPricePaise,
    lineTotalPaise,
  }));
}

function billBundle(s: Scenario): BillBundle {
  const total = Math.round((s.unitPricePaise * s.qtyMilli) / 1000) * s.itemCount;
  return {
    kind: 'bill',
    bill: {
      id: s.billId,
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
      mutationId: `m-${s.billId}`,
      createdAt: T,
      finalizedAt: T,
    },
    items: items(s.billId, s, s.billId),
    auditEvent: audit(s.billId),
  } as BillBundle;
}

function correctionBundle(s: Scenario): CorrectionBundle {
  const isVoid = s.correctionKind === 'void';
  const lines = isVoid ? [] : items(s.correctionId, s, s.correctionId);
  const total = lines.reduce((a, l) => a + l.lineTotalPaise, 0);
  return {
    kind: 'correction',
    bill: {
      id: s.correctionId,
      shopId: 's1',
      kind: s.correctionKind,
      correctsBillId: s.billId,
      customerId: null,
      status: 'finalized',
      subtotalPaise: total,
      discountPaise: 0,
      taxPaise: 0,
      totalPaise: total,
      rawTranscript: '',
      normalizedText: '',
      mutationId: `m-${s.correctionId}`,
      createdAt: T,
      finalizedAt: T,
    },
    items: lines,
    auditEvent: audit(s.correctionId),
  } as CorrectionBundle;
}

function mint(bundle: BillBundle | CorrectionBundle) {
  const adapter = {
    id: 'bill' as const,
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

/** Raw serialized view of the bill and bill-item stores, sorted by primary key. */
async function snapshot(db: AwaazDb, billId: string): Promise<string> {
  const bill = await db.bills.get(billId);
  const lines = (await db.billItems.where('billId').equals(billId).toArray()).sort((a, b) =>
    a.id < b.id ? -1 : 1,
  );
  return JSON.stringify({ bill, lines });
}

describe('finalized bill immutability (property)', () => {
  // Feature: awaaz-kit, Property 29: Finalized bills are immutable and corrections are separate
  // **Validates: Requirements 13.13, 13.14, 16.14**
  it('Property 29: content writes to a finalized bill are rejected and leave rows byte-identical; corrections are separate linked rows', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async (s) => {
        const db: AwaazDb = await openDb({
          name: `immut-${++dbCounter}`,
          indexedDB: new IDBFactory(),
        });
        try {
          await db.shops.put(shop);
          await commitConfirmed(db, mint(billBundle(s)));
          const before = await snapshot(db, s.billId);
          const original = (await db.bills.get(s.billId))!;
          const firstItemId = `${s.billId}-i0`;

          // Content mutation attempts must reject.
          const content: Record<string, unknown> = {
            [s.field]: s.field === 'status' ? 'draft' : s.field === 'kind' ? 'void' : s.field === 'customerId' ? 'c9' : original.totalPaise + 1 + s.newValue,
          };
          const attempt = (): Promise<unknown> => {
            switch (s.attempt) {
              case 'update_bill':
                return db.bills.update(s.billId, content);
              case 'update_item':
                return db.billItems.update(firstItemId, { qtyMilli: s.qtyMilli + 1 + s.newValue });
              case 'put_bill':
                return db.bills.put({ ...original, ...content } as never);
              case 'delete_bill':
                return db.bills.delete(s.billId);
              case 'delete_item':
                return db.billItems.delete(firstItemId);
              case 'bulk_delete':
                return db.billItems.bulkDelete([firstItemId]);
            }
          };
          let rejected = false;
          try {
            await attempt();
          } catch {
            rejected = true;
          }
          expect(rejected).toBe(true);
          expect(await snapshot(db, s.billId)).toBe(before);

          // Sync bookkeeping stays writable, and touches nothing else.
          await db.bills.update(s.billId, { syncState: s.syncState });
          const after = JSON.parse(await snapshot(db, s.billId)) as {
            bill: Record<string, unknown>;
          };
          expect(after.bill['syncState']).toBe(s.syncState);
          expect({ ...after.bill, syncState: original.syncState }).toEqual(original);

          // Void/correction commit creates a new linked row; original content unchanged.
          const billsBefore = await db.bills.count();
          const bookkeeping = await snapshot(db, s.billId);
          await commitConfirmed(db, mint(correctionBundle(s)));
          expect(await db.bills.count()).toBe(billsBefore + 1);
          expect(await snapshot(db, s.billId)).toBe(bookkeeping);
          const linked = await db.bills.where('correctsBillId').equals(s.billId).toArray();
          expect(linked.map((b) => b.id)).toEqual([s.correctionId]);
          expect(linked[0]!.kind).toBe(s.correctionKind);
        } finally {
          db.close();
        }
      }),
    );
  }, 60_000);

  // Regression for the fast-check counterexample: seed -1863756540, path
  // 0:0:0:0:0:0:0:0:0:0:0:1:1 (billItems.bulkDelete on a finalized bill's item succeeded).
  it('regression: deleting finalized bills or their items is rejected; clear() still works', async () => {
    const db: AwaazDb = await openDb({ name: `immut-reg-${++dbCounter}`, indexedDB: new IDBFactory() });
    try {
      const s: Scenario = {
        billId: 'b1',
        correctionId: 'b2',
        correctionKind: 'void',
        itemCount: 1,
        qtyMilli: 1000,
        unitPricePaise: 100,
        attempt: 'bulk_delete',
        field: 'totalPaise',
        newValue: 0,
        syncState: 'pending',
      } as Scenario;
      await db.shops.put(shop);
      await commitConfirmed(db, mint(billBundle(s)));
      const before = await snapshot(db, 'b1');
      await expect(db.billItems.bulkDelete(['b1-i0'])).rejects.toBeDefined();
      await expect(db.billItems.delete('b1-i0')).rejects.toBeDefined();
      await expect(db.bills.delete('b1')).rejects.toBeDefined();
      expect(await snapshot(db, 'b1')).toBe(before);
      // Direct clear of a finalized bill table is also rejected; only the admin purge may empty it.
      await expect(db.bills.clear()).rejects.toBeDefined();
      expect(await snapshot(db, 'b1')).toBe(before);
      await db.transaction('rw', db.tables, () => db.purgeAllTables());
      expect(await db.bills.count()).toBe(0);
      expect(await db.billItems.count()).toBe(0);
    } finally {
      db.close();
    }
  });
});
