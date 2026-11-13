import type { ReactElement } from 'react';

export interface ClarificationCandidate {
  id: string;
  name: string;
}

/** Structurally compatible with confidence-engine's `Clarification`. */
export interface ClarificationPromptValue {
  lineId: string;
  field: string;
  prompt: string;
  candidates: readonly ClarificationCandidate[];
}

export interface ClarificationPromptProps {
  clarification: ClarificationPromptValue | null;
  onSelectCandidate: (candidate: ClarificationCandidate) => void;
}

const MAX_CANDIDATES = 3;

/** One focused prompt at a time, with up to three candidate buttons (Req 10.5, 10.7). */
export function ClarificationPrompt({
  clarification,
  onSelectCandidate,
}: ClarificationPromptProps): ReactElement | null {
  if (clarification === null) return null;
  const candidates = clarification.candidates.slice(0, MAX_CANDIDATES);
  return (
    <section aria-label="Clarification" role="group">
      <p role="status" aria-live="polite">
        {clarification.prompt}
      </p>
      {candidates.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                className="min-h-[44px] min-w-[44px] px-4 rounded-md border"
                onClick={() => onSelectCandidate(candidate)}
              >
                {candidate.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
