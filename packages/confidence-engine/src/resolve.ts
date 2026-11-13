import type { CatalogIndex, CatalogProduct, MatchResult } from '@awaaz-kit/catalog-matcher';
import type { CandidateLine, ExtractedField, ExtractionResult } from '@awaaz-kit/intent-engine';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';

export type { ExtractedField, FieldStatus } from '@awaaz-kit/intent-engine';

export interface ResolvedProduct {
  productId: string;
  name: string;
}

export interface ResolvedLine {
  /** Client UUID. */
  lineId: string;
  product: ExtractedField<ResolvedProduct>;
  quantityMilli: ExtractedField<number>;
  unit: ExtractedField<CanonicalUnit>;
  /** For a `needs_review` product, at most three. */
  candidates: CatalogProduct[];
  spokenName: string;
}

export const MAX_CANDIDATES = 3;

/**
 * Applies the status table from design.md to one candidate line.
 * Pure: the catalog is read through `index`, ids come from `makeId`.
 * No unit conversion is ever performed and a missing quantity never defaults to 1.
 */
function resolveLine(line: CandidateLine, match: MatchResult, lineId: string): ResolvedLine {
  const spokenName = line.productPhrase.value ?? '';
  const qty = line.quantityMilli;
  const spokenUnit = line.unit;

  // Quantity: absent stays null/missing (Req 10.2); explicit stays as spoken.
  const hasQuantity = qty.value !== null && qty.value !== undefined;
  const quantityMilli: ExtractedField<number> = hasQuantity
    ? { ...qty, status: 'confirmed' }
    : {
        value: null,
        status: 'missing',
        ...(qty.sourceText !== undefined ? { sourceText: qty.sourceText } : {}),
        confidence: null,
        reason: qty.reason ?? 'Quantity not given',
      };

  // Unit: absent is needs_review (Req 10.3).
  const hasUnit = spokenUnit.value !== null && spokenUnit.value !== undefined;
  let unit: ExtractedField<CanonicalUnit> = hasUnit
    ? { ...spokenUnit, status: 'confirmed' }
    : {
        value: null,
        status: 'needs_review',
        ...(spokenUnit.sourceText !== undefined ? { sourceText: spokenUnit.sourceText } : {}),
        confidence: null,
        reason: spokenUnit.reason ?? 'Unit not given',
      };

  const productSource = line.productPhrase.sourceText;
  const withSource = productSource !== undefined ? { sourceText: productSource } : {};

  if (match.kind === 'exact') {
    const catalogUnit = match.product.unit;
    const unitConsistent = hasUnit && spokenUnit.value === catalogUnit;
    if (hasUnit && !unitConsistent) {
      unit = {
        ...unit,
        status: 'needs_review',
        reason: `Catalog unit is ${catalogUnit}; no conversion applied`,
      };
    }
    const allGood = hasQuantity && unitConsistent;
    const product: ExtractedField<ResolvedProduct> = {
      value: { productId: match.product.id, name: match.product.name },
      status: allGood ? 'confirmed' : 'needs_review',
      ...withSource,
      confidence: null,
      ...(allGood ? {} : { reason: 'Quantity or unit needs review' }),
    };
    return { lineId, product, quantityMilli, unit, candidates: [], spokenName };
  }

  if (match.kind === 'ambiguous' || match.kind === 'suggestions') {
    const candidates = match.candidates.slice(0, MAX_CANDIDATES);
    const product: ExtractedField<ResolvedProduct> = {
      value: null,
      status: 'needs_review',
      ...withSource,
      confidence: null,
      reason: match.kind === 'ambiguous' ? 'Several products match' : 'Closest catalog matches',
    };
    return { lineId, product, quantityMilli, unit, candidates, spokenName };
  }

  const product: ExtractedField<ResolvedProduct> = {
    value: null,
    status: 'unmatched',
    ...withSource,
    confidence: null,
    reason: 'Not in catalog',
  };
  return { lineId, product, quantityMilli, unit, candidates: [], spokenName };
}

/** Resolves every candidate line against the catalog, in spoken order. */
export function resolveLines(
  extraction: ExtractionResult,
  index: CatalogIndex,
  makeId: () => string,
): ResolvedLine[] {
  return extraction.lines.map((line) => {
    const phrase = line.productPhrase.value;
    const match: MatchResult =
      phrase === null || phrase === undefined || phrase.trim() === ''
        ? { kind: 'unmatched' }
        : index.match(phrase);
    return resolveLine(line, match, makeId());
  });
}
