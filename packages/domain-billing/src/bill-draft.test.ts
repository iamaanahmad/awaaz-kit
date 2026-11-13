import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { WorkflowContext } from '@awaaz-kit/confirmation-engine';
import type { CatalogIndex } from '@awaaz-kit/catalog-matcher';
import { BillingWorkflowAdapter, billDraftSchema, type BillDraft } from './bill-draft.js';

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

const adapter = new BillingWorkflowAdapter();

/** Marks every field confirmed, as the user would on the Review screen. */
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

describe('BillingWorkflowAdapter', () => {
  it('snapshots catalog price on matched lines and passes the schema', () => {
    const d = adapter.parse('2 kg atta aur 1 kg chawal', ctx());
    expect(d.lines).toHaveLength(2);
    expect(d.lines.map((l) => l.price.value)).toEqual([4500, 6000]);
    expect(billDraftSchema.safeParse(d).success).toBe(true);
  });

  it('blocks confirm when a price is missing', () => {
    const d = adapter.parse('2 kg mystery', ctx());
    expect(d.lines[0]?.price.value).toBeNull();
    const issues = adapter.validate(confirmAll(d));
    expect(issues.some((i) => i.code === 'price_missing')).toBe(true);
    expect(adapter.canConfirm(confirmAll(d))).toBe(false);
  });

  it('reports discount over subtotal', () => {
    const d = confirmAll(adapter.parse('2 kg atta', ctx()));
    const bad = { ...d, discountPaise: 10_000_000 };
    expect(adapter.validate(bad).map((i) => i.code)).toContain('discount_exceeds_subtotal');
    expect(adapter.canConfirm(bad)).toBe(false);
  });

  it('canConfirm equals no issues and at least one line', () => {
    const empty = adapter.parse('', ctx());
    expect(adapter.canConfirm(empty)).toBe(false);
    const d = confirmAll(adapter.parse('2 kg atta', ctx()));
    expect(adapter.canConfirm(d)).toBe(adapter.validate(d).length === 0 && d.lines.length > 0);
  });

  it('toBundle produces a finalized bill with snapshots and exact totals', () => {
    const d = {
      ...confirmAll(adapter.parse('2 kg atta aur 1 kg chawal', ctx())),
      discountPaise: 500,
    };
    expect(adapter.canConfirm(d)).toBe(true);
    const b = adapter.toBundle(d);
    expect(b.bill.status).toBe('finalized');
    expect(b.bill.subtotalPaise).toBe(15_000);
    expect(b.bill.totalPaise).toBe(14_500);
    expect(b.items.map((i) => [i.nameSnapshot, i.unitPricePaise, i.lineTotalPaise])).toEqual([
      ['Atta', 4500, 9000],
      ['Rice', 6000, 6000],
    ]);
  });

  it('toBundle throws for an unconfirmable draft', () => {
    expect(() => adapter.toBundle(adapter.parse('2 kg mystery', ctx()))).toThrow();
  });
});
