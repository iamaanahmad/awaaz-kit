import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { buildIndex } from '../../packages/catalog-matcher/src/index';
import {
  confirm,
  createUserConfirmationEvidence,
} from '../../packages/confirmation-engine/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter } from '../../packages/domain-order/src/index';
import { commitConfirmed, openDb, type ShopRecord } from '../../packages/local-data/src/index';
import { assertProperty } from '../setup/fast-check';
import { catalogArb, fc, utteranceArb, type GeneratedCatalog } from './arbitraries';

/**
 * Property 23: matched draft lines carry the catalog `pricePaise` at parse time; saved Order and
 * Bill lines keep `nameSnapshot` and `unitPricePaise` after a later catalog price change.
 *
 * Oracle: expected name and price are looked up by product id in the generated catalog (before
 * any change), never taken from the code under test. Cross-package on purpose: domain adapters
 * and local-data are wired together as the apps do.
 */

const T = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';
let dbCounter = 0;

const shopFor = (id: string): ShopRecord => ({
  id,
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
});

interface Scenario {
  catalog: GeneratedCatalog;
  text: string;
  /** Added to each product's price (>= 1) so every price really changes. */
  bumps: number[];
}

const scenarioArb: fc.Arbitrary<Scenario> = catalogArb.chain((catalog) =>
  fc.record({
    catalog: fc.constant(catalog),
    text: utteranceArb(catalog).map((u) => u.text),
    bumps: fc.array(fc.integer({ min: 1, max: 1_000_000 }), {
      minLength: catalog.products.length,
      maxLength: catalog.products.length,
    }),
  }),
);

function makeCtx(catalog: GeneratedCatalog, seedBase: number) {
  // Distinct id ranges per workflow so audit event and outbox ids never collide when both save.
  let n = seedBase;
  return {
    shopId: catalog.shopId,
    customers: [],
    catalog: buildIndex(catalog.shopId, catalog.products),
    makeId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    now: () => new Date(T),
    config: { taxEnabled: false },
  };
}

const evidence = (revision: number) =>
  createUserConfirmationEvidence({ isTrusted: true, type: 'click' }, revision, () => new Date(T));

describe('price snapshots (Property 23)', () => {
  // Feature: awaaz-kit, Property 23: Price snapshots follow the catalog at parse time and never change afterwards
  // **Validates: Requirements 12.4, 12.10, 13.4, 13.10, 15.7**
  it('Property 23: parse-time price comes from the catalog; saved snapshots survive a later catalog price change', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async ({ catalog, text, bumps }) => {
        const byId = new Map(catalog.products.map((p, i) => [p.id, { p, bump: bumps[i] as number }]));

        const order = new OrderWorkflowAdapter();
        const bill = new BillingWorkflowAdapter();
        const orderDraft = order.parse(text, makeCtx(catalog, 0));
        const billDraft = bill.parse(text, makeCtx(catalog, 1000));

        // Parse time: every matched line carries the catalog price for its product id.
        for (const l of orderDraft.lines) {
          const id = l.product.value?.productId;
          if (id === undefined) continue;
          expect(l.unitPricePaise).toBe(byId.get(id)!.p.pricePaise);
        }
        for (const l of billDraft.lines) {
          const id = l.product.value?.productId;
          if (id === undefined) continue;
          expect(l.price.value).toBe(byId.get(id)!.p.pricePaise);
        }

        // Saving: only confirmable drafts can be saved.
        if (!order.canConfirm(orderDraft) || !bill.canConfirm(billDraft)) return;

        const expectedOrder = orderDraft.lines.map((l) => {
          const src = byId.get(l.product.value!.productId)!.p;
          return { productId: src.id, name: src.name, price: src.pricePaise };
        });

        const db = await openDb({ name: `snap-${++dbCounter}`, indexedDB: new IDBFactory() });
        try {
          await db.shops.put(shopFor(catalog.shopId));
          await db.products.bulkPut(
            catalog.products.map((p) => ({
              id: p.id,
              shopId: p.shopId,
              name: p.name,
              aliases: p.aliases,
              unit: p.unit,
              pricePaise: p.pricePaise,
              active: true,
              updatedAt: T,
              deletedAt: null,
            })),
          );

          const orderResult = await commitConfirmed(
            db,
            confirm(order, orderDraft, evidence(orderDraft.revision)),
          );
          const billResult = await commitConfirmed(
            db,
            confirm(bill, billDraft, evidence(billDraft.revision)),
          );

          // Later catalog change: new price and new name for every product.
          for (const [id, { p, bump }] of byId) {
            await db.products.update(id, {
              pricePaise: p.pricePaise + bump,
              name: `${p.name} (renamed)`,
              updatedAt: LATER,
            });
          }

          const orderItems = (
            await db.orderItems.where('orderId').equals(orderResult.recordId).toArray()
          ).sort((a, b) => a.index - b.index);
          const billItems = (
            await db.billItems.where('billId').equals(billResult.recordId).toArray()
          ).sort((a, b) => a.index - b.index);

          expect(orderItems.map((i) => [i.productId, i.nameSnapshot, i.unitPricePaise])).toEqual(
            expectedOrder.map((e) => [e.productId, e.name, e.price]),
          );
          expect(billItems.map((i) => [i.productId, i.nameSnapshot, i.unitPricePaise])).toEqual(
            expectedOrder.map((e) => [e.productId, e.name, e.price]),
          );
          // The catalog really did change underneath the snapshots.
          for (const i of orderItems) {
            expect((await db.products.get(i.productId as string))!.pricePaise).not.toBe(
              i.unitPricePaise,
            );
          }
        } finally {
          db.close();
        }
      }),
    );
  });
});
