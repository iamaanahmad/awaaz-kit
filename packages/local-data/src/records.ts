import { z } from 'zod';

/**
 * Record types and Zod schemas for the IndexedDB v1 schema.
 * Money is integer paise, quantities are integer milli-units, dates are ISO 8601 strings.
 * All ids are client-generated UUIDs (Req 15.2).
 */

const int = z.number().int();
const nonNegInt = z.number().int().nonnegative();
const isoDate = z.string().min(1);
const id = z.string().min(1);

export const CanonicalUnitSchema = z.enum(['piece', 'kg', 'g', 'litre', 'ml']);
export type CanonicalUnit = z.infer<typeof CanonicalUnitSchema>;

export const FieldStatusSchema = z.enum(['confirmed', 'needs_review', 'missing', 'unmatched']);
export type FieldStatus = z.infer<typeof FieldStatusSchema>;

export const SyncStateSchema = z.enum([
  'local_only',
  'pending',
  'syncing',
  'synced',
  'failed',
  'conflict',
]);
export type SyncState = z.infer<typeof SyncStateSchema>;

export const ConflictInfoSchema = z.object({
  detectedAt: isoDate,
  remoteUpdatedAt: isoDate.nullable(),
  message: z.string(),
});
export type ConflictInfo = z.infer<typeof ConflictInfoSchema>;

export const ShopRecordSchema = z.object({
  id,
  name: z.string().min(1),
  currency: z.literal('INR'),
  locale: z.enum(['hi-IN', 'en-IN']),
  isDemo: z.boolean(),
  nextOrderSeq: nonNegInt,
  nextReceiptSeq: nonNegInt,
  remoteShopId: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
  syncVersion: nonNegInt,
});
export type ShopRecord = z.infer<typeof ShopRecordSchema>;

export const ProductRecordSchema = z.object({
  id,
  shopId: id,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  brand: z.string().optional(),
  unit: CanonicalUnitSchema,
  pricePaise: nonNegInt,
  active: z.boolean(),
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
});
export type ProductRecord = z.infer<typeof ProductRecordSchema>;

export const CustomerRecordSchema = z.object({
  id,
  shopId: id,
  name: z.string().min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
  isSample: z.boolean(),
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
});
export type CustomerRecord = z.infer<typeof CustomerRecordSchema>;

export const OrderRecordSchema = z.object({
  id,
  shopId: id,
  localNumber: z.string().min(1),
  customerId: id.nullable(),
  walkIn: z.boolean(),
  status: z.enum(['confirmed', 'cancelled']),
  fulfillment: z.enum(['delivery', 'pickup']),
  note: z.string().nullable(),
  totalEstimatePaise: nonNegInt,
  rawTranscript: z.string(),
  normalizedText: z.string(),
  extraction: z.unknown(),
  mutationId: id,
  syncState: SyncStateSchema,
  conflict: ConflictInfoSchema.optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type OrderRecord = z.infer<typeof OrderRecordSchema>;

export const OrderItemRecordSchema = z.object({
  id,
  orderId: id,
  index: nonNegInt,
  productId: id.nullable(),
  nameSnapshot: z.string(),
  qtyMilli: int.positive(),
  unit: CanonicalUnitSchema,
  unitPricePaise: nonNegInt.nullable(),
  lineTotalPaise: nonNegInt.nullable(),
  resolutionStatus: FieldStatusSchema,
});
export type OrderItemRecord = z.infer<typeof OrderItemRecordSchema>;

export const BillRecordSchema = z.object({
  id,
  shopId: id,
  receiptNumber: z.string().min(1),
  kind: z.enum(['sale', 'void', 'correction']),
  correctsBillId: id.nullable(),
  customerId: id.nullable(),
  status: z.enum(['draft', 'finalized']),
  subtotalPaise: int,
  discountPaise: int,
  taxPaise: int,
  totalPaise: int,
  rawTranscript: z.string(),
  normalizedText: z.string(),
  mutationId: id,
  syncState: SyncStateSchema,
  conflict: ConflictInfoSchema.optional(),
  createdAt: isoDate,
  finalizedAt: isoDate.nullable(),
});
export type BillRecord = z.infer<typeof BillRecordSchema>;

export const BillItemRecordSchema = z.object({
  id,
  billId: id,
  index: nonNegInt,
  productId: id.nullable(),
  nameSnapshot: z.string(),
  qtyMilli: int,
  unit: CanonicalUnitSchema,
  unitPricePaise: nonNegInt,
  lineTotalPaise: int,
});
export type BillItemRecord = z.infer<typeof BillItemRecordSchema>;

export const AuditEventRecordSchema = z.object({
  id,
  entityType: z.string().min(1),
  entityId: id,
  action: z.string().min(1),
  actor: z.enum(['local_user', 'sync']),
  createdAt: isoDate,
  /** Never contains transcript or phone text. */
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])),
});
export type AuditEventRecord = z.infer<typeof AuditEventRecordSchema>;

