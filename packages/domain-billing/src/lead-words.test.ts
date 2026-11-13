import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { WorkflowContext } from '@awaaz-kit/confirmation-engine';
import { DEMO_SEED, DEMO_SHOP_ID } from '@awaaz-kit/local-data';
import { BillingWorkflowAdapter } from './bill-draft.js';

// Feature: awaaz-kit, Example: workflow lead words never become item lines
// **Validates: Requirements 8.1, 8.2, 13.1**

const TATA_TEA_GOLD = '00000000-0000-4000-8000-000000000006';
const PARLE_G = '00000000-0000-4000-8000-000000000023';

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
    customers: [],
    catalog: buildIndex(DEMO_SHOP_ID, products),
    makeId: () => `id-${++n}`,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    config: { taxEnabled: false },
  };
}

const adapter = new BillingWorkflowAdapter();

describe('bill lead words and customer lead phrases', () => {
  it('"Sunita ke liye bill: ..." yields exactly two lines and no "bill" line', () => {
    const d = adapter.parse(
      'Sunita ke liye bill: aadha kilo Tata Tea Gold aur 2 packet biscuit',
      demoContext(),
    );
    expect(d.lines).toHaveLength(2);
    // Seed: Tata Tea Gold is sold per kg at 52000 paise; "aadha kilo" is 500 milli kg.
    expect(d.lines[0]!.product.value?.productId).toBe(TATA_TEA_GOLD);
    expect(d.lines[0]!.quantityMilli.value).toBe(500);
    expect(d.lines[0]!.unit.value).toBe('kg');
    expect(d.lines[0]!.price.value).toBe(52000);
    // Seed: Parle-G Biscuit is per piece; 2 packets is 2000 milli. A spoken unit that
    // differs from the catalog unit may be needs_review, but the product and qty are fixed.
    expect(d.lines[1]!.product.value?.productId).toBe(PARLE_G);
    expect(d.lines[1]!.quantityMilli.value).toBe(2000);
    expect(d.lines.some((l) => /bill/i.test(l.spokenName))).toBe(false);
  });

  it.each([
    'Sunita ke liye bill: 2 kilo aloo',
    'Sunita ke liye bill 2 kilo aloo',
    'Sunita ke liye order: 2 kilo aloo',
    'Sunita ke liye hisaab: 2 kilo aloo',
    'Sunita ka bill banao: 2 kilo aloo',
    'Sunita ka bill banao 2 kilo aloo',
    'bill: 2 kilo aloo',
    'order 2 kilo aloo',
    'hisaab: 2 kilo aloo',
    'सुनीता के लिए बिल: 2 किलो आलू',
    'सुनीता का बिल बनाओ 2 किलो आलू',
    'बिल 2 किलो आलू',
  ])('"%s" yields one potato line and no workflow-word line', (text) => {
    const d = adapter.parse(text, demoContext());
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]!.product.value?.productId).toBe('00000000-0000-4000-8000-000000000018');
    expect(d.lines[0]!.quantityMilli.value).toBe(2000);
  });
});
