import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '../../packages/catalog-matcher/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter } from '../../packages/domain-order/src/index';
import { normalize } from '../../packages/language-normalizer/src/index';
import { openDb, type AwaazDb } from '../../packages/local-data/src/index';
import { ScriptedProvider, makeScriptedClip } from '../../packages/speech-provider/src/index';
import { assertProperty } from '../setup/fast-check';
import { catalogArb, fc, utteranceArb, type GeneratedCatalog } from './arbitraries';

/**
 * Property 20: capture/transcription, normalization, extraction, matching and validation never
 * write. Oracle: a deep snapshot of every Local_Database store (including outbox and catalog
 * stock-bearing product rows) taken before the pipeline equals the snapshot afterwards, and
 * Dexie write hooks on every store never fire. Neither check calls the code under test.
 */

const TS = '2026-01-01T00:00:00.000Z';
let dbCounter = 0;

const scenarioArb = catalogArb.chain((catalog) =>
  fc
    .tuple(utteranceArb(catalog), fc.string({ maxLength: 80 }))
    .map(([u, noise]) => ({ catalog, texts: [u.text, noise] })),
);

async function seed(db: AwaazDb, catalog: GeneratedCatalog): Promise<void> {
  await db.shops.put({
    id: catalog.shopId,
    name: 'Prop Shop',
    currency: 'INR',
    locale: 'en-IN',
    isDemo: false,
    nextOrderSeq: 1,
    nextReceiptSeq: 1,
    remoteShopId: null,
    createdAt: TS,
    updatedAt: TS,
    syncVersion: 0,
  });
  await db.products.bulkPut(catalog.products.map((p) => ({ ...p, updatedAt: TS })));
  await db.customers.put({
    id: '00000000-0000-4000-9000-0000000000c1',
    shopId: catalog.shopId,
    name: 'Asha Verma',
    isSample: true,
    updatedAt: TS,
    deletedAt: null,
  });
}

async function snapshot(db: AwaazDb): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of db.tables) out[table.name] = await table.toArray();
  return out;
}

// Feature: awaaz-kit, Property 20: Recording, transcription and parsing write nothing
describe('Property 20: Recording, transcription and parsing write nothing', () => {
  it('Property 20: **Validates: Requirements 11.6**', async () => {
    await assertProperty(
      fc.asyncProperty(scenarioArb, async ({ catalog, texts }) => {
        const db = await openDb({ name: `read-only-${++dbCounter}`, indexedDB: new IDBFactory() });
        try {
          await seed(db, catalog);

          let writes = 0;
          for (const table of db.tables) {
            table.hook('creating', () => {
              writes++;
            });
            table.hook('updating', () => {
              writes++;
            });
            table.hook('deleting', () => {
              writes++;
            });
          }

          const before = await snapshot(db);

          // Catalog is read from the database, then passed in as data.
          const products = await db.products.where('shopId').equals(catalog.shopId).toArray();
          const customers = (await db.customers.toArray()).map((c) => ({ id: c.id, name: c.name }));
          const index = buildIndex(catalog.shopId, products as unknown as CatalogProduct[]);
          let n = 0;
          const ctx = () => ({
            shopId: catalog.shopId,
            customers,
            catalog: index,
            makeId: () => `id-${++n}`,
            now: () => new Date(TS),
            config: { taxEnabled: false },
          });

          const clips = Object.fromEntries(texts.map((t, i) => [`c${i}`, t]));
          const provider = new ScriptedProvider({ clips });
          await provider.initialize();

          for (let i = 0; i < texts.length; i++) {
            const { text } = await provider.transcribe(makeScriptedClip(`c${i}`));
            normalize(text);

            const order = new OrderWorkflowAdapter();
            const orderDraft = order.parse(text, ctx());
            order.validate(orderDraft);
            order.canConfirm(orderDraft);

            const bill = new BillingWorkflowAdapter();
            const billDraft = bill.parse(text, ctx());
            bill.validate(billDraft);
            bill.canConfirm(billDraft);
          }

          expect(writes).toBe(0);
          expect(await snapshot(db)).toEqual(before);
          expect(await db.outbox.count()).toBe(0);
          expect(await db.orders.count()).toBe(0);
          expect(await db.bills.count()).toBe(0);
        } finally {
          db.close();
        }
      }),
    );
  }, 60_000);
});
