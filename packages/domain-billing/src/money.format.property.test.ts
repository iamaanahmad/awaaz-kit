import { describe, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { formatRupees, parseRupees } from './money';

/** Independent oracle: Indian grouping built from BigInt digits and string slicing. */
function expectedDisplay(paise: number): string {
  const p = BigInt(paise);
  const digits = (p / 100n).toString();
  const frac = (p % 100n).toString().padStart(2, '0');
  let head = digits;
  const groups: string[] = [];
  if (head.length > 3) {
    groups.unshift(head.slice(-3));
    head = head.slice(0, -3);
    while (head.length > 2) {
      groups.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    groups.unshift(head);
  } else {
    groups.push(head);
  }
  return `₹${groups.join(',')}.${frac}`;
}

// Mix of uniform values and boundary-heavy values (digit-count transitions, max safe int).
const paiseArb = fc.oneof(
  fc.integer({ min: 0, max: 10_000_000 }),
  fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  fc
    .tuple(fc.integer({ min: 0, max: 15 }), fc.integer({ min: -2, max: 2 }))
    .map(([e, d]) => Math.min(Math.max(10 ** e + d, 0), Number.MAX_SAFE_INTEGER)),
);

describe('formatRupees property', () => {
  // Feature: awaaz-kit, Property 26: Rupee display round-trips the paise value
  // **Validates: Requirements 14.7**
  it('Property 26: Rupee display round-trips the paise value', () =>
    assertProperty(
      fc.property(paiseArb, (paise) => {
        const text = formatRupees(paise);
        // Round trip.
        if (parseRupees(text) !== paise) return false;
        // Independent oracle for the display form.
        return text === expectedDisplay(paise);
      }),
    ));
});
