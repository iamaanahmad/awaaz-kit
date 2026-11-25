import { describe, expect, it } from 'vitest';
import {
  ProviderUnavailableError,
  SAMPLE_UTTERANCES,
  ScriptedProvider,
  ShrutiOnnxProvider,
  UnknownClipError,
  createOnDeviceVoice,
  createProvider,
  makeScriptedClip,
  resolveProviderId,
} from './index.js';

describe('ScriptedProvider', () => {
  it('returns the fixed transcript for a known clip', async () => {
    const p = createProvider('scripted');
    expect(await p.initialize()).toEqual({ ready: true, modelVersion: 'scripted' });
    const r = await p.transcribe(makeScriptedClip('order-hinglish-1'));
    expect(r.text).toBe('do kilo aata, ek litre tel aur paanch kilo chawal');
    expect(r.confidence).toBeUndefined();
  });

  it('rejects unknown clips and non-fixture audio', async () => {
    const p = new ScriptedProvider();
    await expect(p.transcribe(makeScriptedClip('nope'))).rejects.toBeInstanceOf(UnknownClipError);
    await expect(p.transcribe(new Blob(['x']))).rejects.toBeInstanceOf(UnknownClipError);
    await expect(p.transcribe(makeScriptedClip('toString'))).rejects.toBeInstanceOf(
      UnknownClipError,
    );
  });
});

describe('registry', () => {
  it('builds the real Shruti provider by default, and uses injected adapters when given', () => {
    expect(createProvider('shruti')).toBeInstanceOf(ShrutiOnnxProvider);
    expect(() => createProvider('whisper-wasm')).toThrow(ProviderUnavailableError);
    const fake = new ScriptedProvider();
    expect(createProvider('whisper-wasm', { adapters: { 'whisper-wasm': () => fake } })).toBe(fake);
    expect(createProvider('shruti', { adapters: { shruti: () => fake } })).toBe(fake);
  });

  it('resolves env values with fallback', () => {
    expect(resolveProviderId('scripted')).toBe('scripted');
    expect(resolveProviderId('bogus')).toBe('shruti');
    expect(resolveProviderId(undefined, 'whisper-wasm')).toBe('whisper-wasm');
  });

  it('pairs the Shruti provider with a model manager for the same files', () => {
    const voice = createOnDeviceVoice('shruti');
    expect(voice.provider).toBeInstanceOf(ShrutiOnnxProvider);
    expect(voice.manager).not.toBeNull();
    // Publisher's sizes for the four int8 files: about 50 MB, downloaded once.
    expect(voice.approxBytes).toBe(911143 + 19633861 + 32293075 + 94153);
    expect(createOnDeviceVoice('scripted')).toMatchObject({ manager: null, approxBytes: 0 });
  });

  it('has unique labelled samples including the required utterance', () => {
    const ids = SAMPLE_UTTERANCES.map((s) => s.clipId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SAMPLE_UTTERANCES.map((s) => s.text)).toContain(
      'do kilo aata, ek litre tel aur paanch kilo chawal',
    );
  });
});
