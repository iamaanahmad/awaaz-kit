import { useId, useState } from 'react';
import type { FormEvent } from 'react';

export interface TranscriptEditorProps {
  /** Editable Transcript text (Req 6.3). */
  value: string;
  /** Raw_Transcript as produced by STT; kept separate from `value` (Req 5.12). */
  rawTranscript?: string;
  /** Called on every edit so the caller can re-run the parser (Req 6.4). */
  onChange: (value: string) => void;
  /** Called when the user submits a typed or edited utterance (Req 6.2). */
  onSubmit?: (value: string) => void;
  label?: string;
  submitLabel?: string;
}

/**
 * Typed input is always available: the field is never disabled by model or
 * recording state (Req 6.1). Render it above the parsed results (Req 6.3).
 */
export function TranscriptEditor({
  value,
  rawTranscript,
  onChange,
  onSubmit,
  label = 'Transcript',
  submitLabel = 'Parse',
}: TranscriptEditorProps) {
  const inputId = useId();
  const hintId = useId();
  const diffId = useId();
  const [showDiff, setShowDiff] = useState(false);
  const edited = rawTranscript !== undefined && rawTranscript !== value;
  const blank = value.trim() === '';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!blank) onSubmit?.(value);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" aria-label="Transcript editor">
      <label htmlFor={inputId} className="font-semibold">
        {label}
      </label>
      <textarea
        id={inputId}
        value={value}
        rows={3}
        lang="hi-Latn"
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        className="touch-target w-full rounded-[var(--radius)] border border-border bg-white p-2 text-base"
      />
      <p id={hintId} className="text-sm text-muted">
        {blank
          ? 'Nothing heard yet. Type your order here or record again.'
          : 'Type or correct the text. Results update as you edit.'}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {onSubmit ? (
          <button
            type="submit"
            disabled={blank}
            className="touch-target rounded-[var(--radius)] bg-accent px-4 font-semibold text-accent-contrast disabled:opacity-60"
          >
            {submitLabel}
          </button>
        ) : null}
        {edited ? (
          <button
            type="button"
            aria-expanded={showDiff}
            aria-controls={diffId}
            onClick={() => setShowDiff((s) => !s)}
            className="touch-target text-sm underline"
          >
            {showDiff ? 'Hide original transcript' : 'View original transcript'}
          </button>
        ) : null}
      </div>
      {edited && showDiff ? (
        <dl id={diffId} className="rounded-[var(--radius)] border border-border p-2 text-sm">
          <dt className="font-semibold">Original (Raw transcript)</dt>
          <dd className="mb-2 whitespace-pre-wrap" data-testid="raw-transcript">
            {rawTranscript}
          </dd>
          <dt className="font-semibold">Edited</dt>
          <dd className="whitespace-pre-wrap" data-testid="edited-transcript">
            {value}
          </dd>
        </dl>
      ) : null}
    </form>
  );
}
