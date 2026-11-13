import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DEMO_SEED, DEMO_SHOP_ID, resetDemoShop } from './demo-shop.js';
import { openDb } from './db.js';

async function setup() {
  return openDb({ name: `demo-${Math.random()}`, indexedDB: new IDBFactory() });
}

describe('demo shop seed', () => {
  it('is fictional, labelled, and sized per Req 3.3', () => {
    expect(DEMO_SEED.shop.name).toBe('Sharma Kirana (Demo)');
    expect(DEMO_SEED.products.length).toBeGreaterThanOrEqual(20);
    expect(DEMO_SEED.products.length).toBeLessThanOrEqual(30);
    expect(DEMO_SEED.customers).toHaveLength(5);
    expect(DEMO_SEED.customers.every((c) => c.name.includes('(Sample)'))).toBe(true);
  });

  it('has unique ids and aliases for the PRD examples', () => {
    const ids = [...DEMO_SEED.products, ...DEMO_SEED.customers].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const aliases = DEMO_SEED.products.flatMap((p) => p.aliases.map((a) => a.toLowerCase()));
    for (const a of ['aata', 'tel', 'chawal', 'amul gold', 'chini', 'chai patti']) {
      expect(aliases).toContain(a);
    }
  });

  it('reset restores seed after edits, additions and deletions', async () => {
    const db = await setup();
    await resetDemoShop(db);
    const first = DEMO_SEED.products[0]!;
    await db.products.update(first.id, { pricePaise: 1, deletedAt: 'x', active: false });
    await db.products.put({
      id: 'extra',
      shopId: DEMO_SHOP_ID,
      name: 'Extra',
      aliases: [],
      unit: 'kg',
      pricePaise: 1,
      active: true,
      updatedAt: 'x',
      deletedAt: null,
    });
    await db.customers.update(DEMO_SEED.customers[0]!.id, { deletedAt: 'x' });
    await db.shops.update(DEMO_SHOP_ID, { nextOrderSeq: 7 });

    await resetDemoShop(db);

    const active = (await db.products.where('shopId').equals(DEMO_SHOP_ID).toArray()).filter(
      (p) => p.deletedAt === null,
    );
    expect(active.map((p) => p.id).sort()).toEqual(DEMO_SEED.products.map((p) => p.id).sort());
    expect(active.find((p) => p.id === first.id)?.pricePaise).toBe(first.pricePaise);
    const custs = (await db.customers.toArray()).filter((c) => c.deletedAt === null);
    expect(custs).toHaveLength(5);
    expect((await db.shops.get(DEMO_SHOP_ID))?.nextOrderSeq).toBe(7);
    db.close();
  });
});
