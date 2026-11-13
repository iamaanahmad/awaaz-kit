import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '../../packages/catalog-matcher/src/index';
import { resolveLines } from '../../packages/confidence-engine/src/index';
import type { WorkflowContext } from '../../packages/confirmation-engine/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter } from '../../packages/domain-order/src/index';
import { extract } from '../../packages/intent-engine/src/index';
import { normalize } from '../../packages/language-normalizer/src/index';
import { DEMO_SEED, DEMO_SHOP_ID } from '../../packages/local-data/src/demo-shop';

// Feature: awaaz-kit, Property 22 (example form): Both workflows consume the same shared pipeline output
// **Validates: Requirements 1.6**

const UTTERANCES = [
  'do kilo aata, ek litre tel aur paanch kilo chawal', // Hinglish
  '2 kg rice and 1 litre oil', // English
  'teen kilo chini aur ek packet namak', // Hinglish, mixed units
  'dhanyavaad', // no items
];

function context(): WorkflowContext<ReturnType<typeof buildIndex>> {
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

/** Shared-stage lines, stripped of the workflow-specific price fields. */
function shared(l: {
  lineId: string;
  product: unknown;
  quantityMilli: unknown;
  unit: unknown;
  candidates: unknown;
  spokenName: string;
}) {
  return {
    lineId: l.lineId,
    product: l.product,
    quantityMilli: l.quantityMilli,
    unit: l.unit,
    candidates: l.candidates,
    spokenName: l.spokenName,
  };
}

describe('Req 1.6 dual-parse reuse: one pipeline, two workflows', () => {
  const order = new OrderWorkflowAdapter();
  const bill = new BillingWorkflowAdapter();

  for (const utterance of UTTERANCES) {
    describe(`"${utterance}"`, () => {
      it('shares normalized text and resolved lines with the engine output', () => {
        // Fresh contexts so the deterministic id sequence starts equal for each parse.
        const o = order.parse(utterance, context());
        const b = bill.parse(utterance, context());

        const ctx = context();
        const normalized = normalize(utterance);
        const expected = resolveLines(
          extract(normalized, {
            locale: 'hi-IN',
            knownCustomerNames: ctx.customers.map((c) => c.name),
          }),
          ctx.catalog,
          ctx.makeId,
        ).map(shared);

        expect(o.normalizedText).toBe(normalized.text);
        expect(b.normalizedText).toBe(normalized.text);
        expect(o.rawTranscript).toBe(utterance);
        expect(b.rawTranscript).toBe(utterance);
        expect(o.lines.map(shared)).toEqual(expected);
        expect(b.lines.map(shared)).toEqual(expected);
      });

      it('yields app-specific drafts built on the shared lines', () => {
        const o = order.parse(utterance, context());
        const b = bill.parse(utterance, context());

        expect(order.id).toBe('order');
        expect(bill.id).toBe('bill');
        // Order-only fields.
        expect(o).toHaveProperty('fulfillment');
        expect(o).toHaveProperty('walkIn');
        expect(b).not.toHaveProperty('fulfillment');
        expect(b).not.toHaveProperty('walkIn');
        // Bill-only fields.
        expect(b).toHaveProperty('discountPaise');
        expect(b).toHaveProperty('taxEnabled');
        expect(o).not.toHaveProperty('discountPaise');
        expect(o).not.toHaveProperty('taxEnabled');
        // Per-line workflow fields.
        for (const l of o.lines) {
          expect(l).toHaveProperty('unitPricePaise');
          expect(l).not.toHaveProperty('price');
        }
        for (const l of b.lines) {
          expect(l).toHaveProperty('price');
          expect(l).not.toHaveProperty('unitPricePaise');
        }
      });
    });
  }

  it('produces an order bundle from one and a bill bundle from the other for the fixture', () => {
    const utterance = UTTERANCES[0] as string;
    const ob = order.toBundle(order.parse(utterance, context()));
    const bb = bill.toBundle(bill.parse(utterance, context()));

    expect(ob.kind).toBe('order');
    expect(bb.kind).toBe('bill');
    expect(ob.items.map((i) => [i.productId, i.qtyMilli, i.unit])).toEqual(
      bb.items.map((i) => [i.productId, i.qtyMilli, i.unit]),
    );
    expect(ob.order.totalEstimatePaise).toBe(bb.bill.totalPaise);
  });
});
