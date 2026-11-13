import { useCallback, useState } from 'react';

/** Remembers that the user dismissed the "Browser storage can be cleared" note. */
export const PERSIST_DISMISSED_KEY = 'awaaz-persist-note-dismissed';

const read = (): boolean => {
  try {
    return localStorage.getItem(PERSIST_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * State for the dismissible persist-denied banner. Only that variant is dismissible; quota,
 * open-failed and reload banners need action and are never hidden by this.
 */
export function usePersistNoteDismissal(): { dismissed: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState<boolean>(read);
  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(PERSIST_DISMISSED_KEY, '1');
    } catch {
      /* Hidden for this session even if storage is unavailable. */
    }
  }, []);
  return { dismissed, dismiss };
}
