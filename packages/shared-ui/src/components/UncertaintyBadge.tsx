import type { ReactElement } from 'react';

export type UncertaintyFieldStatus = 'confirmed' | 'needs_review' | 'missing' | 'unmatched';

export interface UncertaintyBadgeProps {
  status: UncertaintyFieldStatus;
  /** Optional calibrated confidence (0..1), shown numerically when provided (Req 10.9). */
  confidence?: number | null;
}

const LABELS: Record<UncertaintyFieldStatus, string> = {
  confirmed: 'Confirmed',
  needs_review: 'Needs review',
  missing: 'Missing',
  unmatched: 'Not in catalog',
};

const ICONS: Record<UncertaintyFieldStatus, ReactElement> = {
  confirmed: <path d="M4 12l5 5L20 6" />,
  needs_review: <path d="M12 3L2 21h20L12 3zM12 10v5M12 18v.5" />,
  missing: <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />,
  unmatched: <path d="M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l5 5M8.5 8.5l5 5M13.5 8.5l-5 5" />,
};

/** Icon plus text label per Field_Status; never color alone (Req 10.4, 10.8, 17.9). */
export function UncertaintyBadge({ status, confidence }: UncertaintyBadgeProps): ReactElement {
  const showConfidence = typeof confidence === 'number' && Number.isFinite(confidence);
  return (
    <span className="ak-badge" data-status={status}>
      <svg
        aria-hidden="true"
        focusable="false"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICONS[status]}
      </svg>
      <span>{LABELS[status]}</span>
      {showConfidence ? (
        <span>{Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%</span>
      ) : null}
    </span>
  );
}