/** Key-value row in `syncMeta`. */
export const SyncMetaRecordSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});
export type SyncMetaRecord = z.infer<typeof SyncMetaRecordSchema>;

// ---------- Outbox Mutation ----------

export const EntityTypeSchema = z.enum(['order', 'bill', 'bill_correction', 'product', 'customer']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const MutationStateSchema = z.enum(['pending', 'syncing', 'synced', 'failed']);
export type MutationState = z.infer<typeof MutationStateSchema>;

export const SyncErrorKindSchema = z.enum([
  'network',
  'validation',
  'auth',
  'permission',
  'server',
]);
export type SyncErrorKind = z.infer<typeof SyncErrorKindSchema>;

/** Self-contained payload: header row plus child rows with snapshots, so a Mutation is replayable. */
export const MutationPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('order'),
    order: OrderRecordSchema,
    items: z.array(OrderItemRecordSchema),
  }),
  z.object({
    kind: z.literal('bill'),
    bill: BillRecordSchema,
    items: z.array(BillItemRecordSchema),
  }),
  z.object({
    kind: z.literal('bill_correction'),
    bill: BillRecordSchema,
    items: z.array(BillItemRecordSchema),
  }),
  z.object({ kind: z.literal('product'), product: ProductRecordSchema }),
  z.object({ kind: z.literal('customer'), customer: CustomerRecordSchema }),
]);
export type MutationPayload = z.infer<typeof MutationPayloadSchema>;

export const MutationSchema = z.object({
  /** UUID v4, client generated (Req 15.2). */
  mutationId: id,
  entityType: EntityTypeSchema,
  entityId: id,
  operation: z.enum(['create', 'upsert']),
  payload: MutationPayloadSchema,
  createdAt: isoDate,
  attempts: nonNegInt,
  nextAttemptAt: isoDate,
  state: MutationStateSchema,
  lastError: z.object({ kind: SyncErrorKindSchema, message: z.string(), at: isoDate }).nullable(),
});
export type Mutation = z.infer<typeof MutationSchema>;

// ---------- Bundles produced by domain packages ----------
// Numbers (localNumber / receiptNumber) and syncState are assigned inside the commit transaction.

const OrderHeaderInputSchema = OrderRecordSchema.omit({
  localNumber: true,
  syncState: true,
  conflict: true,
  updatedAt: true,
});
const BillHeaderInputSchema = BillRecordSchema.omit({
  receiptNumber: true,
  syncState: true,
  conflict: true,
});

/** Order confirmation: one order row, N items, one audit event (Req 12.8, 12.10). */
export const OrderBundleSchema = z.object({
  kind: z.literal('order'),
  order: OrderHeaderInputSchema,
  items: z.array(OrderItemRecordSchema).min(1),
  auditEvent: AuditEventRecordSchema,
});
export type OrderBundle = z.infer<typeof OrderBundleSchema>;

/** Bill finalization: status "finalized", receipt number allocated at commit. */
export const BillBundleSchema = z.object({
  kind: z.literal('bill'),
  bill: BillHeaderInputSchema.extend({ kind: z.literal('sale'), status: z.literal('finalized') }),
  items: z.array(BillItemRecordSchema).min(1),
  auditEvent: AuditEventRecordSchema,
});
export type BillBundle = z.infer<typeof BillBundleSchema>;

/** Void or correction: creates a new bill row, never touches the original (Req 13.14). */
export const CorrectionBundleSchema = z.object({
  kind: z.literal('correction'),
  bill: BillHeaderInputSchema.extend({
    kind: z.enum(['void', 'correction']),
    status: z.literal('finalized'),
    correctsBillId: id,
  }),
  items: z.array(BillItemRecordSchema),
  auditEvent: AuditEventRecordSchema,
});
export type CorrectionBundle = z.infer<typeof CorrectionBundleSchema>;

export type ConfirmableBundle = OrderBundle | BillBundle | CorrectionBundle;
