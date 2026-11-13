import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '../../packages/catalog-matcher/src/index';
import type { WorkflowContext } from '../../packages/confirmation-engine/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter } from '../../packages/domain-order/src/index';
import { DEMO_SEED, DEMO_SHOP_ID } from '../../packages/local-data/src/demo-shop';
import { SAMPLE_UTTERANCES } from '../../packages/speech-provider/src/samples';

// Feature: awaaz-kit, Example: every built-in sample chip parses cleanly
// **Validates: Requirements 8.1, 12.5, 13.1**

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

// Hand-authored expected line counts per sample, from the sample text itself.
const EXPECTED_LINES: Record<string, number> = {
  'order-hinglish-1': 3, // aata, tel, chawal
  'order-hindi-1': 2, // चीनी, दूध
  'order-english-1': 2, // sugar, milk
  'bill-hinglish-1': 2, // cheeni, tel (after "Ramesh ka bill banao")
  'bill-english-1': 2, // tea, biscuit (after "bill for Ramesh")
};

// The bill chip from the Bill Awaaz screen that originally parsed "bill" as an item.
const EXTRA_BILL_TEXTS: Record<string, number> = {
  'Sunita ke liye bill: aadha kilo Tata Tea Gold aur 2 packet biscuit': 2,
};

const parse = (app: 'order' | 'bill', text: string) =>
  app === 'order'
    ? new OrderWorkflowAdapter().parse(text, demoContext())
    : new BillingWorkflowAdapter().parse(text, demoContext());

describe('built-in sample utterances', () => {
  it('has an expected line count for every sample', () => {
    expect(SAMPLE_UTTERANCES.map((s) => s.clipId).sort()).toEqual(
      Object.keys(EXPECTED_LINES).sort(),
    );
  });

  it.each(SAMPLE_UTTERANCES.map((s) => [s.clipId, s] as const))(
    '%s yields the expected lines and no phantom or unmatched line',
    (clipId, sample) => {
      const draft = parse(sample.app, sample.text);
      expect(draft.lines).toHaveLength(EXPECTED_LINES[clipId]!);
      for (const line of draft.lines) {
        expect(line.product.value, `${line.spokenName} must resolve`).not.toBeNull();
        expect(line.product.status).not.toBe('unmatched');
        expect(line.quantityMilli.value).not.toBeNull();
        expect(line.spokenName).not.toMatch(/\b(bill|order|hisaab)\b|बिल/i);
      }
    },
  );

  it.each(Object.entries(EXTRA_BILL_TEXTS))('%s yields %i resolved lines', (text, count) => {
    const draft = parse('bill', text);
    expect(draft.lines).toHaveLength(count);
    for (const line of draft.lines) {
      expect(line.product.value).not.toBeNull();
      expect(line.product.status).not.toBe('unmatched');
    }
  });
});
