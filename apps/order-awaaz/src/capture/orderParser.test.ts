import { describe, expect, it } from 'vitest';
import type { CustomerRecord, ProductRecord } from '@awaaz-kit/local-data';
import { createOrderParser } from './orderParser';

const SHOP = 'shop-1';
const T = '2025-01-01T00:00:00.000Z';

const product = (
  id: string,
  name: string,
  aliases: string[],
  unit: ProductRecord['unit'],
): ProductRecord => ({
  id,
  shopId: SHOP,
  name,
  aliases,
  unit,
  pricePaise: 5000,
  active: true,
  updatedAt: T,
  deletedAt: null,
});

const products = [
  product('p-atta', 'Wheat flour', ['atta', 'aata'], 'kg'),
  product('p-oil', 'Cooking oil', ['tel', 'oil'], 'litre'),
  product('p-rice', 'Rice', ['chawal', 'rice'], 'kg'),
];

const customer: CustomerRecord = {
  id: 'c-1',
  shopId: SHOP,
  name: 'Ramesh',
  isSample: true,
  updatedAt: T,
  deletedAt: null,
};

let n = 0;
const makeId = (): string => `id-${++n}`;

describe('createOrderParser', () => {
  it('parses the sample utterance into three confirmed lines', () => {
    const parse = createOrderParser({
      shopId: SHOP,
      products,
      customers: [],
      selectedCustomerId: null,
      makeId,
    });
    const draft = parse('do kilo aata, ek litre tel aur paanch kilo chawal');
    expect(draft.lines.map((l) => l.product.value?.productId)).toEqual([
      'p-atta',
      'p-oil',
      'p-rice',
    ]);
    expect(draft.lines.map((l) => l.quantityMilli.value)).toEqual([2000, 1000, 5000]);
    expect(draft.walkIn).toBe(true);
  });

  it('applies the customer chosen on the screen', () => {
    const parse = createOrderParser({
      shopId: SHOP,
      products,
      customers: [customer],
      selectedCustomerId: 'c-1',
      makeId,
    });
    const draft = parse('do kilo aata');
    expect(draft.customerId).toBe('c-1');
    expect(draft.walkIn).toBe(false);
  });
});
