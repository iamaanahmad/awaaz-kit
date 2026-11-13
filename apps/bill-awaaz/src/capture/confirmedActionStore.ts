import type { ConfirmedAction } from '@awaaz-kit/confirmation-engine';
import type { BillBundle } from '@awaaz-kit/local-data';

/**
 * In-memory hand-off from Review to Finalize. Review mints the ConfirmedAction from the
 * user's click; Finalize takes it once and commits it. Nothing is persisted here.
 */
let pending: { id: string; action: ConfirmedAction<BillBundle> } | null = null;

export function setPendingConfirmed(id: string, action: ConfirmedAction<BillBundle>): void {
  pending = { id, action };
}

export function peekPendingConfirmed(id: string): ConfirmedAction<BillBundle> | null {
  return pending !== null && pending.id === id ? pending.action : null;
}

export function clearPendingConfirmed(): void {
  pending = null;
}
