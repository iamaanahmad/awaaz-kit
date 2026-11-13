import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '../../packages/catalog-matcher/src/index';
import {
  confirm,
  createUserConfirmationEvidence,
  NotConfirmableError,
  type WorkflowContext,
} from '../../packages/confirmation-engine/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter } from '../../packages/domain-order/src/index';
import {
  commitConfirmed,
  DEMO_SEED,
  DEMO_SHOP_ID,
  openDb,
  resetDemoShop,
  type AwaazDb,
} from '../../packages/local-data/src/index';

/**
 * Confirm-to-save integration (Req 19.4, 15.5).
 *
 * Real packages end to end: utterance -> parse -> draft -> confirm() -> commitConfirmed()
 * against fake-indexeddb. Expected values are hand-authored from the Demo_Shop seed
 * (same oracle as packages/domain-order fixture-utterance test), not derived from the code.
 */

const UTTERANCE = 'do kilo aata, ek litre tel aur paanch kilo chawal';
const NOW = new Date('2026-01-01T00:00:00.000Z');

// Hand-authored oracle: qty in milli-units, prices in paise.
const EXPECTED_ITEMS = [
  {
    productId: '00000000-0000-4000-8000-000000000001',
    nameSnapshot: 'Aashirvaad Atta',
    qtyMilli: 2000,
    unit: 'kg',
    unitPricePaise: 5800,
    lineTotalPaise: 11600,
  },
  {
    productId: '00000000-0000-4000-8000-000000000002',
    nameSnapshot: 'Fortune Sunflower Oil',
    qtyMilli: 1000,
    unit: 'litre',
    unitPricePaise: 14500,
    lineTotalPaise: 14500,
  },
  {
    productId: '00000000-0000-4000-8000-000000000003',
    nameSnapshot: 'India Gate Basmati Rice',
    qtyMilli: 5000,
    unit: 'kg',
    unitPricePaise: 9000,
    lineTotalPaise: 45000,
  },
] as const;
const EXPECTED_TOTAL_PAISE = 71100;

let dbCounter = 0;

async function freshDb(): Promise<AwaazDb> {
  const db = await openDb({ name: `confirm-to-save-${++dbCounter}`, indexedDB: new IDBFactory() });
  await resetDemoShop(db, () => NOW);
  return db;
}

function makeContext(): WorkflowContext<ReturnType<typeof buildIndex>> {
  const products: CatalogProduct[] = DEMO_SEED.products.map((p) => ({
    id: p.id,
    shopId: DEMO_SHOP_ID,
    name: p.name,
    aliases: [...p.aliases],
    ...(p.brand ? { brand: p.brand } : {}),
    unit: p.unit,
    pricePaise: p.pricePaise,
    active: true,
    deletedAt: null,
  }));
  let n = 0;
  return {
    shopId: DEMO_SHOP_ID,
    customers: DEMO_SEED.customers.map((c) => ({ id: c.id, name: c.name })),
    catalog: buildIndex(DEMO_SHOP_ID, products),
    makeId: () => `it-id-${++n}`,
    now: () => NOW,
    config: { taxEnabled: false },
  };
}

const click = (revision: number) =>
  createUserConfirmationEvidence({ isTrusted: true, type: 'click' }, revision, () => NOW);

async function counts(db: AwaazDb) {
  return {
    orders: await db.orders.count(),
    orderItems: await db.orderItems.count(),
    bills: await db.bills.count(),
    billItems: await db.billItems.count(),
    audit: await db.auditEvents.count(),
    outbox: await db.outbox.count(),
  };
}

/** Picks the snapshot fields under test (drops generated ids). */
function pickLine(i: {
  productId: string | null;
  nameSnapshot: string;
  qtyMilli: number;
  unit: string;
  unitPricePaise: number | null;
  lineTotalPaise: number | null;
  resolutionStatus?: string;
}) {
  return {
    productId: i.productId,
    nameSnapshot: i.nameSnapshot,
    qtyMilli: i.qtyMilli,
    unit: i.unit,
    unitPricePaise: i.unitPricePaise,
    lineTotalPaise: i.lineTotalPaise,
    ...(i.resolutionStatus !== undefined ? { resolutionStatus: i.resolutionStatus } : {}),
  };
}

const ZERO = { orders: 0, orderItems: 0, bills: 0, billItems: 0, audit: 0, outbox: 0 };

