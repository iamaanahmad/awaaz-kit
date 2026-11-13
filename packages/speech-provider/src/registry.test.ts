import { describe, expect, it } from 'vitest';
import {
  ProviderUnavailableError,
  SAMPLE_UTTERANCES,
  ScriptedProvider,
  UnknownClipError,
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
  it('throws for real providers that are not injected, and uses injected ones', () => {
    expect(() => createProvider('shruti')).toThrow(ProviderUnavailableError);
    const fake = new ScriptedProvider();
    expect(createProvider('whisper-wasm', { adapters: { 'whisper-wasm': () => fake } })).toBe(fake);
  });

  it('resolves env values with fallback', () => {
    expect(resolveProviderId('shruti')).toBe('shruti');
    expect(resolveProviderId('bogus')).toBe('scripted');
    expect(resolveProviderId(undefined, 'whisper-wasm')).toBe('whisper-wasm');
  });

  it('has unique labelled samples including the required utterance', () => {
    const ids = SAMPLE_UTTERANCES.map((s) => s.clipId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SAMPLE_UTTERANCES.map((s) => s.text)).toContain(
      'do kilo aata, ek litre tel aur paanch kilo chawal',
    );
  });
});
