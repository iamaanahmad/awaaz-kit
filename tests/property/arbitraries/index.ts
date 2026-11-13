/**
 * Shared fast-check arbitraries for cross-package and package property tests.
 *
 * import { catalogArb, utteranceArb, billArb, faultPlanArb } from '../../tests/property/arbitraries';
 *
 * Generators stay inside the valid input space and do not import workspace packages, so the
 * oracles built on them stay independent of the code under test.
 */
export * from './common';
export * from './catalog';
export * from './utterances';
export * from './drafts';
export * from './bills';
export * from './mutations';
export * from './faults';
