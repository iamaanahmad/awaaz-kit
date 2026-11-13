import type { ReactElement } from 'react';

export type SyncBadgeState =
  | { kind: 'offline'; pending?: number }
  | { kind: 'local-only' }
  | { kind: 'pending'; count: number }
  | { kind: 'syncing' }
  | { kind: 'synced'; lastSyncedAt?: string }
  | { kind: 'failed'; reason?: string }
  | { kind: 'conflict'; count?: number }
  | { kind: 'auth' };

export interface SyncBadgeProps {
  state: SyncBadgeState;
  onSyncNow?: () => void;
  onRetry?: () => void;
}

const formatTime = (iso: string | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return ` ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const buttonClass = 'touch-target ak-btn ak-btn-secondary ak-btn-sm';

/** Sync_State badge: always text plus icon (Req 16.9, 16.10, 17.9). */
export function SyncBadge({ state, onSyncNow, onRetry }: SyncBadgeProps): ReactElement {
  let icon: string;
  let label: string;
  switch (state.kind) {
    case 'offline':
      icon = '○';
      label = state.pending ? `Offline, ${state.pending} pending` : 'Offline';
      break;
    case 'local-only':
      icon = '▣';
      label = 'Local only';
      break;
    case 'pending':
      icon = '◔';
      label = `Pending (${state.count})`;
      break;
    case 'syncing':
      icon = '↻';
      label = 'Syncing';
      break;
    case 'synced':
      icon = '✓';
      label = `Synced${formatTime(state.lastSyncedAt)}`;
      break;
    case 'failed':
      icon = '✕';
      label = state.reason ? `Failed: ${state.reason}` : 'Failed';
      break;
    case 'conflict':
      icon = '⚠';
      label = state.count ? `Conflict (${state.count})` : 'Conflict';
      break;
    case 'auth':
      icon = '🔒';
      label = 'Sign in to resume sync';
      break;
  }

  const showSyncNow =
    onSyncNow && (state.kind === 'pending' || state.kind === 'synced' || state.kind === 'conflict');
  const showRetry = onRetry && state.kind === 'failed';

  return (
    <span className="sync-badge" data-state={state.kind}>
      <span role="status" aria-live="polite">
        <span aria-hidden="true">{icon}</span> {label}
      </span>
      {showSyncNow ? (
        <button type="button" className={buttonClass} onClick={onSyncNow}>
          Sync Now
        </button>
      ) : null}
      {showRetry ? (
        <button type="button" className={buttonClass} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </span>
  );
}
