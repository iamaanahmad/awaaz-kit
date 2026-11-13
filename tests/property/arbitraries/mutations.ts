import type { CatalogProductData } from './catalog';
import {
  fc,
  isoDateArb,
  pricePaiseArb,
  qtyMilliArb,
  unitArb,
  uuidArb,
  type CanonicalUnit,
} from './common';

/**
 * Outbox Mutation generators. Shapes follow `MutationSchema` in `@awaaz-kit/local-data`
 * (header row plus child rows with snapshots), declared locally to keep the arbitraries free of
 * workspace imports. Validate them against the Zod schema in a package test if needed.
 *
 * Totals on generated records are internally consistent but computed with BigInt here, never by
 * calling the code under test.
 */

export type EntityType = 'order' | 'bill' | 'bill_correction' | 'product' | 'customer';
export type MutationState = 'pending' | 'syncing' | 'synced' | 'failed';
export type SyncErrorKind = 'network' | 'validation' | 'auth' | 'permission' | 'server';
export type SyncState = 'local_only' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

export interface OrderRowData {
  id: string;
  shopId: string;
  localNumber: string;
  customerId: string | null;
  walkIn: boolean;
  status: 'confirmed' | 'cancelled';
  fulfillment: 'delivery' | 'pickup';
  note: string | null;
  totalEstimatePaise: number;
  rawTranscript: string;
  normalizedText: string;
  extraction: unknown;
  mutationId: string;
  syncState: SyncState;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemRowData {
  id: string;
  orderId: string;
  index: number;
  productId: string | null;
  nameSnapshot: string;
  qtyMilli: number;
  unit: CanonicalUnit;
  unitPricePaise: number | null;
  lineTotalPaise: number | null;
  resolutionStatus: 'confirmed' | 'needs_review' | 'missing' | 'unmatched';
}

export interface BillRowData {
  id: string;
  shopId: string;
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
  mutationId: string;
  syncState: SyncState;
  createdAt: string;
  finalizedAt: string | null;
}

export interface BillItemRowData {
  id: string;
  billId: string;
  index: number;
  productId: string | null;
  nameSnapshot: string;
  qtyMilli: number;
  unit: CanonicalUnit;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export interface CustomerRowData {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  notes?: string;
  isSample: boolean;
  updatedAt: string;
  deletedAt: string | null;
}

export type MutationPayloadData =
  | { kind: 'order'; order: OrderRowData; items: OrderItemRowData[] }
  | { kind: 'bill'; bill: BillRowData; items: BillItemRowData[] }
  | { kind: 'bill_correction'; bill: BillRowData; items: BillItemRowData[] }
  | { kind: 'product'; product: CatalogProductData & { updatedAt: string } }
  | { kind: 'customer'; customer: CustomerRowData };

export interface MutationData {
  mutationId: string;
  entityType: EntityType;
  entityId: string;
  operation: 'create' | 'upsert';
  payload: MutationPayloadData;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  state: MutationState;
  lastError: { kind: SyncErrorKind; message: string; at: string } | null;
}

const lineTotal = (price: number, qty: number): number =>
  Number((BigInt(price) * BigInt(qty) + 500n) / 1000n);

const transcriptArb = fc.constantFrom('', 'do kilo chini', 'दो किलो चीनी', 'two kg sugar');
const nameArb = fc.constantFrom('Sugar', 'चीनी', 'Milk', 'Toor Dal', 'Soap');

function envelope(
  entityType: EntityType,
  entityId: string,
  operation: 'create' | 'upsert',
  payload: MutationPayloadData,
  mutationId: string,
  createdAt: string,
): MutationData {
  return {
    mutationId,
    entityType,
    entityId,
    operation,
    payload,
    createdAt,
    attempts: 0,
    nextAttemptAt: createdAt,
    state: 'pending',
    lastError: null,
  };
}

/** Pending order Mutation with 1..5 items for one shop. */
export const orderMutationArb = (shopId: string): fc.Arbitrary<MutationData> =>
  fc
    .tuple(
      uuidArb,
      uuidArb,
      isoDateArb,
      fc.option(uuidArb, { nil: null }),
      fc.array(
        fc.tuple(uuidArb, nameArb, qtyMilliArb, unitArb, fc.option(pricePaiseArb, { nil: null })),
        { minLength: 1, maxLength: 5 },
      ),
      transcriptArb,
      fc.nat({ max: 9999 }),
    )
    .map(([orderId, mutationId, createdAt, customerId, rawItems, transcript, seq]) => {
      const items: OrderItemRowData[] = rawItems.map(([itemId, name, qty, unit, price], index) => ({
        id: itemId,
        orderId,
        index,
        productId: null,
        nameSnapshot: name,
        qtyMilli: qty,
        unit,
        unitPricePaise: price,
        lineTotalPaise: price === null ? null : lineTotal(price, qty),
        resolutionStatus: price === null ? 'unmatched' : 'confirmed',
      }));
      const order: OrderRowData = {
        id: orderId,
        shopId,
        localNumber: `ORD-${String(seq).padStart(4, '0')}`,
        customerId,
        walkIn: customerId === null,
        status: 'confirmed',
        fulfillment: 'delivery',
        note: null,
        totalEstimatePaise: items.reduce((a, i) => a + (i.lineTotalPaise ?? 0), 0),
        rawTranscript: transcript,
        normalizedText: transcript,
        extraction: null,
        mutationId,
        syncState: 'pending',
        createdAt,
        updatedAt: createdAt,
      };
      return envelope('order', orderId, 'create', { kind: 'order', order, items }, mutationId, createdAt);
    });

/** Pending finalized bill Mutation with 1..5 items for one shop. */
export const billMutationArb = (shopId: string): fc.Arbitrary<MutationData> =>
  fc
    .tuple(
      uuidArb,
      uuidArb,
      isoDateArb,
      fc.option(uuidArb, { nil: null }),
      fc.array(fc.tuple(uuidArb, nameArb, qtyMilliArb, unitArb, pricePaiseArb), {
        minLength: 1,
        maxLength: 5,
      }),
      fc.nat({ max: 9999 }),
    )
    .map(([billId, mutationId, createdAt, customerId, rawItems, seq]) => {
      const items: BillItemRowData[] = rawItems.map(([itemId, name, qty, unit, price], index) => ({
        id: itemId,
        billId,
        index,
        productId: null,
        nameSnapshot: name,
        qtyMilli: qty,
        unit,
        unitPricePaise: price,
        lineTotalPaise: lineTotal(price, qty),
      }));
      const subtotal = items.reduce((a, i) => a + i.lineTotalPaise, 0);
      const bill: BillRowData = {
        id: billId,
        shopId,
        receiptNumber: `RCT-${String(seq).padStart(4, '0')}`,
        kind: 'sale',
        correctsBillId: null,
        customerId,
        status: 'finalized',
        subtotalPaise: subtotal,
        discountPaise: 0,
        taxPaise: 0,
        totalPaise: subtotal,
        rawTranscript: '',
        normalizedText: '',
        mutationId,
        syncState: 'pending',
        createdAt,
        finalizedAt: createdAt,
      };
      return envelope('bill', billId, 'create', { kind: 'bill', bill, items }, mutationId, createdAt);
    });

/** Pending customer upsert Mutation (mutable entity, last-write-wins). */
export const customerMutationArb = (shopId: string): fc.Arbitrary<MutationData> =>
  fc
    .tuple(uuidArb, uuidArb, isoDateArb, fc.constantFrom('Asha', 'Ravi', 'Meena', 'Imran'), fc.boolean())
    .map(([customerId, mutationId, updatedAt, name, isSample]) =>
      envelope(
        'customer',
        customerId,
        'upsert',
        {
          kind: 'customer',
          customer: { id: customerId, shopId, name, isSample, updatedAt, deletedAt: null },
        },
        mutationId,
        updatedAt,
      ),
    );

/** Pending product upsert Mutation. */
export const productMutationArb = (shopId: string): fc.Arbitrary<MutationData> =>
  fc
    .tuple(uuidArb, uuidArb, isoDateArb, nameArb, pricePaiseArb, unitArb)
    .map(([productId, mutationId, updatedAt, name, pricePaise, unit]) =>
      envelope(
        'product',
        productId,
        'upsert',
        {
          kind: 'product',
          product: {
            id: productId,
            shopId,
            name,
            aliases: [name.toLowerCase()],
            unit,
            pricePaise,
            active: true,
            deletedAt: null,
            updatedAt,
          },
        },
        mutationId,
        updatedAt,
      ),
    );

/** Any single pending Mutation, create-once entities weighted higher. */
export const mutationArb = (shopId: string): fc.Arbitrary<MutationData> =>
  fc.oneof(
    { weight: 3, arbitrary: orderMutationArb(shopId) },
    { weight: 3, arbitrary: billMutationArb(shopId) },
    { weight: 1, arbitrary: customerMutationArb(shopId) },
    { weight: 1, arbitrary: productMutationArb(shopId) },
  );

/**
 * An outbox: 0..`maxLen` Mutations with pairwise distinct `mutationId`s and entity ids,
 * ordered by creation time ascending (the order the engine pushes in).
 */
export function mutationListArb(
  shopId: string,
  opts: { minLen?: number; maxLen?: number } = {},
): fc.Arbitrary<MutationData[]> {
  return fc
    .array(mutationArb(shopId), { minLength: opts.minLen ?? 0, maxLength: opts.maxLen ?? 10 })
    .map((list) => {
      const seenMutation = new Set<string>();
      const seenEntity = new Set<string>();
      const unique = list.filter((m) => {
        if (seenMutation.has(m.mutationId) || seenEntity.has(m.entityId)) return false;
        seenMutation.add(m.mutationId);
        seenEntity.add(m.entityId);
        return true;
      });
      return unique.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
}

/**
 * At-least-once delivery: a unique outbox plus a delivery sequence that contains every Mutation
 * at least once and some of them several times, in arbitrary order. Replaying `delivered`
 * against a remote must create exactly one remote entity per entry of `unique`.
 */
export interface DuplicatedDelivery {
  unique: MutationData[];
  delivered: MutationData[];
}

export function duplicatedMutationListArb(
  shopId: string,
  opts: { minLen?: number; maxLen?: number } = {},
): fc.Arbitrary<DuplicatedDelivery> {
  return mutationListArb(shopId, { minLen: opts.minLen ?? 1, maxLen: opts.maxLen ?? 8 }).chain(
    (unique) =>
      fc
        .array(fc.integer({ min: 0, max: Math.max(0, unique.length - 1) }), {
          maxLength: unique.length === 0 ? 0 : unique.length * 2,
        })
        .chain((extraIdx) =>
          fc.shuffledSubarray([...unique, ...extraIdx.map((i) => unique[i] as MutationData)], {
            minLength: unique.length + extraIdx.length,
          }),
        )
        .map((delivered) => ({ unique, delivered })),
  );
}
