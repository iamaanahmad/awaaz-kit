import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DelayedFallback } from '../components/DelayedFallback';
import { EmptyState } from '../components/EmptyState';
import { StorageBanner } from '../components/StorageBanner';
import { PERSIST_DISMISSED_KEY, usePersistNoteDismissal } from '../components/storageDismissal';
import { THEME_STORAGE_KEY, applyTheme, parseTheme, readStoredTheme, setTheme } from './theme';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.setAttribute('data-app', 'order');
});
afterEach(cleanup);

describe('theme helpers', () => {
  it('defaults to haunted and only accepts classic as the alternative', () => {
    expect(parseTheme(null)).toBe('haunted');
    expect(parseTheme('nonsense')).toBe('haunted');
    expect(parseTheme('classic')).toBe('classic');
    expect(readStoredTheme()).toBe('haunted');
  });

  it('applies data-theme and a per-app meta theme-color, and persists under awaaz-theme', () => {
    setTheme('classic');
    expect(THEME_STORAGE_KEY).toBe('awaaz-theme');
    expect(localStorage.getItem('awaaz-theme')).toBe('classic');
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#e8710a',
    );
    document.documentElement.setAttribute('data-app', 'bill');
    applyTheme('classic');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0f766e',
    );
    applyTheme('haunted');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0f0b14',
    );
  });
});

describe('ThemeToggle', () => {
  it('shows Haunted pressed by default and switches to Classic', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /haunted/i });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('Haunted');
    fireEvent.click(button);
    const after = screen.getByRole('button', { name: /classic/i });
    expect(after.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('awaaz-theme')).toBe('classic');
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic');
  });

  it('starts from the theme already applied to <html>', () => {
    document.documentElement.setAttribute('data-theme', 'classic');
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /classic/i }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});

describe('storage banner dismissal', () => {
  function Harness({ kind }: { kind: 'persist-denied' | 'quota-exceeded' }) {
    const { dismissed, dismiss } = usePersistNoteDismissal();
    const issue = kind === 'persist-denied' && dismissed ? null : { kind };
    return <StorageBanner issue={issue} onDismiss={dismiss} onRetry={() => undefined} />;
  }

  it('persist-denied can be dismissed, and stays dismissed after a remount', () => {
    const { unmount } = render(<Harness kind="persist-denied" />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Browser storage can be cleared/)).toBeNull();
    expect(localStorage.getItem(PERSIST_DISMISSED_KEY)).toBe('1');
    unmount();
    render(<Harness kind="persist-denied" />);
    expect(screen.queryByText(/Browser storage can be cleared/)).toBeNull();
  });

  it('quota-exceeded is never dismissible', () => {
    render(<Harness kind="quota-exceeded" />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('DelayedFallback', () => {
  it('shows nothing until the delay has passed', () => {
    vi.useFakeTimers();
    try {
      render(<DelayedFallback delayMs={300} />);
      expect(screen.queryByText('Loading…')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(screen.queryByText('Loading…')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(screen.getByRole('status').textContent).toContain('Loading…');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('EmptyState', () => {
  it('keeps the plain message findable and hides the decorative ghost from assistive tech', () => {
    const { container } = render(
      <EmptyState>
        <p>No orders yet.</p>
      </EmptyState>,
    );
    expect(screen.getByText('No orders yet.')).toBeTruthy();
    expect(screen.getByText('Boo!')).toBeTruthy();
    const svg = container.querySelector('svg.ak-ghost');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
