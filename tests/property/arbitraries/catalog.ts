import { fc, isoDateArb, pricePaiseArb, uuidArb, type CanonicalUnit } from './common';

/** Structurally identical to `CatalogProduct` in `@awaaz-kit/catalog-matcher`. */
export interface CatalogProductData {
  id: string;
  shopId: string;
  name: string;
  aliases: string[];
  unit: CanonicalUnit;
  pricePaise: number;
  brand?: string;
  active: boolean;
  deletedAt: string | null;
}

/**
 * One entry of the fictional product pool. Every spelling is unique across the pool, so a
 * generated catalog never contains an accidental alias collision (matches stay unambiguous).
 */
export interface PoolEntry {
  /** English display name. */
  name: string;
  /** Devanagari spelling used by Hindi templates. */
  hi: string;
  /** Romanised spelling used by Hinglish templates. */
  hinglish: string;
  unit: CanonicalUnit;
}

export const PRODUCT_POOL: readonly PoolEntry[] = [
  { name: 'Sugar', hi: 'चीनी', hinglish: 'chini', unit: 'kg' },
  { name: 'Wheat Flour', hi: 'आटा', hinglish: 'aata', unit: 'kg' },
  { name: 'Basmati Rice', hi: 'चावल', hinglish: 'chawal', unit: 'kg' },
  { name: 'Toor Dal', hi: 'अरहर दाल', hinglish: 'arhar dal', unit: 'kg' },
  { name: 'Moong Dal', hi: 'मूंग दाल', hinglish: 'moong dal', unit: 'kg' },
  { name: 'Salt', hi: 'नमक', hinglish: 'namak', unit: 'kg' },
  { name: 'Potato', hi: 'आलू', hinglish: 'aalu', unit: 'kg' },
  { name: 'Onion', hi: 'प्याज', hinglish: 'pyaaz', unit: 'kg' },
  { name: 'Tomato', hi: 'टमाटर', hinglish: 'tamatar', unit: 'kg' },
  { name: 'Milk', hi: 'दूध', hinglish: 'doodh', unit: 'litre' },
  { name: 'Mustard Oil', hi: 'सरसों तेल', hinglish: 'sarson tel', unit: 'litre' },
  { name: 'Refined Oil', hi: 'रिफाइंड तेल', hinglish: 'refined tel', unit: 'litre' },
  { name: 'Tea Leaves', hi: 'चायपत्ती', hinglish: 'chaipatti', unit: 'kg' },
  { name: 'Bread', hi: 'ब्रेड', hinglish: 'bread', unit: 'piece' },
  { name: 'Eggs', hi: 'अंडे', hinglish: 'ande', unit: 'piece' },
  { name: 'Butter', hi: 'मक्खन', hinglish: 'makkhan', unit: 'piece' },
  { name: 'Soap', hi: 'साबुन', hinglish: 'sabun', unit: 'piece' },
  { name: 'Biscuits', hi: 'बिस्कुट', hinglish: 'biscuit', unit: 'piece' },
  { name: 'Noodles', hi: 'नूडल्स', hinglish: 'noodles', unit: 'piece' },
  { name: 'Jaggery', hi: 'गुड़', hinglish: 'gud', unit: 'kg' },
  { name: 'Turmeric Powder', hi: 'हल्दी', hinglish: 'haldi', unit: 'g' },
  { name: 'Red Chilli Powder', hi: 'लाल मिर्च', hinglish: 'lal mirch', unit: 'g' },
  { name: 'Cumin', hi: 'जीरा', hinglish: 'jeera', unit: 'g' },
  { name: 'Coconut Water', hi: 'नारियल पानी', hinglish: 'nariyal paani', unit: 'ml' },
];

/** Lower-case English alias used by English templates (the display name, case folded). */
export const englishAlias = (p: PoolEntry): string => p.name.toLowerCase();

/** A catalog together with the pool entry each product was built from. */
export interface GeneratedCatalog {
  shopId: string;
  products: CatalogProductData[];
  /** Same order as `products`. */
  entries: PoolEntry[];
}

/**
 * A catalog of 3..12 distinct products from the pool with Hindi, Hinglish and English aliases,
 * random UUIDs and prices. All products are active and not deleted.
 */
export const catalogArb: fc.Arbitrary<GeneratedCatalog> = fc
  .record({
    shopId: uuidArb,
    picked: fc.uniqueArray(fc.integer({ min: 0, max: PRODUCT_POOL.length - 1 }), {
      minLength: 3,
      maxLength: 12,
    }),
  })
  .chain(({ shopId, picked }) =>
    fc
      .tuple(
        fc.uniqueArray(uuidArb, { minLength: picked.length, maxLength: picked.length }),
        fc.array(pricePaiseArb, { minLength: picked.length, maxLength: picked.length }),
      )
      .map(([ids, prices]) => {
        const entries = picked.map((i) => PRODUCT_POOL[i] as PoolEntry);
        const products = entries.map(
          (e, k): CatalogProductData => ({
            id: ids[k] as string,
            shopId,
            name: e.name,
            // Romanised and English spellings may coincide (e.g. "bread"); keep one copy.
            aliases: [...new Set([e.hi, e.hinglish, englishAlias(e)])],
            unit: e.unit,
            pricePaise: prices[k] as number,
            active: true,
            deletedAt: null,
          }),
        );
        return { shopId, products, entries };
      }),
  );

/** Catalog product `updatedAt`-style timestamps for records that need one. */
export const updatedAtArb = isoDateArb;
