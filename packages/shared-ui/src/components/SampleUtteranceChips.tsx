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
    <div role="group" aria-label="Sample utterances" className="ak-chip-group">
      <span className="ak-chip-label">Sample</span>
      <ul className="ak-chip-list">
        {samples.map((sample) => (
          <li key={sample}>
            <button type="button" onClick={() => onSelect(sample)} className="touch-target ak-chip">
              <span className="sr-only">Sample: </span>
              {sample}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
