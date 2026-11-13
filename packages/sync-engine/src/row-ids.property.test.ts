import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { NS, headerRowId, itemRowId } from './row-ids';

/**
 * Independent oracle: RFC 4122 UUIDv5 computed with node:crypto SHA-1,
 * not with the package's hand-rolled implementation.
 */
function oracleUuidV5(name: string): string {
  const ns = Buffer.from(NS.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  const b = h.subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const x = b.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// Appwrite custom IDs: <= 36 chars of a-z A-Z 0-9 . - _ , first char alphanumeric.
const allowedChars = (s: string): boolean => [...s].every((c) => /[A-Za-z0-9._-]/.test(c));
const alnum = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9]/.test(c);

const mutationArb = fc.record({ mutationId: fc.uuid() });
const indexArb = fc.integer({ min: 0, max: 500 });

describe('row IDs (sync-engine)', () => {
  // Feature: awaaz-kit, Property 34: Remote row IDs are deterministic and valid
  // **Validates: Requirements 16.3**
  it('Property 34: Remote row IDs are deterministic and valid', () =>
    assertProperty(
      fc.property(
        fc.array(fc.tuple(mutationArb, indexArb), { minLength: 1, maxLength: 20 }),
        (pairs) => {
          const seen = new Map<string, string>(); // id -> pair key that produced it
          const claim = (id: string, key: string) => {
            const prev = seen.get(id);
            if (prev !== undefined && prev !== key) return false;
            seen.set(id, key);
            return true;
          };
          for (const [m, i] of pairs) {
            const header = headerRowId(m);
            const item = itemRowId(m, i);
            // deterministic across repeated derivations (fresh equal object too)
            expect(headerRowId({ mutationId: m.mutationId })).toBe(header);
            expect(itemRowId({ mutationId: m.mutationId }, i)).toBe(item);
            // matches the independent oracle
            expect(header).toBe(m.mutationId);
            expect(item).toBe(oracleUuidV5(`${m.mutationId}:item:${i}`));
            // valid Appwrite IDs
            for (const id of [header, item]) {
              expect(id.length).toBeLessThanOrEqual(36);
              expect(id.length).toBeGreaterThan(0);
              expect(allowedChars(id)).toBe(true);
              expect(alnum(id[0])).toBe(true);
            }
            // distinct for distinct (mutationId, index/header) pairs
            expect(claim(header, `h:${m.mutationId}`)).toBe(true);
            expect(claim(item, `i:${m.mutationId}:${i}`)).toBe(true);
          }
        },
      ),
    ));

  it('item IDs differ across indexes and across mutations (example)', () => {
    const a = { mutationId: '11111111-1111-4111-8111-111111111111' };
    const b = { mutationId: '22222222-2222-4222-8222-222222222222' };
    expect(itemRowId(a, 0)).not.toBe(itemRowId(a, 1));
    expect(itemRowId(a, 0)).not.toBe(itemRowId(b, 0));
    expect(itemRowId(a, 0)).not.toBe(headerRowId(a));
  });
});
