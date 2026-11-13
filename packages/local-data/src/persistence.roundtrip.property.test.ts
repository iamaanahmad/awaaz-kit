import { confirm, createUserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import {
  commitConfirmed,
  createRepositories,
  openDb,
  type BillBundle,
  type BillItemRecord,
  type CustomerRecord,
  type OrderBundle,
  type OrderItemRecord,
  type ProductRecord,
  type ShopRecord,
} from './index.js';

const T = '2025-01-01T00:00:00.000Z';
let dbCounter = 0;

const text = fc.string({ minLength: 1, maxLength: 24, unit: 'grapheme' });
// Hindi, Hinglish and English names are all valid free text.
const nameArb = fc.oneof(
  text,
  fc.constantFrom('आटा', 'चीनी 1 किलो', 'Atta chakki', 'दूध (toned)'),
);
const unitArb = fc.constantFrom('piece', 'kg', 'g', 'litre', 'ml') as fc.Arbitrary<
  ProductRecord['unit']
>;
const isoArb = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2035-01-01T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString());
const paise = fc.integer({ min: 0, max: 100_000_000 });

type Scenario = {
  ids: string[];
  shop: Omit<ShopRecord, 'id'>;
  products: Array<Omit<ProductRecord, 'id' | 'shopId'>>;
  customers: Array<Omit<CustomerRecord, 'id' | 'shopId'>>;
  orderItems: Array<Omit<OrderItemRecord, 'id' | 'orderId' | 'index'>>;
  billItems: Array<Omit<BillItemRecord, 'id' | 'billId' | 'index'>>;
  order: {
    customerLinked: boolean;
    walkIn: boolean;
    fulfillment: 'delivery' | 'pickup';
    note: string | null;
    total: number;
    rawTranscript: string;
    normalizedText: string;
    extraction: unknown;
    createdAt: string;
  };
  bill: {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    rawTranscript: string;
    normalizedText: string;
    createdAt: string;
    finalizedAt: string;
  };
};

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  // Distinct client-generated UUIDs: shop, order, bill, 2 mutations, up to 5+5 catalog rows, 3+3 line rows.
  ids: fc.uniqueArray(fc.uuid(), { minLength: 24, maxLength: 24 }),
  shop: fc.record({
    name: nameArb,
    currency: fc.constant('INR' as const),
    locale: fc.constantFrom('hi-IN' as const, 'en-IN' as const),
    isDemo: fc.boolean(),
    nextOrderSeq: fc.integer({ min: 0, max: 9_000 }),
    nextReceiptSeq: fc.integer({ min: 0, max: 9_000 }),
    remoteShopId: fc.option(fc.uuid(), { nil: null }),
    createdAt: isoArb,
    updatedAt: isoArb,
    syncVersion: fc.nat(1000),
  }),
  products: fc.array(
    fc.record(
      {
        name: nameArb,
        aliases: fc.array(text, { maxLength: 4 }),
        brand: text,
        unit: unitArb,
        pricePaise: paise,
        active: fc.boolean(),
        updatedAt: isoArb,
        deletedAt: fc.option(isoArb, { nil: null }),
      },
      { requiredKeys: ['name', 'aliases', 'unit', 'pricePaise', 'active', 'updatedAt', 'deletedAt'] },
    ),
    { maxLength: 5 },
  ),
  customers: fc.array(
    fc.record(
      {
        name: nameArb,
        phone: fc.stringMatching(/^[0-9]{10}$/),
        notes: text,
        isSample: fc.boolean(),
        updatedAt: isoArb,
        deletedAt: fc.option(isoArb, { nil: null }),
      },
      { requiredKeys: ['name', 'isSample', 'updatedAt', 'deletedAt'] },
    ),
    { maxLength: 5 },
  ),
  orderItems: fc.array(
    fc.record({
      productId: fc.constant(null),
      nameSnapshot: nameArb,
      qtyMilli: fc.integer({ min: 1, max: 1_000_000 }),
      unit: unitArb,
      unitPricePaise: fc.option(paise, { nil: null }),
      lineTotalPaise: fc.option(paise, { nil: null }),
      resolutionStatus: fc.constantFrom(
        'confirmed' as const,
        'needs_review' as const,
        'missing' as const,
        'unmatched' as const,
      ),
    }),
    { minLength: 1, maxLength: 3 },
  ),
  billItems: fc.array(
    fc.record({
      productId: fc.constant(null),
      nameSnapshot: nameArb,
      qtyMilli: fc.integer({ min: -1_000_000, max: 1_000_000 }),
      unit: unitArb,
      unitPricePaise: paise,
      lineTotalPaise: fc.integer({ min: -100_000_000, max: 100_000_000 }),
    }),
    { minLength: 1, maxLength: 3 },
  ),
  order: fc.record({
    customerLinked: fc.boolean(),
    walkIn: fc.boolean(),
    fulfillment: fc.constantFrom('delivery' as const, 'pickup' as const),
    note: fc.option(text, { nil: null }),
    total: paise,
    rawTranscript: fc.string({ maxLength: 40 }),
    normalizedText: fc.string({ maxLength: 40 }),
    extraction: fc.jsonValue(),
    createdAt: isoArb,
  }),
  bill: fc.record({
    subtotal: fc.integer({ min: -100_000_000, max: 100_000_000 }),
    discount: paise,
    tax: paise,
    total: fc.integer({ min: -100_000_000, max: 100_000_000 }),
    rawTranscript: fc.string({ maxLength: 40 }),
    normalizedText: fc.string({ maxLength: 40 }),
    createdAt: isoArb,
    finalizedAt: isoArb,
  }),
});

