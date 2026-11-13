import seedJson from './seed/demo-shop.json';
import type { AwaazDb } from './schema.js';
import type { CustomerRecord, ProductRecord, ShopRecord } from './records.js';

/** Fictional Demo_Shop seed with fixed ids so corpus and E2E results are stable (Req 3.3, 3.4). */
export const DEMO_SEED = seedJson as {
  seedVersion: number;
  label: string;
  shop: { id: string; name: string; currency: 'INR'; locale: 'hi-IN' | 'en-IN' };
  products: Array<{
    id: string;
    name: string;
    brand?: string;
    unit: ProductRecord['unit'];
    pricePaise: number;
    aliases: string[];
  }>;
  customers: Array<{ id: string; name: string; notes?: string }>;
};

export const DEMO_SHOP_ID = DEMO_SEED.shop.id;

/**
 * Upserts the seed by id and soft-deletes non-seed products and customers of the demo shop (Req 3.9).
 * Existing order/receipt counters are kept so numbers are never reused. Runs in one transaction.
 */
export async function resetDemoShop(
  db: AwaazDb,
  now: () => Date = () => new Date(),
): Promise<void> {
  const ts = now().toISOString();
  const { shop, products, customers } = DEMO_SEED;
  const productIds = new Set(products.map((p) => p.id));
  const customerIds = new Set(customers.map((c) => c.id));

  await db.transaction('rw', db.shops, db.products, db.customers, async () => {
    const existing = await db.shops.get(shop.id);
    const shopRecord: ShopRecord = {
      id: shop.id,
      name: shop.name,
      currency: shop.currency,
      locale: shop.locale,
      isDemo: true,
      nextOrderSeq: existing?.nextOrderSeq ?? 1,
      nextReceiptSeq: existing?.nextReceiptSeq ?? 1,
      remoteShopId: existing?.remoteShopId ?? null,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
      syncVersion: existing?.syncVersion ?? 0,
    };
    await db.shops.put(shopRecord);

    await db.products.bulkPut(
      products.map((p): ProductRecord => ({
        id: p.id,
        shopId: shop.id,
        name: p.name,
        aliases: [...p.aliases],
        ...(p.brand ? { brand: p.brand } : {}),
        unit: p.unit,
        pricePaise: p.pricePaise,
        active: true,
        updatedAt: ts,
        deletedAt: null,
      })),
    );
    await db.customers.bulkPut(
      customers.map((c): CustomerRecord => ({
        id: c.id,
        shopId: shop.id,
        name: c.name,
        ...(c.notes ? { notes: c.notes } : {}),
        isSample: true,
        updatedAt: ts,
        deletedAt: null,
      })),
    );

    for (const p of await db.products.where('shopId').equals(shop.id).toArray()) {
      if (!productIds.has(p.id) && p.deletedAt === null) {
        await db.products.update(p.id, { deletedAt: ts, active: false, updatedAt: ts });
      }
    }
    for (const c of await db.customers.where('shopId').equals(shop.id).toArray()) {
      if (!customerIds.has(c.id) && c.deletedAt === null) {
        await db.customers.update(c.id, { deletedAt: ts, updatedAt: ts });
      }
    }
  });
}
