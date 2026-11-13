import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '../../packages/catalog-matcher/src/index';
import type { WorkflowContext } from '../../packages/confirmation-engine/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import {
  OrderWorkflowAdapter,
  setOrderLineProduct,
  setOrderLineQuantity,
  setOrderLineUnit,
  type OrderDraft,
} from '../../packages/domain-order/src/index';
import { assertProperty, fc } from '../setup/fast-check';
import { catalogArb, uncertainUtteranceArb } from './arbitraries/index';

/**
 * Property 15 over generated utterances: a seeded missing or unmatched field is never
 * `confirmed`, the draft cannot be confirmed, and only user-supplied values unlock it.
 * Oracle: the expected non-confirmed status comes from the seed kind, not from the parser.
 */

const NOT_CONFIRMED = ['missing', 'unmatched', 'ambiguous', 'needs_review'];

function contextFor(catalogData: { shopId: string; products: CatalogProduct[] }) {
  let n = 0;
  const catalog = buildIndex(catalogData.shopId, catalogData.products);
  const context: WorkflowContext<typeof catalog> = {
    shopId: catalogData.shopId,
    customers: [],
    catalog,
    makeId: () => `id-${++n}`,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    config: { taxEnabled: false },
  };
  return context;
}

describe('seeded uncertainty (Property 15)', () => {
  // Feature: awaaz-kit, Property 15: Seeded ambiguous and unmatched fixtures are never confirmed
  // **Validates: Requirements 10.10**
  it('Property 15: seeded missing/unmatched fields are never confirmed and block canConfirm until resolved', () => {
    assertProperty(
      fc.property(
        catalogArb.chain((c) => uncertainUtteranceArb(c).map((u) => ({ c, u }))),
        ({ c, u }) => {
          const context = contextFor(c);
          const order = new OrderWorkflowAdapter();
          const bill = new BillingWorkflowAdapter();

          const draft: OrderDraft = order.parse(u.text, context);
          expect(draft.lines.length).toBeGreaterThan(0);
          const line = draft.lines[0]!;

          // The seeded field is flagged, never silently filled.
          if (u.uncertain === 'missing_quantity') {
            expect(line.quantityMilli.status).toBe('missing');
            expect(line.quantityMilli.value).toBeNull();
          } else {
            expect(line.product.status).toBe('unmatched');
            expect(line.product.value).toBeNull();
          }
          const seeded =
            u.uncertain === 'missing_quantity' ? line.quantityMilli.status : line.product.status;
          expect(NOT_CONFIRMED).toContain(seeded);

          // Gate stays closed for both adapters.
          expect(order.canConfirm(draft)).toBe(false);
          expect(bill.canConfirm(bill.parse(u.text, context))).toBe(false);

          // Resolving only the seeded field is not enough while other fields are unreviewed;
          // after the user supplies every non-confirmed field the gate opens.
          const target = c.products[0]!;
          let resolved = draft;
          for (const l of draft.lines) {
            if (l.product.status !== 'confirmed') {
              resolved = setOrderLineProduct(resolved, l.lineId, target);
            }
          }
          for (const l of draft.lines) {
            if (l.quantityMilli.status !== 'confirmed') {
              resolved = setOrderLineQuantity(resolved, l.lineId, 2000);
            }
          }
          for (const l of draft.lines) {
            if (l.unit.status !== 'confirmed') {
              resolved = setOrderLineUnit(resolved, l.lineId, target.unit);
            }
          }
          expect(resolved.lines.every((l) => l.product.status === 'confirmed')).toBe(true);
          expect(resolved.lines.every((l) => l.quantityMilli.status === 'confirmed')).toBe(true);
          expect(resolved.lines.every((l) => l.unit.status === 'confirmed')).toBe(true);
          expect(order.canConfirm(resolved)).toBe(true);
        },
      ),
    );
  });
});
