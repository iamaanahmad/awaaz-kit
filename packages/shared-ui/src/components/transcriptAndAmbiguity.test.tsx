import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClarificationPrompt, type ClarificationPromptValue } from './ClarificationPrompt';
import { TranscriptEditor } from './TranscriptEditor';
import { UncertaintyBadge, type UncertaintyFieldStatus } from './UncertaintyBadge';

afterEach(cleanup);

describe('TranscriptEditor (Req 6.4)', () => {
  it('calls onChange with the new text on each edit so the caller can re-parse', () => {
    const onChange = vi.fn();
    render(<TranscriptEditor value="2 kg atta" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Transcript'), { target: { value: '3 kg atta' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('3 kg atta');
  });

  it('submits the current text', () => {
    const onSubmit = vi.fn();
    render(<TranscriptEditor value="2 kg atta" onChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Parse' }));
    expect(onSubmit).toHaveBeenCalledWith('2 kg atta');
  });

  it('disables submit and does not fire when the text is blank', () => {
    const onSubmit = vi.fn();
    render(<TranscriptEditor value="   " onChange={() => {}} onSubmit={onSubmit} />);
    const button = screen.getByRole('button', { name: 'Parse' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows raw vs edited transcript only after an edit, on request', () => {
    const { rerender } = render(
      <TranscriptEditor value="do kilo atta" rawTranscript="do kilo atta" onChange={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /original transcript/i })).toBeNull();

    rerender(
      <TranscriptEditor value="do kilo chawal" rawTranscript="do kilo atta" onChange={() => {}} />,
    );
    expect(screen.queryByTestId('raw-transcript')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View original transcript' }));
    expect(screen.getByTestId('raw-transcript').textContent).toBe('do kilo atta');
    expect(screen.getByTestId('edited-transcript').textContent).toBe('do kilo chawal');
    fireEvent.click(screen.getByRole('button', { name: 'Hide original transcript' }));
    expect(screen.queryByTestId('raw-transcript')).toBeNull();
  });
});

describe('ClarificationPrompt (Req 10.5, 10.6)', () => {
  const make = (names: string[]): ClarificationPromptValue => ({
    lineId: 'l1',
    field: 'product',
    prompt: 'Which atta did you mean?',
    candidates: names.map((name, i) => ({ id: `p${i}`, name })),
  });

  it('renders nothing when there is no clarification', () => {
    const { container } = render(
      <ClarificationPrompt clarification={null} onSelectCandidate={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows exactly one prompt with the question text', () => {
    render(<ClarificationPrompt clarification={make(['A', 'B'])} onSelectCandidate={() => {}} />);
    expect(screen.getAllByRole('group', { name: 'Clarification' })).toHaveLength(1);
    expect(screen.getByText('Which atta did you mean?')).toBeTruthy();
  });

  it('caps candidate buttons at three', () => {
    render(
      <ClarificationPrompt
        clarification={make(['A', 'B', 'C', 'D', 'E'])}
        onSelectCandidate={() => {}}
      />,
    );
    const group = screen.getByRole('group', { name: 'Clarification' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('reports the chosen candidate', () => {
    const onSelect = vi.fn();
    render(<ClarificationPrompt clarification={make(['A', 'B'])} onSelectCandidate={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onSelect).toHaveBeenCalledWith({ id: 'p1', name: 'B' });
  });
});

describe('UncertaintyBadge text labels (Req 10.4)', () => {
  const cases: [UncertaintyFieldStatus, string][] = [
    ['confirmed', 'Confirmed'],
    ['needs_review', 'Needs review'],
    ['missing', 'Missing'],
    ['unmatched', 'Not in catalog'],
  ];
  it.each(cases)('%s is conveyed by the text "%s", not color alone', (status, label) => {
    const { container } = render(<UncertaintyBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
