import { normalize } from '@awaaz-kit/language-normalizer';
import { describe, expect, it } from 'vitest';
import { extract, extractCustomer } from './customer.js';

const ctx = { locale: 'en-IN' } as const;
const run = (s: string) => extract(normalize(s), ctx);

describe('customer name', () => {
  it("reads 'Ramesh ka bill banao'", () => {
    const r = run('Ramesh ka bill banao');
    expect(r.customerName).toMatchObject({
      value: 'Ramesh',
      status: 'confirmed',
      sourceText: 'Ramesh',
    });
    expect(r.lines).toEqual([]);
  });

  it("reads 'for Ramesh' and keeps items", () => {
    const r = run('for Ramesh do kilo aata aur ek litre tel');
    expect(r.customerName?.value).toBe('Ramesh');
    expect(r.lines.map((l) => l.productPhrase.value)).toEqual(['aata', 'tel']);
  });

  it('reads Devanagari names', () => {
    expect(run('रमेश का बिल बनाओ').customerName?.value).toBe('रमेश');
  });

  it('is absent when not spoken', () => {
    const r = run('do kilo aata');
    expect(r.customerName).toBeUndefined();
    expect(r.customerPhone).toBeUndefined();
    expect(r.lines).toHaveLength(1);
  });

  it('uses known customer name casing', () => {
    const r = extract(normalize('for ramesh'), { ...ctx, knownCustomerNames: ['Ramesh'] });
    expect(r.customerName?.value).toBe('Ramesh');
  });
});

describe('customer phone', () => {
  it('reads a 10-digit mobile with source text', () => {
    const raw = 'Ramesh ka bill banao phone 9876543210';
    const r = run(raw);
    expect(r.customerPhone).toMatchObject({ value: '9876543210', sourceText: '9876543210' });
    expect(r.customerName?.value).toBe('Ramesh');
    expect(r.lines).toEqual([]);
  });

  it('accepts +91 prefix and spaces', () => {
    expect(run('+91 98765 43210 ke liye aata').customerPhone?.value).toBe('9876543210');
  });

  it('accepts Devanagari digits', () => {
    expect(run('९८७६५४३२१०').customerPhone?.value).toBe('9876543210');
  });

  it('rejects numbers that are not Indian mobiles', () => {
    expect(run('1234567890').customerPhone).toBeUndefined();
    expect(run('98765432101').customerPhone).toBeUndefined();
    expect(run('98765').customerPhone).toBeUndefined();
  });

  it('does not mistake quantities for a phone', () => {
    const r = run('do kilo aata aur 5 kg chawal');
    expect(r.customerPhone).toBeUndefined();
    expect(r.lines).toHaveLength(2);
  });

  it('is pure', () => {
    const n = normalize('for Ramesh 9876543210');
    expect(extractCustomer(n, ctx)).toEqual(extractCustomer(n, ctx));
  });
});
