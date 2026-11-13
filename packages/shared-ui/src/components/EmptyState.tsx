import type { ReactElement, ReactNode } from 'react';
import { GhostMascot } from '../theme/Spooky';

export interface EmptyStateProps {
  /** Light spooky lead-in, e.g. "Boo!". Decorative flavour only; the children carry the meaning. */
  lead?: string;
  /** The plain, functional message. */
  children: ReactNode;
}

/** Friendly empty state with the ghost mascot. The ghost is decorative (aria-hidden). */
export function EmptyState({ lead = 'Boo!', children }: EmptyStateProps): ReactElement {
  return (
    <div className="ak-empty">
      <GhostMascot size={64} />
      <div className="ak-empty-text">
        <strong className="ak-empty-lead">{lead}</strong>
        {children}
      </div>
    </div>
  );
}
