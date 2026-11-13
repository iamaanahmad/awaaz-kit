import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { WorkflowContext } from '@awaaz-kit/confirmation-engine';
import { DEMO_SEED, DEMO_SHOP_ID } from '@awaaz-kit/local-data';
import { OrderWorkflowAdapter } from './order-draft.js';

// Feature: awaaz-kit, Example: fixture utterance against the Demo_Shop
// **Validates: Requirements 12.5**

const UTTERANCE = 'do kilo aata, ek litre tel aur paanch kilo chawal';

// Hand-authored oracle, written from the Demo_Shop seed and the spec, not from running the code.
// Quantities are integer milli-units; prices are integer paise snapshots from the seed.
const EXPECTED = [
  {
    productId: '00000000-0000-4000-8000-000000000001', // Aashirvaad Atta (wheat flour)
    name: 'Aashirvaad Atta',
    qtyMilli: 2000,
    unit: 'kg',
    unitPricePaise: 5800,
    lineTotalPaise: 11600,
  },
  {
    productId: '00000000-0000-4000-8000-000000000002', // Fortune Sunflower Oil (cooking oil)
    name: 'Fortune Sunflower Oil',
    qtyMilli: 1000,
    unit: 'litre',
    unitPricePaise: 14500,
    lineTotalPaise: 14500,
  },
  {
    productId: '00000000-0000-4000-8000-000000000003', // India Gate Basmati Rice
    name: 'India Gate Basmati Rice',
    qtyMilli: 5000,
    unit: 'kg',
    unitPricePaise: 9000,
    lineTotalPaise: 45000,
  },
] as const;

function demoContext(): WorkflowContext<ReturnType<typeof buildIndex>> {
  const products: CatalogProduct[] = DEMO_SEED.products.map((p) => ({
    id: p.id,
    shopId: DEMO_SHOP_ID,
    name: p.name,
    aliases: [...p.aliases],
    ...(p.brand ? { brand: p.brand } : {}),
    unit: p.unit,
    pricePaise: p.pricePaise,
    active: true,
    deletedAt: null,
  }));
  let n = 0;
  return {
    shopId: DEMO_SHOP_ID,
    customers: DEMO_SEED.customers.map((c) => ({ id: c.id, name: c.name })),
    catalog: buildIndex(DEMO_SHOP_ID, products),
    makeId: () => `id-${++n}`,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    config: { taxEnabled: false },
  };
}

describe('Req 12.5 fixture utterance against the Demo_Shop', () => {
  const adapter = new OrderWorkflowAdapter();

  it('yields wheat flour 2 kg, cooking oil 1 litre and rice 5 kg with seed price snapshots', () => {
    const draft = adapter.parse(UTTERANCE, demoContext());

    expect(draft.lines).toHaveLength(3);
    expect(
      draft.lines.map((l) => ({
        productId: l.product.value?.productId,
        name: l.product.value?.name,
        qtyMilli: l.quantityMilli.value,
        unit: l.unit.value,
        unitPricePaise: l.unitPricePaise,
        lineTotalPaise: l.lineTotalPaise,
      })),
    ).toEqual(EXPECTED.map((e) => ({ ...e })));
    expect(draft.walkIn).toBe(true);
    expect(draft.customerId).toBeNull();
    expect(draft.rawTranscript).toBe(UTTERANCE);
  });

  it('marks every field as confirmed-ready with no validation issues and a 71100 paise estimate', () => {
    const draft = adapter.parse(UTTERANCE, demoContext());
    for (const l of draft.lines) {
      expect(l.product.status).toBe('confirmed');
      expect(l.quantityMilli.status).toBe('confirmed');
      expect(l.unit.status).toBe('confirmed');
    }
    expect(adapter.validate(draft)).toEqual([]);
    expect(adapter.canConfirm(draft)).toBe(true);
    const bundle = adapter.toBundle(draft);
    expect(bundle.order.totalEstimatePaise).toBe(11600 + 14500 + 45000);
  });
});
