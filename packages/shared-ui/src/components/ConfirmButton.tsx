import type { MouseEvent, ReactElement } from 'react';
import {
  createUserConfirmationEvidence,
  type UserConfirmationEvidence,
} from '@awaaz-kit/confirmation-engine';

export interface ConfirmButtonProps {
  /** Result of `buildReview(...).canConfirm`. */
  canConfirm: boolean;
  /** Draft revision the user is confirming. */
  revision: number;
  /** Visible reason shown while confirm is not available (Req 11.3). */
  disabledReason?: string;
  /** True while a confirm or commit is in flight; prevents double submission. */
  pending?: boolean;
  label?: string;
  /** Receives evidence minted only from a trusted click (Req 11.5). */
  onConfirm: (evidence: UserConfirmationEvidence) => void;
  /** Injectable clock for tests. */
  now?: () => Date;
}

/**
 * The only UI path that creates `UserConfirmationEvidence`. It is disabled with a visible
 * reason while the draft cannot be confirmed, and disabled while pending. Untrusted or
 * synthetic clicks are ignored (the engine rejects them).
 */
export function ConfirmButton(props: ConfirmButtonProps): ReactElement {
  const {
    canConfirm,
    revision,
    disabledReason,
    pending = false,
    label = 'Confirm',
    onConfirm,
    now,
  } = props;
  const disabled = !canConfirm || pending;
  const reason = !canConfirm
    ? (disabledReason ?? 'Resolve the highlighted items before confirming.')
    : null;
  const reasonId = 'confirm-disabled-reason';

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (!event.nativeEvent.isTrusted || event.nativeEvent.type !== 'click') return;
    onConfirm(createUserConfirmationEvidence(event.nativeEvent, revision, now));
  };

  return (
    <div className="ak-confirm">
      <button
        type="button"
        className="touch-target ak-btn ak-btn-primary ak-btn-lg"
        onClick={handleClick}
        disabled={disabled}
        aria-busy={pending}
        aria-describedby={reason !== null ? reasonId : undefined}
      >
        {pending ? 'Confirming…' : label}
      </button>
      {reason !== null ? (
        <p id={reasonId} className="ak-help">
          {reason}
        </p>
      ) : null}
    </div>
  );
}
