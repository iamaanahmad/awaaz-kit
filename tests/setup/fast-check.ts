import fc from 'fast-check';

/**
 * Default number of fast-check runs per property (design: "Property-based testing configuration").
 * Do not go below this without a code comment explaining the cost.
 */
export const DEFAULT_NUM_RUNS = 100;

/**
 * Run a property with the project default of 100 runs.
 *
 * Tag convention: every property test carries a comment directly above it:
 *   // Feature: awaaz-kit, Property N: <property title>
 * and one test implements exactly one Correctness Property.
 *
 * Usage:
 *   // Feature: awaaz-kit, Property 25: Excess discount blocks finalization
 *   it('...', () => {
 *     assertProperty(fc.property(fc.nat(), (n) => n >= 0));
 *   });
 */
export function assertProperty<Ts extends unknown[]>(
  property: fc.IPropertyWithHooks<Ts> | fc.IAsyncPropertyWithHooks<Ts>,
  params: fc.Parameters<Ts> = {},
): void | Promise<void> {
  return fc.assert(property, { numRuns: DEFAULT_NUM_RUNS, ...params }) as void | Promise<void>;
}

export { fc };
