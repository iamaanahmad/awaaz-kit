import { confirm, createUserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  commitConfirmed,
  openDb,
  type AuditEventRecord,
  type BillBundle,
  type OrderBundle,
  type ShopRecord,
} from './index.js';

const T = '2025-01-01T00:00:00.000Z';
let n = 0;

const shop: ShopRecord = {
  id: 's1',
  name: 'Shop',
  currency: 'INR',
  locale: 'en-IN',
  isDemo: false,
  nextOrderSeq: 1,
  nextReceiptSeq: 1,
  remoteShopId: null,
  createdAt: T,
  updatedAt: T,
  syncVersion: 0,
};

async function setup() {
  const db = await openDb({ name: `c-${++n}`, indexedDB: new IDBFactory() });
  await db.shops.put(shop);
  return db;
}

const audit = (id: string, entityId: string): AuditEventRecord => ({
  id,
  entityType: 'order',
  entityId,
  action: 'confirm',
  actor: 'local_user',
  createdAt: T,
  metadata: {},
});

const orderBundle = (id: string, over: Partial<OrderBundle> = {}): OrderBundle => ({
  kind: 'order',
  order: {
    id,
    shopId: 's1',
    customerId: null,
    walkIn: true,
    status: 'confirmed',
    fulfillment: 'pickup',
    note: null,
    totalEstimatePaise: 500,
    rawTranscript: '',
    normalizedText: '',
    extraction: null,
    mutationId: `m-${id}`,
    createdAt: T,
  },
  items: [
    {
      id: `${id}-i1`,
      orderId: id,
      index: 0,
      productId: 'p1',
      nameSnapshot: 'Atta',
      qtyMilli: 1000,
      unit: 'kg',
      unitPricePaise: 500,
      lineTotalPaise: 500,
      resolutionStatus: 'confirmed',
    },
  ],
  auditEvent: audit(`a-${id}`, id),
  ...over,
});

const billBundle = (id: string): BillBundle => ({
  kind: 'bill',
  bill: {
    id,
    shopId: 's1',
    kind: 'sale',
    correctsBillId: null,
    customerId: null,
    status: 'finalized',
    subtotalPaise: 500,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: 500,
    rawTranscript: '',
    normalizedText: '',
    mutationId: `m-${id}`,
    createdAt: T,
    finalizedAt: T,
  },
  items: [
    {
      id: `${id}-i1`,
      billId: id,
      index: 0,
      productId: 'p1',
      nameSnapshot: 'Atta',
      qtyMilli: 1000,
      unit: 'kg',
      unitPricePaise: 500,
      lineTotalPaise: 500,
    },
  ],
  auditEvent: audit(`a-${id}`, id),
});

function mint<B>(bundle: B) {
  const adapter = {
    id: 'order' as const,
    parse: () => bundle,
    validate: () => [],
    canConfirm: () => true,
    toBundle: () => bundle,
  };
  const ev = createUserConfirmationEvidence(
    { isTrusted: true, type: 'click' },
    1,
    () => new Date(T),
  );
  return confirm(adapter as never, bundle, ev) as never as Parameters<typeof commitConfirmed>[1];
}

