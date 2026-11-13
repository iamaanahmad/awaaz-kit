import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { WorkflowContext } from '@awaaz-kit/confirmation-engine';
import type { CatalogIndex } from '@awaaz-kit/catalog-matcher';
import { BillingWorkflowAdapter, type BillDraft } from './bill-draft.js';
import {
  removeLine,
  setDiscount,
  setLinePrice,
  setLineQuantity,
  summarizeDraft,
} from './draft-edit.js';
import { computeTotals, formatRupees, lineTotalPaise } from './money.js';

// Hand-authored expectations in paise. Every expected value below is worked out
// by hand in the comments, not derived by calling the code under test.
// Validates: Requirements 13.8, 13.16, 14.8

const product = (
  id: string,
  name: string,
  aliases: string[],
  unit: CatalogProduct['unit'],
  pricePaise: number,
): CatalogProduct => ({
  id,
  shopId: 's1',
  name,
  aliases,
  unit,
  pricePaise,
  active: true,
  deletedAt: null,
});

// Amul Gold: Rs 68.00 per litre. Chini (sugar): Rs 45.00 per kg. Chai patti: Rs 360.00 per kg.
const catalog = buildIndex('s1', [
  product('p-amul', 'Amul Gold', ['amul gold'], 'litre', 6800),
  product('p-chini', 'Sugar', ['chini'], 'kg', 4500),
  product('p-chai', 'Tea', ['chai patti'], 'kg', 36000),
]);

function ctx(taxEnabled = false, index: CatalogIndex = catalog): WorkflowContext<CatalogIndex> {
  let n = 0;
  return {
    shopId: 's1',
    customers: [],
    catalog: index,
    makeId: () => `id-${++n}`,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    config: { taxEnabled },
  };
}

const adapter = new BillingWorkflowAdapter();

/** Marks every field confirmed, as the user does on the Review screen. */
function confirmAll(d: BillDraft): BillDraft {
  return {
    ...d,
    lines: d.lines.map((l) => ({
      ...l,
      product: { ...l.product, status: 'confirmed' },
      quantityMilli: { ...l.quantityMilli, status: 'confirmed' },
      unit: { ...l.unit, status: 'confirmed' },
    })),
  };
}

/** Three-line draft built from typed text, with fields confirmed. */
function threeItemDraft(taxEnabled = false): BillDraft {
  return confirmAll(
    adapter.parse('2 litre amul gold, 1 kg chini aur 1 kg chai patti', ctx(taxEnabled)),
  );
}

describe('billing PRD examples (paise)', () => {
  it('parses three typed items with catalog price snapshots', () => {
    const d = threeItemDraft();
    expect(d.lines).toHaveLength(3);
    expect(d.lines.map((l) => l.price.value)).toEqual([6800, 4500, 36000]);
    expect(d.lines.map((l) => l.quantityMilli.value)).toEqual([2000, 1000, 1000]);
  });

  it('totals three items: 13600 + 4500 + 36000 = 54100', () => {
    const s = summarizeDraft(threeItemDraft());
    expect(s.totals.lineTotals).toEqual([13_600, 4500, 36_000]);
    expect(s.totals.subtotalPaise).toBe(54_100);
    expect(s.totals.totalPaise).toBe(54_100);
    expect(s.canConfirm).toBe(true);
    expect(formatRupees(s.totals.totalPaise)).toBe('₹541.00');
  });

  it('recomputes after an edited quantity: chini 2.5 kg = 11250, total 60850', () => {
    const d = threeItemDraft();
    const chini = d.lines[1]!.lineId;
    const edited = setLineQuantity(d, chini, 2500);
    const s = summarizeDraft(edited);
    expect(s.totals.lineTotals[1]).toBe(11_250);
    expect(s.totals.totalPaise).toBe(13_600 + 11_250 + 36_000);
    expect(s.totals.totalPaise).toBe(60_850);
    expect(edited.revision).toBe(d.revision + 1);
  });

  it('removing a line drops it from the total', () => {
    const d = threeItemDraft();
    const s = summarizeDraft(removeLine(d, d.lines[2]!.lineId));
    expect(s.totals.totalPaise).toBe(18_100);
  });
});

describe('discount', () => {
  it('subtracts a discount: 54100 - 1100 = 53000', () => {
    const s = summarizeDraft(setDiscount(threeItemDraft(), 1100));
    expect(s.totals.totalPaise).toBe(53_000);
    expect(s.canConfirm).toBe(true);
  });

  it('allows a discount equal to the subtotal (total 0)', () => {
    const s = summarizeDraft(setDiscount(threeItemDraft(), 54_100));
    expect(s.totals.totalPaise).toBe(0);
    expect(s.canConfirm).toBe(true);
  });

  it('blocks a discount one paisa over the subtotal', () => {
    const s = summarizeDraft(setDiscount(threeItemDraft(), 54_101));
    expect(s.totals.discountValid).toBe(false);
    expect(s.issues.map((i) => i.code)).toContain('discount_exceeds_subtotal');
    expect(s.canConfirm).toBe(false);
  });
});

