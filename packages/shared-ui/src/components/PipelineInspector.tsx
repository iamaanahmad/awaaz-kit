import { useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { UncertaintyBadge } from './UncertaintyBadge';
import type { UncertaintyFieldStatus } from './UncertaintyBadge';

/** Structural subset of a normalizer token; `span` indexes into `raw`. */
export interface InspectorToken {
  text: string;
  kind: 'number' | 'unit' | 'word' | 'punct';
  span: { start: number; end: number };
}

export interface InspectorCandidate {
  id: string;
  name: string;
}

export interface InspectorMatch {
  kind: 'exact' | 'ambiguous' | 'none' | string;
  productName?: string | null;
  score?: number | null;
}

export interface InspectorField {
  label: string;
  value: string | null;
  status: UncertaintyFieldStatus;
  confidence?: number | null;
  sourceText?: string | null;
  reason?: string | null;
}

export interface InspectorLine {
  lineId: string;
  spokenName: string;
  match?: InspectorMatch | null;
  candidates: readonly InspectorCandidate[];
  fields: readonly InspectorField[];
}

export interface PipelineInspectorProps {
  raw: string;
  normalized: { text: string; tokens: readonly InspectorToken[] } | null;
  lines: readonly InspectorLine[];
  /** Initial open state. */
  defaultOpen?: boolean;
}

/** Splits `raw` into plain and highlighted parts using token spans (number and unit only). */
export function buildHighlightParts(
  raw: string,
  tokens: readonly InspectorToken[],
): { text: string; kind: InspectorToken['kind'] | null }[] {
  const marks = tokens
    .filter(
      (t) =>
        (t.kind === 'number' || t.kind === 'unit') &&
        Number.isInteger(t.span.start) &&
        Number.isInteger(t.span.end) &&
        t.span.start >= 0 &&
        t.span.end > t.span.start &&
        t.span.end <= raw.length,
    )
    .sort((a, b) => a.span.start - b.span.start);
  const parts: { text: string; kind: InspectorToken['kind'] | null }[] = [];
  let cursor = 0;
  for (const t of marks) {
    if (t.span.start < cursor) continue;
    if (t.span.start > cursor) parts.push({ text: raw.slice(cursor, t.span.start), kind: null });
    parts.push({ text: raw.slice(t.span.start, t.span.end), kind: t.kind });
    cursor = t.span.end;
  }
  if (cursor < raw.length) parts.push({ text: raw.slice(cursor), kind: null });
  return parts;
}

function Stage({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="rounded-md border p-3">
      <h4 className="mb-2 text-base font-semibold">{title}</h4>
      {children}
    </section>
  );
}

/** "How it understood this": Raw, Normalized with spans, Candidates, Matches, Field_Status. */
export function PipelineInspector({
  raw,
  normalized,
  lines,
  defaultOpen = false,
}: PipelineInspectorProps): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const parts = normalized
    ? buildHighlightParts(raw, normalized.tokens)
    : [{ text: raw, kind: null }];

  return (
    <div className="pipeline-inspector">
      <button
        type="button"
        className="min-h-11 rounded-md border px-3 py-2 text-base"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide how it understood this' : 'Show how it understood this'}
      </button>
      <div id={panelId} hidden={!open} className="mt-3 grid gap-3">
        {open ? (
          <>
            <Stage title="1. Raw">
              <p lang="hi" className="whitespace-pre-wrap" data-testid="inspector-raw">
                {raw === '' ? <em>Nothing heard yet</em> : raw}
              </p>
            </Stage>

            <Stage title="2. Normalized">
              {normalized ? (
                <>
                  <p className="whitespace-pre-wrap" data-testid="inspector-normalized">
                    {normalized.text}
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="font-medium">Spans in raw text: </span>
                    {parts.map((p, i) =>
                      p.kind ? (
                        <mark
                          key={i}
                          data-span-kind={p.kind}
                          className="rounded px-1 underline decoration-2"
                          title={p.kind === 'number' ? 'Quantity' : 'Unit'}
                        >
                          {p.text}
                          <span className="sr-only">
                            {' '}
                            ({p.kind === 'number' ? 'quantity' : 'unit'})
                          </span>
                        </mark>
                      ) : (
                        <span key={i}>{p.text}</span>
                      ),
                    )}
                  </p>
                </>
              ) : (
                <p>Not normalized yet</p>
              )}
            </Stage>

            {lines.length === 0 ? (
              <Stage title="3. Candidates, matches and status">
                <p>No lines found</p>
              </Stage>
            ) : (
              lines.map((line, idx) => (
                <Stage key={line.lineId} title={`Line ${idx + 1}: ${line.spokenName || 'unnamed'}`}>
                  <h5 className="font-medium">Candidates</h5>
                  {line.candidates.length === 0 ? (
                    <p className="text-sm">None</p>
                  ) : (
                    <ul className="list-disc pl-5 text-sm">
                      {line.candidates.slice(0, 3).map((c) => (
                        <li key={c.id}>{c.name}</li>
                      ))}
                    </ul>
                  )}
                  <h5 className="mt-2 font-medium">Match</h5>
                  <p className="text-sm" data-testid="inspector-match">
                    {line.match
                      ? `${line.match.kind}${line.match.productName ? `: ${line.match.productName}` : ''}${
                          typeof line.match.score === 'number'
                            ? ` (score ${line.match.score.toFixed(2)})`
                            : ''
                        }`
                      : 'No match information'}
                  </p>
                  <h5 className="mt-2 font-medium">Field status</h5>
                  <ul className="grid gap-1">
                    {line.fields.map((f) => (
                      <li key={f.label} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{f.label}:</span>
                        <span>{f.value ?? '—'}</span>
                        <UncertaintyBadge status={f.status} confidence={f.confidence} />
                        {f.reason ? <span>{f.reason}</span> : null}
                      </li>
                    ))}
                  </ul>
                </Stage>
              ))
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
