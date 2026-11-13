import type { CatalogProduct } from '@awaaz-kit/catalog-matcher';
import { applyUserValue } from '@awaaz-kit/confidence-engine';
import type { ValidationIssue } from '@awaaz-kit/confirmation-engine';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';
import {
  OrderWorkflowAdapter,
  orderLineTotalPaise,
  type OrderDraft,
  type OrderDraftLine,
} from './order-draft.js';

/**
 * Pure editing operations for an Order draft (Req 12.6, 10.11).
 *
 * Every operation returns a new draft with `revision` incremented. Operations
 * that name a line which is not in the draft return the draft unchanged.
 * The estimated total and validity are derived by `summarizeOrderDraft`.
 */

const adapter = new OrderWorkflowAdapter();

function bump(draft: OrderDraft, changes: Partial<OrderDraft>): OrderDraft {
  return { ...draft, ...changes, revision: draft.revision + 1 };
}

/** Keeps `lineTotalPaise` consistent with price and quantity. */
function withTotal(line: OrderDraftLine): OrderDraftLine {
  return {
    ...line,
    lineTotalPaise: orderLineTotalPaise(line.unitPricePaise, line.quantityMilli.value),
  };
}

function updateLine(
  draft: OrderDraft,
  lineId: string,
  fn: (line: OrderDraftLine) => OrderDraftLine,
): OrderDraft {
  if (!draft.lines.some((l) => l.lineId === lineId)) return draft;
  return bump(draft, {
    lines: draft.lines.map((l) => (l.lineId === lineId ? withTotal(fn(l)) : l)),
  });
}

/** Chooses a catalog product; the price snapshot follows the chosen product. */
export function setOrderLineProduct(
  draft: OrderDraft,
  lineId: string,
  product: CatalogProduct,
): OrderDraft {
  return updateLine(draft, lineId, (line) => ({
    ...line,
    ...applyUserValue(line, 'product', { productId: product.id, name: product.name }),
    unitPricePaise: product.pricePaise,
  }));
}

/** Sets the quantity in milli-units. */
export function setOrderLineQuantity(
  draft: OrderDraft,
  lineId: string,
  quantityMilli: number,
): OrderDraft {
  return updateLine(draft, lineId, (line) => ({
    ...line,
    ...applyUserValue(line, 'quantityMilli', quantityMilli),
  }));
}

/** Sets the unit as given; no unit conversion is performed. */
export function setOrderLineUnit(
  draft: OrderDraft,
  lineId: string,
  unit: CanonicalUnit,
): OrderDraft {
  return updateLine(draft, lineId, (line) => ({
    ...line,
    ...applyUserValue(line, 'unit', unit),
  }));
}

/** Sets delivery or pickup. */
export function setFulfillment(draft: OrderDraft, fulfillment: 'delivery' | 'pickup'): OrderDraft {
  return bump(draft, { fulfillment });
}

/** Sets the optional note. */
export function setNote(draft: OrderDraft, note: string): OrderDraft {
  return bump(draft, { note });
}

/** Selects a customer, or Walk-in when `customerId` is null (Req 12.3). */
export function setOrderCustomer(draft: OrderDraft, customerId: string | null): OrderDraft {
  return bump(draft, { customerId, walkIn: customerId === null });
}

/**
 * Appends an empty line. Its fields are `missing`, so the draft is not
 * confirmable until the user fills them in or removes it.
 */
export function addOrderLine(draft: OrderDraft, lineId: string): OrderDraft {
  if (draft.lines.some((l) => l.lineId === lineId)) return draft;
  const missing = <T>() => ({
    value: null as T | null,
    status: 'missing' as const,
    confidence: null,
  });
  const line: OrderDraftLine = {
    lineId,
    product: { ...missing(), status: 'unmatched' },
    quantityMilli: missing(),
    unit: missing(),
    candidates: [],
    spokenName: '',
    unitPricePaise: null,
    lineTotalPaise: null,
  };
  return bump(draft, { lines: [...draft.lines, line] });
}

/** Removes a line and excludes it from the total and validity (Req 10.11). */
export function removeOrderLine(draft: OrderDraft, lineId: string): OrderDraft {
  if (!draft.lines.some((l) => l.lineId === lineId)) return draft;
  return bump(draft, { lines: draft.lines.filter((l) => l.lineId !== lineId) });
}

/** Sum of known line totals in paise; lines without a price add nothing. */
export function estimateTotalPaise(draft: OrderDraft): number {
  return draft.lines.reduce((sum, l) => sum + (l.lineTotalPaise ?? 0), 0);
}

export interface OrderDraftSummary {
  totalEstimatePaise: number;
  issues: ValidationIssue[];
  canConfirm: boolean;
}

/** Derives the estimated total, validation issues and the confirmation gate. */
export function summarizeOrderDraft(draft: OrderDraft): OrderDraftSummary {
  return {
    totalEstimatePaise: estimateTotalPaise(draft),
    issues: adapter.validate(draft),
    canConfirm: adapter.canConfirm(draft),
  };
}
