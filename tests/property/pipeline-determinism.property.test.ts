import { describe, expect, it } from 'vitest';
import { buildIndex } from '../../packages/catalog-matcher/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter } from '../../packages/domain-order/src/index';
import { assertProperty } from '../setup/fast-check';
import { catalogArb, fc, utteranceArb } from './arbitraries';

const scenarioArb = catalogArb.chain((catalog) =>
  fc
    .tuple(
      utteranceArb(catalog),
      utteranceArb(catalog),
      // Arbitrary free text, including noise that is not an item list.
      fc.string({ maxLength: 80 }),
    )
    .map(([first, second, noise]) => ({ catalog, first: first.text, second: second.text, noise })),
);

// Feature: awaaz-kit, Property 5: Extraction is deterministic and depends only on the text
describe('Property 5: Extraction is deterministic and depends only on the text', () => {
  it('Property 5: **Validates: Requirements 8.5, 6.4**', () => {
    assertProperty(
      fc.property(scenarioArb, ({ catalog, first, second, noise }) => {
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

        for (const text of [first, second, noise]) {
          // Running the full pipeline twice yields deeply equal output.
          expect(new OrderWorkflowAdapter().parse(text, makeCtx())).toEqual(
            new OrderWorkflowAdapter().parse(text, makeCtx()),
          );
          expect(new BillingWorkflowAdapter().parse(text, makeCtx())).toEqual(
            new BillingWorkflowAdapter().parse(text, makeCtx()),
          );
        }

        // Editing a transcript: parse the original text, then the edited text on the same
        // adapter. The result equals a fresh parse of the edited text (no hidden state).
        const orderAdapter = new OrderWorkflowAdapter();
        orderAdapter.parse(first, makeCtx());
        expect(orderAdapter.parse(second, makeCtx())).toEqual(
          new OrderWorkflowAdapter().parse(second, makeCtx()),
        );
        const billAdapter = new BillingWorkflowAdapter();
        billAdapter.parse(first, makeCtx());
        expect(billAdapter.parse(second, makeCtx())).toEqual(
          new BillingWorkflowAdapter().parse(second, makeCtx()),
        );
      }),
    );
  });
});
