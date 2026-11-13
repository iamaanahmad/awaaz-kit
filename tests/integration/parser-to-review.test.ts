import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '../../packages/catalog-matcher/src/index';
import { buildReview, type WorkflowContext } from '../../packages/confirmation-engine/src/index';
import {
  BillingWorkflowAdapter,
  setLineProduct,
  setLineQuantity,
  setLineUnit,
  type BillDraft,
} from '../../packages/domain-billing/src/index';
import {
  OrderWorkflowAdapter,
  setOrderLineProduct,
  setOrderLineQuantity,
  setOrderLineUnit,
  type OrderDraft,
} from '../../packages/domain-order/src/index';
import { DEMO_SEED } from '../../packages/local-data/src/demo-shop';

/**
 * Parser-to-review integration (Task 16.4).
 * Utterance -> adapter.parse -> buildReview with the Demo_Shop catalog, for both adapters.
 * Clean utterances are confirmable, uncertain ones are not, and a user edit makes them confirmable.
 *
 * **Validates: Requirements 19.4, 12.5**
 */

const shopId = DEMO_SEED.shop.id;
const products: CatalogProduct[] = DEMO_SEED.products.map((p) => ({
  id: p.id,
  shopId,
  name: p.name,
  aliases: [...p.aliases],
  ...(p.brand ? { brand: p.brand } : {}),
  unit: p.unit,
  pricePaise: p.pricePaise,
  active: true,
  deletedAt: null,
}));
const catalog = buildIndex(shopId, products);
const atta = products.find((p) => p.id === '00000000-0000-4000-8000-000000000001') as CatalogProduct;

function ctx(): WorkflowContext<typeof catalog> {
  let n = 0;
  return {
    shopId,
    customers: DEMO_SEED.customers.map((c) => ({ id: c.id, name: c.name })),
    catalog,
    makeId: () => `id-${++n}`,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    config: { taxEnabled: false },
  };
}

const order = new OrderWorkflowAdapter();
const bill = new BillingWorkflowAdapter();

const CLEAN = [
  'do kilo aata, ek litre tel aur paanch kilo chawal',
  'two kg rice and one litre cooking oil',
  'दो किलो आटा और एक लीटर तेल',
];
const BILL_CLEAN = ['teen kilo chini aur do kilo namak', 'one litre milk and two kg sugar'];
const UNCERTAIN = [
  'ek litre Amul', // ambiguous product
  'do kilo laptop', // unmatched product
  'kilo chini', // missing quantity
  'ek kilo xyzzy masala', // unmatched product
];
const BILL_UNCERTAIN = ['kilo namak aur do kilo chawal', 'do kilo laptop'];

describe('parser to review: Order adapter', () => {
  it.each(CLEAN)('clean utterance is confirmable: %s', (text) => {
    const draft = order.parse(text, ctx());
    const review = buildReview(order, draft, draft.revision);
    expect(review.issues).toEqual([]);
    expect(review.canConfirm).toBe(true);
    expect(review.revision).toBe(draft.revision);
    expect(review.draft).toBe(draft);
  });

  it.each(UNCERTAIN)('uncertain utterance is not confirmable: %s', (text) => {
    const draft = order.parse(text, ctx());
    const review = buildReview(order, draft, draft.revision);
    expect(review.canConfirm).toBe(false);
    expect(review.issues.length).toBeGreaterThan(0);
    // Every issue points at a real line in the draft.
    for (const i of review.issues) {
      if (i.lineId !== undefined) expect(draft.lines.some((l) => l.lineId === i.lineId)).toBe(true);
    }
  });

  it.each(UNCERTAIN)('edit then confirmable with a bumped revision: %s', (text) => {
    let draft: OrderDraft = order.parse(text, ctx());
    const before = buildReview(order, draft, draft.revision);
    expect(before.canConfirm).toBe(false);
    for (const line of draft.lines) {
      draft = setOrderLineProduct(draft, line.lineId, atta);
      draft = setOrderLineQuantity(draft, line.lineId, 1000);
      draft = setOrderLineUnit(draft, line.lineId, 'kg');
    }
    const after = buildReview(order, draft, draft.revision);
    expect(after.issues).toEqual([]);
    expect(after.canConfirm).toBe(true);
    expect(after.revision).toBeGreaterThan(before.revision);
  });
});

describe('parser to review: Billing adapter', () => {
  it.each(BILL_CLEAN)('clean utterance is confirmable: %s', (text) => {
    const draft = bill.parse(text, ctx());
    const review = buildReview(bill, draft, draft.revision);
    expect(review.issues).toEqual([]);
    expect(review.canConfirm).toBe(true);
    expect(review.revision).toBe(draft.revision);
  });

  it.each(BILL_UNCERTAIN)('uncertain utterance is not confirmable: %s', (text) => {
    const draft = bill.parse(text, ctx());
    const review = buildReview(bill, draft, draft.revision);
    expect(review.canConfirm).toBe(false);
    expect(review.issues.length).toBeGreaterThan(0);
  });

  it.each(BILL_UNCERTAIN)('edit then confirmable with a bumped revision: %s', (text) => {
    let draft: BillDraft = bill.parse(text, ctx());
    const before = buildReview(bill, draft, draft.revision);
    expect(before.canConfirm).toBe(false);
    for (const line of draft.lines) {
      draft = setLineProduct(draft, line.lineId, atta);
      draft = setLineQuantity(draft, line.lineId, 1000);
      draft = setLineUnit(draft, line.lineId, 'kg');
    }
    const after = buildReview(bill, draft, draft.revision);
    expect(after.issues).toEqual([]);
    expect(after.canConfirm).toBe(true);
    expect(after.revision).toBeGreaterThan(before.revision);
  });

  it('a missing price blocks confirm until the user supplies one', () => {
    const draft = bill.parse('teen kilo chini', ctx());
    const line = draft.lines[0];
    expect(line).toBeDefined();
    const noPrice: BillDraft = {
      ...draft,
      lines: draft.lines.map((l) => ({
        ...l,
        price: { value: null, status: 'missing' as const, confidence: null },
      })),
    };
    const review = buildReview(bill, noPrice, noPrice.revision);
    expect(review.canConfirm).toBe(false);
    expect(review.issues.map((i) => i.code)).toContain('price_missing');
  });
});
