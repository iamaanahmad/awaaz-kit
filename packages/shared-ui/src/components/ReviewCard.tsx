import type { ReactElement, ReactNode } from 'react';
import type { UserConfirmationEvidence, ValidationIssue } from '@awaaz-kit/confirmation-engine';
import { ConfirmButton } from './ConfirmButton';

export interface ReviewCardProps {
  title?: string;
  /** Full draft view (all lines, fields and statuses), rendered by the app (Req 11.2). */
  children: ReactNode;
  revision: number;
  issues: readonly ValidationIssue[];
  canConfirm: boolean;
  pending?: boolean;
  confirmLabel?: string;
  onConfirm: (evidence: UserConfirmationEvidence) => void;
  /** Optional secondary action to discard the draft. */
  onDiscard?: () => void;
  now?: () => Date;
}

/**
 * Shows the complete draft with every validation issue, and a confirm control that is
 * disabled with a reason until `canConfirm` is true (Req 11.2-11.5).
 */
export function ReviewCard(props: ReviewCardProps): ReactElement {
  const {
    title = 'Review',
    children,
    revision,
    issues,
    canConfirm,
    pending,
    confirmLabel,
    onConfirm,
    onDiscard,
    now,
  } = props;
  const reason =
    issues.length > 0
      ? `Cannot confirm yet: ${issues.length} ${issues.length === 1 ? 'issue needs' : 'issues need'} attention.`
      : 'This draft cannot be confirmed yet.';

  return (
    <section
      className="flex flex-col gap-4 rounded-[var(--radius)] border-2 border-border bg-surface p-4"
      aria-label={title}
      data-revision={revision}
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <div data-testid="review-draft">{children}</div>
      {issues.length > 0 ? (
        <ul className="flex flex-col gap-1 text-danger" aria-label="Issues">
          {issues.map((issue, i) => (
            <li key={`${issue.code}-${issue.lineId ?? ''}-${issue.field ?? ''}-${i}`}>
              <span aria-hidden="true">⚠ </span>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        <ConfirmButton
          canConfirm={canConfirm}
          revision={revision}
          disabledReason={reason}
          pending={pending}
          label={confirmLabel}
          onConfirm={onConfirm}
          now={now}
        />
        {onDiscard ? (
          <button
            type="button"
            className="touch-target rounded-[var(--radius)] border-2 border-ink px-4 py-3 font-semibold text-ink disabled:opacity-60"
            onClick={onDiscard}
            disabled={pending === true}
          >
            Discard
          </button>
        ) : null}
      </div>
    </section>
  );
}