describe('tax off and on (Req 13.16)', () => {
  it('tax off: tax is zero and a non-zero tax blocks confirm', () => {
    const d = threeItemDraft(false);
    expect(d.taxEnabled).toBe(false);
    expect(d.taxPaise).toBe(0);
    expect(summarizeDraft(d).totals.totalPaise).toBe(54_100);

    const bad = summarizeDraft({ ...d, taxPaise: 500 });
    expect(bad.issues.map((i) => i.code)).toContain('tax_disabled');
    expect(bad.canConfirm).toBe(false);
  });

  it('tax on: tax is added after discount: 54100 - 1000 + 2650 = 55750', () => {
    const d = { ...setDiscount(threeItemDraft(true), 1000), taxPaise: 2650 };
    expect(d.taxEnabled).toBe(true);
    const s = summarizeDraft(d);
    expect(s.totals.totalPaise).toBe(55_750);
    expect(s.canConfirm).toBe(true);
    const b = adapter.toBundle(d);
    expect(b.bill.taxPaise).toBe(2650);
    expect(b.bill.totalPaise).toBe(55_750);
  });
});

describe('half-up rounding', () => {
  it.each([
    // [unit price paise, qty milli, expected paise]; exact value in the comment.
    [333, 1500, 500], // 499.5 -> 500
    [3, 500, 2], // 1.5 -> 2
    [1, 500, 1], // 0.5 -> 1
    [1, 499, 0], // 0.499 -> 0
    [999, 1, 1], // 0.999 -> 1
    [4500, 2500, 11_250], // exact, no rounding
    [10, 1250, 13], // 12.5 -> 13
    [7, 1000, 7], // whole unit
  ])('price %i x qty %i milli = %i paise', (price, qty, expected) => {
    expect(lineTotalPaise(price, qty)).toBe(expected);
  });

  it('rounds each line before summing', () => {
    // Two lines of 0.5 paise each round to 1 + 1 = 2, not round(1.0) = 1.
    const t = computeTotals(
      [
        { unitPricePaise: 1, qtyMilli: 500 },
        { unitPricePaise: 1, qtyMilli: 500 },
      ],
      0,
      0,
    );
    expect(t.lineTotals).toEqual([1, 1]);
    expect(t.subtotalPaise).toBe(2);
  });
});

describe('missing price blocks finalize (Req 13.5)', () => {
  it('unknown product has no price, reports price_missing and cannot confirm', () => {
    const d = confirmAll(adapter.parse('1 kg mystery', ctx()));
    expect(d.lines[0]!.price.value).toBeNull();
    const s = summarizeDraft(d);
    expect(s.issues.map((i) => i.code)).toContain('price_missing');
    expect(s.canConfirm).toBe(false);
    expect(() => adapter.toBundle(d)).toThrow();
  });

  it('entering a price unblocks it: 1 kg at 120.00 = 12000', () => {
    const d = confirmAll(adapter.parse('1 kg mystery', ctx()));
    const lineId = d.lines[0]!.lineId;
    // The product itself is still unresolved, so only the price issue clears.
    const priced = summarizeDraft(setLinePrice(d, lineId, 12_000));
    expect(priced.issues.map((i) => i.code)).not.toContain('price_missing');
    expect(priced.totals.totalPaise).toBe(12_000);
  });
});

describe('receipt bundle shape', () => {
  it('toBundle returns a finalized sale with items, snapshots and audit event', () => {
    const d = setDiscount(threeItemDraft(), 1100);
    const b = adapter.toBundle(d);

    expect(b.kind).toBe('bill');
    expect(b.bill).toMatchObject({
      id: d.id,
      shopId: 's1',
      kind: 'sale',
      correctsBillId: null,
      status: 'finalized',
      subtotalPaise: 54_100,
      discountPaise: 1100,
      taxPaise: 0,
      totalPaise: 53_000,
      mutationId: d.mutationId,
      createdAt: '2026-01-01T00:00:00.000Z',
      finalizedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(b.items).toHaveLength(3);
    expect(
      b.items.map((i) => [
        i.index,
        i.billId,
        i.nameSnapshot,
        i.qtyMilli,
        i.unit,
        i.unitPricePaise,
        i.lineTotalPaise,
      ]),
    ).toEqual([
      [0, d.id, 'Amul Gold', 2000, 'litre', 6800, 13_600],
      [1, d.id, 'Sugar', 1000, 'kg', 4500, 4500],
      [2, d.id, 'Tea', 1000, 'kg', 36_000, 36_000],
    ]);
    expect(new Set(b.items.map((i) => i.id)).size).toBe(3);

    expect(b.auditEvent).toMatchObject({
      entityType: 'bill',
      entityId: d.id,
      action: 'bill_finalized',
      actor: 'local_user',
      metadata: { lineCount: 3, totalPaise: 53_000 },
    });
  });

  it('line totals in the bundle sum to the subtotal', () => {
    const b = adapter.toBundle(threeItemDraft());
    expect(b.items.reduce((a, i) => a + i.lineTotalPaise, 0)).toBe(b.bill.subtotalPaise);
  });
});
