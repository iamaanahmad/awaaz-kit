import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createVoiceCapture,
  type VoiceCapture,
  type VoiceCaptureSnapshot,
} from '@awaaz-kit/voice-capture';
import type { SpeechToTextProvider } from '@awaaz-kit/speech-provider';
import type { MicErrorKind, UseCaptureSession } from '@awaaz-kit/shared-ui';

export interface VoiceRecorder {
  snapshot: VoiceCaptureSnapshot;
  errorKind: MicErrorKind;
  start: () => void;
  stop: () => void;
  retry: () => void;
}

const IDLE: VoiceCaptureSnapshot = { state: 'idle', elapsedMs: 0, error: null };

type SessionActions = Pick<
  UseCaptureSession<unknown>,
  'setRecordingPhase' | 'startTranscription' | 'transcriptionSucceeded' | 'transcriptionFailed'
>;

/**
 * Connects Voice_Capture and the speech provider to the capture session.
 * Audio stays in memory only and is discarded once transcription finishes (Req 4.8).
 */
export function useVoiceRecorder(
  provider: SpeechToTextProvider,
  session: SessionActions,
): VoiceRecorder {
  const captureRef = useRef<VoiceCapture | null>(null);
  captureRef.current ??= createVoiceCapture();
  const [snapshot, setSnapshot] = useState<VoiceCaptureSnapshot>(IDLE);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const capture = captureRef.current as VoiceCapture;
    const unsubscribe = capture.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      if (capture.state === 'recording') {
        capture
          .stop()
          .then(() => capture.discard())
          .catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    sessionRef.current.setRecordingPhase(snapshot.state);
  }, [snapshot.state]);

  const start = useCallback(() => {
    void (captureRef.current as VoiceCapture).start();
  }, []);

  const retry = useCallback(() => {
    (captureRef.current as VoiceCapture).retry();
  }, []);

  const stop = useCallback(() => {
    const capture = captureRef.current as VoiceCapture;
    void (async () => {
      let audio: Blob;
      try {
        audio = await capture.stop();
      } catch {
        return;
      }
      sessionRef.current.startTranscription();
      try {
        const result = await provider.transcribe(audio, { language: 'auto' });
        sessionRef.current.transcriptionSucceeded(result.text);
      } catch (err) {
        sessionRef.current.transcriptionFailed(
          err instanceof Error ? err.message : 'Transcription failed',
        );
      } finally {
        capture.discard();
      }
    })();
  }, [provider]);

  const kind = snapshot.error?.kind;
  const errorKind: MicErrorKind =
    kind === 'permission_denied'
      ? 'permission_denied'
      : kind === 'no_device'
        ? 'no_device'
        : 'unknown';

  return { snapshot, errorKind, start, stop, retry };
}
