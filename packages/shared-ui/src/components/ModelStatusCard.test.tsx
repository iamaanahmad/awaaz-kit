import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ModelStatusCard, type ModelStatusState } from './ModelStatusCard';

afterEach(cleanup);

const setup = (status: ModelStatusState) => {
  const onDownload = vi.fn();
  const onContinueTyping = vi.fn();
  render(
    <ModelStatusCard
      status={status}
      approxSizeBytes={150 * 1024 * 1024}
      onDownload={onDownload}
      onContinueTyping={onContinueTyping}
    />,
  );
  return { onDownload, onContinueTyping };
};

describe('ModelStatusCard', () => {
  it('missing: shows size, Download model and Continue with typing', () => {
    const { onDownload, onContinueTyping } = setup({ kind: 'missing' });
    expect(screen.getByText(/150 MB/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with typing' }));
    expect(onDownload).toHaveBeenCalledOnce();
    expect(onContinueTyping).toHaveBeenCalledOnce();
  });

  it('evicted: explains removal and offers download plus typing', () => {
    setup({ kind: 'evicted' });
    expect(screen.getByText(/removed from browser storage/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download model' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with typing' })).toBeTruthy();
  });

  it('downloading: shows clamped progress and keeps typing available', () => {
    setup({ kind: 'downloading', progress: 1.7 });
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('100');
    expect(screen.getByRole('button', { name: 'Continue with typing' })).toBeTruthy();
  });

  it('failed: shows reason, Retry and typing', () => {
    setup({ kind: 'failed', reason: 'hash mismatch' });
    expect(screen.getByRole('alert').textContent).toContain('hash mismatch');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with typing' })).toBeTruthy();
  });

  it('ready: shows status without download action', () => {
    setup({ kind: 'ready', version: '1.0' });
    expect(screen.getByText(/ready/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download model' })).toBeNull();
  });
});
