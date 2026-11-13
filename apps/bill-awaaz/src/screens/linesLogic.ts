import type { CatalogProduct } from '@awaaz-kit/catalog-matcher';
import {
  setLinePrice,
  setLineProduct,
  setLineQuantity,
  setLineUnit,
  type BillDraft,
  type BillDraftLine,
} from '@awaaz-kit/domain-billing';
import type { LineEditorValue } from '@awaaz-kit/shared-ui';

export const BILL_UNITS = ['piece', 'kg', 'g', 'litre', 'ml'] as const;
type BillUnit = (typeof BILL_UNITS)[number];

const isBillUnit = (u: string): u is BillUnit => (BILL_UNITS as readonly string[]).includes(u);

/** Derives the editor value of a draft line. Quantity is shown in units, not milli-units. */
export function lineToEditorValue(line: BillDraftLine): LineEditorValue {
  const milli = line.quantityMilli.value;
  return {
    productName: line.product.value?.name ?? line.spokenName,
    quantity: milli === null ? null : milli / 1000,
    unit: line.unit.value ?? '',
    unitPricePaise: line.price.value,
  };
}

/**
 * Applies the fields that changed between `prev` and `next` to the draft through the
 * domain edit functions. Blank or invalid inputs (null quantity or price) are not applied.
 */
export function applyEditorChange(
  draft: BillDraft,
  lineId: string,
  prev: LineEditorValue,
  next: LineEditorValue,
  products: readonly CatalogProduct[],
): BillDraft {
  let d = draft;
  if (next.productName !== prev.productName) {
    const key = next.productName.trim().toLowerCase();
    const hit = key === '' ? undefined : products.find((p) => p.name.trim().toLowerCase() === key);
    if (hit) d = setLineProduct(d, lineId, hit);
  }
  if (next.quantity !== null && next.quantity !== prev.quantity) {
    d = setLineQuantity(d, lineId, Math.round(next.quantity * 1000));
  }
  if (next.unit !== prev.unit && isBillUnit(next.unit)) d = setLineUnit(d, lineId, next.unit);
  if (next.unitPricePaise !== null && next.unitPricePaise !== prev.unitPricePaise) {
    d = setLinePrice(d, lineId, next.unitPricePaise);
  }
  return d;
}

export type LineField = 'product' | 'quantityMilli' | 'unit' | 'price';

export interface LineClarification {
  lineId: string;
  field: LineField;
  prompt: string;
  candidates: CatalogProduct[];
}

/** First unconfirmed field in order: product, quantity, unit, price (Req 13.5, 10.7). */
export function nextLineClarification(lines: readonly BillDraftLine[]): LineClarification | null {
  for (const line of lines) {
    const name = line.spokenName.trim();
    if (line.product.status !== 'confirmed') {
      return {
        lineId: line.lineId,
        field: 'product',
        prompt: name === '' ? 'Kaunsa item?' : `"${name}" kaunsa item hai?`,
        candidates: line.candidates.slice(0, 3),
      };
    }
    if (line.quantityMilli.status !== 'confirmed') {
      return {
        lineId: line.lineId,
        field: 'quantityMilli',
        prompt: 'Kitni quantity?',
        candidates: [],
      };
    }
    if (line.unit.status !== 'confirmed') {
      return { lineId: line.lineId, field: 'unit', prompt: 'Kaunsi unit?', candidates: [] };
    }
    if (line.price.status !== 'confirmed') {
      return { lineId: line.lineId, field: 'price', prompt: 'Price kitna hai?', candidates: [] };
    }
  }
  return null;
}

/**
 * Confirms the current value of a clarified non-product field. Returns the draft unchanged
 * when that field has no value yet (the user must enter one in the line editor).
 */
export function confirmCurrentValue(draft: BillDraft, c: LineClarification): BillDraft {
  const line = draft.lines.find((l) => l.lineId === c.lineId);
  if (!line) return draft;
  switch (c.field) {
    case 'quantityMilli':
      return line.quantityMilli.value === null
        ? draft
        : setLineQuantity(draft, c.lineId, line.quantityMilli.value);
    case 'unit':
      return line.unit.value === null ? draft : setLineUnit(draft, c.lineId, line.unit.value);
    case 'price':
      return line.price.value === null ? draft : setLinePrice(draft, c.lineId, line.price.value);
    case 'product':
      return draft;
  }
}
