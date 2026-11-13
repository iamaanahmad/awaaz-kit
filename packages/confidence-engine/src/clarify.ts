import type { CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { ResolvedLine } from './resolve.js';

/** The editable fields of a resolved line, in clarification order. */
export type ResolvedFieldKey = 'product' | 'quantityMilli' | 'unit';

export const FIELD_ORDER: readonly ResolvedFieldKey[] = ['product', 'quantityMilli', 'unit'];

/** Value type accepted for each field. */
export type FieldValue<K extends ResolvedFieldKey> = ResolvedLine[K] extends { value: infer V }
  ? NonNullable<V>
  : never;

export interface Clarification {
  lineId: string;
  /** Index of the line in the list passed to `nextClarification`. */
  lineIndex: number;
  field: ResolvedFieldKey;
  /** Short prompt text shown to the user. */
  prompt: string;
  /** Product candidates to offer (product field only, max 3). */
  candidates: CatalogProduct[];
}

/**
 * Sets one field to a user-supplied value with status `confirmed` (Req 10.6).
 * Returns a new line; every other field is left untouched. Pure.
 */
export function applyUserValue<K extends ResolvedFieldKey>(
  line: ResolvedLine,
  field: K,
  value: FieldValue<K>,
): ResolvedLine {
  const previous = line[field];
  const next = {
    value,
    status: 'confirmed' as const,
    ...(previous.sourceText !== undefined ? { sourceText: previous.sourceText } : {}),
    confidence: null,
  };
  return { ...line, [field]: next };
}

function promptFor(line: ResolvedLine, field: ResolvedFieldKey): string {
  const name = line.spokenName.trim();
  switch (field) {
    case 'product':
      return name === '' ? 'Kaunsa item?' : `"${name}" kaunsa item hai?`;
    case 'quantityMilli':
      return 'Kitni quantity?';
    case 'unit':
      return 'Kaunsi unit?';
  }
}

/**
 * Returns one clarification for the first unresolved (not `confirmed`) field,
 * scanning lines in order and fields as product, quantity, unit (Req 10.7).
 * Returns null when every required field is confirmed.
 */
export function nextClarification(lines: readonly ResolvedLine[]): Clarification | null {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) continue;
    for (const field of FIELD_ORDER) {
      if (line[field].status !== 'confirmed') {
        return {
          lineId: line.lineId,
          lineIndex,
          field,
          prompt: promptFor(line, field),
          candidates: field === 'product' ? line.candidates.slice(0, 3) : [],
        };
      }
    }
  }
  return null;
}
