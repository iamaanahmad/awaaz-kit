import type { CatalogProduct } from '@awaaz-kit/catalog-matcher';
import { applyUserValue } from '@awaaz-kit/confidence-engine';
import type { ValidationIssue } from '@awaaz-kit/confirmation-engine';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';
import { BillingWorkflowAdapter, type BillDraft, type BillDraftLine } from './bill-draft.js';
import { computeTotals, type Totals } from './money.js';

/**
 * Pure editing operations for a Bill draft (Req 13.6, 14.8, 10.11).
 *
 * Every operation returns a new draft with `revision` incremented. Operations
 * that name a line which is not in the draft return the draft unchanged.
 * Totals and validity are never stored; they are derived by `summarizeDraft`,
 * so they are recomputed after every edit.
 */

const adapter = new BillingWorkflowAdapter();

function bump(draft: BillDraft, changes: Partial<BillDraft>): BillDraft {
  return { ...draft, ...changes, revision: draft.revision + 1 };
}

function updateLine(
  draft: BillDraft,
  lineId: string,
  fn: (line: BillDraftLine) => BillDraftLine,
): BillDraft {
  if (!draft.lines.some((l) => l.lineId === lineId)) return draft;
  return bump(draft, { lines: draft.lines.map((l) => (l.lineId === lineId ? fn(l) : l)) });
}

const confirmedPrice = (paise: number, reason: string) => ({
  value: paise,
  status: 'confirmed' as const,
  confidence: null,
  reason,
});

/** Chooses a catalog product; the price snapshot follows the chosen product. */
export function setLineProduct(
  draft: BillDraft,
  lineId: string,
  product: CatalogProduct,
): BillDraft {
  return updateLine(draft, lineId, (line) => ({
    ...line,
    ...applyUserValue(line, 'product', { productId: product.id, name: product.name }),
    price: confirmedPrice(product.pricePaise, 'Catalog price'),
  }));
}

/** Sets the quantity in milli-units. Totals are recomputed by `summarizeDraft` (Req 14.8). */
export function setLineQuantity(
  draft: BillDraft,
  lineId: string,
  quantityMilli: number,
): BillDraft {
  return updateLine(draft, lineId, (line) => ({
    ...line,
    ...applyUserValue(line, 'quantityMilli', quantityMilli),
  }));
}

/** Sets the unit as given; no unit conversion is performed. */
export function setLineUnit(draft: BillDraft, lineId: string, unit: CanonicalUnit): BillDraft {
  return updateLine(draft, lineId, (line) => ({
    ...line,
    ...applyUserValue(line, 'unit', unit),
  }));
}

/** Sets a manual unit price in paise. */
export function setLinePrice(draft: BillDraft, lineId: string, unitPricePaise: number): BillDraft {
  return updateLine(draft, lineId, (line) => ({
    ...line,
    price: confirmedPrice(unitPricePaise, 'Entered by user'),
  }));
}

/** Sets the bill discount in paise. An excess discount is reported by validation (Req 14.6). */
export function setDiscount(draft: BillDraft, discountPaise: number): BillDraft {
  return bump(draft, { discountPaise });
}

/** Sets or clears the customer. */
export function setCustomer(draft: BillDraft, customerId: string | null): BillDraft {
  return bump(draft, { customerId });
}

/**
 * Appends an empty line. Its fields are `missing`, so the draft is not
 * confirmable until the user fills them in or removes it.
 */
export function addLine(draft: BillDraft, lineId: string): BillDraft {
  if (draft.lines.some((l) => l.lineId === lineId)) return draft;
  const missing = <T>() => ({
    value: null as T | null,
    status: 'missing' as const,
    confidence: null,
  });
  const line: BillDraftLine = {
    lineId,
    product: { ...missing(), status: 'unmatched' },
    quantityMilli: missing(),
    unit: missing(),
    candidates: [],
    spokenName: '',
    price: { ...missing(), reason: 'Price not known. Enter a price.' },
  };
  return bump(draft, { lines: [...draft.lines, line] });
}

/** Removes a line and excludes it from totals and validity (Req 10.11). */
export function removeLine(draft: BillDraft, lineId: string): BillDraft {
  if (!draft.lines.some((l) => l.lineId === lineId)) return draft;
  return bump(draft, { lines: draft.lines.filter((l) => l.lineId !== lineId) });
}

export interface DraftSummary {
  totals: Totals;
  issues: ValidationIssue[];
  canConfirm: boolean;
}

/** Derives totals, validation issues and the confirmation gate from the current draft. */
export function summarizeDraft(draft: BillDraft): DraftSummary {
  const totals = computeTotals(
    draft.lines.map((l) => ({
      unitPricePaise: l.price.value ?? 0,
      qtyMilli: l.quantityMilli.value ?? 0,
    })),
    draft.discountPaise,
    draft.taxPaise,
  );
  return {
    totals,
    issues: adapter.validate(draft),
    canConfirm: adapter.canConfirm(draft),
  };
}
