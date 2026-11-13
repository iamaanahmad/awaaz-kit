import { fc } from './common';
import type { SyncErrorKind } from './mutations';

/**
 * Fault plans script the behaviour of a fake `SyncRemote`, one step per remote write call.
 * `ok` lets the call succeed, `error` makes it throw a `SyncError` of the given kind,
 * `stale` (upserts only) reports a lost last-write-wins race. Calls beyond the plan succeed
 * (or repeat the last step when `repeatLast` is set, to model a long outage).
 */
export type FaultStep =
  | { kind: 'ok' }
  | { kind: 'error'; errorKind: SyncErrorKind }
  | { kind: 'stale' };

export interface FaultPlan {
  steps: FaultStep[];
  repeatLast: boolean;
}

export const ERROR_KINDS: readonly SyncErrorKind[] = [
  'network',
  'validation',
  'auth',
  'permission',
  'server',
];

export const errorKindArb: fc.Arbitrary<SyncErrorKind> = fc.constantFrom(...ERROR_KINDS);

export const faultStepArb: fc.Arbitrary<FaultStep> = fc.oneof(
  { weight: 5, arbitrary: fc.constant<FaultStep>({ kind: 'ok' }) },
  { weight: 4, arbitrary: errorKindArb.map((errorKind): FaultStep => ({ kind: 'error', errorKind })) },
  { weight: 1, arbitrary: fc.constant<FaultStep>({ kind: 'stale' }) },
);

/** A fault plan of 0..`maxSteps` steps. */
export const faultPlanArb = (maxSteps = 12): fc.Arbitrary<FaultPlan> =>
  fc.record({
    steps: fc.array(faultStepArb, { maxLength: maxSteps }),
    repeatLast: fc.boolean(),
  });

/** A plan that never fails and never reports stale. */
export const noFaultPlan: FaultPlan = { steps: [], repeatLast: false };

/** A plan where every call fails with the given kind (offline or server down). */
export const alwaysFailPlan = (errorKind: SyncErrorKind): FaultPlan => ({
  steps: [{ kind: 'error', errorKind }],
  repeatLast: true,
});

/** Step to apply to the n-th (0-based) remote call under `plan`. */
export function faultAt(plan: FaultPlan, callIndex: number): FaultStep {
  const step = plan.steps[callIndex];
  if (step) return step;
  if (plan.repeatLast && plan.steps.length > 0) return plan.steps[plan.steps.length - 1] as FaultStep;
  return { kind: 'ok' };
}

/** Backoff inputs: attempts so far, jitter in [0, 1) and an injected clock in ms. */
export const backoffInputArb: fc.Arbitrary<{ attempts: number; jitter: number; nowMs: number }> =
  fc.record({
    attempts: fc.integer({ min: 0, max: 30 }),
    jitter: fc.double({ min: 0, max: 0.999999, noNaN: true }),
    nowMs: fc.integer({ min: 1_704_067_200_000, max: 1_893_456_000_000 }),
  });
