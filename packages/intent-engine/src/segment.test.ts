import { normalize } from '@awaaz-kit/language-normalizer';
import { describe, expect, it } from 'vitest';
import { extractLines } from './segment.js';

const run = (s: string) => extractLines(normalize(s));

describe('extractLines', () => {
  it('binds number unit phrase', () => {
    const [l] = run('do kilo aata');
    expect(l?.productPhrase.value).toBe('aata');
    expect(l?.quantityMilli.value).toBe(2000);
    expect(l?.unit.value).toBe('kg');
    expect(l?.unit.sourceText).toBe('kilo');
  });

  it('binds phrase first order', () => {
    const [l] = run('aata do kilo');
    expect(l?.productPhrase.value).toBe('aata');
    expect(l?.quantityMilli.value).toBe(2000);
    expect(l?.unit.value).toBe('kg');
  });

  it('yields null quantity when missing', () => {
    const [l] = run('aata');
    expect(l?.quantityMilli).toMatchObject({ value: null, status: 'missing' });
  });

  it('splits on mixed separators in spoken order', () => {
    const lines = run('do kilo aata aur 1 litre tel, chini 3 kg and namak plus dal');
    expect(lines.map((l) => l.productPhrase.value)).toEqual([
      'aata',
      'tel',
      'chini',
      'namak',
      'dal',
    ]);
    expect(lines.map((l) => l.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('splits on the danda', () => {
    expect(run('aata \u0964 chini')).toHaveLength(2);
  });

  it('returns empty for no recognizable item', () => {
    expect(run('')).toEqual([]);
    expect(run('do kilo')).toEqual([]);
    expect(run('aur , aur')).toEqual([]);
  });

  it('is deterministic', () => {
    expect(run('do kilo aata aur tel')).toEqual(run('do kilo aata aur tel'));
  });
});
