import type { SyncBadgeState } from '../components/SyncBadge';

/**
 * App-agnostic sync presentation helpers shared by both apps. Inputs are structural so this
 * package needs no dependency on the sync engine; its `SyncStatus` / `SyncReport` fit as-is.
 */
export interface SyncStatusLike {
  readonly pending: number;
  readonly failed: number;
  readonly lastSyncedAt: string | null;
  readonly running: boolean;
  readonly signedIn: boolean;
  readonly authPaused: boolean;
}

export interface SyncReportLike {
  readonly ran: boolean;
  readonly skipped: string | null;
  readonly push: { readonly synced: number } | null;
  readonly pull: { readonly applied: number; readonly conflicts: number } | null;
  readonly error: string | null;
}

export interface SyncConfig {
  readonly endpoint: string;
  readonly projectId: string;
}

/** Reads the public Appwrite settings; undefined means the app stays local-only. */
export function readSyncConfig(env: {
  VITE_APPWRITE_ENDPOINT?: string;
  VITE_APPWRITE_PROJECT_ID?: string;
}): SyncConfig | undefined {
  const endpoint = env.VITE_APPWRITE_ENDPOINT?.trim();
  const projectId = env.VITE_APPWRITE_PROJECT_ID?.trim();
  return endpoint && projectId ? { endpoint, projectId } : undefined;
}

/** Maps engine status to the badge. Without configuration or opt-in the app is "Local only". */
export function toBadgeState(
  status: SyncStatusLike | null,
  opts: { configured: boolean; online: boolean; optedIn: boolean; lastError?: string | null },
): SyncBadgeState {
  const pending = status?.pending ?? 0;
  if (!opts.online) return { kind: 'offline', pending };
  if (!opts.configured || !opts.optedIn || !status) return { kind: 'local-only' };
  if (status.authPaused || !status.signedIn) return { kind: 'auth' };
  if (status.running) return { kind: 'syncing' };
  if (status.failed > 0)
    return { kind: 'failed', ...(opts.lastError ? { reason: opts.lastError } : {}) };
  if (pending > 0) return { kind: 'pending', count: pending };
  return status.lastSyncedAt
    ? { kind: 'synced', lastSyncedAt: status.lastSyncedAt }
    : { kind: 'synced' };
}

/** One plain-language line describing the last sync run. */
export function describeReport(report: SyncReportLike | null): string | null {
  if (!report) return null;
  if (!report.ran) {
    const why: Record<string, string> = {
      not_opted_in: 'Cloud sync is off.',
      not_signed_in: 'Sign in to sync.',
      offline: 'Offline. Changes will sync when you are back online.',
      no_shop: 'Choose a shop to sync.',
      auth_paused: 'Sign in to resume sync.',
    };
    return report.error ? `Sync did not run: ${report.error}` : (why[report.skipped ?? ''] ?? null);
  }
  const sent = report.push?.synced ?? 0;
  const got = report.pull?.applied ?? 0;
  const conflicts = report.pull?.conflicts ?? 0;
  const base = `Last sync: sent ${sent}, received ${got}${conflicts > 0 ? `, ${conflicts} conflict${conflicts === 1 ? '' : 's'}` : ''}.`;
  return report.error ? `${base} Stopped early: ${report.error}.` : base;
}
