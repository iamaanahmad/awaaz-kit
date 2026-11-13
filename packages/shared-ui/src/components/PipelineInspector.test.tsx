import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PipelineInspector, buildHighlightParts } from './PipelineInspector';
import type { InspectorLine } from './PipelineInspector';

afterEach(cleanup);

const raw = 'do kilo chawal';
const tokens = [
  { text: 'do', kind: 'number', span: { start: 0, end: 2 } },
  { text: 'kilo', kind: 'unit', span: { start: 3, end: 7 } },
  { text: 'chawal', kind: 'word', span: { start: 8, end: 14 } },
] as const;
const lines: InspectorLine[] = [
  {
    lineId: 'l1',
    spokenName: 'chawal',
    match: { kind: 'ambiguous', score: 0.8 },
    candidates: [{ id: 'p1', name: 'Basmati Rice' }],
    fields: [{ label: 'Product', value: null, status: 'needs_review', confidence: 0.5 }],
  },
];

describe('PipelineInspector', () => {
  it('is collapsed by default and toggles open', () => {
    render(<PipelineInspector raw={raw} normalized={null} lines={[]} />);
    const btn = screen.getByRole('button', { name: /show how it understood this/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('inspector-raw')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByTestId('inspector-raw').textContent).toBe(raw);
  });

  it('shows normalized spans, candidates, match and field status', () => {
    const { container } = render(
      <PipelineInspector
        raw={raw}
        normalized={{ text: '2 kg chawal', tokens }}
        lines={lines}
        defaultOpen
      />,
    );
    expect(container.querySelectorAll('mark')).toHaveLength(2);
    expect(screen.getByText('Basmati Rice')).toBeTruthy();
    expect(screen.getByTestId('inspector-match').textContent).toContain('ambiguous');
    expect(screen.getByText('Needs review')).toBeTruthy();
  });

  it('buildHighlightParts reassembles the raw text and ignores bad spans', () => {
    const parts = buildHighlightParts(raw, [
      ...tokens,
      { text: 'x', kind: 'number', span: { start: 50, end: 60 } },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe(raw);
    expect(parts.filter((p) => p.kind)).toHaveLength(2);
  });
});
