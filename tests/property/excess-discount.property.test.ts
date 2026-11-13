import { describe, expect, it } from 'vitest';
import { BillingWorkflowAdapter, type BillDraft } from '../../packages/domain-billing/src/index';
import { assertProperty } from '../setup/fast-check';
import { excessDiscountBillArb, fc, oracleTotals, type BillInput } from './arbitraries';

const adapter = new BillingWorkflowAdapter();

/** Builds a draft whose lines are fully resolved and confirmed, so only the discount can block. */
function draftFrom(bill: BillInput): BillDraft {
  return {
    id: 'bill-1',
    shopId: 'shop-1',
    customerId: null,
    lines: bill.lines.map((l, i) => ({
      lineId: `line-${i}`,
      product: {
        value: { productId: `p-${i}`, name: `Product ${i}` },
        status: 'confirmed',
        confidence: null,
        reason: '',
      },
      quantityMilli: { value: l.qtyMilli, status: 'confirmed', confidence: null, reason: '' },
      unit: { value: 'piece', status: 'confirmed', confidence: null, reason: '' },
      candidates: [],
      spokenName: `product ${i}`,
      price: { value: l.unitPricePaise, status: 'confirmed', confidence: null, reason: '' },
    })),
    discountPaise: bill.discountPaise,
    taxPaise: bill.taxPaise,
    taxEnabled: bill.taxPaise !== 0,
    rawTranscript: '',
    normalizedText: '',
    revision: 0,
    mutationId: 'mutation-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  } as BillDraft;
}

// Feature: awaaz-kit, Property 25: Excess discount blocks finalization
describe('Property 25: Excess discount blocks finalization', () => {
  it('Property 25: discount above subtotal yields a discount issue and canConfirm is false. **Validates: Requirements 14.6**', () => {
    assertProperty(
      fc.property(excessDiscountBillArb, (bill) => {
        // Independent oracle agrees the discount is excessive.
        expect(oracleTotals(bill).total).toBeNull();

        const draft = draftFrom(bill);
        const issues = adapter.validate(draft);
        expect(
          issues.some((i) => i.code === 'discount_exceeds_subtotal' && i.field === 'discountPaise'),
        ).toBe(true);
        expect(adapter.canConfirm(draft)).toBe(false);
      }),
    );
  });

  it('example: Rs 10 discount on a Rs 5 bill is blocked', () => {
    const draft = draftFrom({
      lines: [{ unitPricePaise: 500, qtyMilli: 1000 }],
      discountPaise: 1000,
      taxPaise: 0,
    });
    expect(adapter.canConfirm(draft)).toBe(false);
    expect(adapter.validate(draft).map((i) => i.code)).toContain('discount_exceeds_subtotal');
  });
});
