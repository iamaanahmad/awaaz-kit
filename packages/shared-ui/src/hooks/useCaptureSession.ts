import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

/**
 * CaptureSession: layers transcription and parsing over Recording_State (design.md,
 * "Capture session state machine"). The reducer is pure and generic over the draft type so
 * shared-ui stays independent of the workflow packages and of local-data.
 */

/** Mirrors the voice-capture Recording_State names (Req 4.2). */
export type RecordingPhase = 'idle' | 'requesting_permission' | 'recording' | 'stopped' | 'error';

/** Transcription sub-state, shown as the processing indicator (Req 5.10). */
export type TranscriptionPhase = 'none' | 'transcribing' | 'ready' | 'failed';

export type TranscriptSource = 'audio' | 'typed' | null;

export interface CaptureSessionState<TDraft> {
  recording: RecordingPhase;
  transcription: TranscriptionPhase;
  source: TranscriptSource;
  /** Exactly what the speech provider returned; never changes on edit (Req 5.12, 6.6). */
  rawTranscript: string | null;
  /** The editable transcript the parser runs on (Req 6.3). */
  transcript: string;
  /** Latest parse result for `transcript`, or null (never created for blank text, Req 6.5). */
  draft: TDraft | null;
  /** Failure reason when transcription failed (Req 5.9). */
  failureReason: string | null;
  /** True when the transcript is empty or whitespace after a produced/edited transcript. */
  blank: boolean;
  /** Bumped on every transcript change so stale async parses can be discarded. */
  revision: number;
}

export type CaptureSessionAction<TDraft> =
  | { type: 'recording_changed'; phase: RecordingPhase }
  | { type: 'transcription_started' }
  | { type: 'transcription_succeeded'; text: string }
  | { type: 'transcription_failed'; reason: string }
  | { type: 'transcript_edited'; text: string }
  | { type: 'typed_submitted'; text: string }
  | { type: 'draft_parsed'; revision: number; draft: TDraft | null }
  | { type: 'reset' };

export function isBlankTranscript(text: string): boolean {
  return text.trim().length === 0;
}

export function initialCaptureSessionState<TDraft>(): CaptureSessionState<TDraft> {
  return {
    recording: 'idle',
    transcription: 'none',
    source: null,
    rawTranscript: null,
    transcript: '',
    draft: null,
    failureReason: null,
    blank: false,
    revision: 0,
  };
}

export function captureSessionReducer<TDraft>(
  state: CaptureSessionState<TDraft>,
  action: CaptureSessionAction<TDraft>,
): CaptureSessionState<TDraft> {
  switch (action.type) {
    case 'recording_changed': {
      // A new recording attempt starts a fresh audio session; typed text is left alone.
      if (action.phase === 'requesting_permission' || action.phase === 'recording') {
        return {
          ...state,
          recording: action.phase,
          transcription: 'none',
          failureReason: null,
        };
      }
      return { ...state, recording: action.phase };
    }
    case 'transcription_started':
      return { ...state, transcription: 'transcribing', failureReason: null };
    case 'transcription_succeeded': {
      const blank = isBlankTranscript(action.text);
      return {
        ...state,
        transcription: 'ready',
        source: 'audio',
        rawTranscript: action.text,
        transcript: action.text,
        draft: null,
        failureReason: null,
        blank,
        revision: state.revision + 1,
      };
    }
    case 'transcription_failed':
      // Typed input stays available; the transcript the user already has is preserved (Req 5.9).
      return { ...state, transcription: 'failed', failureReason: action.reason };
    case 'transcript_edited':
    case 'typed_submitted': {
      const blank = isBlankTranscript(action.text);
      const typed = action.type === 'typed_submitted';
      return {
        ...state,
        source: typed && state.source === null ? 'typed' : state.source,
        // Raw_Transcript is only ever set from audio; for first typed entry there is no audio.
        transcription: typed ? 'ready' : state.transcription,
        transcript: action.text,
        // Blank text never yields a draft (Req 6.5); otherwise keep the old one until re-parse lands.
        draft: blank ? null : state.draft,
        failureReason: typed ? null : state.failureReason,
        blank,
        revision: state.revision + 1,
      };
    }
    case 'draft_parsed': {
      if (action.revision !== state.revision || state.blank) return state;
      return { ...state, draft: action.draft };
    }
    case 'reset':
      return initialCaptureSessionState<TDraft>();
  }
}

export interface CaptureSessionView<TDraft> extends CaptureSessionState<TDraft> {
  /** Show retry and typed-entry options (blank transcript or failed transcription). */
  offerRetryAndTyping: boolean;
  /** True while the processing indicator should be visible. */
  processing: boolean;
}

export function selectCaptureSessionView<TDraft>(
  state: CaptureSessionState<TDraft>,
): CaptureSessionView<TDraft> {
  return {
    ...state,
    offerRetryAndTyping: state.blank || state.transcription === 'failed',
    processing: state.transcription === 'transcribing',
  };
}

export interface UseCaptureSessionOptions<TDraft> {
  /** Parses the (edited) transcript; called again whenever the transcript changes. */
  parse: (transcript: string) => TDraft | null | Promise<TDraft | null>;
}

export interface UseCaptureSession<TDraft> {
  session: CaptureSessionView<TDraft>;
  setRecordingPhase: (phase: RecordingPhase) => void;
  startTranscription: () => void;
  transcriptionSucceeded: (text: string) => void;
  transcriptionFailed: (reason: string) => void;
  editTranscript: (text: string) => void;
  submitTyped: (text: string) => void;
  reset: () => void;
}

export function useCaptureSession<TDraft>(
  options: UseCaptureSessionOptions<TDraft>,
): UseCaptureSession<TDraft> {
  const [state, dispatch] = useReducer(
    captureSessionReducer<TDraft>,
    undefined,
    initialCaptureSessionState<TDraft>,
  );
  const parseRef = useRef(options.parse);
  parseRef.current = options.parse;

  // Re-run normalization, extraction and matching on every transcript change (Req 6.4).
  useEffect(() => {
    if (state.revision === 0 || state.blank) return;
    const { revision, transcript } = state;
    let cancelled = false;
    void Promise.resolve()
      .then(() => parseRef.current(transcript))
      .then((draft) => {
        if (!cancelled) dispatch({ type: 'draft_parsed', revision, draft });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'draft_parsed', revision, draft: null });
      });
    return () => {
      cancelled = true;
    };
  }, [state.revision, state.blank, state.transcript]);

  const session = useMemo(() => selectCaptureSessionView(state), [state]);

  return {
    session,
    setRecordingPhase: useCallback((phase) => dispatch({ type: 'recording_changed', phase }), []),
    startTranscription: useCallback(() => dispatch({ type: 'transcription_started' }), []),
    transcriptionSucceeded: useCallback(
      (text) => dispatch({ type: 'transcription_succeeded', text }),
      [],
    ),
    transcriptionFailed: useCallback(
      (reason) => dispatch({ type: 'transcription_failed', reason }),
      [],
    ),
    editTranscript: useCallback((text) => dispatch({ type: 'transcript_edited', text }), []),
    submitTyped: useCallback((text) => dispatch({ type: 'typed_submitted', text }), []),
    reset: useCallback(() => dispatch({ type: 'reset' }), []),
  };
}
