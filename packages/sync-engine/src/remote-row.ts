/**
 * Pure mapping from an outbox Mutation to remote rows, plus the remote Zod
 * schemas (used to validate pulled rows) and the team-scoped permission builder.
 *
 * Inputs are structural types so this package does not depend on local-data.
 * `local-data`'s `Mutation` is assignable to `MutationLike`.
 */
import { z } from 'zod';
import type { RemoteTable, RowPermissions } from './contracts';
import { entityRowId, headerRowId, itemRowId } from './row-ids';

// ---------- Structural local shapes ----------

type Unit = 'piece' | 'kg' | 'g' | 'litre' | 'ml';

export interface ProductLike {
  id: string;
  shopId: string;
  name: string;
  aliases: string[];
  brand?: string | undefined;
  unit: Unit;
  pricePaise: number;
  active: boolean;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CustomerLike {
  id: string;
  shopId: string;
  name: string;
  phone?: string | undefined;
  notes?: string | undefined;
  isSample: boolean;
  updatedAt: string;
  deletedAt: string | null;
}

export interface OrderLike {
  id: string;
  localNumber: string;
  customerId: string | null;
  walkIn: boolean;
  status: 'confirmed' | 'cancelled';
  fulfillment: 'delivery' | 'pickup';
  note: string | null;
  totalEstimatePaise: number;
  rawTranscript: string;
  normalizedText: string;
  createdAt: string;
}

export interface OrderItemLike {
  index: number;
  productId: string | null;
  nameSnapshot: string;
  qtyMilli: number;
  unit: Unit;
  unitPricePaise: number | null;
  lineTotalPaise: number | null;
  resolutionStatus: 'confirmed' | 'needs_review' | 'missing' | 'unmatched';
}

export interface BillLike {
  id: string;
  receiptNumber: string;
  kind: 'sale' | 'void' | 'correction';
  correctsBillId: string | null;
  customerId: string | null;
  status: 'draft' | 'finalized';
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  rawTranscript: string;
  normalizedText: string;
  createdAt: string;
  finalizedAt: string | null;
}

export interface BillItemLike {
  index: number;
  productId: string | null;
  nameSnapshot: string;
  qtyMilli: number;
  unit: Unit;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export type MutationPayloadLike =
  | { kind: 'order'; order: OrderLike; items: readonly OrderItemLike[] }
  | { kind: 'bill'; bill: BillLike; items: readonly BillItemLike[] }
  | { kind: 'bill_correction'; bill: BillLike; items: readonly BillItemLike[] }
  | { kind: 'product'; product: ProductLike }
  | { kind: 'customer'; customer: CustomerLike };

export interface MutationLike {
  mutationId: string;
  payload: MutationPayloadLike;
}

// ---------- Settings and output ----------

export interface TranscriptSetting {
  readonly enabled: boolean;
  readonly at?: string;
}

export interface RemoteRowSettings {
  /** Defaults to disabled: transcripts never leave the device unless enabled (Req 16.19, 16.20). */
  readonly syncTranscripts?: TranscriptSetting | undefined;
  /** Remote team id for the shop. Written as `shopId` on every row. */
  readonly remoteShopId: string;
  readonly deviceId: string;
  /**
   * Maps a local bill id to the remote row id of that bill (its mutationId).
   * Used for `correctsBillRowId`; falls back to the local id when unknown.
   */
  readonly resolveBillRowId?: ((localBillId: string) => string | undefined) | undefined;
}

/** Whether a row is written once (`createOnce`) or as a guarded upsert. */
export type RemoteWriteMode = 'create' | 'upsert';

export interface RemoteWrite {
  readonly table: RemoteTable;
  readonly rowId: string;
  readonly mode: RemoteWriteMode;
  readonly data: Record<string, unknown>;
  readonly permissions: RowPermissions;
}

// ---------- Permissions ----------

const teamRole = (teamId: string): string => `team:${teamId}`;
const teamOwnerRole = (teamId: string): string => `team:${teamId}/owner`;

/** Tables whose rows can never be updated or deleted from a client (Req 16.14). */
export const IMMUTABLE_TABLES: readonly RemoteTable[] = ['bills', 'bill_items'];

/**
 * Explicit, team-scoped row permissions. Bills and bill items are read-only for
 * everyone; other tables allow team read/update and owner-only delete.
 */
export function buildPermissions(table: RemoteTable, remoteShopId: string): RowPermissions {
  const read = [`read(${teamRole(remoteShopId)})`];
  if (IMMUTABLE_TABLES.includes(table)) return { read, update: [], delete: [] };
  return {
    read,
    update: [`update(${teamRole(remoteShopId)})`],
    delete: [`delete(${teamOwnerRole(remoteShopId)})`],
  };
}

/** Flattens permissions to the Appwrite string array. */
export function permissionStrings(perm: RowPermissions): string[] {
  return [...perm.read, ...perm.update, ...perm.delete];
}

// ---------- toRemoteRow ----------

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * Maps a Mutation to the remote writes it produces. Child rows come before the
 * header row so a header never exists without its items. Transcript fields are
 * included only when `settings.syncTranscripts.enabled` is true.
 */
export function toRemoteRow(mutation: MutationLike, settings: RemoteRowSettings): RemoteWrite[] {
  const { remoteShopId, deviceId } = settings;
  const withTranscripts = settings.syncTranscripts?.enabled === true;
  const p = mutation.payload;
  const perm = (t: RemoteTable) => buildPermissions(t, remoteShopId);

  switch (p.kind) {
    case 'product': {
      const r = p.product;
      return [
        {
          table: 'products',
          rowId: entityRowId(r.id),
          mode: 'upsert',
          permissions: perm('products'),
          data: compact({
            shopId: remoteShopId,
            name: r.name,
            aliases: r.aliases,
            brand: r.brand,
            unit: r.unit,
            pricePaise: r.pricePaise,
            active: r.active,
            deletedAt: r.deletedAt,
            deviceId,
            clientUpdatedAt: r.updatedAt,
          }),
        },
      ];
    }
    case 'customer': {
      const r = p.customer;
      return [
        {
          table: 'customers',
          rowId: entityRowId(r.id),
          mode: 'upsert',
          permissions: perm('customers'),
          data: compact({
            shopId: remoteShopId,
            name: r.name,
            phone: r.phone,
            notes: r.notes,
            isSample: r.isSample,
            deletedAt: r.deletedAt,
            deviceId,
            clientUpdatedAt: r.updatedAt,
          }),
        },
      ];
    }
    case 'order': {
      const o = p.order;
      const orderRowId = headerRowId(mutation);
      const items: RemoteWrite[] = p.items.map((it) => ({
        table: 'order_items',
        rowId: itemRowId(mutation, it.index),
        mode: 'create',
        permissions: perm('order_items'),
        data: compact({
          shopId: remoteShopId,
          orderRowId,
          index: it.index,
          productId: it.productId ?? undefined,
          nameSnapshot: it.nameSnapshot,
          qtyMilli: it.qtyMilli,
          unit: it.unit,
          unitPricePaise: it.unitPricePaise ?? undefined,
          lineTotalPaise: it.lineTotalPaise ?? undefined,
          resolutionStatus: it.resolutionStatus,
        }),
      }));
      const header: RemoteWrite = {
        table: 'orders',
        rowId: orderRowId,
        mode: 'create',
        permissions: perm('orders'),
        data: compact({
          shopId: remoteShopId,
          localNumber: o.localNumber,
          customerId: o.customerId ?? undefined,
          walkIn: o.walkIn,
          fulfillment: o.fulfillment,
          note: o.note ?? undefined,
          totalEstimatePaise: o.totalEstimatePaise,
          status: o.status,
          mutationId: mutation.mutationId,
          deviceId,
          clientCreatedAt: o.createdAt,
          ...(withTranscripts
            ? { rawTranscript: o.rawTranscript, normalizedText: o.normalizedText }
            : {}),
        }),
      };
      return [...items, header];
    }
    case 'bill':
    case 'bill_correction': {
      const b = p.bill;
      const billRowId = headerRowId(mutation);
      const items: RemoteWrite[] = p.items.map((it) => ({
        table: 'bill_items',
        rowId: itemRowId(mutation, it.index),
        mode: 'create',
        permissions: perm('bill_items'),
        data: compact({
          shopId: remoteShopId,
          billRowId,
          index: it.index,
          productId: it.productId ?? undefined,
          nameSnapshot: it.nameSnapshot,
          qtyMilli: it.qtyMilli,
          unit: it.unit,
          unitPricePaise: it.unitPricePaise,
          lineTotalPaise: it.lineTotalPaise,
        }),
      }));
      const corrects =
        b.correctsBillId === null
          ? undefined
          : (settings.resolveBillRowId?.(b.correctsBillId) ?? b.correctsBillId);
      const header: RemoteWrite = {
        table: 'bills',
        rowId: billRowId,
        mode: 'create',
        permissions: perm('bills'),
        data: compact({
          shopId: remoteShopId,
          receiptNumber: b.receiptNumber,
          kind: b.kind,
          correctsBillRowId: corrects,
          customerId: b.customerId ?? undefined,
          status: b.status,
          subtotalPaise: b.subtotalPaise,
          discountPaise: b.discountPaise,
          taxPaise: b.taxPaise,
          totalPaise: b.totalPaise,
          mutationId: mutation.mutationId,
          deviceId,
          finalizedAt: b.finalizedAt ?? b.createdAt,
          clientCreatedAt: b.createdAt,
          ...(withTranscripts
            ? { rawTranscript: b.rawTranscript, normalizedText: b.normalizedText }
            : {}),
        }),
      };
      return [...items, header];
    }
  }
}

// ---------- Remote Zod schemas ----------

const str = z.string();
const optStr = z.string().nullish();
const int = z.number().int();
const nonNegInt = z.number().int().nonnegative();
const unit = z.enum(['piece', 'kg', 'g', 'litre', 'ml']);

export const RemoteProductSchema = z.object({
  shopId: str,
  name: z.string().min(1),
  aliases: z.array(str),
  brand: optStr,
  unit,
  pricePaise: nonNegInt,
  active: z.boolean(),
  deletedAt: optStr,
  deviceId: optStr,
  clientUpdatedAt: z.string().min(1),
});

export const RemoteCustomerSchema = z.object({
  shopId: str,
  name: z.string().min(1),
  phone: optStr,
  notes: optStr,
  isSample: z.boolean(),
  deletedAt: optStr,
  deviceId: optStr,
  clientUpdatedAt: z.string().min(1),
});

export const RemoteOrderSchema = z.object({
  shopId: str,
  localNumber: z.string().min(1),
  customerId: optStr,
  walkIn: z.boolean(),
  fulfillment: z.enum(['delivery', 'pickup']),
  note: optStr,
  totalEstimatePaise: nonNegInt,
  status: z.enum(['confirmed', 'cancelled']),
  mutationId: z.string().min(1),
  deviceId: z.string().min(1),
  clientCreatedAt: z.string().min(1),
  rawTranscript: optStr,
  normalizedText: optStr,
});

export const RemoteOrderItemSchema = z.object({
  shopId: str,
  orderRowId: z.string().min(1),
  index: nonNegInt,
  productId: optStr,
  nameSnapshot: str,
  qtyMilli: int.positive(),
  unit,
  unitPricePaise: nonNegInt.nullish(),
  lineTotalPaise: nonNegInt.nullish(),
  resolutionStatus: z.enum(['confirmed', 'needs_review', 'missing', 'unmatched']),
});

export const RemoteBillSchema = z.object({
  shopId: str,
  receiptNumber: z.string().min(1),
  kind: z.enum(['sale', 'void', 'correction']),
  correctsBillRowId: optStr,
  customerId: optStr,
  status: z.enum(['draft', 'finalized']),
  subtotalPaise: int,
  discountPaise: int,
  taxPaise: int,
  totalPaise: int,
  mutationId: z.string().min(1),
  deviceId: z.string().min(1),
  finalizedAt: z.string().min(1),
  clientCreatedAt: z.string().min(1),
  rawTranscript: optStr,
  normalizedText: optStr,
});

export const RemoteBillItemSchema = z.object({
  shopId: str,
  billRowId: z.string().min(1),
  index: nonNegInt,
  productId: optStr,
  nameSnapshot: str,
  qtyMilli: int,
  unit,
  unitPricePaise: nonNegInt,
  lineTotalPaise: int,
});

export const REMOTE_SCHEMAS = {
  products: RemoteProductSchema,
  customers: RemoteCustomerSchema,
  orders: RemoteOrderSchema,
  order_items: RemoteOrderItemSchema,
  bills: RemoteBillSchema,
  bill_items: RemoteBillItemSchema,
} as const satisfies Record<RemoteTable, z.ZodTypeAny>;

export type RemoteProduct = z.infer<typeof RemoteProductSchema>;
export type RemoteCustomer = z.infer<typeof RemoteCustomerSchema>;
export type RemoteOrder = z.infer<typeof RemoteOrderSchema>;
export type RemoteOrderItem = z.infer<typeof RemoteOrderItemSchema>;
export type RemoteBill = z.infer<typeof RemoteBillSchema>;
export type RemoteBillItem = z.infer<typeof RemoteBillItemSchema>;

/** Validates a pulled row's attributes against its table schema. */
export function parseRemoteRow(
  table: RemoteTable,
  row: unknown,
): { ok: true; data: Record<string, unknown> } | { ok: false } {
  const r = REMOTE_SCHEMAS[table].safeParse(row);
  return r.success ? { ok: true, data: r.data as Record<string, unknown> } : { ok: false };
}
