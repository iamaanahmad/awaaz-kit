import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OnlineIndicator } from './OnlineIndicator';
import { SyncBadge, type SyncBadgeState } from './SyncBadge';
import { StorageBanner } from './StorageBanner';

afterEach(cleanup);

describe('OnlineIndicator', () => {
  it('updates on connectivity events without reload', () => {
    render(<OnlineIndicator />);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/Offline/)).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText(/Online/)).toBeTruthy();
  });
});

describe('SyncBadge', () => {
  const cases: Array<[SyncBadgeState, RegExp]> = [
    [{ kind: 'offline' }, /Offline/],
    [{ kind: 'local-only' }, /Local only/],
    [{ kind: 'pending', count: 3 }, /Pending \(3\)/],
    [{ kind: 'syncing' }, /Syncing/],
    [{ kind: 'synced' }, /Synced/],
    [{ kind: 'failed' }, /Failed/],
    [{ kind: 'conflict' }, /Conflict/],
  ];
  it.each(cases)('shows text plus icon for %j', (state, text) => {
    const { container } = render(<SyncBadge state={state} />);
    expect(screen.getByRole('status').textContent).toMatch(text);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy();
  });

  it('offers Sync Now and Retry', () => {
    const onSyncNow = vi.fn();
    const onRetry = vi.fn();
    render(<SyncBadge state={{ kind: 'pending', count: 1 }} onSyncNow={onSyncNow} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
    expect(onSyncNow).toHaveBeenCalledOnce();
    cleanup();
    render(<SyncBadge state={{ kind: 'failed' }} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('StorageBanner', () => {
  it('renders nothing without an issue', () => {
    const { container } = render(<StorageBanner issue={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('persist denied explains clearing risk', () => {
    render(<StorageBanner issue={{ kind: 'persist-denied' }} />);
    expect(screen.getByText(/can be cleared/)).toBeTruthy();
  });

  it('open error and quota offer Retry; reload banner offers Reload to update', () => {
    const onRetry = vi.fn();
    const onReload = vi.fn();
    render(<StorageBanner issue={{ kind: 'open-error' }} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    cleanup();
    render(<StorageBanner issue={{ kind: 'quota-exceeded' }} onRetry={onRetry} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    cleanup();
    render(<StorageBanner issue={{ kind: 'reload-required' }} onReload={onReload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload to update' }));
    expect(onReload).toHaveBeenCalledOnce();
  });
});