describe('confirm-to-save: order', () => {
  let db: AwaazDb;
  beforeEach(async () => {
    db = await freshDb();
  });

  // **Validates: Requirements 19.4, 15.5**
  it('saves order, items, snapshots, audit event, outbox mutation and counter in one commit', async () => {
    const adapter = new OrderWorkflowAdapter();
    const draft = adapter.parse(UTTERANCE, makeContext());
    expect(await counts(db)).toEqual(ZERO); // parsing alone writes nothing
    const before = await db.shops.get(DEMO_SHOP_ID);
    expect(before?.nextOrderSeq).toBe(1);

    const action = confirm(adapter, draft, click(draft.revision));
    expect(await counts(db)).toEqual(ZERO); // minting alone writes nothing

    const res = await commitConfirmed(db, action);
    expect(res).toEqual({ status: 'created', recordId: draft.id, number: 'ORD-0001' });

    const order = await db.orders.get(draft.id);
    expect(order).toMatchObject({
      shopId: DEMO_SHOP_ID,
      status: 'confirmed',
      walkIn: true,
      customerId: null,
      localNumber: 'ORD-0001',
      syncState: 'local_only',
      totalEstimatePaise: EXPECTED_TOTAL_PAISE,
      rawTranscript: UTTERANCE,
      mutationId: draft.mutationId,
    });

    const items = (await db.orderItems.where('orderId').equals(draft.id).toArray()).sort(
      (a, b) => a.index - b.index,
    );
    expect(items).toHaveLength(3);
    expect(items.map((i) => ({ ...pickLine(i), index: i.index, orderId: i.orderId }))).toEqual(
      EXPECTED_ITEMS.map((e, idx) => ({
        ...e,
        resolutionStatus: 'confirmed',
        index: idx,
        orderId: draft.id,
      })),
    );

    const events = await db.auditEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: 'order',
      entityId: draft.id,
      action: 'order_confirmed',
      actor: 'local_user',
      metadata: { lineCount: 3, totalEstimatePaise: EXPECTED_TOTAL_PAISE },
    });

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      mutationId: draft.mutationId,
      entityType: 'order',
      entityId: draft.id,
      operation: 'create',
      state: 'pending',
      attempts: 0,
      lastError: null,
    });

    expect((await db.shops.get(DEMO_SHOP_ID))?.nextOrderSeq).toBe(2);
    expect((await db.shops.get(DEMO_SHOP_ID))?.nextReceiptSeq).toBe(1);
    expect((await counts(db)).bills).toBe(0);
  });

  it('freezes price snapshots when the catalog price changes later', async () => {
    const adapter = new OrderWorkflowAdapter();
    const draft = adapter.parse(UTTERANCE, makeContext());
    await commitConfirmed(db, confirm(adapter, draft, click(0)));
    await db.products.update(EXPECTED_ITEMS[0].productId, { pricePaise: 9999 });
    const first = (await db.orderItems.where('orderId').equals(draft.id).sortBy('index'))[0];
    expect(first?.unitPricePaise).toBe(5800);
    expect(first?.lineTotalPaise).toBe(11600);
  });

  it('double activation creates exactly one record and consumes one number', async () => {
    const adapter = new OrderWorkflowAdapter();
    const draft = adapter.parse(UTTERANCE, makeContext());
    const a = await commitConfirmed(db, confirm(adapter, draft, click(0)));
    const b = await commitConfirmed(db, confirm(adapter, draft, click(0)));
    expect(a.status).toBe('created');
    expect(b).toEqual({ status: 'already_exists', recordId: draft.id, number: 'ORD-0001' });
    expect(await counts(db)).toMatchObject({ orders: 1, orderItems: 3, audit: 1, outbox: 1 });
    expect((await db.shops.get(DEMO_SHOP_ID))?.nextOrderSeq).toBe(2);
  });

  it('numbers consecutive orders ORD-0001 and ORD-0002', async () => {
    const adapter = new OrderWorkflowAdapter();
    const ctx = makeContext();
    const d1 = adapter.parse(UTTERANCE, ctx);
    const d2 = adapter.parse('do kilo aata', ctx);
    const r1 = await commitConfirmed(db, confirm(adapter, d1, click(0)));
    const r2 = await commitConfirmed(db, confirm(adapter, d2, click(0)));
    expect([r1.number, r2.number]).toEqual(['ORD-0001', 'ORD-0002']);
    expect((await db.shops.get(DEMO_SHOP_ID))?.nextOrderSeq).toBe(3);
    expect(await db.outbox.count()).toBe(2);
  });
});

