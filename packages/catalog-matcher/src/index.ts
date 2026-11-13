import Fuse from 'fuse.js';
import { foldForMatching } from '@awaaz-kit/language-normalizer';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';

export interface CatalogProduct {
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

export type MatchResult =
  | { kind: 'exact'; product: CatalogProduct; via: 'alias' | 'name' }
  | { kind: 'ambiguous'; candidates: CatalogProduct[] }
  | { kind: 'suggestions'; candidates: CatalogProduct[] }
  | { kind: 'unmatched' };

export interface CatalogIndex {
  match(phrase: string): MatchResult;
}

interface ExactEntry {
  product: CatalogProduct;
  via: 'alias' | 'name';
}

const MAX_CANDIDATES = 3;
/** Fuse score threshold (0 exact, 1 anything). */
const FUZZY_THRESHOLD = 0.4;
/** Top fuzzy candidates within this score margin are treated as a tie. */
const TIE_MARGIN = 0.05;

interface FuzzyDoc {
  key: string;
  product: CatalogProduct;
}

/**
 * Builds a matching index over the products of one shop.
 * Only active, non-deleted products of `shopId` are indexed.
 * Exact folded matches win; otherwise Fuse.js yields up to three suggestions.
 * Near-equal fuzzy scores are reported as `ambiguous`; the matcher never picks one.
 */
export function buildIndex(shopId: string, products: readonly CatalogProduct[]): CatalogIndex {
  const eligible = products.filter(
    (p) => p.shopId === shopId && p.active === true && p.deletedAt === null,
  );

  // folded key -> distinct products (insertion order), name wins over alias per product
  const exact = new Map<string, Map<string, ExactEntry>>();
  const add = (key: string, product: CatalogProduct, via: 'alias' | 'name'): void => {
    if (key === '') return;
    let bucket = exact.get(key);
    if (!bucket) {
      bucket = new Map();
      exact.set(key, bucket);
    }
    const existing = bucket.get(product.id);
    if (!existing || (existing.via === 'alias' && via === 'name')) {
      bucket.set(product.id, { product, via });
    }
  };

  for (const product of eligible) {
    add(foldForMatching(product.name), product, 'name');
    for (const alias of product.aliases) {
      add(foldForMatching(alias), product, 'alias');
    }
  }

  const docs: FuzzyDoc[] = [];
  for (const [key, bucket] of exact) {
    for (const entry of bucket.values()) docs.push({ key, product: entry.product });
  }
  const fuse = new Fuse(docs, {
    keys: ['key'],
    includeScore: true,
    threshold: FUZZY_THRESHOLD,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const fuzzy = (folded: string): MatchResult => {
    if (folded === '') return { kind: 'unmatched' };
    // best (lowest) score per distinct product, in rank order
    const best = new Map<string, { product: CatalogProduct; score: number }>();
    for (const hit of fuse.search(folded)) {
      const score = hit.score ?? 1;
      const prev = best.get(hit.item.product.id);
      if (!prev || score < prev.score)
        best.set(hit.item.product.id, { product: hit.item.product, score });
    }
    const ranked = [...best.values()].sort((a, b) => a.score - b.score);
    const [top, second] = ranked;
    if (!top) return { kind: 'unmatched' };
    if (second && second.score - top.score <= TIE_MARGIN) {
      const tied = ranked.filter((r) => r.score - top.score <= TIE_MARGIN);
      return {
        kind: 'ambiguous',
        candidates: tied.slice(0, MAX_CANDIDATES).map((r) => r.product),
      };
    }
    return {
      kind: 'suggestions',
      candidates: ranked.slice(0, MAX_CANDIDATES).map((r) => r.product),
    };
  };

  return {
    match(phrase: string): MatchResult {
      const folded = foldForMatching(phrase);
      const bucket = exact.get(folded);
      if (!bucket || bucket.size === 0) return fuzzy(folded);
      const entries = [...bucket.values()];
      if (entries.length === 1) {
        const [only] = entries as [ExactEntry];
        return { kind: 'exact', product: only.product, via: only.via };
      }
      return {
        kind: 'ambiguous',
        candidates: entries.slice(0, MAX_CANDIDATES).map((e) => e.product),
      };
    },
  };
}
