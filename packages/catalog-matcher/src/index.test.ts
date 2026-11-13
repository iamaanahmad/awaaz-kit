import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from './index.js';

const p = (over: Partial<CatalogProduct> & { id: string }): CatalogProduct => ({
  shopId: 's1',
  name: 'Item',
  aliases: [],
  unit: 'kg',
  pricePaise: 1000,
  active: true,
  deletedAt: null,
  ...over,
});

describe('buildIndex exact lookup', () => {
  const atta = p({ id: 'a', name: 'Wheat Flour', aliases: ['aata', 'atta'] });

  it('matches by alias with spelling variants', () => {
    const r = buildIndex('s1', [atta]).match('ata');
    expect(r).toMatchObject({ kind: 'exact', via: 'alias' });
  });

  it('matches by name', () => {
    expect(buildIndex('s1', [atta]).match('Wheat Flour')).toMatchObject({
      kind: 'exact',
      via: 'name',
    });
  });

  it('returns unmatched for unknown phrases', () => {
    expect(buildIndex('s1', [atta]).match('laptop')).toEqual({ kind: 'unmatched' });
  });

  it('ignores inactive, deleted and foreign-shop products', () => {
    const idx = buildIndex('s1', [
      p({ id: '1', name: 'Rice', active: false }),
      p({ id: '2', name: 'Rice', deletedAt: '2025-01-01T00:00:00Z' }),
      p({ id: '3', name: 'Rice', shopId: 's2' }),
    ]);
    expect(idx.match('rice')).toEqual({ kind: 'unmatched' });
  });

  it('reports shared aliases as ambiguous', () => {
    const idx = buildIndex('s1', [
      p({ id: '1', name: 'Amul Butter', aliases: ['amul'] }),
      p({ id: '2', name: 'Amul Milk', aliases: ['amul'] }),
    ]);
    const r = idx.match('amul');
    expect(r.kind).toBe('ambiguous');
  });
});

describe('buildIndex fuzzy suggestions', () => {
  const catalog = [
    p({ id: 'r', name: 'Basmati Rice', aliases: ['chawal'], brand: 'India Gate' }),
    p({ id: 'o', name: 'Cooking Oil', aliases: ['tel'], unit: 'litre' }),
  ];

  it('suggests close misspellings without picking exact', () => {
    const r = buildIndex('s1', catalog).match('basmti rice');
    expect(r.kind).toBe('suggestions');
    if (r.kind === 'suggestions') {
      expect(r.candidates.length).toBeLessThanOrEqual(3);
      expect(r.candidates[0]?.id).toBe('r');
      expect(r.candidates[0]?.brand).toBe('India Gate');
    }
  });

  it('reports near-equal fuzzy matches as ambiguous', () => {
    const idx = buildIndex('s1', [
      p({ id: '1', name: 'Amul Butter' }),
      p({ id: '2', name: 'Amul Butte' }),
    ]);
    const r = idx.match('amul buttr');
    expect(r.kind).toBe('ambiguous');
  });

  it('caps candidates at three', () => {
    const many = ['1', '2', '3', '4', '5'].map((id) =>
      p({ id, name: 'Amul Ghee', aliases: ['amul'] }),
    );
    const r = buildIndex('s1', many).match('amul');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates).toHaveLength(3);
  });

  it('stays unmatched for unrelated phrases and blanks', () => {
    const idx = buildIndex('s1', catalog);
    expect(idx.match('laptop')).toEqual({ kind: 'unmatched' });
    expect(idx.match('  ')).toEqual({ kind: 'unmatched' });
  });
});
