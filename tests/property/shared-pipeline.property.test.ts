import { describe, expect, it } from 'vitest';
import { buildIndex } from '../../packages/catalog-matcher/src/index';
import { resolveLines } from '../../packages/confidence-engine/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter } from '../../packages/domain-order/src/index';
import { extract } from '../../packages/intent-engine/src/index';
import { normalize } from '../../packages/language-normalizer/src/index';
import { assertProperty } from '../setup/fast-check';
import { catalogArb, fc, utteranceArb } from './arbitraries';

/** (product, quantity, unit, Field_Status) tuple of one draft line. */
interface LineTuple {
  productId: string | null;
  qtyMilli: number | null;
  unit: string | null;
  statuses: [string, string, string];
}

interface TupleSource {
  product: { value: { productId: string } | null; status: string };
  quantityMilli: { value: number | null; status: string };
  unit: { value: string | null; status: string };
}

const tupleOf = (l: TupleSource): LineTuple => ({
  productId: l.product.value?.productId ?? null,
  qtyMilli: l.quantityMilli.value,
  unit: l.unit.value,
  statuses: [l.product.status, l.quantityMilli.status, l.unit.status],
});

const scenarioArb = catalogArb.chain((catalog) =>
  utteranceArb(catalog).map((utterance) => ({ catalog, utterance })),
);

// Feature: awaaz-kit, Property 22: Both workflows consume the same shared pipeline output
describe('Property 22: Both workflows consume the same shared pipeline output', () => {
  it('Property 22: **Validates: Requirements 1.6**', () => {
    assertProperty(
      fc.property(scenarioArb, ({ catalog, utterance }) => {
        const index = buildIndex(catalog.shopId, catalog.products);
        const makeCtx = () => {
          let n = 0;
          return {
            shopId: catalog.shopId,
            customers: [],
            catalog: index,
            makeId: () => `id-${++n}`,
            now: () => new Date('2026-01-01T00:00:00.000Z'),
            config: { taxEnabled: false },
          };
        };

        const order = new OrderWorkflowAdapter().parse(utterance.text, makeCtx());
        const bill = new BillingWorkflowAdapter().parse(utterance.text, makeCtx());

        // Reference: the shared normalize -> extract -> resolve stages called directly.
        const normalized = normalize(utterance.text);
        const shared = resolveLines(
          extract(normalized, { locale: 'hi-IN', knownCustomerNames: [] }),
          index,
          makeCtx().makeId,
        ).map(tupleOf);

        const orderTuples = order.lines.map(tupleOf);
        const billTuples = bill.lines.map(tupleOf);

        // Identical shared output for both workflows, equal to the shared stages called directly.
        expect(orderTuples).toEqual(billTuples);
        expect(orderTuples).toEqual(shared);
        expect(order.normalizedText).toBe(bill.normalizedText);
        expect(order.normalizedText).toBe(normalized.text);

        // Independent oracle from the generator's template inputs. Product matching accuracy is
        // covered by the corpus gates, so only line count, quantity and unit are pinned here.
        expect(orderTuples.map((t) => [t.qtyMilli, t.unit])).toEqual(
          utterance.lines.map((l) => [l.qtyMilli, l.unit]),
        );

        // Domain fields differ: order carries a price snapshot and total, bill a price field.
        // Prices are looked up by product id in the generated catalog, not via the code under test.
        order.lines.forEach((l, i) => {
          const productId = l.product.value?.productId;
          const price = catalog.products.find((p) => p.id === productId)?.pricePaise ?? null;
          expect(l.unitPricePaise).toBe(price);
          expect(bill.lines[i]!.price.value).toBe(price);
          expect('price' in l).toBe(false);
          expect('unitPricePaise' in bill.lines[i]!).toBe(false);
        });
        expect('fulfillment' in order).toBe(true);
        expect('fulfillment' in bill).toBe(false);
        expect('discountPaise' in bill).toBe(true);
        expect('discountPaise' in order).toBe(false);
      }),
    );
  });
});
