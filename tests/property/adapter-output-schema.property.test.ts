import { describe, expect, it } from 'vitest';
import { buildIndex } from '../../packages/catalog-matcher/src/index';
import { BillingWorkflowAdapter, billDraftSchema } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter, orderDraftSchema } from '../../packages/domain-order/src/index';
import { assertProperty } from '../setup/fast-check';
import { catalogArb, fc, utteranceArb } from './arbitraries';

/** Arbitrary text: template utterances, free-form strings, and utterances with junk appended. */
const scenarioArb = catalogArb.chain((catalog) =>
  fc
    .oneof(
      utteranceArb(catalog).map((u) => u.text),
      fc.string({ maxLength: 120 }),
      fc.constantFrom('', '   ', '\n\t', '0', '-1 kg', '99999999999 kg chawal'),
      fc
        .tuple(
          utteranceArb(catalog).map((u) => u.text),
          fc.string({ maxLength: 40 }),
        )
        .map(([a, b]) => `${a} ${b}`),
    )
    .map((text) => ({ catalog, text })),
);

// Feature: awaaz-kit, Property 8: Adapter output satisfies the draft schema
describe('Property 8: Adapter output satisfies the draft schema', () => {
  it('Property 8: **Validates: Requirements 8.10**', () => {
    assertProperty(
      fc.property(scenarioArb, ({ catalog, text }) => {
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

        const order = new OrderWorkflowAdapter().parse(text, makeCtx());
        const bill = new BillingWorkflowAdapter().parse(text, makeCtx());

        expect(orderDraftSchema.safeParse(order).success).toBe(true);
        expect(billDraftSchema.safeParse(bill).success).toBe(true);

        expect(() => new OrderWorkflowAdapter().validate(order)).not.toThrow();
        expect(() => new BillingWorkflowAdapter().validate(bill)).not.toThrow();
        expect(Array.isArray(new OrderWorkflowAdapter().validate(order))).toBe(true);
        expect(Array.isArray(new BillingWorkflowAdapter().validate(bill))).toBe(true);
      }),
    );
  });
});
