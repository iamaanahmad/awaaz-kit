import { describe, expect, it } from 'vitest';
import { BillingWorkflowAdapter, type BillDraft } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter, type OrderDraft } from '../../packages/domain-order/src/index';
import { assertProperty, fc } from '../setup/fast-check';
import {
  billDraftArb,
  catalogArb,
  completeBillDraftArb,
  completeOrderDraftArb,
  orderDraftArb,
  type BillDraftData,
  type FieldData,
  type OrderDraftData,
  type ResolvedLineData,
} from './arbitraries/index';

/**
 * Property 17: canConfirm is true iff the draft has at least one line, no validation issues and
 * every required field of every line is `confirmed`; run against both adapters.
 *
 * Oracle: validity is recomputed from the raw draft data (statuses, values, BigInt subtotal) and
 * never by calling `validate` or `canConfirm`. `validate` is only compared against it.
 */

const confirmedValue = <T>(f: FieldData<T>): boolean => f.status === 'confirmed' && f.value !== null;

/** Required fields every line must have confirmed (product, quantity, unit). */
function lineResolved(l: ResolvedLineData): boolean {
  return (
    confirmedValue(l.product) &&
    confirmedValue(l.quantityMilli) &&
    (l.quantityMilli.value as number) > 0 &&
    confirmedValue(l.unit)
  );
}

function orderOracle(d: OrderDraftData): boolean {
  return d.lines.length > 0 && d.lines.every(lineResolved);
}

function billOracle(d: BillDraftData): boolean {
  if (d.lines.length === 0) return false;
  if (!d.lines.every((l) => lineResolved(l) && confirmedValue(l.price))) return false;
  if (!d.taxEnabled && d.taxPaise !== 0) return false;
  const subtotal = d.lines.reduce(
    (acc, l) =>
      acc + (BigInt(l.price.value as number) * BigInt(l.quantityMilli.value as number) + 500n) / 1000n,
    0n,
  );
  return BigInt(d.discountPaise) <= subtotal;
}

function toOrderDraft(d: OrderDraftData): OrderDraft {
  return {
    ...d,
    note: d.note ?? '',
    lines: d.lines.map((l) => ({ ...l, lineTotalPaise: null })),
  } as unknown as OrderDraft;
}

function toBillDraft(d: BillDraftData): BillDraft {
  return d as unknown as BillDraft;
}

describe('confirmation gate (Property 17)', () => {
  // Feature: awaaz-kit, Property 17: The confirmation gate matches draft validity
  // **Validates: Requirements 11.3, 11.4, 12.7, 13.5**
  it('Property 17: Order canConfirm iff lines exist, no issues and required fields confirmed', () => {
    assertProperty(
      fc.property(
        catalogArb.chain((c) => fc.oneof(orderDraftArb(c), completeOrderDraftArb(c))),
        (data) => {
          const adapter = new OrderWorkflowAdapter();
          const draft = toOrderDraft(data);
          const expected = orderOracle(data);

          expect(adapter.canConfirm(draft)).toBe(expected);
          expect(adapter.validate(draft).length === 0 && draft.lines.length > 0).toBe(expected);
          // Unresolved required fields always block.
          if (data.lines.some((l) => !lineResolved(l))) expect(adapter.canConfirm(draft)).toBe(false);
        },
      ),
    );
  });

  // Feature: awaaz-kit, Property 17: The confirmation gate matches draft validity
  // **Validates: Requirements 11.3, 11.4, 12.7, 13.5**
  it('Property 17: Bill canConfirm iff lines exist, no issues, required fields confirmed and priced', () => {
    assertProperty(
      fc.property(
        catalogArb.chain((c) => fc.oneof(billDraftArb(c), completeBillDraftArb(c))),
        (data) => {
          const adapter = new BillingWorkflowAdapter();
          const draft = toBillDraft(data);
          const expected = billOracle(data);

          expect(adapter.canConfirm(draft)).toBe(expected);
          expect(adapter.validate(draft).length === 0 && draft.lines.length > 0).toBe(expected);
          // Unresolved required fields (including a missing price) always block.
          if (data.lines.some((l) => !lineResolved(l) || !confirmedValue(l.price))) {
            expect(adapter.canConfirm(draft)).toBe(false);
          }
        },
      ),
    );
  });
});
