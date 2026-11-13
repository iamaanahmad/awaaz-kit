import { z } from 'zod';
import type { CatalogIndex, CatalogProduct } from '@awaaz-kit/catalog-matcher';
import { resolveLines, type ResolvedLine } from '@awaaz-kit/confidence-engine';
import type {
  ValidationIssue,
  WorkflowAdapter,
  WorkflowContext,
} from '@awaaz-kit/confirmation-engine';
import {
  extract,
  extractedFieldSchema,
  type ExtractedField,
  type FieldStatus,
} from '@awaaz-kit/intent-engine';
import { foldForMatching, normalize } from '@awaaz-kit/language-normalizer';
import type { BillBundle } from '@awaaz-kit/local-data';
import { computeTotals } from './money.js';

/** A resolved line plus its price snapshot in paise (Req 13.4, 13.5, 13.10). */
export interface BillDraftLine extends ResolvedLine {
  price: ExtractedField<number>;
}

export interface BillDraft {
  id: string;
  shopId: string;
  customerId: string | null;
  lines: BillDraftLine[];
  discountPaise: number;
  taxPaise: number;
  taxEnabled: boolean;
  rawTranscript: string;
  normalizedText: string;
  revision: number;
  /** Idempotency key for the outbox Mutation, generated at parse time. */
  mutationId: string;
  /** ISO timestamp taken at parse time. */
  createdAt: string;
}

// ---------- Zod schema (Req 8.10) ----------

const canonicalUnit = z.enum(['piece', 'kg', 'g', 'litre', 'ml']);

const catalogProductSchema: z.ZodType<CatalogProduct> = z.object({
  id: z.string(),
  shopId: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  unit: canonicalUnit,
  pricePaise: z.number(),
  brand: z.string().optional(),
  active: z.boolean(),
  deletedAt: z.string().nullable(),
});

export const billDraftLineSchema: z.ZodType<BillDraftLine> = z.object({
  lineId: z.string().min(1),
  product: extractedFieldSchema(z.object({ productId: z.string(), name: z.string() })),
  quantityMilli: extractedFieldSchema(z.number()),
  unit: extractedFieldSchema(canonicalUnit),
  candidates: z.array(catalogProductSchema),
  spokenName: z.string(),
  price: extractedFieldSchema(z.number()),
}) as unknown as z.ZodType<BillDraftLine>;

export const billDraftSchema: z.ZodType<BillDraft> = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  customerId: z.string().nullable(),
  lines: z.array(billDraftLineSchema),
  discountPaise: z.number(),
  taxPaise: z.number(),
  taxEnabled: z.boolean(),
  rawTranscript: z.string(),
  normalizedText: z.string(),
  revision: z.number().int().nonnegative(),
  mutationId: z.string().min(1),
  createdAt: z.string().min(1),
});

// ---------- parse ----------

const isOk = (s: FieldStatus): boolean => s === 'confirmed';

function priceField(line: ResolvedLine, catalog: CatalogIndex): ExtractedField<number> {
  const productId = line.product.value?.productId;
  if (productId !== undefined) {
    const m = catalog.match(line.spokenName);
    if (m.kind === 'exact' && m.product.id === productId) {
      return {
        value: m.product.pricePaise,
        status: 'confirmed',
        confidence: null,
        reason: 'Catalog price',
      };
    }
    // Fall back to a candidate with the same id, if the matcher offered one.
    const cand =
      m.kind === 'ambiguous' || m.kind === 'suggestions'
        ? m.candidates.find((c) => c.id === productId)
        : undefined;
    if (cand) {
      return {
        value: cand.pricePaise,
        status: 'confirmed',
        confidence: null,
        reason: 'Catalog price',
      };
    }
  }
  return {
    value: null,
    status: 'missing',
    confidence: null,
    reason: 'Price not known. Enter a price.',
  };
}

function resolveCustomerId(
  name: string | null | undefined,
  phone: string | null | undefined,
  customers: WorkflowContext['customers'],
): string | null {
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    const byPhone = customers.filter((c) => c.phone && c.phone.replace(/\D/g, '') === digits);
    if (byPhone.length === 1) return (byPhone[0] as { id: string }).id;
  }
  if (name) {
    const key = foldForMatching(name);
    const byName = customers.filter((c) => foldForMatching(c.name) === key);
    if (byName.length === 1) return (byName[0] as { id: string }).id;
  }
  return null;
}

// ---------- validate ----------

