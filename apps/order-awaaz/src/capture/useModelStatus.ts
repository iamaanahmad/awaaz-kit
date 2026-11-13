import { useCallback, useEffect, useState } from 'react';
import type { ModelManager, ModelStatus } from '@awaaz-kit/speech-provider';
import type { ModelStatusState } from '@awaaz-kit/shared-ui';

/** Approximate download size shown before the user starts a download. */
export const APPROX_MODEL_BYTES = 120 * 1024 * 1024;

export function toCardStatus(status: ModelStatus): ModelStatusState {
  switch (status.kind) {
    case 'not_installed':
      return { kind: 'missing' };
    case 'evicted':
      return { kind: 'evicted' };
    case 'ready':
      return { kind: 'ready', version: status.modelVersion };
    case 'downloading':
      return {
        kind: 'downloading',
        progress:
          status.totalBytes && status.totalBytes > 0 ? status.receivedBytes / status.totalBytes : 0,
      };
    case 'error':
      return { kind: 'failed', reason: status.message };
  }
}

export interface UseModelStatus {
  status: ModelStatusState;
  approxBytes: number;
  download: () => void;
}

/**
 * Tracks the speech model state. Without a manager (the scripted provider needs no model)
 * the card reports ready. Only `download` touches the network, after a user action (Req 5.4).
 */
export function useModelStatus(manager: ModelManager | null): UseModelStatus {
  const [status, setStatus] = useState<ModelStatusState>(
    manager ? { kind: 'checking' } : { kind: 'ready', version: 'scripted' },
  );
  const [approxBytes, setApproxBytes] = useState(APPROX_MODEL_BYTES);

  useEffect(() => {
    if (!manager) return;
    let cancelled = false;
    void manager.status().then((s) => {
      if (cancelled) return;
      if (s.kind === 'not_installed') setApproxBytes(s.approxBytes);
      setStatus(toCardStatus(s));
    });
    return () => {
      cancelled = true;
    };
  }, [manager]);

  const download = useCallback(() => {
    if (!manager) return;
    setStatus({ kind: 'downloading', progress: 0 });
    manager
      .download((s) => setStatus(toCardStatus(s)))
      .catch((err: unknown) =>
        setStatus({
          kind: 'failed',
          reason: err instanceof Error ? err.message : 'Download failed',
        }),
      );
  }, [manager]);

  return { status, approxBytes, download };
}
