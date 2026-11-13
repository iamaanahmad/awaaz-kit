import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { WorkflowContext } from '@awaaz-kit/confirmation-engine';
import type { CatalogIndex } from '@awaaz-kit/catalog-matcher';
import { BillingWorkflowAdapter } from './bill-draft.js';
import {
  addLine,
  removeLine,
  setDiscount,
  setLinePrice,
  setLineProduct,
  setLineQuantity,
  setLineUnit,
  summarizeDraft,
} from './draft-edit.js';

const product = (
  id: string,
  name: string,
  aliases: string[],
  pricePaise: number,
): CatalogProduct => ({
  id,
  shopId: 's1',
  name,
  aliases,
  unit: 'kg',
  pricePaise,
  active: true,
  deletedAt: null,
});

const atta = product('p-atta', 'Atta', ['aata'], 4500);
const rice = product('p-rice', 'Rice', ['chawal'], 6000);
const catalog = buildIndex('s1', [atta, rice]);

function ctx(index: CatalogIndex = catalog): WorkflowContext<CatalogIndex> {
  let n = 0;
  return {
    shopId: 's1',
    customers: [],
    catalog: index,
    makeId: () => `id-${++n}`,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    config: { taxEnabled: false },
  };
}

const adapter = new BillingWorkflowAdapter();

describe('bill draft editing', () => {
  const base = () => adapter.parse('2 kg atta aur 1 kg chawal', ctx());

  it('recomputes totals after a quantity edit', () => {
    const d = base();
    const first = d.lines[0]!.lineId;
    const before = summarizeDraft(d).totals;
    const edited = setLineQuantity(d, first, 3000);
    const after = summarizeDraft(edited).totals;
    expect(after.lineTotals[0]).toBe(13500);
    expect(after.subtotalPaise).toBe(before.subtotalPaise + 4500);
    expect(edited.revision).toBe(d.revision + 1);
    expect(edited.lines[0]!.quantityMilli.status).toBe('confirmed');
    expect(d.lines[0]!.quantityMilli.value).toBe(2000);
  });

  it('edits product, unit and price', () => {
    const d = base();
    const id = d.lines[0]!.lineId;
    const e = setLinePrice(setLineUnit(setLineProduct(d, id, rice), id, 'g'), id, 5000);
    expect(e.lines[0]!.product.value).toEqual({ productId: 'p-rice', name: 'Rice' });
    expect(e.lines[0]!.unit.value).toBe('g');
    expect(e.lines[0]!.price.value).toBe(5000);
    expect(setLineProduct(d, id, rice).lines[0]!.price.value).toBe(6000);
  });

  it('blocks confirmation when the discount exceeds the subtotal', () => {
    const d = base();
    expect(summarizeDraft(d).canConfirm).toBe(true);
    const bad = setDiscount(d, 999999);
    const s = summarizeDraft(bad);
    expect(s.canConfirm).toBe(false);
    expect(s.issues.some((i) => i.code === 'discount_exceeds_subtotal')).toBe(true);
    expect(summarizeDraft(setDiscount(bad, 500)).canConfirm).toBe(true);
  });

  it('adds an incomplete line then removes it', () => {
    const d = base();
    const added = addLine(d, 'new-line');
    expect(added.lines).toHaveLength(3);
    expect(summarizeDraft(added).canConfirm).toBe(false);
    const removed = removeLine(added, 'new-line');
    expect(removed.lines).toHaveLength(2);
    expect(summarizeDraft(removed).canConfirm).toBe(true);
  });

  it('fills an added line completely to make it confirmable', () => {
    let d = addLine(adapter.parse('2 kg atta', ctx()), 'x');
    d = setLineProduct(d, 'x', rice);
    d = setLineQuantity(d, 'x', 1000);
    d = setLineUnit(d, 'x', 'kg');
    const s = summarizeDraft(d);
    expect(s.canConfirm).toBe(true);
    expect(s.totals.subtotalPaise).toBe(9000 + 6000);
  });

  it('ignores unknown line ids', () => {
    const d = base();
    expect(removeLine(d, 'nope')).toBe(d);
    expect(setLineQuantity(d, 'nope', 1)).toBe(d);
  });
});
