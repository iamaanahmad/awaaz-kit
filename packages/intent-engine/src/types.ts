import { CANONICAL_UNITS } from '@awaaz-kit/language-normalizer';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';
import { z } from 'zod';

/** Field status shared with the confidence engine (design.md "confidence-engine"). */
export const FIELD_STATUSES = ['confirmed', 'needs_review', 'missing', 'unmatched'] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

export const fieldStatusSchema = z.enum(FIELD_STATUSES);

export interface ExtractedField<T> {
  value: T | null;
  status: FieldStatus;
  /** Exact substring of the raw transcript this value came from (Req 8.7). */
  sourceText?: string;
  confidence?: number | null;
  reason?: string;
}

export interface CandidateLine {
  /** Spoken order, zero-based. */
  index: number;
  productPhrase: ExtractedField<string>;
  quantityMilli: ExtractedField<number>;
  unit: ExtractedField<CanonicalUnit>;
}

export interface ExtractionResult {
  lines: CandidateLine[];
  customerName?: ExtractedField<string>;
  customerPhone?: ExtractedField<string>;
}

export interface ExtractionContext {
  /** Hints only. */
  knownCustomerNames?: readonly string[];
  locale: 'hi-IN' | 'en-IN';
}

/** Builds a schema for `ExtractedField<T>` from a value schema. */
export function extractedFieldSchema<T extends z.ZodTypeAny>(
  valueSchema: T,
): z.ZodType<ExtractedField<z.infer<T>>> {
  return z.object({
    value: valueSchema.nullable(),
    status: fieldStatusSchema,
    sourceText: z.string().optional(),
    confidence: z.number().nullable().optional(),
    reason: z.string().optional(),
  }) as unknown as z.ZodType<ExtractedField<z.infer<T>>>;
}

const canonicalUnitSchema = z.enum(CANONICAL_UNITS as [CanonicalUnit, ...CanonicalUnit[]]);

export const candidateLineSchema: z.ZodType<CandidateLine> = z.object({
  index: z.number().int().nonnegative(),
  productPhrase: extractedFieldSchema(z.string()),
  quantityMilli: extractedFieldSchema(z.number().int()),
  unit: extractedFieldSchema(canonicalUnitSchema),
});

export const extractionResultSchema: z.ZodType<ExtractionResult> = z.object({
  lines: z.array(candidateLineSchema),
  customerName: extractedFieldSchema(z.string()).optional(),
  customerPhone: extractedFieldSchema(z.string()).optional(),
});

export const extractionContextSchema: z.ZodType<ExtractionContext> = z.object({
  knownCustomerNames: z.array(z.string()).readonly().optional(),
  locale: z.enum(['hi-IN', 'en-IN']),
});
