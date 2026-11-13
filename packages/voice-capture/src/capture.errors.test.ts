import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVoiceCapture } from './index';

/**
 * Example tests for capture error handling.
 * **Validates: Requirements 4.1, 4.6, 4.7**
 */

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
  static throwOnStart = false;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: FakeStream) {}
  start(): void {
    if (FakeRecorder.throwOnStart) throw new Error('recorder boom');
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
  }
}

function domError(name: string, message = name): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

function devicesWith(getUserMedia: () => Promise<unknown>): MediaDevices {
  return { getUserMedia } as unknown as MediaDevices;
}

describe('voice-capture errors', () => {
  beforeEach(() => {
    FakeRecorder.throwOnStart = false;
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not request the microphone on construction', () => {
    const getUserMedia = vi.fn(() => Promise.resolve(new FakeStream()));
    const capture = createVoiceCapture({ mediaDevices: devicesWith(getUserMedia) });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(capture.state).toBe('idle');
    expect(capture.error).toBeNull();
  });

  it('requests the microphone only when start() is called', async () => {
    const getUserMedia = vi.fn(() => Promise.resolve(new FakeStream()));
    const capture = createVoiceCapture({ mediaDevices: devicesWith(getUserMedia) });
    await capture.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(capture.state).toBe('recording');
    capture.discard();
  });

  it.each(['NotAllowedError', 'SecurityError', 'PermissionDeniedError'])(
    'maps %s to permission_denied',
    async (name) => {
      const capture = createVoiceCapture({
        mediaDevices: devicesWith(() => Promise.reject(domError(name))),
      });
      await capture.start();
      expect(capture.state).toBe('error');
      expect(capture.error).toEqual({ kind: 'permission_denied' });
    },
  );

  it.each(['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'])(
    'maps %s to no_device',
    async (name) => {
      const capture = createVoiceCapture({
        mediaDevices: devicesWith(() => Promise.reject(domError(name))),
      });
      await capture.start();
      expect(capture.state).toBe('error');
      expect(capture.error).toEqual({ kind: 'no_device' });
    },
  );

  it('reports unsupported when MediaRecorder is missing', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const getUserMedia = vi.fn(() => Promise.resolve(new FakeStream()));
    const capture = createVoiceCapture({ mediaDevices: devicesWith(getUserMedia) });
    await capture.start();
    expect(capture.state).toBe('error');
    expect(capture.error).toEqual({ kind: 'unsupported' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('reports unsupported when getUserMedia is unavailable', async () => {
    const capture = createVoiceCapture({ mediaDevices: {} as unknown as MediaDevices });
    await capture.start();
    expect(capture.state).toBe('error');
    expect(capture.error).toEqual({ kind: 'unsupported' });
  });

  it('maps other getUserMedia failures to stream_failure', async () => {
    const capture = createVoiceCapture({
      mediaDevices: devicesWith(() => Promise.reject(domError('AbortError', 'device busy'))),
    });
    await capture.start();
    expect(capture.state).toBe('error');
    expect(capture.error).toEqual({ kind: 'stream_failure', message: 'device busy' });
  });

  it('reports stream_failure and releases tracks when the recorder fails to start', async () => {
    FakeRecorder.throwOnStart = true;
    const stream = new FakeStream();
    const capture = createVoiceCapture({
      mediaDevices: devicesWith(() => Promise.resolve(stream)),
    });
    await capture.start();
    expect(capture.state).toBe('error');
    expect(capture.error).toEqual({ kind: 'stream_failure', message: 'recorder boom' });
    expect(stream.tracks[0]?.stopped).toBe(true);
  });

  it('returns to idle on retry after an error and clears the error', async () => {
    const capture = createVoiceCapture({
      mediaDevices: devicesWith(() => Promise.reject(domError('NotAllowedError'))),
    });
    await capture.start();
    capture.retry();
    expect(capture.state).toBe('idle');
    expect(capture.error).toBeNull();
  });
});