describe('confirm-to-save: bill', () => {
  let db: AwaazDb;
  beforeEach(async () => {
    db = await freshDb();
  });

  // **Validates: Requirements 19.4, 15.5**
  it('finalizes a bill with items, exact totals, audit event, outbox mutation and counter', async () => {
    const adapter = new BillingWorkflowAdapter();
    const draft = adapter.parse(UTTERANCE, makeContext());
    expect(await counts(db)).toEqual(ZERO);

    const res = await commitConfirmed(db, confirm(adapter, draft, click(draft.revision)));
    expect(res).toEqual({ status: 'created', recordId: draft.id, number: 'R-0001' });

    const bill = await db.bills.get(draft.id);
    expect(bill).toMatchObject({
      shopId: DEMO_SHOP_ID,
      kind: 'sale',
      status: 'finalized',
      correctsBillId: null,
      receiptNumber: 'R-0001',
      subtotalPaise: EXPECTED_TOTAL_PAISE,
      discountPaise: 0,
      taxPaise: 0,
      totalPaise: EXPECTED_TOTAL_PAISE,
      syncState: 'local_only',
      mutationId: draft.mutationId,
    });

    const items = (await db.billItems.where('billId').equals(draft.id).toArray()).sort(
      (a, b) => a.index - b.index,
    );
    expect(items.map((i) => ({ ...pickLine(i), index: i.index, billId: i.billId }))).toEqual(
      EXPECTED_ITEMS.map((e, idx) => ({ ...e, index: idx, billId: draft.id })),
    );

    const events = await db.auditEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: 'bill',
      entityId: draft.id,
      action: 'bill_finalized',
      actor: 'local_user',
    });

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      mutationId: draft.mutationId,
      entityType: 'bill',
      entityId: draft.id,
      operation: 'create',
      state: 'pending',
    });

    const shop = await db.shops.get(DEMO_SHOP_ID);
    expect(shop?.nextReceiptSeq).toBe(2);
    expect(shop?.nextOrderSeq).toBe(1);
    expect((await counts(db)).orders).toBe(0);
  });

  it('keeps the finalized bill immutable and double activation creates one record', async () => {
    const adapter = new BillingWorkflowAdapter();
    const draft = adapter.parse(UTTERANCE, makeContext());
    await commitConfirmed(db, confirm(adapter, draft, click(0)));
    const again = await commitConfirmed(db, confirm(adapter, draft, click(0)));
    expect(again.status).toBe('already_exists');
    expect(await counts(db)).toMatchObject({ bills: 1, billItems: 3, audit: 1, outbox: 1 });
    await expect(db.bills.update(draft.id, { totalPaise: 1 })).rejects.toMatchObject({
      name: 'ImmutableRecordError',
    });
    expect((await db.bills.get(draft.id))?.totalPaise).toBe(EXPECTED_TOTAL_PAISE);
  });
});

describe('confirm-to-save: nothing persists without confirmation', () => {
  it('parsing and reviewing order and bill drafts writes no rows', async () => {
    const db = await freshDb();
    const ctx = makeContext();
    new OrderWorkflowAdapter().parse(UTTERANCE, ctx);
    new BillingWorkflowAdapter().parse(UTTERANCE, ctx);
    expect(await counts(db)).toEqual(ZERO);
    const shop = await db.shops.get(DEMO_SHOP_ID);
    expect([shop?.nextOrderSeq, shop?.nextReceiptSeq]).toEqual([1, 1]);
  });

  it('refuses to confirm a draft that is not confirmable and persists nothing', async () => {
    const db = await freshDb();
    const order = new OrderWorkflowAdapter();
    const bill = new BillingWorkflowAdapter();
    const ctx = makeContext();
    const unmatched = 'teen kilo xyzzyplugh';

    const od = order.parse(unmatched, ctx);
    const bd = bill.parse(unmatched, ctx);
    expect(order.canConfirm(od)).toBe(false);
    expect(bill.canConfirm(bd)).toBe(false);
    expect(() => confirm(order, od, click(0))).toThrow(NotConfirmableError);
    expect(() => confirm(bill, bd, click(0))).toThrow(NotConfirmableError);

    const empty = order.parse('', ctx);
    expect(() => confirm(order, empty, click(0))).toThrow(NotConfirmableError);
    expect(await counts(db)).toEqual(ZERO);
  });

  it('refuses untrusted or missing click evidence', async () => {
    const db = await freshDb();
    const order = new OrderWorkflowAdapter();
    const draft = order.parse(UTTERANCE, makeContext());
    expect(() => createUserConfirmationEvidence({ isTrusted: false, type: 'click' }, 0)).toThrow(
      NotConfirmableError,
    );
    expect(() => confirm(order, draft, undefined)).toThrow(NotConfirmableError);
    expect(await counts(db)).toEqual(ZERO);
  });

  it('commitConfirmed rejects a forged action built from a valid bundle', async () => {
    const db = await freshDb();
    const order = new OrderWorkflowAdapter();
    const draft = order.parse(UTTERANCE, makeContext());
    const forged = {
      bundle: order.toBundle(draft),
      confirmation: { kind: 'user_confirm', at: NOW.toISOString(), draftRevision: 0 },
    };
    await expect(commitConfirmed(db, forged as never)).rejects.toMatchObject({
      reason: 'not_confirmed',
    });
    expect(await counts(db)).toEqual(ZERO);
    expect((await db.shops.get(DEMO_SHOP_ID))?.nextOrderSeq).toBe(1);
  });

  it('a failed transaction leaves no partial rows and does not advance the counter', async () => {
    const db = await freshDb();
    const order = new OrderWorkflowAdapter();
    const draft = order.parse(UTTERANCE, makeContext());
    // Collide with the audit id so the last write in the transaction fails.
    await db.auditEvents.add({
      id: `${draft.mutationId}:audit`,
      entityType: 'order',
      entityId: 'other',
      action: 'order_confirmed',
      actor: 'local_user',
      createdAt: NOW.toISOString(),
      metadata: {},
    });
    await expect(commitConfirmed(db, confirm(order, draft, click(0)))).rejects.toBeDefined();
    expect(await counts(db)).toEqual({ ...ZERO, audit: 1 });
    expect((await db.shops.get(DEMO_SHOP_ID))?.nextOrderSeq).toBe(1);
  });
});
