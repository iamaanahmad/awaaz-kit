import { useCallback, useSyncExternalStore } from 'react';
import { orderLineTotalPaise, type OrderDraft } from '@awaaz-kit/domain-order';

/**
 * App-local holder for the user's edits to the parsed draft (Req 10.6, 10.11).
 *
 * The capture session owns the parsed draft and has no setter, so edits made on the
 * Resolve screen live here, tied to the exact parsed draft they were made against.
 * When the capture session re-parses (a new draft object), the edits are discarded.
 * The Review screen reads the same store through `useResolvedDraft`.
 */
interface Edited {
  base: OrderDraft;
  draft: OrderDraft;
}

let edited: Edited | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): Edited | null => edited;

function emit(): void {
  for (const l of listeners) l();
}

/** Returns the edited draft when it was made from `parsed`, otherwise `parsed` itself. */
export function currentDraft(
  parsed: OrderDraft | null,
  snapshot: Edited | null,
): OrderDraft | null {
  if (parsed === null) return null;
  return snapshot !== null && snapshot.base === parsed ? snapshot.draft : parsed;
}

export interface ResolvedDraftApi {
  draft: OrderDraft | null;
  /** Applies a pure draft edit; the result replaces the working draft. */
  update: (edit: (draft: OrderDraft) => OrderDraft) => void;
}

export function useResolvedDraft(parsed: OrderDraft | null): ResolvedDraftApi {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const draft = currentDraft(parsed, snapshot);
  const update = useCallback(
    (edit: (d: OrderDraft) => OrderDraft) => {
      if (parsed === null) return;
      const working = currentDraft(parsed, edited);
      if (working === null) return;
      edited = { base: parsed, draft: edit(working) };
      emit();
    },
    [parsed],
  );
  return { draft, update };
}

/** Sets the unit price snapshot (integer Paise) and keeps the line total consistent. */
export function setOrderLinePrice(
  draft: OrderDraft,
  lineId: string,
  unitPricePaise: number | null,
): OrderDraft {
  if (!draft.lines.some((l) => l.lineId === lineId)) return draft;
  return {
    ...draft,
    revision: draft.revision + 1,
    lines: draft.lines.map((l) =>
      l.lineId === lineId
        ? {
            ...l,
            unitPricePaise,
            lineTotalPaise: orderLineTotalPaise(unitPricePaise, l.quantityMilli.value),
          }
        : l,
    ),
  };
}
