import { describe, expect, it } from 'vitest';
import {
  BillingWorkflowAdapter,
  removeLine,
  type BillDraft,
} from '../../packages/domain-billing/src/index';
import {
  OrderWorkflowAdapter,
  removeOrderLine,
  type OrderDraft,
} from '../../packages/domain-order/src/index';
import { assertProperty, fc } from '../setup/fast-check';
import {
  billDraftArb,
  catalogArb,
  completeBillDraftArb,
  completeOrderDraftArb,
  orderDraftArb,
} from './arbitraries/index';

/**
 * Property 18: removing a line yields a draft whose lines, validation issues and `canConfirm`
 * equal those of a draft built without that line.
 *
 * Oracle: the "never had it" draft is built here by filtering the line out of the generated data,
 * not by calling the removal function under test.
 */

const orderScenarioArb = catalogArb
  .chain((c) =>
    fc.oneof(
      completeOrderDraftArb(c),
      orderDraftArb(c).filter((d) => d.lines.length > 0),
    ),
  )
  .chain((data) =>
    fc.integer({ min: 0, max: data.lines.length - 1 }).map((index) => ({ data, index })),
  );

const billScenarioArb = catalogArb
  .chain((c) =>
    fc.oneof(
      completeBillDraftArb(c),
      billDraftArb(c).filter((d) => d.lines.length > 0),
    ),
  )
  .chain((data) =>
    fc.integer({ min: 0, max: data.lines.length - 1 }).map((index) => ({ data, index })),
  );

describe('line removal (Property 18)', () => {
  // Feature: awaaz-kit, Property 18: Removing a line equals never having it
  // **Validates: Requirements 10.11**
  it('Property 18: Order draft with a line removed equals a draft built without it', () => {
    assertProperty(
      fc.property(orderScenarioArb, ({ data, index }) => {
        const adapter = new OrderWorkflowAdapter();
        const toDraft = (lines: typeof data.lines): OrderDraft =>
          ({
            ...data,
            note: data.note ?? '',
            lines: lines.map((l) => ({ ...l, lineTotalPaise: null })),
          }) as unknown as OrderDraft;

        const full = toDraft(data.lines);
        const lineId = data.lines[index]!.lineId;
        const removed = removeOrderLine(full, lineId);
        const without = toDraft(data.lines.filter((_, i) => i !== index));

        expect(removed.lines).toEqual(without.lines);
        expect(adapter.validate(removed)).toEqual(adapter.validate(without));
        expect(adapter.canConfirm(removed)).toBe(adapter.canConfirm(without));
        expect(removed.lines.some((l) => l.lineId === lineId)).toBe(false);
      }),
    );
  });

  // Feature: awaaz-kit, Property 18: Removing a line equals never having it
  // **Validates: Requirements 10.11**
  it('Property 18: Bill draft with a line removed equals a draft built without it', () => {
    assertProperty(
      fc.property(billScenarioArb, ({ data, index }) => {
        const adapter = new BillingWorkflowAdapter();
        const toDraft = (lines: typeof data.lines): BillDraft =>
          ({ ...data, lines }) as unknown as BillDraft;

        const full = toDraft(data.lines);
        const lineId = data.lines[index]!.lineId;
        const removed = removeLine(full, lineId);
        const without = toDraft(data.lines.filter((_, i) => i !== index));

        expect(removed.lines).toEqual(without.lines);
        expect(adapter.validate(removed)).toEqual(adapter.validate(without));
        expect(adapter.canConfirm(removed)).toBe(adapter.canConfirm(without));
        expect(removed.lines.some((l) => l.lineId === lineId)).toBe(false);
      }),
    );
  });
});
