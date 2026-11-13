import type { CatalogProductData, GeneratedCatalog } from './catalog';
import {
  fc,
  isoDateArb,
  pricePaiseArb,
  qtyMilliArb,
  unitArb,
  uuidArb,
  type CanonicalUnit,
  type FieldStatus,
} from './common';

/**
 * Draft generators. Shapes are structurally compatible with `ResolvedLine`, `BillDraft` and
 * `OrderDraft` from the engine and domain packages, but are declared here so that the shared
 * arbitraries do not depend on any workspace package.
 *
 * Invariants kept by construction (design.md status table):
 * - `confirmed` fields carry a value; `missing` and `unmatched` carry `null`.
 * - A missing quantity is never defaulted to 1.
 * - `needs_review` products carry no value and at most three candidates.
 */

export interface FieldData<T> {
  value: T | null;
  status: FieldStatus;
  sourceText?: string;
  confidence?: number | null;
  reason?: string;
}

export interface ResolvedLineData {
  lineId: string;
  product: FieldData<{ productId: string; name: string }>;
  quantityMilli: FieldData<number>;
  unit: FieldData<CanonicalUnit>;
  candidates: CatalogProductData[];
  spokenName: string;
}

export interface BillDraftLineData extends ResolvedLineData {
  price: FieldData<number>;
}

export interface BillDraftData {
  id: string;
  shopId: string;
  customerId: string | null;
  lines: BillDraftLineData[];
  discountPaise: number;
  taxPaise: number;
  taxEnabled: boolean;
  rawTranscript: string;
  normalizedText: string;
  revision: number;
  mutationId: string;
  createdAt: string;
}

export interface OrderDraftLineData extends ResolvedLineData {
  unitPricePaise: number | null;
}

export interface OrderDraftData {
  id: string;
  shopId: string;
  customerId: string | null;
  walkIn: boolean;
  fulfillment: 'delivery' | 'pickup';
  note: string | null;
  lines: OrderDraftLineData[];
  rawTranscript: string;
  normalizedText: string;
  revision: number;
  mutationId: string;
  createdAt: string;
}

const ok = <T>(value: T): FieldData<T> => ({ value, status: 'confirmed', confidence: null });
const missing = <T>(reason: string): FieldData<T> => ({
  value: null,
  status: 'missing',
  confidence: null,
  reason,
});

const spokenNameArb = fc.constantFrom('chini', 'doodh', 'आटा', 'rice', 'tel', 'xyz');

/** A fully resolved line: every field `confirmed`, unit equal to the catalog unit. */
export function completeLineArb(catalog: GeneratedCatalog): fc.Arbitrary<ResolvedLineData> {
  return fc
    .tuple(fc.integer({ min: 0, max: catalog.products.length - 1 }), qtyMilliArb, uuidArb)
    .map(([i, qty, lineId]) => {
      const p = catalog.products[i] as CatalogProductData;
      return {
        lineId,
        product: ok({ productId: p.id, name: p.name }),
        quantityMilli: ok(qty),
        unit: ok(p.unit),
        candidates: [],
        spokenName: p.name.toLowerCase(),
      };
    });
}

/**
 * A line in any status combination allowed by the status table, including unmatched products,
 * ambiguous products (`needs_review` with 2..3 candidates), missing quantity and missing or
 * mismatched unit.
 */
export function anyLineArb(catalog: GeneratedCatalog): fc.Arbitrary<ResolvedLineData> {
  const productField = fc
    .tuple(
      fc.constantFrom<'matched' | 'ambiguous' | 'unmatched'>('matched', 'matched', 'ambiguous', 'unmatched'),
      fc.integer({ min: 0, max: catalog.products.length - 1 }),
      fc.uniqueArray(fc.integer({ min: 0, max: catalog.products.length - 1 }), {
        minLength: 2,
        maxLength: Math.min(3, catalog.products.length),
      }),
    )
    .map(([kind, i, cand]) => {
      const p = catalog.products[i] as CatalogProductData;
      if (kind === 'matched') {
        return {
          product: ok({ productId: p.id, name: p.name }) as ResolvedLineData['product'],
          candidates: [] as CatalogProductData[],
          catalogUnit: p.unit,
        };
      }
      if (kind === 'ambiguous') {
        return {
          product: {
            value: null,
            status: 'needs_review',
            confidence: null,
            reason: 'Several products match. Pick one.',
          } as ResolvedLineData['product'],
          candidates: cand.map((c) => catalog.products[c] as CatalogProductData),
          catalogUnit: p.unit,
        };
      }
      return {
        product: {
          value: null,
          status: 'unmatched',
          confidence: null,
          reason: 'No product found.',
        } as ResolvedLineData['product'],
        candidates: [] as CatalogProductData[],
        catalogUnit: p.unit,
      };
    });

  const quantity = fc.oneof(
    { weight: 4, arbitrary: qtyMilliArb.map((q) => ok(q)) },
    { weight: 1, arbitrary: fc.constant(missing<number>('Quantity not heard.')) },
  );

  return fc.tuple(uuidArb, productField, quantity, unitArb, spokenNameArb, fc.integer({ min: 0, max: 3 })).map(
    ([lineId, pf, qty, otherUnit, spokenName, unitMode]): ResolvedLineData => {
      let unit: FieldData<CanonicalUnit>;
      if (unitMode === 0) unit = missing('Unit not heard.');
      else if (unitMode === 1 && otherUnit !== pf.catalogUnit) {
        unit = {
          value: otherUnit,
          status: 'needs_review',
          confidence: null,
          reason: 'Unit differs from the catalog unit.',
        };
      } else unit = ok(pf.catalogUnit);
      return {
        lineId,
        product: pf.product,
        quantityMilli: qty,
        unit,
        candidates: pf.candidates,
        spokenName,
      };
    },
  );
}

