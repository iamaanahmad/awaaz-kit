import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { MicButton, formatElapsed } from './MicButton';

afterEach(cleanup);

const handlers = () => ({ onStart: vi.fn(), onStop: vi.fn(), onRetry: vi.fn() });

describe('MicButton', () => {
  it('starts recording from idle', () => {
    const h = handlers();
    render(<MicButton state="idle" {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(h.onStart).toHaveBeenCalledOnce();
  });

  it('stops while recording and shows the elapsed timer in the live status', () => {
    const h = handlers();
    render(<MicButton state="recording" elapsedMs={65_000} {...h} />);
    expect(screen.getByRole('status').textContent).toContain('1:05');
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(h.onStop).toHaveBeenCalledOnce();
  });

  it('offers Retry after stopping', () => {
    const h = handlers();
    render(<MicButton state="stopped" {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry recording' }));
    expect(h.onRetry).toHaveBeenCalledOnce();
  });

  it('disables the control while requesting permission', () => {
    render(<MicButton state="requesting_permission" {...handlers()} />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ['permission_denied', /denied/i],
    ['no_device', /No microphone was found/i],
  ] as const)('shows %s message offering typed input', (errorKind, text) => {
    const onUseTyping = vi.fn();
    render(
      <MicButton state="error" errorKind={errorKind} onUseTyping={onUseTyping} {...handlers()} />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(text);
    fireEvent.click(screen.getByRole('button', { name: 'Type instead' }));
    expect(onUseTyping).toHaveBeenCalledOnce();
  });

  it('formats elapsed time', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(undefined)).toBe('0:00');
    expect(formatElapsed(599_000)).toBe('9:59');
  });
});
