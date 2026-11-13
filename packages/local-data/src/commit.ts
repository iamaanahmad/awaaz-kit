import { isConfirmedAction, type ConfirmedAction } from '@awaaz-kit/confirmation-engine';
import { LocalDataError } from './db.js';
import {
  AuditEventRecordSchema,
  BillBundleSchema,
  CorrectionBundleSchema,
  OrderBundleSchema,
  type BillBundle,
  type BillRecord,
  type ConfirmableBundle,
  type CorrectionBundle,
  type Mutation,
  type OrderBundle,
  type OrderRecord,
} from './records.js';
import type { AwaazDb } from './schema.js';

export type CommitResult = {
  status: 'created' | 'already_exists';
  recordId: string;
  /** `localNumber` for orders, `receiptNumber` for bills and corrections. */
  number: string;
};

export class CommitError extends Error {
  readonly reason:
    'not_confirmed' | 'shop_not_found' | 'invalid_bundle' | 'invalid_correction_target';

  constructor(reason: CommitError['reason'], message: string) {
    super(message);
    this.name = 'CommitError';
    this.reason = reason;
  }
}

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

function isQuotaError(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const e = cur as { name?: unknown; inner?: unknown; cause?: unknown };
    if (e.name === 'QuotaExceededError' || e.name === 'QuotaExceeded') return true;
    cur = e.inner ?? e.cause;
  }
  return false;
}

function parseBundle(bundle: unknown): ConfirmableBundle {
  const kind = (bundle as { kind?: unknown } | null)?.kind;
  try {
    if (kind === 'order') return OrderBundleSchema.parse(bundle);
    if (kind === 'bill') return BillBundleSchema.parse(bundle);
    if (kind === 'correction') return CorrectionBundleSchema.parse(bundle);
  } catch (err) {
    throw new CommitError('invalid_bundle', err instanceof Error ? err.message : 'Invalid bundle.');
  }
  throw new CommitError('invalid_bundle', 'Unknown bundle kind.');
}

/**
 * The single write path for confirmed domain data (Req 15.5, 15.6).
 * Accepts only a `ConfirmedAction` minted by the confirmation engine (Req 11.7).
 * One transaction: shop counter, header + item rows, audit event and outbox
 * Mutation. A repeated draft id returns `already_exists` without writing (Req 11.8).
 * Any error aborts the whole transaction, leaving no partial rows.
 */
export async function commitConfirmed(
  db: AwaazDb,
  action: ConfirmedAction<OrderBundle | BillBundle | CorrectionBundle>,
): Promise<CommitResult> {
  if (!isConfirmedAction(action)) {
    throw new CommitError('not_confirmed', 'commitConfirmed requires a ConfirmedAction.');
  }
  const bundle = parseBundle(action.bundle);
  const at = action.confirmation.at;
  const audit = AuditEventRecordSchema.parse(bundle.auditEvent);

  try {
    return await db.transaction(
      'rw',
      [db.shops, db.orders, db.orderItems, db.bills, db.billItems, db.outbox, db.auditEvents],
      async (): Promise<CommitResult> => {
        if (bundle.kind === 'order') {
          const existing = await db.orders.get(bundle.order.id);
          if (existing) {
            return {
              status: 'already_exists',
              recordId: existing.id,
              number: existing.localNumber,
            };
          }
          const shop = await db.shops.get(bundle.order.shopId);
          if (!shop) throw new CommitError('shop_not_found', 'Shop not found.');
          const localNumber = `ORD-${pad(shop.nextOrderSeq)}`;
          await db.shops.put({ ...shop, nextOrderSeq: shop.nextOrderSeq + 1, updatedAt: at });

          const order: OrderRecord = {
            ...bundle.order,
            localNumber,
            syncState: 'local_only',
            updatedAt: at,
          };
          await db.orders.add(order);
          await db.orderItems.bulkAdd(bundle.items);
          await db.auditEvents.add(audit);
          const mutation: Mutation = {
            mutationId: order.mutationId,
            entityType: 'order',
            entityId: order.id,
            operation: 'create',
            payload: { kind: 'order', order, items: bundle.items },
            createdAt: at,
            attempts: 0,
            nextAttemptAt: at,
            state: 'pending',
            lastError: null,
          };
          await db.outbox.add(mutation);
          return { status: 'created', recordId: order.id, number: localNumber };
        }

        const existing = await db.bills.get(bundle.bill.id);
        if (existing) {
          return {
            status: 'already_exists',
            recordId: existing.id,
            number: existing.receiptNumber,
          };
        }
        const shop = await db.shops.get(bundle.bill.shopId);
        if (!shop) throw new CommitError('shop_not_found', 'Shop not found.');
        if (bundle.kind === 'correction') {
          // The original stays untouched; it must be a finalized sale of the same shop (Req 13.14).
          const original = await db.bills.get(bundle.bill.correctsBillId);
          if (
            !original ||
            original.shopId !== bundle.bill.shopId ||
            original.status !== 'finalized' ||
            original.kind !== 'sale'
          ) {
            throw new CommitError(
              'invalid_correction_target',
              'A correction must reference a finalized bill of the same shop.',
            );
          }
        }
        const receiptNumber = `R-${pad(shop.nextReceiptSeq)}`;
        await db.shops.put({ ...shop, nextReceiptSeq: shop.nextReceiptSeq + 1, updatedAt: at });

        const bill: BillRecord = { ...bundle.bill, receiptNumber, syncState: 'local_only' };
        await db.bills.add(bill);
        if (bundle.items.length > 0) await db.billItems.bulkAdd(bundle.items);
        await db.auditEvents.add(audit);
        const isCorrection = bundle.kind === 'correction';
        const mutation: Mutation = {
          mutationId: bill.mutationId,
          entityType: isCorrection ? 'bill_correction' : 'bill',
          entityId: bill.id,
          operation: 'create',
          payload: { kind: isCorrection ? 'bill_correction' : 'bill', bill, items: bundle.items },
          createdAt: at,
          attempts: 0,
          nextAttemptAt: at,
          state: 'pending',
          lastError: null,
        };
        await db.outbox.add(mutation);
        return { status: 'created', recordId: bill.id, number: receiptNumber };
      },
    );
  } catch (err) {
    if (isQuotaError(err)) {
      throw new LocalDataError('quota_exceeded', 'Device storage is full.', err);
    }
    throw err;
  }
}
