import { sampleClipTranscripts } from './samples.js';
import type { InitializeResult, SpeechToTextProvider, TranscriptionResult } from './types.js';

const CLIP_PREFIX = 'scripted-clip:';

export class UnknownClipError extends Error {
  constructor(public readonly clipId: string | null) {
    super(clipId ? `Unknown scripted clip: ${clipId}` : 'Audio is not a scripted fixture clip');
    this.name = 'UnknownClipError';
  }
}

/** Builds a fixture "audio" Blob that `ScriptedProvider` maps to a fixed transcript. */
export function makeScriptedClip(clipId: string): Blob {
  return new Blob([`${CLIP_PREFIX}${clipId}`], { type: 'audio/x-scripted' });
}

export interface ScriptedProviderOptions {
  /** clip id -> transcript. Defaults to the sample utterances. */
  clips?: Record<string, string>;
}

/**
 * Returns a fixed transcript for a known fixture clip id. No microphone, model
 * or network involved. `confidence` is never set.
 */
export class ScriptedProvider implements SpeechToTextProvider {
  private readonly clips: Record<string, string>;

  constructor(options: ScriptedProviderOptions = {}) {
    this.clips = options.clips ?? sampleClipTranscripts();
  }

  initialize(): Promise<InitializeResult> {
    return Promise.resolve({ ready: true, modelVersion: 'scripted' });
  }

  async transcribe(audio: Blob): Promise<TranscriptionResult> {
    const body = await audio.text();
    if (!body.startsWith(CLIP_PREFIX)) throw new UnknownClipError(null);
    const clipId = body.slice(CLIP_PREFIX.length);
    const text = Object.prototype.hasOwnProperty.call(this.clips, clipId)
      ? this.clips[clipId]
      : undefined;
    if (text === undefined) throw new UnknownClipError(clipId);
    return { text };
  }
}
