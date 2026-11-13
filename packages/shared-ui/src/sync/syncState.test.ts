import { describe, expect, it } from 'vitest';
import { describeReport, readSyncConfig, toBadgeState, type SyncStatusLike } from './syncState';

const status = (over: Partial<SyncStatusLike> = {}): SyncStatusLike => ({
  pending: 0,
  failed: 0,
  lastSyncedAt: null,
  running: false,
  signedIn: true,
  authPaused: false,
  ...over,
});
const on = { configured: true, online: true, optedIn: true };

describe('readSyncConfig', () => {
  it('is undefined unless both public values are set', () => {
    expect(readSyncConfig({})).toBeUndefined();
    expect(readSyncConfig({ VITE_APPWRITE_ENDPOINT: 'https://x/v1' })).toBeUndefined();
    expect(
      readSyncConfig({ VITE_APPWRITE_ENDPOINT: ' https://x/v1 ', VITE_APPWRITE_PROJECT_ID: 'p' }),
    ).toEqual({
      endpoint: 'https://x/v1',
      projectId: 'p',
    });
  });
});

describe('toBadgeState', () => {
  it('is local-only when unconfigured or not opted in', () => {
    expect(toBadgeState(status(), { ...on, configured: false }).kind).toBe('local-only');
    expect(toBadgeState(status(), { ...on, optedIn: false }).kind).toBe('local-only');
  });
  it('maps engine states', () => {
    expect(toBadgeState(status(), { ...on, online: false })).toEqual({
      kind: 'offline',
      pending: 0,
    });
    expect(toBadgeState(status({ signedIn: false }), on).kind).toBe('auth');
    expect(toBadgeState(status({ running: true }), on).kind).toBe('syncing');
    expect(toBadgeState(status({ failed: 1 }), on).kind).toBe('failed');
    expect(toBadgeState(status({ pending: 2 }), on)).toEqual({ kind: 'pending', count: 2 });
    expect(toBadgeState(status({ lastSyncedAt: 't' }), on)).toEqual({
      kind: 'synced',
      lastSyncedAt: 't',
    });
  });
});

describe('describeReport', () => {
  it('describes skips and runs', () => {
    expect(describeReport(null)).toBeNull();
    expect(
      describeReport({ ran: false, skipped: 'not_opted_in', push: null, pull: null, error: null }),
    ).toBe('Cloud sync is off.');
    const push = { synced: 2 };
    const pull = { applied: 1, conflicts: 1 };
    expect(describeReport({ ran: true, skipped: null, push, pull, error: null })).toBe(
      'Last sync: sent 2, received 1, 1 conflict.',
    );
  });
});
