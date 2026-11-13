import type { ReactElement } from 'react';

export type StorageIssue =
  | { kind: 'persist-denied' }
  | { kind: 'quota-exceeded' }
  | { kind: 'open-error'; detail?: string }
  | { kind: 'reload-required' };

export interface StorageBannerProps {
  issue: StorageIssue | null;
  onRetry?: () => void;
  onReload?: () => void;
}

const buttonClass = 'min-h-[44px] min-w-[44px] px-3 rounded-md border';

/** Storage problems and "Reload to update" banner (Req 2.4, 2.5, 2.6). */
export function StorageBanner({
  issue,
  onRetry,
  onReload,
}: StorageBannerProps): ReactElement | null {
  if (!issue) return null;

  let message: string;
  let action: ReactElement | null = null;
  switch (issue.kind) {
    case 'persist-denied':
      message =
        'Browser storage can be cleared by you or your operating system. The app keeps working.';
      break;
    case 'quota-exceeded':
      message = 'Device storage is full, so changes cannot be saved.';
      action = onRetry ? (
        <button type="button" className={buttonClass} onClick={onRetry}>
          Retry
        </button>
      ) : null;
      break;
    case 'open-error':
      message = `Could not open local storage${issue.detail ? `: ${issue.detail}` : '.'}`;
      action = onRetry ? (
        <button type="button" className={buttonClass} onClick={onRetry}>
          Retry
        </button>
      ) : null;
      break;
    case 'reload-required':
      message = 'A newer version of the local database is in use by another tab or app.';
      action = (
        <button type="button" className={buttonClass} onClick={onReload}>
          Reload to update
        </button>
      );
      break;
  }

  const urgent = issue.kind !== 'persist-denied';
  return (
    <div className="storage-banner" data-issue={issue.kind} role={urgent ? 'alert' : 'status'}>
      <span aria-hidden="true">⚠</span> <span>{message}</span>
      {action}
    </div>
  );
}
