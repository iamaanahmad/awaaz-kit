// Mocked ort session only. No real Shruti model: the adapter is UNVERIFIED against the real model.
import { describe, expect, it, vi } from 'vitest';
import {
  ShrutiProvider,
  SpeechProviderError,
  createProvider,
  ctcGreedy,
  shrutiAdapterFactory,
  type OrtLike,
  type OrtSessionLike,
  type ShrutiConfig,
} from './index.js';

function fakeCaches(files: Record<string, string>): CacheStorage {
  const cache = {
    match: (url: string) =>
      Promise.resolve(url in files ? new Response(files[url] as string) : undefined),
  };
  return { open: () => Promise.resolve(cache) } as unknown as CacheStorage;
}

function fakeOrt(session: OrtSessionLike) {
  const created: { type: string; dims: readonly number[] }[] = [];
  const ort: OrtLike = {
    Tensor: class {
      constructor(
        public type: string,
        public data: unknown,
        public dims: readonly number[],
      ) {
        created.push({ type, dims });
      }
    },
    InferenceSession: { create: () => Promise.resolve(session) },
  };
  return { ort, created };
}

const baseConfig: ShrutiConfig = {
  modelVersion: 'test-1',
  modelUrl: 'm.onnx',
  inputName: 'audio',
  outputName: 'text',
  outputMode: 'text',
};
const decodeAudio = () => Promise.resolve(new Float32Array(16000));
const audio = new Blob(['x']);

function setup(
  config: ShrutiConfig,
  out: Record<string, { data: unknown; dims: number[] } | undefined>,
  files: Record<string, string> = { 'm.onnx': 'bytes' },
) {
  const run = vi.fn(() => Promise.resolve(out));
  const session: OrtSessionLike = {
    inputNames: ['audio', 'length'],
    outputNames: ['text', 'logits'],
    run,
  };
  const { ort, created } = fakeOrt(session);
  const loadOrt = vi.fn(() => Promise.resolve(ort));
  const provider = new ShrutiProvider(config, { loadOrt, caches: fakeCaches(files), decodeAudio });
  return { provider, run, loadOrt, created };
}

describe('ShrutiProvider (mocked ort)', () => {
  it('does not load ort until initialize, then transcribes text output without confidence', async () => {
    const { provider, loadOrt, run } = setup(baseConfig, {
      text: { data: ['do kilo', 'aata'], dims: [2] },
    });
    expect(loadOrt).not.toHaveBeenCalled();
    expect(await provider.initialize()).toEqual({ ready: true, modelVersion: 'test-1' });
    const r = await provider.transcribe(audio);
    expect(r.text).toBe('do kilo aata');
    expect(r.confidence).toBeUndefined();
    expect(loadOrt).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('feeds the length input when configured', async () => {
    const { provider, created } = setup(
      { ...baseConfig, lengthInputName: 'length' },
      { text: { data: ['a'], dims: [1] } },
    );
    await provider.transcribe(audio);
    expect(created.map((t) => t.type)).toEqual(['float32', 'int64']);
  });

  it('decodes ids and ctc output through the injected vocab', async () => {
    const files = { 'm.onnx': 'b', 'v.json': JSON.stringify(['<b>', 'a', 'b']) };
    const ids = setup(
      { ...baseConfig, outputMode: 'ids', vocabUrl: 'v.json', joiner: '' },
      { text: { data: BigInt64Array.from([1n, 0n, 2n]), dims: [3] } },
      files,
    );
    expect((await ids.provider.transcribe(audio)).text).toBe('ab');

    // steps: a, a, blank, b -> "ab"
    const logits = [0, 9, 0, 0, 9, 0, 9, 0, 0, 0, 0, 9];
    const ctc = setup(
      { ...baseConfig, outputName: 'logits', outputMode: 'ctc', vocabUrl: 'v.json' },
      { logits: { data: logits, dims: [1, 4, 3] } },
      files,
    );
    expect((await ctc.provider.transcribe(audio)).text).toBe('ab');
    expect(ctcGreedy(logits, 4, 3, 0)).toEqual([1, 2]);
  });

  it('fails with typed reasons: missing model, bad tensor name, bad output, decode', async () => {
    const missing = setup(baseConfig, {}, {});
    await expect(missing.provider.initialize()).rejects.toMatchObject({ reason: 'model_missing' });

    const badName = setup({ ...baseConfig, outputName: 'nope' }, {});
    await expect(badName.provider.initialize()).rejects.toMatchObject({ reason: 'bad_config' });

    const noOut = setup(baseConfig, {});
    await expect(noOut.provider.transcribe(audio)).rejects.toMatchObject({
      reason: 'inference_failed',
    });

    const session: OrtSessionLike = { inputNames: ['audio'], outputNames: ['text'], run: vi.fn() };
    const p = new ShrutiProvider(baseConfig, {
      loadOrt: () => Promise.resolve(fakeOrt(session).ort),
      caches: fakeCaches({ 'm.onnx': 'b' }),
      decodeAudio: () => Promise.reject(new Error('bad')),
    });
    await expect(p.transcribe(audio)).rejects.toMatchObject({ reason: 'decode_failed' });
  });

  it('rejects with a timeout reason when inference exceeds the limit', async () => {
    vi.useFakeTimers();
    try {
      const session: OrtSessionLike = {
        inputNames: ['audio'],
        outputNames: ['text'],
        run: () => new Promise(() => undefined),
      };
      const p = new ShrutiProvider(baseConfig, {
        loadOrt: () => Promise.resolve(fakeOrt(session).ort),
        caches: fakeCaches({ 'm.onnx': 'b' }),
        decodeAudio,
      });
      await p.initialize();
      const pending = p.transcribe(audio);
      const assertion = expect(pending).rejects.toMatchObject({ reason: 'timeout' });
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires a vocab for ids/ctc and plugs into the registry as 'shruti'", () => {
    expect(() => new ShrutiProvider({ ...baseConfig, outputMode: 'ids' })).toThrow(
      SpeechProviderError,
    );
    const p = createProvider('shruti', { adapters: { shruti: shrutiAdapterFactory(baseConfig) } });
    expect(p).toBeInstanceOf(ShrutiProvider);
  });
});
