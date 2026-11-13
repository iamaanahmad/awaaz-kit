import type { CatalogLookup, WorkflowAdapter } from './workflow.js';

declare const confirmedBrand: unique symbol;
declare const evidenceBrand: unique symbol;

/** Runtime brand key (module-private; not re-exported from the package index). */
const CONFIRMED_KEY: unique symbol = Symbol('awaaz.confirmedAction') as never;

export type UserConfirmation = {
  kind: 'user_confirm';
  at: string;
  draftRevision: number;
};

/** Thrown when a draft cannot be confirmed or evidence is missing/invalid. */
export class NotConfirmableError extends Error {
  readonly reason: 'cannot_confirm' | 'missing_evidence' | 'untrusted_event';

  constructor(reason: 'cannot_confirm' | 'missing_evidence' | 'untrusted_event', message: string) {
    super(message);
    this.name = 'NotConfirmableError';
    this.reason = reason;
  }
}

/** Minimal shape of a (React) click event the UI hands over. */
export interface TrustedClickEventLike {
  readonly isTrusted: boolean;
  readonly type: string;
}

export type UserConfirmationEvidence = Readonly<{
  [evidenceBrand]: true;
  confirmation: UserConfirmation;
}>;

const mintedEvidence = new WeakSet<object>();
const mintedActions = new WeakSet<object>();

/**
 * Creates evidence from a UI click event. Requires `isTrusted === true` and
 * `type === "click"`. Intended to be called only from `<ConfirmButton>`.
 */
export function createUserConfirmationEvidence(
  event: TrustedClickEventLike,
  draftRevision: number,
  now: () => Date = () => new Date(),
): UserConfirmationEvidence {
  if (
    event === null ||
    typeof event !== 'object' ||
    event.isTrusted !== true ||
    event.type !== 'click'
  ) {
    throw new NotConfirmableError(
      'untrusted_event',
      'Confirmation requires a trusted user click event.',
    );
  }
  const evidence = Object.freeze({
    confirmation: Object.freeze({
      kind: 'user_confirm' as const,
      at: now().toISOString(),
      draftRevision,
    }),
  }) as unknown as UserConfirmationEvidence;
  mintedEvidence.add(evidence);
  return evidence;
}

export type ConfirmedAction<TBundle> = Readonly<{
  [confirmedBrand]: true;
  bundle: TBundle;
  confirmation: UserConfirmation;
}>;

/**
 * The only way to mint a ConfirmedAction. Throws NotConfirmableError when
 * `canConfirm` is false or the evidence is missing/forged.
 */
export function confirm<TDraft, TBundle, TCatalog extends CatalogLookup = CatalogLookup>(
  adapter: WorkflowAdapter<TDraft, TCatalog> & { toBundle(draft: TDraft): TBundle },
  draft: TDraft,
  evidence: UserConfirmationEvidence | undefined | null,
): ConfirmedAction<TBundle> {
  if (evidence === undefined || evidence === null || !mintedEvidence.has(evidence)) {
    throw new NotConfirmableError('missing_evidence', 'Confirmation requires user click evidence.');
  }
  if (!adapter.canConfirm(draft)) {
    throw new NotConfirmableError('cannot_confirm', 'Draft is not confirmable.');
  }
  const action = Object.freeze({
    [CONFIRMED_KEY]: true,
    bundle: adapter.toBundle(draft),
    confirmation: evidence.confirmation,
  }) as unknown as ConfirmedAction<TBundle>;
  mintedActions.add(action);
  return action;
}

/** Runtime check used by `local-data.commitConfirmed` to reject unbranded values. */
export function isConfirmedAction(value: unknown): value is ConfirmedAction<unknown> {
  return typeof value === 'object' && value !== null && mintedActions.has(value);
}
