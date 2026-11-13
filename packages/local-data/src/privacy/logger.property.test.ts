import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../../tests/setup/fast-check.js';
import { createLogger, REDACTED_KEYS, type LogLevel } from './logger.js';

// Secret values: unique marker prefix plus letters (Latin or Devanagari), never digits,
// so they cannot collide with keys, other fields or the phone pattern.
const letter = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'आलूप्याजदूधचीनीआटाकिलो'.split(''),
  ' ',
);
const secretArb = (tag: string) =>
  fc.array(letter, { minLength: 6, maxLength: 24 }).map((cs) => `${tag}${cs.join('')}`);

const digit = fc.integer({ min: 0, max: 9 }).map(String);
const phoneArb = fc
  .tuple(
    fc.array(digit, { minLength: 10, maxLength: 10 }),
    fc.constantFrom('', ' ', '-', '.'),
  )
  .map(([ds, sep]) => (sep === '' ? ds.join('') : ds.join(sep)));
const phoneDigits = (p: string) => p.replace(/\D/g, '');

const keyArb = fc.constantFrom(...REDACTED_KEYS);
const levelArb = fc.constantFrom<LogLevel>('debug', 'info', 'warn', 'error');

type Scenario = {
  level: LogLevel;
  key: string;
  keyCase: 'same' | 'upper';
  secret: string;
  nestedSecret: string;
  freePhone: string;
  messagePhone: string;
  shape: 'flat' | 'nested' | 'array';
};

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  level: levelArb,
  key: keyArb,
  keyCase: fc.constantFrom<'same' | 'upper'>('same', 'upper'),
  secret: secretArb('SECRETA'),
  nestedSecret: secretArb('SECRETB'),
  freePhone: phoneArb,
  messagePhone: phoneArb,
  shape: fc.constantFrom<'flat' | 'nested' | 'array'>('flat', 'nested', 'array'),
});

function build(s: Scenario): unknown {
  const key = s.keyCase === 'upper' ? s.key.toUpperCase() : s.key;
  const base = {
    id: 'bill-1',
    count: 3,
    [key]: s.secret,
    // sensitive key holding a structured value (e.g. a receipt payload)
    payload: { lines: [{ name: s.nestedSecret }] },
    memo: `call ${s.freePhone} today`,
  };
  if (s.shape === 'nested') return { outer: { inner: base } };
  if (s.shape === 'array') return [{ wrap: [base] }];
  return base;
}

describe('createLogger redaction', () => {
  // Feature: awaaz-kit, Property 30: Logging redacts sensitive content
  // **Validates: Requirements 15.10**
  it('Property 30: Logging redacts sensitive content', () =>
    assertProperty(
      fc.property(scenarioArb, (s) => {
        const calls: Array<{ level: LogLevel; message: string; data: unknown[] }> = [];
        const logger = createLogger((level, message, data) => calls.push({ level, message, data }));
        logger[s.level](`sync failed for ${s.messagePhone}`, build(s));

        expect(calls).toHaveLength(1);
        const out = JSON.stringify(calls[0]);
        expect(out).not.toContain(s.secret);
        expect(out).not.toContain(s.nestedSecret);
        expect(out).not.toContain(s.freePhone);
        expect(out).not.toContain(s.messagePhone);
        expect(out).not.toContain(phoneDigits(s.freePhone));
        expect(out).not.toContain(phoneDigits(s.messagePhone));
        // non-sensitive fields still logged
        expect(out).toContain('bill-1');
      }),
    ));
});
