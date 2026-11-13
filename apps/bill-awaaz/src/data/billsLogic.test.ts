import { describe, expect, it } from 'vitest';
import {
  CorrectionBundleSchema,
  type BillItemRecord,
  type BillRecord,
} from '@awaaz-kit/local-data';
import {
  correctionAdapter,
  filterBills,
  formatSignedRupees,
  parseSignedRupees,
  voidedBillIds,
  type CorrectionDraft,
} from './billsLogic';

const at = new Date(2026, 0, 15, 12).toISOString();
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mk = (o: Partial<BillRecord>): BillRecord => ({
  id: uuid(1),
  shopId: uuid(9),
  receiptNumber: 'R-0001',
  kind: 'sale',
  correctsBillId: null,
  customerId: null,
  status: 'finalized',
  subtotalPaise: 5000,
  discountPaise: 0,
  taxPaise: 0,
  totalPaise: 5000,
  rawTranscript: 'two kilo atta',
  normalizedText: '2 kg atta',
  mutationId: uuid(2),
  syncState: 'pending',
  createdAt: at,
  finalizedAt: at,
  ...o,
});
const item: BillItemRecord = {
  id: uuid(3),
  billId: uuid(1),
  index: 0,
  productId: null,
  nameSnapshot: 'Atta',
  qtyMilli: 2000,
  unit: 'kg',
  unitPricePaise: 2500,
  lineTotalPaise: 5000,
};
const draft = (o: Partial<CorrectionDraft>): CorrectionDraft => ({
  id: uuid(4),
  mutationId: uuid(5),
  kind: 'void',
  original: mk({}),
  originalItems: [item],
  adjustmentPaise: 0,
  reason: '',
  createdAt: at,
  ...o,
});

describe('bills list helpers', () => {
  it('searches receipt/transcript and filters by kind and sync', () => {
    const bills = [
      mk({}),
      mk({
        id: uuid(6),
        receiptNumber: 'R-0002',
        kind: 'void',
        syncState: 'synced',
        rawTranscript: '',
        normalizedText: '',
      }),
    ];
    expect(filterBills(bills, 'atta', 'all')).toHaveLength(1);
    expect(filterBills(bills, 'r-0002', 'all')).toHaveLength(1);
    expect(filterBills(bills, '', 'voids')).toHaveLength(1);
    expect(filterBills(bills, '', 'unsynced')).toHaveLength(1);
  });

  it('finds voided sales', () => {
    const v = mk({ id: uuid(6), kind: 'void', correctsBillId: uuid(1) });
    expect([...voidedBillIds([mk({}), v])]).toEqual([uuid(1)]);
  });

  it('parses and formats signed rupees', () => {
    expect(parseSignedRupees('-50')).toBe(-5000);
    expect(parseSignedRupees('20.5')).toBe(2050);
    expect(parseSignedRupees('abc')).toBeNull();
    expect(formatSignedRupees(-5000)).toBe('-₹50.00');
  });
});

describe('correctionAdapter', () => {
  it('builds a valid void that reverses the original without touching it', () => {
    const d = draft({});
    const bundle = correctionAdapter.toBundle(d);
    expect(() => CorrectionBundleSchema.parse(bundle)).not.toThrow();
    expect(bundle.bill.correctsBillId).toBe(d.original.id);
    expect(bundle.bill.totalPaise).toBe(-5000);
    expect(bundle.items[0]?.lineTotalPaise).toBe(-5000);
    expect(d.original.totalPaise).toBe(5000);
  });

  it('builds a correction carrying only the adjustment, and rejects zero', () => {
    const bundle = correctionAdapter.toBundle(draft({ kind: 'correction', adjustmentPaise: -200 }));
    expect(CorrectionBundleSchema.safeParse(bundle).success).toBe(true);
    expect(bundle.bill.totalPaise).toBe(-200);
    expect(correctionAdapter.canConfirm(draft({ kind: 'correction' }))).toBe(false);
  });

  it('rejects voiding a non-sale', () => {
    expect(correctionAdapter.canConfirm(draft({ original: mk({ kind: 'void' }) }))).toBe(false);
  });
});
