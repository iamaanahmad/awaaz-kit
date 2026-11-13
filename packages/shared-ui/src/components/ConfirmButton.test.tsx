import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirm, type UserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { ConfirmButton } from './ConfirmButton';
import { ReviewCard } from './ReviewCard';

afterEach(cleanup);

/**
 * jsdom dispatches synthetic events with isTrusted === false, and the real browser trusted-click
 * path cannot be produced from script. Here we try to shadow `isTrusted` on a single event
 * instance. This only exercises the component's evidence path; the genuine trusted click is
 * covered by the Playwright journeys (tests/e2e).
 */
function fakeTrustedClick(el: Element): boolean {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  try {
    Object.defineProperty(ev, 'isTrusted', { value: true });
  } catch {
    return false;
  }
  if (!ev.isTrusted) return false;
  act(() => {
    el.dispatchEvent(ev);
  });
  return true;
}

const adapter = {
  id: 'x',
  parse: () => 1,
  validate: () => [],
  canConfirm: () => true,
  toBundle: () => ({}),
};

describe('ConfirmButton states (Req 11.3, 11.4, 11.8)', () => {
  it('is disabled with a visible reason linked by aria-describedby when not confirmable', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton
        canConfirm={false}
        revision={1}
        disabledReason="Add at least one line"
        onConfirm={onConfirm}
      />,
    );
    const button = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const reason = screen.getByText('Add at least one line');
    expect(button.getAttribute('aria-describedby')).toBe(reason.id);
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a default text reason when none is supplied', () => {
    render(<ConfirmButton canConfirm={false} revision={1} onConfirm={vi.fn()} />);
    const button = screen.getByRole('button');
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toMatch(/Resolve/);
  });

  it('shows pending state: disabled, busy, "Confirming…", and no reason text', () => {
    render(<ConfirmButton canConfirm revision={1} pending onConfirm={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Confirming…' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  it('ignores untrusted clicks even when enabled', () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton canConfirm revision={1} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is enabled when confirmable, without a reason or busy flag', () => {
    render(<ConfirmButton canConfirm revision={1} onConfirm={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('false');
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  it('emits evidence that confirm() accepts when the click is trusted-like (if jsdom permits)', () => {
    const received: UserConfirmationEvidence[] = [];
    render(
      <ConfirmButton
        canConfirm
        revision={4}
        now={() => new Date(0)}
        onConfirm={(e) => received.push(e)}
      />,
    );
    const dispatched = fakeTrustedClick(screen.getByRole('button'));
    if (!dispatched) {
      // Limitation: jsdom's isTrusted is unforgeable here; Playwright covers the real path.
      expect(received).toHaveLength(0);
      return;
    }
    expect(received).toHaveLength(1);
    const action = confirm(adapter as never, {}, received[0] as UserConfirmationEvidence);
    expect(action.confirmation.draftRevision).toBe(4);
  });

  it('ReviewCard disables confirm with a reason while pending or blocked', () => {
    const { rerender } = render(
      <ReviewCard revision={1} canConfirm={false} issues={[]} onConfirm={vi.fn()}>
        <p>draft</p>
      </ReviewCard>,
    );
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    rerender(
      <ReviewCard revision={1} canConfirm issues={[]} onConfirm={vi.fn()}>
        <p>draft</p>
      </ReviewCard>,
    );
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
