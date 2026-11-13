export interface SampleUtteranceChipsProps {
  /** Fictional demo utterances (Hindi, Hinglish, English). */
  samples: readonly string[];
  /** Fills the transcript field; does not submit by itself. */
  onSelect: (sample: string) => void;
}

/** Fill-in chips for demo reliability, always labelled "Sample" (Req 17.7, 17.9). */
export function SampleUtteranceChips({ samples, onSelect }: SampleUtteranceChipsProps) {
  if (samples.length === 0) return null;
  return (
    <div role="group" aria-label="Sample utterances" className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-muted">Sample</span>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {samples.map((sample) => (
          <li key={sample}>
            <button
              type="button"
              onClick={() => onSelect(sample)}
              className="touch-target rounded-full border border-border bg-white px-3 text-left text-sm"
            >
              <span className="sr-only">Sample: </span>
              {sample}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
