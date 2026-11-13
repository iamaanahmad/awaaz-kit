import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { WorkflowContext } from '@awaaz-kit/confirmation-engine';
import { OrderBundleSchema } from '@awaaz-kit/local-data';
import { OrderWorkflowAdapter } from './order-draft.js';
import {
  addOrderLine,
  removeOrderLine,
  setFulfillment,
  setNote,
  setOrderLineProduct,
  setOrderLineQuantity,
  setOrderLineUnit,
  summarizeOrderDraft,
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

const adapter = new OrderWorkflowAdapter();
const base = () => adapter.parse('2 kg atta aur 1 kg chawal', ctx());

describe('order draft editing', () => {
  it('recomputes line and estimated totals after a quantity edit', () => {
    const d = base();
    const edited = setOrderLineQuantity(d, d.lines[0]!.lineId, 3000);
    expect(edited.lines[0]!.lineTotalPaise).toBe(13500);
    expect(summarizeOrderDraft(edited).totalEstimatePaise).toBe(19500);
    expect(edited.revision).toBe(d.revision + 1);
    expect(d.lines[0]!.quantityMilli.value).toBe(2000);
  });

  it('edits product, fulfillment and note', () => {
    const d = base();
    const id = d.lines[0]!.lineId;
    const e = setNote(
      setFulfillment(setOrderLineUnit(setOrderLineProduct(d, id, rice), id, 'g'), 'delivery'),
      'gate',
    );
    expect(e.lines[0]!.product.value).toEqual({ productId: 'p-rice', name: 'Rice' });
    expect(e.lines[0]!.unitPricePaise).toBe(6000);
    expect(e.fulfillment).toBe('delivery');
    expect(e.note).toBe('gate');
  });

  it('removes a line, recomputes validity, and ignores unknown ids', () => {
    const d = base();
    const added = addOrderLine(d, 'new');
    expect(summarizeOrderDraft(added).canConfirm).toBe(false);
    const removed = removeOrderLine(added, 'new');
    expect(summarizeOrderDraft(removed).canConfirm).toBe(true);
    expect(removeOrderLine(d, 'nope')).toBe(d);
  });

  it('toBundle yields a schema-valid order with snapshots and no number', () => {
    const d = setNote(setFulfillment(base(), 'delivery'), 'hello');
    const b = adapter.toBundle(d);
    expect(OrderBundleSchema.safeParse(b).success).toBe(true);
    expect(b.order.totalEstimatePaise).toBe(15000);
    expect(b.order.fulfillment).toBe('delivery');
    expect(b.items.map((i) => [i.nameSnapshot, i.unitPricePaise])).toEqual([
      ['Atta', 4500],
      ['Rice', 6000],
    ]);
    expect('localNumber' in b.order).toBe(false);
  });

  it('toBundle throws for an unconfirmable draft', () => {
    expect(() => adapter.toBundle(adapter.parse('2 kg mystery', ctx()))).toThrow();
  });
});
