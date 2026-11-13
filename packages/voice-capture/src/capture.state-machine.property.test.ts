import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';

import { createVoiceCapture, type RecordingState } from './index';

/**
 * Independent oracle: the transition table from the design's "Capture session state machine"
 * diagram, written as data. It does not call the reducer or the capture factory.
 *
 * Action outcomes:
 *  - start (granted)   idle -> requesting_permission -> recording
 *  - start (failed)    idle -> requesting_permission -> error   (denied, no device, other failure)
 *  - stop              recording -> stopped
 *  - fail (stream)     recording -> error
 *  - retry             stopped | error -> idle
 *  - discard           stopped -> idle
 * Everything else leaves the state unchanged.
 */
type Action =
  | 'start_grant'
  | 'start_denied'
  | 'start_no_device'
  | 'start_other'
  | 'stop'
  | 'fail'
  | 'retry'
  | 'discard';

const ALL_STATES: readonly RecordingState[] = [
  'idle',
  'requesting_permission',
  'recording',
  'stopped',
  'error',
];

const ORACLE: Record<Action, Partial<Record<RecordingState, RecordingState>>> = {
  start_grant: { idle: 'recording' },
  start_denied: { idle: 'error' },
  start_no_device: { idle: 'error' },
  start_other: { idle: 'error' },
  stop: { recording: 'stopped' },
  fail: { recording: 'error' },
  retry: { stopped: 'idle', error: 'idle' },
  discard: { stopped: 'idle' },
};

const EXPECTED_ERROR_KIND: Partial<Record<Action, string>> = {
  start_denied: 'permission_denied',
  start_no_device: 'no_device',
  start_other: 'stream_failure',
};

// ---- Fake media device (scripted outcomes) ----

class FakeTrack {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

class FakeStream {
  readonly tracks = [new FakeTrack()];
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static chunkSize = 1;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: FakeStream) {
    FakeRecorder.instances.push(this);
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    const size = FakeRecorder.chunkSize;
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) });
      this.onstop?.();
    });
  }
}

const actionArb = fc.constantFrom<Action>(
  'start_grant',
  'start_denied',
  'start_no_device',
  'start_other',
  'stop',
  'fail',
  'retry',
  'discard',
);

describe('voice-capture state machine', () => {
  beforeEach(() => {
    FakeRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Feature: awaaz-kit, Property 32: Capture state machine is legal and discards audio
  // **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**
  it('Property 32: Capture state machine is legal and discards audio', async () => {
    await assertProperty(
      fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 40 }), async (actions) => {
        FakeRecorder.instances = [];
        const streams: FakeStream[] = [];
        let outcome: 'grant' | 'denied' | 'no_device' | 'other' = 'grant';
        let getUserMediaCalls = 0;
        const mediaDevices = {
          getUserMedia: async (): Promise<FakeStream> => {
            getUserMediaCalls += 1;
            if (outcome === 'denied')
              throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
            if (outcome === 'no_device')
              throw Object.assign(new Error('x'), { name: 'NotFoundError' });
            if (outcome === 'other') throw new Error('boom');
            const s = new FakeStream();
            streams.push(s);
            return s;
          },
        } as unknown as MediaDevices;

        const capture = createVoiceCapture({ mediaDevices });
        const seen: RecordingState[] = [capture.state];
        capture.subscribe((s) => seen.push(s.state));

        let model: RecordingState = 'idle';
        let sessionIndex = 0;
        // Audio size the current recording session should produce (fresh chunks only).
        let expectedBytes = 0;

        for (const action of actions) {
          const before: RecordingState = model;
          const callsBefore = getUserMediaCalls;
          const next: RecordingState = ORACLE[action][before] ?? before;

          if (action.startsWith('start_')) {
            outcome =
              action === 'start_grant'
                ? 'grant'
                : action === 'start_denied'
                  ? 'denied'
                  : action === 'start_no_device'
                    ? 'no_device'
                    : 'other';
            sessionIndex += 1;
            FakeRecorder.chunkSize = sessionIndex;
            expectedBytes = sessionIndex;
            await capture.start();
          } else if (action === 'stop') {
            if (before === 'recording') {
              const blob = await capture.stop();
              // Only this session's audio is returned; nothing leaks from earlier sessions.
              expect(blob.size).toBe(expectedBytes);
            } else {
              await expect(capture.stop()).rejects.toBeDefined();
            }
          } else if (action === 'fail') {
            const rec = FakeRecorder.instances[FakeRecorder.instances.length - 1];
            if (before === 'recording' && rec) rec.onerror?.();
            // When not recording, a stray stream failure must be a no-op; nothing to trigger.
          } else if (action === 'retry') {
            capture.retry();
          } else {
            capture.discard();
          }

          // Only legal transitions occur.
          expect(capture.state).toBe(next);
          expect(ALL_STATES).toContain(capture.state);
          // Permission is requested only inside start(), and only from idle.
          const startedFromIdle = action.startsWith('start_') && before === 'idle';
          expect(getUserMediaCalls - callsBefore).toBe(startedFromIdle ? 1 : 0);
          // Error info is present exactly in the error state, with the mapped kind.
          if (capture.state === 'error') {
            expect(capture.error).not.toBeNull();
            const kind = EXPECTED_ERROR_KIND[action];
            if (kind && before === 'idle') expect(capture.error?.kind).toBe(kind);
            if (action === 'fail' && before === 'recording')
              expect(capture.error?.kind).toBe('stream_failure');
          } else {
            expect(capture.error).toBeNull();
          }
          // Leaving recording releases the microphone; only a live session holds an unstopped track.
          const live = streams.filter((s) => s.tracks.some((t) => !t.stopped)).length;
          expect(live).toBe(capture.state === 'recording' ? 1 : 0);
          // After retry/discard the session is fully reset.
          if (action === 'retry' || action === 'discard') {
            if (next === 'idle') {
              expect(capture.state).toBe('idle');
              expect(capture.elapsedMs).toBe(0);
              expect(capture.error).toBeNull();
            }
          }
          model = next;
        }

        // Every observed state was one of the five defined states.
        for (const s of seen) expect(ALL_STATES).toContain(s);
        // Wind down any live session so no timer or stream leaks between runs.
        if (capture.state === 'recording') {
          await capture.stop();
        }
      }),
    );
  });
});
