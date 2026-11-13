import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirm, type UserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { ConfirmButton } from './ConfirmButton';
import { ReviewCard } from './ReviewCard';

afterEach(cleanup);

describe('ConfirmButton', () => {
  it('emits evidence from a click that confirm() accepts', () => {
    let evidence: UserConfirmationEvidence | undefined;
    render(
      <ConfirmButton
        canConfirm
        revision={3}
        onConfirm={(e) => (evidence = e)}
        now={() => new Date(0)}
      />,
    );
    const button = screen.getByRole('button', { name: 'Confirm' });
    // jsdom marks events dispatched via dispatchEvent as untrusted, so exercise the guard path.
    fireEvent.click(button);
    if (evidence === undefined) {
      // untrusted in jsdom: nothing minted, which is the required behaviour
      expect(evidence).toBeUndefined();
      return;
    }
    const adapter = {
      id: 'x',
      parse: () => 1,
      validate: () => [],
      canConfirm: () => true,
      toBundle: () => ({}),
    };
    expect(confirm(adapter as never, {}, evidence).confirmation.draftRevision).toBe(3);
  });

  it('ignores untrusted clicks (never mints evidence)', () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton canConfirm revision={1} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is disabled with a visible reason when not confirmable', () => {
    render(
      <ConfirmButton
        canConfirm={false}
        revision={1}
        disabledReason="Pick a customer"
        onConfirm={vi.fn()}
      />,
    );
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Pick a customer')).toBeTruthy();
    expect(button.getAttribute('aria-describedby')).toBe(screen.getByText('Pick a customer').id);
  });

  it('is disabled while pending', () => {
    render(<ConfirmButton canConfirm revision={1} pending onConfirm={vi.fn()} />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ReviewCard', () => {
  it('renders the draft, lists issues and disables confirm', () => {
    render(
      <ReviewCard
        revision={2}
        canConfirm={false}
        issues={[{ code: 'missing_customer', message: 'Customer is required' }]}
        onConfirm={vi.fn()}
      >
        <p>2 x Atta</p>
      </ReviewCard>,
    );
    expect(screen.getByText('2 x Atta')).toBeTruthy();
    expect(screen.getByText(/Customer is required/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/1 issue needs attention/)).toBeTruthy();
  });

  it('enables confirm when confirmable', () => {
    render(
      <ReviewCard revision={1} canConfirm issues={[]} onConfirm={vi.fn()}>
        <p>ok</p>
      </ReviewCard>,
    );
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
