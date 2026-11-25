import { describe, expect, it, vi } from 'vitest';
import {
  SHRUTI_HI_MANIFEST,
  ShrutiOnnxProvider,
  SpeechProviderError,
  type ShrutiLoader,
} from './shruti-onnx.js';
import { modelManifestSchema } from './model-manager.js';

/** In-memory Cache Storage with just the calls the provider makes. */
function fakeCaches(present: string[]) {
  const store = new Map(present.map((u) => [u, new Response(`bytes of ${u}`)]));
  const cache = { match: vi.fn(async (url: string) => store.get(url)) };
  return {
    caches: { open: vi.fn(async () => cache) } as unknown as CacheStorage,
    cache,
  };
}

const allFiles = SHRUTI_HI_MANIFEST.files.map((f) => f.url);
const decodeAudio = async () => new Float32Array(16000);

describe('Shruti manifest', () => {
  it('is a valid manifest of the four published int8 files with SHA-256 values', () => {
    expect(() => modelManifestSchema.parse(SHRUTI_HI_MANIFEST)).not.toThrow();
    expect(SHRUTI_HI_MANIFEST.files.map((f) => f.url.split('/').pop())).toEqual([
      'frontend.onnx',
      'encoder.onnx',
      'decoder.onnx',
      'shruti.json',
    ]);
    for (const f of SHRUTI_HI_MANIFEST.files) {
      expect(f.url.startsWith('https://')).toBe(true);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('ShrutiOnnxProvider', () => {
  it('reports not ready (not an error) when the model is not downloaded, and never loads', async () => {
    const loadModel = vi.fn<ShrutiLoader>();
    const { caches } = fakeCaches([]);
    const p = new ShrutiOnnxProvider({ caches, loadModel });
    expect(await p.initialize()).toEqual({ ready: false });
    expect(loadModel).not.toHaveBeenCalled();
  });

  it('fails a recording with model_missing instead of fetching the model', async () => {
    const loadModel = vi.fn<ShrutiLoader>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { caches } = fakeCaches(allFiles.slice(0, 3)); // one file evicted
    const p = new ShrutiOnnxProvider({ caches, loadModel, decodeAudio });
    await expect(p.transcribe(new Blob(['a']))).rejects.toMatchObject({ reason: 'model_missing' });
    expect(loadModel).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('loads the model only through a cache-only fetch, with no network', async () => {
    const { caches } = fakeCaches(allFiles);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let seen: { ok?: boolean; status?: number } | null = null;
    const loadModel: ShrutiLoader = async ({ baseUrl, fetchFn }) => {
      expect(baseUrl.endsWith('/hi/onnx-int8/')).toBe(true);
      expect(await fetchFn(`${baseUrl}encoder.onnx`)).toBeInstanceOf(Response);
      seen = (await fetchFn(`${baseUrl}not-in-cache.onnx`)) as { ok: boolean; status: number };
      return { transcribe: async () => ({ text: 'x' }) };
    };
    const p = new ShrutiOnnxProvider({ caches, loadModel });
    await p.load();
    expect(seen).toEqual({ ok: false, status: 404 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('loads once and shares the result; initialize reports the version and warms up', async () => {
    const { caches } = fakeCaches(allFiles);
    const loadModel = vi.fn<ShrutiLoader>(async () => ({ transcribe: async () => ({ text: '' }) }));
    const p = new ShrutiOnnxProvider({ caches, loadModel });
    expect(await p.initialize()).toEqual({ ready: true, modelVersion: 'shruti-hi-int8' });
    await Promise.all([p.load(), p.load()]);
    expect(loadModel).toHaveBeenCalledTimes(1);
  });

  it('transcribes decoded audio, passes the language hint, cuts loops and never adds confidence', async () => {
    const { caches } = fakeCaches(allFiles);
    const calls: unknown[] = [];
    const loadModel: ShrutiLoader = async () => ({
      transcribe: async (samples, opts) => {
        calls.push({ n: samples.length, ...opts });
        return { text: '  दो किलो आटा  ', language: 'hi' };
      },
    });
    let t = 1000;
    const p = new ShrutiOnnxProvider({ caches, loadModel, decodeAudio, now: () => (t += 250) });
    const auto = await p.transcribe(new Blob(['a']), { language: 'auto' });
    expect(auto).toEqual({ text: 'दो किलो आटा', language: 'hi', durationMs: 250 });
    expect(auto).not.toHaveProperty('confidence');
    await p.transcribe(new Blob(['a']), { language: 'en' });
    expect(calls).toEqual([
      { n: 16000, language: null, loops: 'cut' },
      { n: 16000, language: 'en', loops: 'cut' },
    ]);
  });

  it('maps failures to typed reasons and allows a retry after a load failure', async () => {
    const { caches } = fakeCaches(allFiles);
    let fail = true;
    const loadModel: ShrutiLoader = async () => {
      if (fail) throw new Error('wasm blocked');
      return { transcribe: async () => ({ text: 'ok' }) };
    };
    const p = new ShrutiOnnxProvider({ caches, loadModel, decodeAudio });
    await expect(p.load()).rejects.toMatchObject({ reason: 'model_load_failed' });
    fail = false;
    expect((await p.transcribe(new Blob(['a']))).text).toBe('ok');

    const bad = new ShrutiOnnxProvider({
      caches,
      loadModel,
      decodeAudio: async () => {
        throw new Error('not audio');
      },
    });
    await expect(bad.transcribe(new Blob(['a']))).rejects.toMatchObject({
      reason: 'decode_failed',
    });

    const broken = new ShrutiOnnxProvider({
      caches,
      decodeAudio,
      loadModel: async () => ({
        transcribe: async () => {
          throw new Error('session crashed');
        },
      }),
    });
    await expect(broken.transcribe(new Blob(['a']))).rejects.toMatchObject({
      reason: 'inference_failed',
    });
  });

  it('times out a stuck transcription with a typed error', async () => {
    vi.useFakeTimers();
    const { caches } = fakeCaches(allFiles);
    const p = new ShrutiOnnxProvider({
      caches,
      decodeAudio,
      timeoutMs: 1000,
      loadModel: async () => ({ transcribe: () => new Promise(() => undefined) }),
    });
    const pending = p.transcribe(new Blob(['a']));
    const assertion = expect(pending).rejects.toBeInstanceOf(SpeechProviderError);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    vi.useRealTimers();
  });
});
