import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelStatusState } from '../components/ModelStatusCard';

/*
 * Structural copies of the speech-provider types this hook needs, so shared-ui does not depend
 * on that package. speech-provider's ModelManager and SpeechToTextProvider fit these shapes.
 */
export type SpeechModelStatus =
  | { kind: 'not_installed'; approxBytes: number }
  | { kind: 'downloading'; receivedBytes: number; totalBytes: number | null }
  | { kind: 'ready'; modelVersion: string }
  | { kind: 'evicted' }
  | { kind: 'error'; message: string };

export interface SpeechModelManagerLike {
  status(): Promise<SpeechModelStatus>;
  download(onProgress: (s: SpeechModelStatus) => void, signal?: AbortSignal): Promise<void>;
}

export interface SpeechProviderLike {
  initialize(): Promise<{ ready: boolean; modelVersion?: string }>;
}

export function toModelCardStatus(status: SpeechModelStatus): ModelStatusState {
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

export interface UseSpeechModel {
  status: ModelStatusState;
  /** One-time download size, shown before the user agrees to it. */
  approxBytes: number;
  /** User action only: starts the verified download (Req 5.4). */
  download: () => void;
  /** Whether recording can produce a transcript right now. */
  voiceReady: boolean;
}

/**
 * Speech model state for the capture screens of both apps.
 * - Without a manager (the scripted provider) the card says plainly that this is demo mode.
 * - `status()` and warm-up never touch the network; only `download` does, after a tap.
 * - When the model is present, the provider is initialised so it loads in the background and
 *   the first recording does not wait for it.
 */
export function useSpeechModel(
  manager: SpeechModelManagerLike | null,
  provider: SpeechProviderLike,
  fallbackBytes: number,
): UseSpeechModel {
  const [status, setStatus] = useState<ModelStatusState>(
    manager ? { kind: 'checking' } : { kind: 'ready', version: 'scripted' },
  );
  const [approxBytes, setApproxBytes] = useState(fallbackBytes);
  const providerRef = useRef(provider);
  providerRef.current = provider;

  const warmUp = useCallback(() => {
    void providerRef.current.initialize().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!manager) return;
    let cancelled = false;
    void manager.status().then((s) => {
      if (cancelled) return;
      if (s.kind === 'not_installed') setApproxBytes(s.approxBytes);
      setStatus(toModelCardStatus(s));
      if (s.kind === 'ready') warmUp();
    });
    return () => {
      cancelled = true;
    };
  }, [manager, warmUp]);

  const download = useCallback(() => {
    if (!manager) return;
    setStatus({ kind: 'downloading', progress: 0 });
    manager
      .download((s) => {
        setStatus(toModelCardStatus(s));
        if (s.kind === 'ready') warmUp();
      })
      .catch((err: unknown) =>
        setStatus({
          kind: 'failed',
          reason: err instanceof Error ? err.message : 'Download failed',
        }),
      );
  }, [manager, warmUp]);

  return {
    status,
    approxBytes,
    download,
    voiceReady: status.kind === 'ready' && status.version !== 'scripted',
  };
}
