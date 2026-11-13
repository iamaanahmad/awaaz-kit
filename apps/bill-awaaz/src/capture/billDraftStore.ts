import { useSyncExternalStore } from 'react';
import type { BillDraft } from '@awaaz-kit/domain-billing';

/**
 * Tiny in-memory hand-off store: Capture writes the parsed BillDraft here and the Lines
 * screen reads it. Nothing is persisted until the bill is finalized.
 */
let current: BillDraft | null = null;
const listeners = new Set<() => void>();

export function getBillDraft(): BillDraft | null {
  return current;
}

export function setBillDraft(draft: BillDraft | null): void {
  current = draft;
  for (const l of [...listeners]) l();
}

export function subscribeBillDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBillDraft(): BillDraft | null {
  return useSyncExternalStore(subscribeBillDraft, getBillDraft, getBillDraft);
}
