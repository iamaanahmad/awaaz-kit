import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

export interface DelayedFallbackProps {
  /** Milliseconds to wait before showing anything. Fast loads never flash a spinner. */
  delayMs?: number;
  children?: ReactNode;
}

/** Suspense fallback that stays blank for `delayMs`, then shows a "Loading…" status. */
export function DelayedFallback({
  delayMs = 300,
  children = 'Loading…',
}: DelayedFallbackProps): ReactElement {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);
  if (!show) return <div aria-hidden="true" className="ak-loading-placeholder" />;
  return (
    <p role="status" className="ak-loading">
      <span aria-hidden="true" className="ak-loading-dot" /> {children}
    </p>
  );
}

/** Runs `tasks` when the browser is idle (or shortly after), e.g. to preload route chunks. */
export function runWhenIdle(tasks: ReadonlyArray<() => unknown>): () => void {
  const run = (): void => {
    for (const task of tasks) {
      try {
        const result = task();
        if (result instanceof Promise) result.catch(() => undefined);
      } catch {
        /* Preloading is best effort. */
      }
    }
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 200);
  return () => clearTimeout(id);
}
