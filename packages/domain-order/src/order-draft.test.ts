import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { WorkflowContext } from '@awaaz-kit/confirmation-engine';
import type { CatalogIndex } from '@awaaz-kit/catalog-matcher';
import { OrderWorkflowAdapter, orderDraftSchema, type OrderDraft } from './order-draft.js';

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

const catalog = buildIndex('s1', [
  product('p-atta', 'Atta', ['aata'], 4500),
  product('p-rice', 'Rice', ['chawal'], 6000),
]);

function ctx(index: CatalogIndex = catalog): WorkflowContext<CatalogIndex> {
  let n = 0;
  return {
    shopId: 's1',
    customers: [{ id: 'c1', name: 'Ramesh' }],
    catalog: index,
    makeId: () => `id-${++n}`,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    config: { taxEnabled: false },
  };
}

const adapter = new OrderWorkflowAdapter();

function confirmAll(d: OrderDraft): OrderDraft {
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

describe('OrderWorkflowAdapter', () => {
  it('snapshots catalog price on matched lines and passes the schema', () => {
    const d = adapter.parse('2 kg atta aur 1 kg chawal', ctx());
    expect(d.lines).toHaveLength(2);
    expect(d.lines.map((l) => l.unitPricePaise)).toEqual([4500, 6000]);
    expect(d.lines.map((l) => l.lineTotalPaise)).toEqual([9000, 6000]);
    expect(d.walkIn).toBe(true);
    expect(d.customerId).toBeNull();
    expect(orderDraftSchema.safeParse(d).success).toBe(true);
  });

  it('reports an unresolved product and blocks confirm', () => {
    const d = adapter.parse('2 kg mystery', ctx());
    expect(d.lines[0]?.unitPricePaise).toBeNull();
    const issues = adapter.validate(confirmAll(d));
    expect(issues.some((i) => i.code === 'product_unresolved')).toBe(true);
    expect(adapter.canConfirm(confirmAll(d))).toBe(false);
  });

  it('keeps canConfirm consistent with validate and never confirms empty drafts', () => {
    const empty = adapter.parse('', ctx());
    expect(adapter.canConfirm(empty)).toBe(false);
    const d = confirmAll(adapter.parse('2 kg atta', ctx()));
    expect(adapter.canConfirm(d)).toBe(adapter.validate(d).length === 0 && d.lines.length > 0);
  });
});