describe('commitConfirmed', () => {
  it('writes order, items, audit and mutation, and allocates a number', async () => {
    const db = await setup();
    const res = await commitConfirmed(db, mint(orderBundle('o1')));
    expect(res).toEqual({ status: 'created', recordId: 'o1', number: 'ORD-0001' });
    expect((await db.shops.get('s1'))?.nextOrderSeq).toBe(2);
    expect(await db.orderItems.count()).toBe(1);
    expect(await db.auditEvents.count()).toBe(1);
    expect((await db.outbox.toArray())[0]).toMatchObject({
      entityType: 'order',
      state: 'pending',
      mutationId: 'm-o1',
    });
  });

  it('returns already_exists for a repeated id without writing', async () => {
    const db = await setup();
    await commitConfirmed(db, mint(orderBundle('o1')));
    const res = await commitConfirmed(db, mint(orderBundle('o1')));
    expect(res).toEqual({ status: 'already_exists', recordId: 'o1', number: 'ORD-0001' });
    expect(await db.orders.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
    expect((await db.shops.get('s1'))?.nextOrderSeq).toBe(2);
  });

  it('commits bills with receipt numbers', async () => {
    const db = await setup();
    const res = await commitConfirmed(db, mint(billBundle('b1')));
    expect(res).toEqual({ status: 'created', recordId: 'b1', number: 'R-0001' });
    expect(await db.billItems.count()).toBe(1);
  });

  it('rolls back fully when a later write fails', async () => {
    const db = await setup();
    await db.auditEvents.add(audit('a-o1', 'other')); // audit id collision
    await expect(commitConfirmed(db, mint(orderBundle('o1')))).rejects.toBeDefined();
    expect(await db.orders.count()).toBe(0);
    expect(await db.orderItems.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.shops.get('s1'))?.nextOrderSeq).toBe(1);
  });

  it('rejects content edits to finalized bills but allows syncState/conflict', async () => {
    const db = await setup();
    await commitConfirmed(db, mint(billBundle('b1')));
    await expect(db.bills.update('b1', { totalPaise: 1 })).rejects.toMatchObject({
      name: 'ImmutableRecordError',
    });
    await expect(db.bills.update('b1', { status: 'draft' })).rejects.toMatchObject({
      name: 'ImmutableRecordError',
    });
    await expect(db.billItems.update('b1-i1', { qtyMilli: 5 })).rejects.toMatchObject({
      name: 'ImmutableRecordError',
    });
    expect((await db.bills.get('b1'))?.totalPaise).toBe(500);

    await db.bills.update('b1', { syncState: 'synced' });
    await db.bills.update('b1', {
      syncState: 'conflict',
      conflict: { remoteUpdatedAt: T, detectedAt: T } as never,
    });
    await db.bills
      .where('id')
      .equals('b1')
      .modify((b) => {
        b.syncState = 'synced';
        delete b.conflict;
      });
    const b = await db.bills.get('b1');
    expect(b?.syncState).toBe('synced');
    expect(b?.conflict).toBeUndefined();
  });

  it('creates a correction row linked to the original and leaves it unchanged', async () => {
    const db = await setup();
    await commitConfirmed(db, mint(billBundle('b1')));
    const before = await db.bills.get('b1');
    const base = billBundle('c1');
    const correction = {
      kind: 'correction' as const,
      bill: { ...base.bill, kind: 'void' as const, correctsBillId: 'b1' },
      items: [],
      auditEvent: audit('a-c1', 'c1'),
    };
    const res = await commitConfirmed(db, mint(correction));
    expect(res).toEqual({ status: 'created', recordId: 'c1', number: 'R-0002' });
    expect(await db.bills.get('b1')).toEqual(before);
    expect(await db.bills.get('c1')).toMatchObject({ kind: 'void', correctsBillId: 'b1' });
    expect((await db.outbox.get('m-c1'))?.entityType).toBe('bill_correction');

    const missing = {
      ...correction,
      bill: { ...correction.bill, id: 'c2', mutationId: 'm-c2', correctsBillId: 'nope' },
      auditEvent: audit('a-c2', 'c2'),
    };
    await expect(commitConfirmed(db, mint(missing))).rejects.toMatchObject({
      reason: 'invalid_correction_target',
    });
    expect(await db.bills.get('c2')).toBeUndefined();
  });

  it('rejects values that were not minted by confirm()', async () => {
    const db = await setup();
    const forged = {
      bundle: orderBundle('o1'),
      confirmation: { kind: 'user_confirm', at: T, draftRevision: 1 },
    };
    await expect(commitConfirmed(db, forged as never)).rejects.toMatchObject({
      reason: 'not_confirmed',
    });
    expect(await db.orders.count()).toBe(0);
  });
});
