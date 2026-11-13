// Task 19.17: sync status display. Validates: Requirements 2.7, 16.10
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OnlineIndicator } from './OnlineIndicator';
import { SyncBadge, type SyncBadgeState } from './SyncBadge';
import { toBadgeState, type SyncStatusLike } from '../sync/syncState';

afterEach(cleanup);

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

describe('SyncBadge states (text plus icon)', () => {
  const cases: Array<[SyncBadgeState, RegExp]> = [
    [{ kind: 'offline' }, /^\S+ Offline$/],
    [{ kind: 'offline', pending: 4 }, /Offline, 4 pending/],
    [{ kind: 'local-only' }, /Local only/],
    [{ kind: 'pending', count: 7 }, /Pending \(7\)/],
    [{ kind: 'syncing' }, /Syncing/],
    [{ kind: 'synced', lastSyncedAt: '2026-01-01T10:30:00.000Z' }, /Synced \d{1,2}[:.]\d{2}/],
    [{ kind: 'synced' }, /Synced$/],
    [{ kind: 'failed' }, /Failed/],
    [{ kind: 'failed', reason: 'network_error' }, /Failed: network_error/],
    [{ kind: 'conflict', count: 2 }, /Conflict \(2\)/],
    [{ kind: 'auth' }, /Sign in to resume sync/],
  ];

  it.each(cases)('%j shows label and a non-empty aria-hidden icon', (state, text) => {
    const { container } = render(<SyncBadge state={state} />);
    const live = screen.getByRole('status');
    expect(live.textContent).toMatch(text);
    const icon = container.querySelector('[aria-hidden="true"]');
    expect(icon?.textContent?.trim().length).toBeGreaterThan(0);
    // Label text must exist outside the icon so meaning is not colour or glyph only.
    expect((live.textContent ?? '').replace(icon?.textContent ?? '', '').trim().length).toBeGreaterThan(0);
  });

  it('uses a distinct icon per state', () => {
    const kinds: SyncBadgeState[] = [
      { kind: 'offline' },
      { kind: 'local-only' },
      { kind: 'pending', count: 1 },
      { kind: 'syncing' },
      { kind: 'synced' },
      { kind: 'failed' },
      { kind: 'conflict' },
      { kind: 'auth' },
    ];
    const icons = kinds.map((state) => {
      const { container, unmount } = render(<SyncBadge state={state} />);
      const icon = container.querySelector('[aria-hidden="true"]')?.textContent;
      unmount();
      return icon;
    });
    expect(new Set(icons).size).toBe(kinds.length);
  });

  it('Sync Now shows for pending, synced and conflict only, and fires', () => {
    const onSyncNow = vi.fn();
    for (const state of [
      { kind: 'pending', count: 1 },
      { kind: 'synced' },
      { kind: 'conflict' },
    ] as SyncBadgeState[]) {
      const { unmount } = render(<SyncBadge state={state} onSyncNow={onSyncNow} />);
      fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
      unmount();
    }
    expect(onSyncNow).toHaveBeenCalledTimes(3);
    for (const state of [{ kind: 'offline' }, { kind: 'syncing' }, { kind: 'auth' }] as SyncBadgeState[]) {
      const { unmount } = render(<SyncBadge state={state} onSyncNow={onSyncNow} />);
      expect(screen.queryByRole('button', { name: 'Sync Now' })).toBeNull();
      unmount();
    }
  });

  it('Retry shows only for failed', () => {
    const onRetry = vi.fn();
    render(<SyncBadge state={{ kind: 'failed' }} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    cleanup();
    render(<SyncBadge state={{ kind: 'pending', count: 1 }} onRetry={onRetry} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('OnlineIndicator events', () => {
  it('shows text plus icon and flips on offline/online events', () => {
    const { container } = render(<OnlineIndicator />);
    const icon = (): string | null | undefined =>
      container.querySelector('[aria-hidden="true"]')?.textContent;
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status').textContent).toMatch(/Offline/);
    const offlineIcon = icon();
    expect(offlineIcon).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status').textContent).toMatch(/Online/);
    expect(icon()).not.toBe(offlineIcon);
  });

  it('honours an explicit online override', () => {
    render(<OnlineIndicator online={false} />);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status').textContent).toMatch(/Offline/);
  });
});

describe('toBadgeState mapping', () => {
  it('offline wins and carries the pending count', () => {
    expect(toBadgeState(status({ pending: 3 }), { ...on, online: false })).toEqual({
      kind: 'offline',
      pending: 3,
    });
    expect(toBadgeState(null, { ...on, online: false })).toEqual({ kind: 'offline', pending: 0 });
  });

  it('local-only when unconfigured, not opted in, or no status', () => {
    expect(toBadgeState(status(), { ...on, configured: false })).toEqual({ kind: 'local-only' });
    expect(toBadgeState(status(), { ...on, optedIn: false })).toEqual({ kind: 'local-only' });
    expect(toBadgeState(null, on)).toEqual({ kind: 'local-only' });
  });

  it('auth when signed out or auth paused', () => {
    expect(toBadgeState(status({ signedIn: false }), on)).toEqual({ kind: 'auth' });
    expect(toBadgeState(status({ authPaused: true }), on)).toEqual({ kind: 'auth' });
  });

  it('syncing, failed, pending, synced precedence', () => {
    expect(toBadgeState(status({ running: true, failed: 1, pending: 2 }), on)).toEqual({
      kind: 'syncing',
    });
    expect(toBadgeState(status({ failed: 1, pending: 2 }), { ...on, lastError: 'boom' })).toEqual({
      kind: 'failed',
      reason: 'boom',
    });
    expect(toBadgeState(status({ failed: 1 }), on)).toEqual({ kind: 'failed' });
    expect(toBadgeState(status({ pending: 5 }), on)).toEqual({ kind: 'pending', count: 5 });
    expect(toBadgeState(status({ lastSyncedAt: '2026-01-01T00:00:00.000Z' }), on)).toEqual({
      kind: 'synced',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(toBadgeState(status(), on)).toEqual({ kind: 'synced' });
  });
});