const textArb = fc.constantFrom('', 'do kilo chini', 'दो किलो चीनी', 'two kg sugar');

function draftHeader(catalog: GeneratedCatalog) {
  return fc.record({
    id: uuidArb,
    shopId: fc.constant(catalog.shopId),
    customerId: fc.option(uuidArb, { nil: null }),
    rawTranscript: textArb,
    normalizedText: textArb,
    revision: fc.nat({ max: 20 }),
    mutationId: uuidArb,
    createdAt: isoDateArb,
  });
}

/** Bill draft line: resolved line plus a price field (catalog price when matched, else missing). */
function billLineOf(catalog: GeneratedCatalog, line: ResolvedLineData, priced: boolean): BillDraftLineData {
  const id = line.product.value?.productId;
  const product = catalog.products.find((p) => p.id === id);
  const price: FieldData<number> =
    priced && product
      ? { value: product.pricePaise, status: 'confirmed', confidence: null, reason: 'Catalog price' }
      : missing('Price not known. Enter a price.');
  return { ...line, price };
}

/**
 * Bill draft with 0..6 lines in any status mix. Discount and tax are non-negative integers.
 * Use `completeBillDraftArb` when the draft must be confirmable.
 */
export function billDraftArb(catalog: GeneratedCatalog): fc.Arbitrary<BillDraftData> {
  return fc
    .tuple(
      draftHeader(catalog),
      fc.array(fc.tuple(anyLineArb(catalog), fc.boolean()), { maxLength: 6 }),
      fc.nat({ max: 100_000 }),
      fc.nat({ max: 100_000 }),
      fc.boolean(),
    )
    .map(([h, lines, discountPaise, taxPaise, taxEnabled]) => ({
      ...h,
      lines: lines.map(([l, priced]) => billLineOf(catalog, l, priced)),
      discountPaise,
      taxPaise: taxEnabled ? taxPaise : 0,
      taxEnabled,
    }));
}

/**
 * Bill draft with 1..6 fully confirmed, priced lines and a discount no larger than the subtotal
 * computed with BigInt (independent of `domain-billing`). Zero discount is common.
 */
export function completeBillDraftArb(catalog: GeneratedCatalog): fc.Arbitrary<BillDraftData> {
  return fc
    .tuple(
      draftHeader(catalog),
      fc.array(fc.tuple(completeLineArb(catalog), pricePaiseArb), { minLength: 1, maxLength: 6 }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.boolean(),
      fc.nat({ max: 100_000 }),
    )
    .map(([h, lines, discountFraction, taxEnabled, taxPaise]) => {
      const billLines: BillDraftLineData[] = lines.map(([l, price]) => ({
        ...l,
        price: ok(price),
      }));
      const subtotal = billLines.reduce(
        (acc, l) =>
          acc + (BigInt(l.price.value as number) * BigInt(l.quantityMilli.value as number) + 500n) / 1000n,
        0n,
      );
      const discountPaise = Number((subtotal * BigInt(Math.floor(discountFraction * 1000))) / 1000n);
      return {
        ...h,
        lines: billLines,
        discountPaise,
        taxPaise: taxEnabled ? taxPaise : 0,
        taxEnabled,
      };
    });
}

/** Order draft with 0..6 lines in any status mix; `unitPricePaise` is null for unmatched lines. */
export function orderDraftArb(catalog: GeneratedCatalog): fc.Arbitrary<OrderDraftData> {
  return fc
    .tuple(
      draftHeader(catalog),
      fc.array(anyLineArb(catalog), { maxLength: 6 }),
      fc.boolean(),
      fc.constantFrom<'delivery' | 'pickup'>('delivery', 'pickup'),
      fc.option(fc.constantFrom('after 6 pm', 'doorbell kharab hai'), { nil: null }),
    )
    .map(([h, lines, walkIn, fulfillment, note]) => ({
      ...h,
      customerId: walkIn ? null : h.customerId,
      walkIn,
      fulfillment,
      note,
      lines: lines.map((l): OrderDraftLineData => {
        const id = l.product.value?.productId;
        const p = catalog.products.find((c) => c.id === id);
        return { ...l, unitPricePaise: p ? p.pricePaise : null };
      }),
    }));
}

/** Order draft with 1..6 fully confirmed lines (confirmable). */
export function completeOrderDraftArb(catalog: GeneratedCatalog): fc.Arbitrary<OrderDraftData> {
  return fc
    .tuple(
      draftHeader(catalog),
      fc.array(completeLineArb(catalog), { minLength: 1, maxLength: 6 }),
      fc.constantFrom<'delivery' | 'pickup'>('delivery', 'pickup'),
    )
    .map(([h, lines, fulfillment]) => ({
      ...h,
      customerId: h.customerId ?? null,
      walkIn: h.customerId === null,
      fulfillment,
      note: null,
      lines: lines.map((l): OrderDraftLineData => {
        const p = catalog.products.find((c) => c.id === l.product.value?.productId);
        return { ...l, unitPricePaise: p ? p.pricePaise : null };
      }),
    }));
}
