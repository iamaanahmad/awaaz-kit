export type RecordingState = 'idle' | 'requesting_permission' | 'recording' | 'stopped' | 'error';

export type CaptureError =
  | { kind: 'permission_denied' }
  | { kind: 'no_device' }
  | { kind: 'unsupported' }
  | { kind: 'stream_failure'; message: string };

export interface VoiceCaptureSnapshot {
  readonly state: RecordingState;
  readonly elapsedMs: number;
  readonly error: CaptureError | null;
}

export type CaptureEvent =
  | { type: 'start' }
  | { type: 'permission_granted' }
  | { type: 'permission_failed'; error: CaptureError }
  | { type: 'tick'; elapsedMs: number }
  | { type: 'stop'; elapsedMs: number }
  | { type: 'stream_failure'; error: CaptureError }
  | { type: 'retry' }
  | { type: 'discard' };

export const initialSnapshot: VoiceCaptureSnapshot = {
  state: 'idle',
  elapsedMs: 0,
  error: null,
};

/**
 * Pure Recording_State reducer. Illegal events for the current state return
 * the same snapshot reference unchanged.
 */
export function captureReducer(
  snapshot: VoiceCaptureSnapshot,
  event: CaptureEvent,
): VoiceCaptureSnapshot {
  switch (event.type) {
    case 'start':
      return snapshot.state === 'idle'
        ? { state: 'requesting_permission', elapsedMs: 0, error: null }
        : snapshot;
    case 'permission_granted':
      return snapshot.state === 'requesting_permission'
        ? { state: 'recording', elapsedMs: 0, error: null }
        : snapshot;
    case 'permission_failed':
      return snapshot.state === 'requesting_permission'
        ? { state: 'error', elapsedMs: 0, error: event.error }
        : snapshot;
    case 'tick':
      return snapshot.state === 'recording'
        ? { ...snapshot, elapsedMs: Math.max(0, event.elapsedMs) }
        : snapshot;
    case 'stop':
      return snapshot.state === 'recording'
        ? { state: 'stopped', elapsedMs: Math.max(0, event.elapsedMs), error: null }
        : snapshot;
    case 'stream_failure':
      return snapshot.state === 'recording'
        ? { state: 'error', elapsedMs: snapshot.elapsedMs, error: event.error }
        : snapshot;
    case 'retry':
      return snapshot.state === 'stopped' || snapshot.state === 'error'
        ? initialSnapshot
        : snapshot;
    case 'discard':
      return snapshot.state === 'stopped' ? initialSnapshot : snapshot;
  }
}