function mint(bundle: OrderBundle | BillBundle) {
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

const pad4 = (n: number): string => '0000'.slice(String(n).length) + String(n);

describe('local persistence round trip (property)', () => {
  // Feature: awaaz-kit, Property 27: Local persistence round trip
  // **Validates: Requirements 15.2, 15.8, 12.11, 13.16**
  it('Property 27: saved shop, product, customer, order, bill and line records read back deeply equal', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async (s) => {
        const db = await openDb({ name: `rt-${++dbCounter}`, indexedDB: new IDBFactory() });
        try {
          const repos = createRepositories(db, { now: () => new Date(T), newId: () => 'unused' });
          const [shopId, orderId, billId, orderMut, billMut, auditO, auditB, ...rest] = s.ids as unknown as [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            ...string[],
          ];
          const shop: ShopRecord = { id: shopId, ...s.shop };
          const products: ProductRecord[] = s.products.map((p, i) => ({
            id: rest[i] as string,
            shopId,
            ...p,
          }));
          const customers: CustomerRecord[] = s.customers.map((c, i) => ({
            id: rest[5 + i] as string,
            shopId,
            ...c,
          }));

          await repos.shops.put(shop);
          for (const p of products) await repos.products.put(p);
          for (const c of customers) await repos.customers.put(c);

          // Order and bill can only be written through commitConfirmed (safety rules).
          const customerId = customers[0]?.id ?? null;
          const orderItems: OrderItemRecord[] = s.orderItems.map((it, index) => ({
            id: rest[10 + index] as string,
            orderId,
            index,
            ...it,
          }));
          const billItems: BillItemRecord[] = s.billItems.map((it, index) => ({
            id: rest[13 + index] as string,
            billId,
            index,
            ...it,
          }));
          const orderBundle: OrderBundle = {
            kind: 'order',
            order: {
              id: orderId,
              shopId,
              customerId: s.order.customerLinked ? customerId : null,
              walkIn: s.order.walkIn,
              status: 'confirmed',
              fulfillment: s.order.fulfillment,
              note: s.order.note,
              totalEstimatePaise: s.order.total,
              rawTranscript: s.order.rawTranscript,
              normalizedText: s.order.normalizedText,
              extraction: s.order.extraction,
              mutationId: orderMut,
              createdAt: s.order.createdAt,
            },
            items: orderItems,
            auditEvent: {
              id: auditO,
              entityType: 'order',
              entityId: orderId,
              action: 'confirm',
              actor: 'local_user',
              createdAt: T,
              metadata: {},
            },
          };
          const billBundle: BillBundle = {
            kind: 'bill',
            bill: {
              id: billId,
              shopId,
              kind: 'sale',
              correctsBillId: null,
              customerId: null,
              status: 'finalized',
              subtotalPaise: s.bill.subtotal,
              discountPaise: s.bill.discount,
              taxPaise: s.bill.tax,
              totalPaise: s.bill.total,
              rawTranscript: s.bill.rawTranscript,
              normalizedText: s.bill.normalizedText,
              mutationId: billMut,
              createdAt: s.bill.createdAt,
              finalizedAt: s.bill.finalizedAt,
            },
            items: billItems,
            auditEvent: {
              id: auditB,
              entityType: 'bill',
              entityId: billId,
              action: 'confirm',
              actor: 'local_user',
              createdAt: T,
              metadata: {},
            },
          };
          await commitConfirmed(db, mint(orderBundle));
          await commitConfirmed(db, mint(billBundle));

          // Oracle: expected values are built from the inputs, not from repository output.
          const readShop = await repos.shops.get(shopId);
          expect(readShop).toStrictEqual({
            ...shop,
            nextOrderSeq: shop.nextOrderSeq + 1,
            nextReceiptSeq: shop.nextReceiptSeq + 1,
            updatedAt: T,
          });

          for (const p of products) expect(await repos.products.get(p.id)).toStrictEqual(p);
          for (const c of customers) expect(await repos.customers.get(c.id)).toStrictEqual(c);
          expect((await repos.products.listAll(shopId)).length).toBe(products.length);
          expect((await repos.customers.listAll(shopId)).length).toBe(customers.length);

          const gotOrder = await repos.orders.getWithItems(orderId);
          expect(gotOrder).toStrictEqual({
            order: {
              ...orderBundle.order,
              localNumber: `ORD-${pad4(shop.nextOrderSeq)}`,
              syncState: 'local_only',
              updatedAt: T,
            },
            items: orderItems,
          });

          const gotBill = await repos.bills.getWithItems(billId);
          expect(gotBill).toStrictEqual({
            bill: {
              ...billBundle.bill,
              receiptNumber: `R-${pad4(shop.nextReceiptSeq)}`,
              syncState: 'local_only',
            },
            items: billItems,
          });
        } finally {
          db.close();
        }
      }),
    );
  }, 120_000);
});
