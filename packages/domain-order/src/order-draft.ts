import { z } from 'zod';
import type { CatalogIndex, CatalogProduct } from '@awaaz-kit/catalog-matcher';
import { resolveLines, type ResolvedLine } from '@awaaz-kit/confidence-engine';
import type {
  ValidationIssue,
  WorkflowAdapter,
  WorkflowContext,
} from '@awaaz-kit/confirmation-engine';
import { extract, extractedFieldSchema, type FieldStatus } from '@awaaz-kit/intent-engine';
import { foldForMatching, normalize } from '@awaaz-kit/language-normalizer';
import type { OrderBundle } from '@awaaz-kit/local-data';

/** A resolved line plus a catalog price snapshot in paise (Req 12.4). */
export interface OrderDraftLine extends ResolvedLine {
  /** Catalog price at parse time; null when the product is not matched. */
  unitPricePaise: number | null;
  /** Half-up rounded line total; null when price or quantity is absent. */
  lineTotalPaise: number | null;
}

export interface OrderDraft {
  id: string;
  shopId: string;
  customerId: string | null;
  walkIn: boolean;
  fulfillment: 'delivery' | 'pickup';
  note: string;
  lines: OrderDraftLine[];
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

export const orderDraftLineSchema: z.ZodType<OrderDraftLine> = z.object({
  lineId: z.string().min(1),
  product: extractedFieldSchema(z.object({ productId: z.string(), name: z.string() })),
  quantityMilli: extractedFieldSchema(z.number()),
  unit: extractedFieldSchema(canonicalUnit),
  candidates: z.array(catalogProductSchema),
  spokenName: z.string(),
  unitPricePaise: z.number().nullable(),
  lineTotalPaise: z.number().nullable(),
}) as unknown as z.ZodType<OrderDraftLine>;

export const orderDraftSchema: z.ZodType<OrderDraft> = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  customerId: z.string().nullable(),
  walkIn: z.boolean(),
  fulfillment: z.enum(['delivery', 'pickup']),
  note: z.string(),
  lines: z.array(orderDraftLineSchema),
  rawTranscript: z.string(),
  normalizedText: z.string(),
  revision: z.number().int().nonnegative(),
  mutationId: z.string().min(1),
  createdAt: z.string().min(1),
});

// ---------- helpers ----------

const isOk = (s: FieldStatus): boolean => s === 'confirmed';

/** Exact half-up `price * qty / 1000` in paise; null if inputs are unusable. */
export function orderLineTotalPaise(
  unitPricePaise: number | null,
  qtyMilli: number | null,
): number | null {
  if (unitPricePaise === null || qtyMilli === null) return null;
  if (!Number.isSafeInteger(unitPricePaise) || !Number.isSafeInteger(qtyMilli)) return null;
  if (unitPricePaise < 0 || qtyMilli < 0) return null;
  const total = (BigInt(unitPricePaise) * BigInt(qtyMilli) + 500n) / 1000n;
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

function priceSnapshot(line: ResolvedLine, catalog: CatalogIndex): number | null {
  const productId = line.product.value?.productId;
  if (productId === undefined) return null;
  const m = catalog.match(line.spokenName);
  if (m.kind === 'exact' && m.product.id === productId) return m.product.pricePaise;
  if (m.kind === 'ambiguous' || m.kind === 'suggestions') {
    return m.candidates.find((c) => c.id === productId)?.pricePaise ?? null;
  }
  return null;
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

function lineIssues(line: OrderDraftLine): ValidationIssue[] {
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
  return out;
}

// ---------- adapter ----------

export class OrderWorkflowAdapter implements WorkflowAdapter<OrderDraft, CatalogIndex> {
  readonly id = 'order' as const;

  parse(text: string, context: WorkflowContext<CatalogIndex>): OrderDraft {
    const normalized = normalize(text);
    const extraction = extract(normalized, {
      locale: 'hi-IN',
      knownCustomerNames: context.customers.map((c) => c.name),
    });
    const resolved = resolveLines(extraction, context.catalog, context.makeId);
    const lines: OrderDraftLine[] = resolved.map((l) => {
      const unitPricePaise = priceSnapshot(l, context.catalog);
      return {
        ...l,
        unitPricePaise,
        lineTotalPaise: orderLineTotalPaise(unitPricePaise, l.quantityMilli.value),
      };
    });
    const customerId = resolveCustomerId(
      extraction.customerName?.value,
      extraction.customerPhone?.value,
      context.customers,
    );

    return {
      id: context.makeId(),
      shopId: context.shopId,
      customerId,
      walkIn: customerId === null,
      fulfillment: 'pickup',
      note: '',
      lines,
      rawTranscript: text,
      normalizedText: normalized.text,
      revision: 0,
      mutationId: context.makeId(),
      createdAt: context.now().toISOString(),
    };
  }

  validate(draft: OrderDraft): ValidationIssue[] {
    return draft.lines.flatMap(lineIssues);
  }

  canConfirm(draft: OrderDraft): boolean {
    return draft.lines.length > 0 && this.validate(draft).length === 0;
  }

  /**
   * Builds the confirmed order. Throws if the draft is not confirmable.
   * The human-readable `localNumber` is allocated inside the commit
   * transaction (Req 12.8), so the bundle carries no number.
   */
  toBundle(draft: OrderDraft): OrderBundle {
    if (!this.canConfirm(draft)) {
      throw new Error('Order draft is not confirmable.');
    }
    const items = draft.lines.map((l, index) => ({
      id: `${draft.mutationId}:item:${l.lineId}`,
      orderId: draft.id,
      index,
      productId: l.product.value?.productId ?? null,
      nameSnapshot: l.product.value?.name ?? l.spokenName,
      qtyMilli: l.quantityMilli.value as number,
      unit: l.unit.value as NonNullable<ResolvedLine['unit']['value']>,
      unitPricePaise: l.unitPricePaise,
      lineTotalPaise: l.lineTotalPaise,
      resolutionStatus: 'confirmed' as const,
    }));
    const totalEstimatePaise = items.reduce((s, i) => s + (i.lineTotalPaise ?? 0), 0);

    return {
      kind: 'order',
      order: {
        id: draft.id,
        shopId: draft.shopId,
        customerId: draft.customerId,
        walkIn: draft.customerId === null,
        status: 'confirmed',
        fulfillment: draft.fulfillment,
        note: draft.note === '' ? null : draft.note,
        totalEstimatePaise,
        rawTranscript: draft.rawTranscript,
        normalizedText: draft.normalizedText,
        extraction: null,
        mutationId: draft.mutationId,
        createdAt: draft.createdAt,
      },
      items,
      auditEvent: {
        id: `${draft.mutationId}:audit`,
        entityType: 'order',
        entityId: draft.id,
        action: 'order_confirmed',
        actor: 'local_user',
        createdAt: draft.createdAt,
        metadata: { lineCount: items.length, totalEstimatePaise },
      },
    };
  }
}
