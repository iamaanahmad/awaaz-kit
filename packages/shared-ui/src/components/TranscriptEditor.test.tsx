import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SampleUtteranceChips } from './SampleUtteranceChips';
import { TranscriptEditor } from './TranscriptEditor';

afterEach(cleanup);

describe('TranscriptEditor', () => {
  it('is always editable and reports edits', () => {
    const onChange = vi.fn();
    render(<TranscriptEditor value="" onChange={onChange} />);
    const field = screen.getByLabelText('Transcript');
    expect((field as HTMLTextAreaElement).disabled).toBe(false);
    fireEvent.change(field, { target: { value: 'do kilo chawal' } });
    expect(onChange).toHaveBeenCalledWith('do kilo chawal');
  });

  it('submits non-blank text only', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <TranscriptEditor value="  " onChange={() => {}} onSubmit={onSubmit} />,
    );
    expect((screen.getByRole('button', { name: 'Parse' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    rerender(<TranscriptEditor value="2 kg atta" onChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Parse' }));
    expect(onSubmit).toHaveBeenCalledWith('2 kg atta');
  });

  it('shows the raw transcript diff only after an edit', () => {
    const { rerender } = render(
      <TranscriptEditor value="same" rawTranscript="same" onChange={() => {}} />,
    );
    expect(screen.queryByText('View original transcript')).toBeNull();
    rerender(
      <TranscriptEditor value="2 kg atta" rawTranscript="do kilo ata" onChange={() => {}} />,
    );
    fireEvent.click(screen.getByText('View original transcript'));
    expect(screen.getByTestId('raw-transcript').textContent).toBe('do kilo ata');
    expect(screen.getByTestId('edited-transcript').textContent).toBe('2 kg atta');
  });
});

describe('SampleUtteranceChips', () => {
  it('labels chips as Sample and fills on click', () => {
    const onSelect = vi.fn();
    render(<SampleUtteranceChips samples={['do kilo chawal']} onSelect={onSelect} />);
    expect(screen.getAllByText('Sample').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /do kilo chawal/ }));
    expect(onSelect).toHaveBeenCalledWith('do kilo chawal');
  });
});
