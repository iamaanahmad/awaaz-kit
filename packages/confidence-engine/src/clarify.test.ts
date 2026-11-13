import { describe, expect, it } from 'vitest';
import { applyUserValue, nextClarification } from './clarify.js';
import type { ResolvedLine } from './resolve.js';

const line = (id: string, over: Partial<ResolvedLine> = {}): ResolvedLine => ({
  lineId: id,
  product: { value: { productId: 'p', name: 'P' }, status: 'confirmed' },
  quantityMilli: { value: 1000, status: 'confirmed' },
  unit: { value: 'kg', status: 'confirmed' },
  candidates: [],
  spokenName: 'aata',
  ...over,
});

describe('applyUserValue', () => {
  it('confirms only the given field', () => {
    const l = line('a', { quantityMilli: { value: null, status: 'missing' } });
    const out = applyUserValue(l, 'quantityMilli', 2000);
    expect(out.quantityMilli).toMatchObject({ value: 2000, status: 'confirmed' });
    expect(out.product).toBe(l.product);
    expect(out.unit).toBe(l.unit);
    expect(l.quantityMilli.status).toBe('missing');
  });
});

describe('nextClarification', () => {
  it('returns null when all confirmed', () => {
    expect(nextClarification([line('a'), line('b')])).toBeNull();
    expect(nextClarification([])).toBeNull();
  });

  it('picks the first unresolved field in line order', () => {
    const lines = [
      line('a'),
      line('b', {
        quantityMilli: { value: null, status: 'missing' },
        unit: { value: null, status: 'needs_review' },
      }),
      line('c', { product: { value: null, status: 'unmatched' } }),
    ];
    const c = nextClarification(lines);
    expect(c).toMatchObject({ lineId: 'b', lineIndex: 1, field: 'quantityMilli' });
    expect(c?.prompt).toBe('Kitni quantity?');
  });
});
