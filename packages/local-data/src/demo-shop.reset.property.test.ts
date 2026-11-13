import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import { DEMO_SEED, DEMO_SHOP_ID, resetDemoShop } from './demo-shop.js';
import { openDb } from './db.js';

const T = '2025-02-02T00:00:00.000Z';
const units = [...new Set(DEMO_SEED.products.map((p) => p.unit))];

type Edit =
  | { op: 'editProduct'; idx: number; name: string; price: number; unit: string; aliases: string[] }
  | { op: 'softDeleteProduct'; idx: number }
  | { op: 'hardDeleteProduct'; idx: number }
  | { op: 'deactivateProduct'; idx: number }
  | { op: 'addProduct'; n: number; name: string; price: number }
  | { op: 'editCustomer'; idx: number; name: string; phone: string }
  | { op: 'softDeleteCustomer'; idx: number }
  | { op: 'hardDeleteCustomer'; idx: number }
  | { op: 'addCustomer'; n: number; name: string };

const nameArb = fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0);
const pIdx = fc.nat({ max: DEMO_SEED.products.length - 1 });
const cIdx = fc.nat({ max: DEMO_SEED.customers.length - 1 });

const editArb: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({
    op: fc.constant('editProduct' as const),
    idx: pIdx,
    name: nameArb,
    price: fc.nat({ max: 1_000_000 }),
    unit: fc.constantFrom(...units),
    aliases: fc.array(nameArb, { maxLength: 3 }),
  }),
  fc.record({ op: fc.constant('softDeleteProduct' as const), idx: pIdx }),
  fc.record({ op: fc.constant('hardDeleteProduct' as const), idx: pIdx }),
  fc.record({ op: fc.constant('deactivateProduct' as const), idx: pIdx }),
  fc.record({
    op: fc.constant('addProduct' as const),
    n: fc.nat({ max: 5 }),
    name: nameArb,
    price: fc.nat({ max: 100_000 }),
  }),
  fc.record({
    op: fc.constant('editCustomer' as const),
    idx: cIdx,
    name: nameArb,
    phone: fc.stringMatching(/^[0-9]{10}$/),
  }),
  fc.record({ op: fc.constant('softDeleteCustomer' as const), idx: cIdx }),
  fc.record({ op: fc.constant('hardDeleteCustomer' as const), idx: cIdx }),
  fc.record({ op: fc.constant('addCustomer' as const), n: fc.nat({ max: 5 }), name: nameArb }),
);

describe('demo shop reset property', () => {
  // Feature: awaaz-kit, Property 33: Demo reset restores the seed
  // **Validates: Requirements 3.9**
  it('Property 33: Demo reset restores the seed', async () => {
    await assertProperty(
      fc.asyncProperty(fc.array(editArb, { maxLength: 25 }), async (edits) => {
        const db = await openDb({ name: `reset-${Math.random()}`, indexedDB: new IDBFactory() });
        try {
          await resetDemoShop(db, () => new Date(T));
          for (const e of edits) {
            switch (e.op) {
              case 'editProduct':
                await db.products.update(DEMO_SEED.products[e.idx]!.id, {
                  name: e.name,
                  pricePaise: e.price,
                  unit: e.unit as never,
                  aliases: e.aliases,
                });
                break;
              case 'softDeleteProduct':
                await db.products.update(DEMO_SEED.products[e.idx]!.id, { deletedAt: T });
                break;
              case 'hardDeleteProduct':
                await db.products.delete(DEMO_SEED.products[e.idx]!.id);
                break;
              case 'deactivateProduct':
                await db.products.update(DEMO_SEED.products[e.idx]!.id, { active: false });
                break;
              case 'addProduct':
                await db.products.put({
                  id: `extra-p-${e.n}`,
                  shopId: DEMO_SHOP_ID,
                  name: e.name,
                  aliases: [],
                  unit: 'kg',
                  pricePaise: e.price,
                  active: true,
                  updatedAt: T,
                  deletedAt: null,
                });
                break;
              case 'editCustomer':
                await db.customers.update(DEMO_SEED.customers[e.idx]!.id, {
                  name: e.name,
                  phone: e.phone,
                });
                break;
              case 'softDeleteCustomer':
                await db.customers.update(DEMO_SEED.customers[e.idx]!.id, { deletedAt: T });
                break;
              case 'hardDeleteCustomer':
                await db.customers.delete(DEMO_SEED.customers[e.idx]!.id);
                break;
              case 'addCustomer':
                await db.customers.put({
                  id: `extra-c-${e.n}`,
                  shopId: DEMO_SHOP_ID,
                  name: e.name,
                  isSample: false,
                  updatedAt: T,
                  deletedAt: null,
                });
                break;
            }
          }

          await resetDemoShop(db, () => new Date('2025-03-03T00:00:00.000Z'));

          const products = (await db.products.where('shopId').equals(DEMO_SHOP_ID).toArray())
            .filter((p) => p.deletedAt === null)
            .sort((a, b) => a.id.localeCompare(b.id));
          const customers = (await db.customers.where('shopId').equals(DEMO_SHOP_ID).toArray())
            .filter((c) => c.deletedAt === null)
            .sort((a, b) => a.id.localeCompare(b.id));

          const expectedProducts = DEMO_SEED.products
            .map((p) => ({
              id: p.id,
              name: p.name,
              brand: p.brand,
              unit: p.unit,
              pricePaise: p.pricePaise,
              aliases: p.aliases,
              active: true,
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
          const expectedCustomers = DEMO_SEED.customers
            .map((c) => ({ id: c.id, name: c.name, notes: c.notes, phone: undefined }))
            .sort((a, b) => a.id.localeCompare(b.id));

          expect(
            products.map((p) => ({
              id: p.id,
              name: p.name,
              brand: p.brand,
              unit: p.unit,
              pricePaise: p.pricePaise,
              aliases: p.aliases,
              active: p.active,
            })),
          ).toEqual(expectedProducts);
          expect(
            customers.map((c) => ({ id: c.id, name: c.name, notes: c.notes, phone: c.phone })),
          ).toEqual(expectedCustomers);
          expect(customers.every((c) => c.isSample)).toBe(true);
        } finally {
          db.close();
        }
      }),
    );
  });
});
