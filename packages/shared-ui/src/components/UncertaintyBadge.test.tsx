import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UncertaintyBadge } from './UncertaintyBadge';
import { ClarificationPrompt } from './ClarificationPrompt';

afterEach(cleanup);

describe('UncertaintyBadge', () => {
  it.each([
    ['confirmed', 'Confirmed'],
    ['needs_review', 'Needs review'],
    ['missing', 'Missing'],
    ['unmatched', 'Not in catalog'],
  ] as const)('%s shows text label and icon', (status, label) => {
    const { container } = render(<UncertaintyBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows numeric confidence only when provided', () => {
    render(<UncertaintyBadge status="needs_review" confidence={0.72} />);
    expect(screen.getByText('72%')).toBeTruthy();
  });
});

describe('ClarificationPrompt', () => {
  const make = (n: number) => ({
    lineId: 'l1',
    field: 'product',
    prompt: 'Kaunsa item?',
    candidates: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Item ${i}` })),
  });

  it('renders nothing when there is no clarification', () => {
    const { container } = render(
      <ClarificationPrompt clarification={null} onSelectCandidate={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows prompt text and at most three candidate buttons', () => {
    const onSelect = vi.fn();
    render(<ClarificationPrompt clarification={make(5)} onSelectCandidate={onSelect} />);
    expect(screen.getByText('Kaunsa item?')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Item 1' }));
    expect(onSelect).toHaveBeenCalledWith({ id: 'p1', name: 'Item 1' });
  });
});
