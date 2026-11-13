import {
  captureReducer,
  initialSnapshot,
  type CaptureError,
  type CaptureEvent,
  type RecordingState,
  type VoiceCaptureSnapshot,
} from './reducer';

export interface VoiceCapture extends VoiceCaptureSnapshot {
  /** Requests microphone permission here, never earlier. */
  start(): Promise<void>;
  /** Resolves with the recorded audio; state becomes `stopped`. */
  stop(): Promise<Blob>;
  /** Discards audio and returns to `idle`. */
  retry(): void;
  /** Called after transcription succeeds or fails; discards audio. */
  discard(): void;
  subscribe(listener: (s: VoiceCaptureSnapshot) => void): () => void;
}

export interface VoiceCaptureDeps {
  mediaDevices?: MediaDevices;
  now?: () => number;
}

const TICK_MS = 250;

function mapPermissionError(err: unknown): CaptureError {
  const name = err instanceof Error ? err.name : '';
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'DevicesNotFoundError'
  ) {
    return { kind: 'no_device' };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return { kind: 'permission_denied' };
  }
  return { kind: 'stream_failure', message: err instanceof Error ? err.message : 'Unknown error' };
}

/**
 * Creates a microphone capture session. Audio lives only in closure variables;
 * this module performs no storage or network calls.
 */
export function createVoiceCapture(deps: VoiceCaptureDeps = {}): VoiceCapture {
  const now = deps.now ?? (() => Date.now());
  const listeners = new Set<(s: VoiceCaptureSnapshot) => void>();

  let snapshot: VoiceCaptureSnapshot = initialSnapshot;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let audio: Blob | null = null;
  let startedAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let pendingStop: { resolve: (b: Blob) => void; reject: (e: Error) => void } | null = null;
  // Incremented on every reset so late async results from an old session are ignored.
  let generation = 0;

  const dispatch = (event: CaptureEvent): void => {
    const next = captureReducer(snapshot, event);
    if (next === snapshot) return;
    snapshot = next;
    for (const l of [...listeners]) l(snapshot);
  };

  const stopTimer = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const releaseStream = (): void => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  const clearAudio = (): void => {
    chunks = [];
    audio = null;
  };

  const teardown = (): void => {
    stopTimer();
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // already stopped
        }
      }
      recorder = null;
    }
    releaseStream();
  };

  const failStream = (message: string): void => {
    if (snapshot.state !== 'recording') return;
    teardown();
    clearAudio();
    dispatch({ type: 'stream_failure', error: { kind: 'stream_failure', message } });
    pendingStop?.reject(new Error(message));
    pendingStop = null;
  };

  const reset = (event: CaptureEvent): void => {
    const before = snapshot;
    dispatch(event);
    if (snapshot !== before) {
      generation += 1;
      teardown();
      clearAudio();
    }
  };

  const getMediaDevices = (): MediaDevices | undefined =>
    deps.mediaDevices ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);

  const api: VoiceCapture = {
    get state(): RecordingState {
      return snapshot.state;
    },
    get elapsedMs(): number {
      return snapshot.elapsedMs;
    },
    get error(): CaptureError | null {
      return snapshot.error;
    },

    async start(): Promise<void> {
      if (snapshot.state !== 'idle') return;
      dispatch({ type: 'start' });
      const myGeneration = generation;

      const devices = getMediaDevices();
      if (
        !devices ||
        typeof devices.getUserMedia !== 'function' ||
        typeof MediaRecorder === 'undefined'
      ) {
        dispatch({ type: 'permission_failed', error: { kind: 'unsupported' } });
        return;
      }

      let acquired: MediaStream;
      try {
        acquired = await devices.getUserMedia({ audio: true });
      } catch (err) {
        if (myGeneration === generation) {
          dispatch({ type: 'permission_failed', error: mapPermissionError(err) });
        }
        return;
      }
      if (myGeneration !== generation || api.state !== 'requesting_permission') {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }

      try {
        stream = acquired;
        chunks = [];
        const rec = new MediaRecorder(acquired);
        recorder = rec;
        rec.ondataavailable = (e: BlobEvent): void => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        rec.onerror = (): void => failStream('Recording failed');
        rec.start();
      } catch (err) {
        teardown();
        clearAudio();
        dispatch({
          type: 'permission_failed',
          error: {
            kind: 'stream_failure',
            message: err instanceof Error ? err.message : 'Recording failed',
          },
        });
        return;
      }

      startedAt = now();
      dispatch({ type: 'permission_granted' });
      timer = setInterval(() => {
        dispatch({ type: 'tick', elapsedMs: now() - startedAt });
      }, TICK_MS);
    },

    stop(): Promise<Blob> {
      const rec = recorder;
      if (snapshot.state !== 'recording' || !rec) {
        return Promise.reject(new Error('Not recording'));
      }
      const elapsed = now() - startedAt;
      return new Promise<Blob>((resolve, reject) => {
        pendingStop = { resolve, reject };
        rec.onstop = (): void => {
          const type = rec.mimeType || 'audio/webm';
          audio = new Blob(chunks, { type });
          chunks = [];
          const result = audio;
          stopTimer();
          releaseStream();
          recorder = null;
          dispatch({ type: 'stop', elapsedMs: elapsed });
          pendingStop?.resolve(result);
          pendingStop = null;
        };
        try {
          rec.stop();
        } catch (err) {
          failStream(err instanceof Error ? err.message : 'Stop failed');
        }
      });
    },

    retry(): void {
      reset({ type: 'retry' });
    },

    discard(): void {
      reset({ type: 'discard' });
    },

    subscribe(listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return api;
}
