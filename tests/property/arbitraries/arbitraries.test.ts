import { describe, expect, it } from 'vitest';
import { assertProperty } from '../../setup/fast-check';
import {
  billDraftArb,
  billArb,
  catalogArb,
  completeBillDraftArb,
  duplicatedMutationListArb,
  excessDiscountBillArb,
  faultAt,
  faultPlanArb,
  fc,
  mutationListArb,
  oracleTotals,
  orderDraftArb,
  uncertainUtteranceArb,
  utteranceArb,
  validBillArb,
  alwaysFailPlan,
  type GeneratedCatalog,
} from './index';

// Arbitraries self-test (not a numbered Correctness Property).
// Validates the generators' own invariants: Requirements 19.2

const withCatalog = <T>(make: (c: GeneratedCatalog) => fc.Arbitrary<T>) =>
  catalogArb.chain((c) => make(c).map((v) => ({ c, v })));

describe('shared arbitraries', () => {
  it('catalog has unique ids and unique aliases', () => {
    assertProperty(
      fc.property(catalogArb, (c) => {
        const ids = new Set(c.products.map((p) => p.id));
        const aliases = c.products.flatMap((p) => p.aliases);
        expect(ids.size).toBe(c.products.length);
        expect(new Set(aliases).size).toBe(aliases.length);
        expect(c.products.length).toBeGreaterThanOrEqual(3);
      }),
    );
  });

  it('utterances mention every expected product and use the catalog unit', () => {
    assertProperty(
      fc.property(withCatalog((c) => utteranceArb(c)), ({ c, v }) => {
        expect(v.lines.length).toBeGreaterThan(0);
        for (const line of v.lines) {
          const entry = c.entries[line.productIndex]!;
          expect(line.unit).toBe(entry.unit);
          const alias = v.lang === 'hi' ? entry.hi : v.lang === 'hinglish' ? entry.hinglish : entry.name.toLowerCase();
          expect(v.text).toContain(alias);
        }
        expect(new Set(v.lines.map((l) => l.productIndex)).size).toBe(v.lines.length);
      }),
    );
  });

  it('uncertain utterances are non-empty', () => {
    assertProperty(
      fc.property(withCatalog(uncertainUtteranceArb), ({ v }) => v.text.length > 0),
    );
  });

  it('bill oracle: valid bills never exceed discount, excess bills always do', () => {
    assertProperty(
      fc.property(validBillArb, (b) => oracleTotals(b).total !== null),
    );
    assertProperty(
      fc.property(excessDiscountBillArb, (b) => oracleTotals(b).total === null),
    );
    assertProperty(fc.property(billArb, (b) => oracleTotals(b).subtotal >= 0n));
  });

  it('half-up oracle rounds an exact half up', () => {
    const t = oracleTotals({ lines: [{ unitPricePaise: 1, qtyMilli: 500 }], discountPaise: 0, taxPaise: 0 });
    expect(t.lineTotals[0]).toBe(1n);
  });

  it('draft statuses follow the status table', () => {
    assertProperty(
      fc.property(withCatalog(billDraftArb), ({ v }) => {
        for (const l of v.lines) {
          for (const f of [l.product, l.quantityMilli, l.unit, l.price]) {
            if (f.status === 'confirmed') expect(f.value).not.toBeNull();
            if (f.status === 'missing' || f.status === 'unmatched') expect(f.value).toBeNull();
          }
          expect(l.candidates.length).toBeLessThanOrEqual(3);
        }
      }),
    );
    assertProperty(
      fc.property(withCatalog(orderDraftArb), ({ v }) => {
        if (v.walkIn) expect(v.customerId).toBeNull();
      }),
    );
  });

  it('complete bill drafts have all lines confirmed and a valid discount', () => {
    assertProperty(
      fc.property(withCatalog(completeBillDraftArb), ({ v }) => {
        const subtotal = v.lines.reduce(
          (a, l) => a + (BigInt(l.price.value!) * BigInt(l.quantityMilli.value!) + 500n) / 1000n,
          0n,
        );
        expect(BigInt(v.discountPaise) <= subtotal).toBe(true);
        expect(v.lines.every((l) => l.product.status === 'confirmed')).toBe(true);
      }),
    );
  });

  it('mutation lists have unique ids and duplicated delivery covers every mutation', () => {
    const shop = '11111111-1111-4111-8111-111111111111';
    assertProperty(
      fc.property(mutationListArb(shop), (list) => {
        expect(new Set(list.map((m) => m.mutationId)).size).toBe(list.length);
        expect(new Set(list.map((m) => m.entityId)).size).toBe(list.length);
      }),
      { numRuns: 50 },
    );
    assertProperty(
      fc.property(duplicatedMutationListArb(shop), ({ unique, delivered }) => {
        const ids = new Set(delivered.map((m) => m.mutationId));
        expect(ids.size).toBe(unique.length);
        expect(delivered.length).toBeGreaterThanOrEqual(unique.length);
      }),
      { numRuns: 50 },
    );
  });

  it('fault plans resolve a step for any call index', () => {
    assertProperty(
      fc.property(faultPlanArb(), fc.nat({ max: 40 }), (plan, i) => {
        expect(['ok', 'error', 'stale']).toContain(faultAt(plan, i).kind);
      }),
    );
    expect(faultAt(alwaysFailPlan('network'), 99)).toEqual({ kind: 'error', errorKind: 'network' });
  });
});