function lineIssues(line: BillDraftLine): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (code: string, field: string, message: string) =>
    out.push({ code, lineId: line.lineId, field, message });

  if (line.product.value === null || !isOk(line.product.status)) {
    add('product_unresolved', 'product', 'Choose a product from the catalog.');
  }
  if (line.quantityMilli.value === null) {
    add('quantity_missing', 'quantityMilli', 'Quantity is needed.');
  } else if (!isOk(line.quantityMilli.status)) {
    add('quantity_unconfirmed', 'quantityMilli', 'Check the quantity.');
  } else if (!Number.isSafeInteger(line.quantityMilli.value) || line.quantityMilli.value <= 0) {
    add('quantity_invalid', 'quantityMilli', 'Quantity must be more than zero.');
  }
  if (line.unit.value === null) {
    add('unit_missing', 'unit', 'Unit is needed.');
  } else if (!isOk(line.unit.status)) {
    add('unit_unconfirmed', 'unit', 'Check the unit.');
  }
  // A missing price blocks finalization (Req 13.5).
  if (line.price.value === null) {
    add('price_missing', 'price', 'Price is needed.');
  } else if (!isOk(line.price.status)) {
    add('price_unconfirmed', 'price', 'Check the price.');
  }
  return out;
}

function totalsOf(draft: BillDraft) {
  return computeTotals(
    draft.lines.map((l) => ({
      unitPricePaise: l.price.value ?? 0,
      qtyMilli: l.quantityMilli.value ?? 0,
    })),
    draft.discountPaise,
    draft.taxPaise,
  );
}

// ---------- adapter ----------

export class BillingWorkflowAdapter implements WorkflowAdapter<BillDraft, CatalogIndex> {
  readonly id = 'bill' as const;

  parse(text: string, context: WorkflowContext<CatalogIndex>): BillDraft {
    const normalized = normalize(text);
    const extraction = extract(normalized, {
      locale: 'hi-IN',
      knownCustomerNames: context.customers.map((c) => c.name),
    });
    const resolved = resolveLines(extraction, context.catalog, context.makeId);
    const lines: BillDraftLine[] = resolved.map((l) => ({
      ...l,
      price: priceField(l, context.catalog),
    }));

    return {
      id: context.makeId(),
      shopId: context.shopId,
      customerId: resolveCustomerId(
        extraction.customerName?.value,
        extraction.customerPhone?.value,
        context.customers,
      ),
      lines,
      discountPaise: 0,
      taxPaise: 0,
      taxEnabled: context.config.taxEnabled,
      rawTranscript: text,
      normalizedText: normalized.text,
      revision: 0,
      mutationId: context.makeId(),
      createdAt: context.now().toISOString(),
    };
  }

  validate(draft: BillDraft): ValidationIssue[] {
    const issues: ValidationIssue[] = draft.lines.flatMap(lineIssues);

    if (!draft.taxEnabled && draft.taxPaise !== 0) {
      issues.push({ code: 'tax_disabled', field: 'taxPaise', message: 'Tax is turned off.' });
    }

    // Arithmetic problems; lines with absent values are already reported above.
    for (const m of totalsOf(draft).issues) {
      const lineId = m.lineIndex !== undefined ? draft.lines[m.lineIndex]?.lineId : undefined;
      issues.push({
        code: m.code,
        ...(lineId !== undefined ? { lineId } : {}),
        ...(m.field !== undefined ? { field: m.field } : {}),
        message: m.message,
      });
    }
    return issues;
  }

  canConfirm(draft: BillDraft): boolean {
    return draft.lines.length > 0 && this.validate(draft).length === 0;
  }

  /** Builds the finalized bill. Throws if the draft is not confirmable. */
  toBundle(draft: BillDraft): BillBundle {
    if (!this.canConfirm(draft)) {
      throw new Error('Bill draft is not confirmable.');
    }
    const totals = totalsOf(draft);
    const items = draft.lines.map((l, index) => ({
      id: `${draft.mutationId}:item:${l.lineId}`,
      billId: draft.id,
      index,
      productId: l.product.value?.productId ?? null,
      nameSnapshot: l.product.value?.name ?? l.spokenName,
      qtyMilli: l.quantityMilli.value as number,
      unit: l.unit.value as NonNullable<ResolvedLine['unit']['value']>,
      unitPricePaise: l.price.value as number,
      lineTotalPaise: totals.lineTotals[index] as number,
    }));

    return {
      kind: 'bill',
      bill: {
        id: draft.id,
        shopId: draft.shopId,
        kind: 'sale',
        correctsBillId: null,
        customerId: draft.customerId,
        status: 'finalized',
        subtotalPaise: totals.subtotalPaise,
        discountPaise: draft.discountPaise,
        taxPaise: draft.taxPaise,
        totalPaise: totals.totalPaise,
        rawTranscript: draft.rawTranscript,
        normalizedText: draft.normalizedText,
        mutationId: draft.mutationId,
        createdAt: draft.createdAt,
        finalizedAt: draft.createdAt,
      },
      items,
      auditEvent: {
        id: `${draft.mutationId}:audit`,
        entityType: 'bill',
        entityId: draft.id,
        action: 'bill_finalized',
        actor: 'local_user',
        createdAt: draft.createdAt,
        metadata: { lineCount: items.length, totalPaise: totals.totalPaise },
      },
    };
  }
}
