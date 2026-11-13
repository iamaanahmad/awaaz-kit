/**
 * Shruti ONNX adapter behind `SpeechToTextProvider`.
 *
 * UNVERIFIED AGAINST THE REAL MODEL. The day-1 spike (`docs/model-benchmark.md`) has not been run
 * manually. Model files, tensor names and output mode are NOT known; they are injected through
 * `ShrutiConfig` (and the model manifest) and nothing about the real Shruti I/O contract is
 * hardcoded here. The decoding logic is ported from `spikes/shruti-bare-vite/src/transcribe.ts`
 * and `audio.ts`. It is only exercised in tests with a mocked ort session.
 *
 * - `onnxruntime-web` is imported lazily on `initialize()`, so it stays out of the app shell.
 * - `confidence` is never set (Req 5.11).
 * - Transcription fails with a typed `SpeechProviderError` after 30 s (Req 5.9).
 * - Not yet done: running inference in a dedicated Web Worker. Optionally, ort's own proxy worker
 *   can be enabled with `wasmProxy: true` (also unverified).
 */
import { z } from 'zod';
import { MODEL_CACHE_NAME } from './model-manager.js';
import type { OrtLike, OrtSessionLike } from './ort-types.js';
import type { InitializeResult, SpeechToTextProvider, TranscriptionResult } from './types.js';

export const TARGET_SAMPLE_RATE = 16000;
export const TRANSCRIBE_TIMEOUT_MS = 30_000;

export const shrutiConfigSchema = z.object({
  /** Version string reported by `initialize()`. */
  modelVersion: z.string().min(1),
  /** Cache Storage key (manifest file url) of the .onnx file. */
  modelUrl: z.string().min(1),
  /** Cache key of a vocab JSON (array, or token -> id object). Required for "ids" and "ctc". */
  vocabUrl: z.string().min(1).optional(),
  inputName: z.string().min(1),
  /** Optional second input carrying the sample count as int64. */
  lengthInputName: z.string().min(1).optional(),
  outputName: z.string().min(1),
  /** "text": string tensor; "ids": token ids via vocab; "ctc": float logits [1, T, V]. */
  outputMode: z.enum(['text', 'ids', 'ctc']),
  blankId: z.number().int().nonnegative().default(0),
  /** "" for char vocab, " " for word vocab. */
  joiner: z.string().default(''),
  executionProviders: z.array(z.string().min(1)).min(1).default(['wasm']),
  wasmProxy: z.boolean().default(false),
  cacheName: z.string().min(1).default(MODEL_CACHE_NAME),
  timeoutMs: z.number().int().positive().default(TRANSCRIBE_TIMEOUT_MS),
});
export type ShrutiConfig = z.input<typeof shrutiConfigSchema>;

export type SpeechFailureReason =
  | 'timeout'
  | 'model_missing'
  | 'model_load_failed'
  | 'decode_failed'
  | 'inference_failed'
  | 'bad_config';

export class SpeechProviderError extends Error {
  constructor(
    public readonly reason: SpeechFailureReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SpeechProviderError';
  }
}

export interface ShrutiDeps {
  /** Defaults to a lazy `import("onnxruntime-web")`. */
  loadOrt?: () => Promise<OrtLike>;
  caches?: CacheStorage;
  /** Defaults to AudioContext decode + OfflineAudioContext resample to mono 16 kHz. */
  decodeAudio?: (encoded: ArrayBuffer) => Promise<Float32Array>;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  now?: () => number;
}

const defaultLoadOrt = async (): Promise<OrtLike> =>
  (await import('./ort-loader.js')).loadOnnxruntimeWeb();

/** Decodes encoded audio and resamples to mono 16 kHz Float32 (from the spike's audio.ts). */
export async function decodeToMono16k(encoded: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(encoded);
    const frames = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded; // multi-channel input is down-mixed by the 1-channel destination
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    await ctx.close();
  }
}

export function parseVocab(json: unknown): string[] {
  if (Array.isArray(json)) return json.map(String);
  if (json && typeof json === 'object') {
    const out: string[] = [];
    for (const [tok, id] of Object.entries(json as Record<string, unknown>)) {
      if (typeof id === 'number') out[id] = tok;
    }
    return out;
  }
  throw new Error('vocab must be an array or a token->id object');
}

/** Greedy CTC decode over row-major [T, V] logits. */
export function ctcGreedy(
  data: ArrayLike<number>,
  steps: number,
  vocabSize: number,
  blankId: number,
): number[] {
  const ids: number[] = [];
  let prev = -1;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestV = -Infinity;
    for (let v = 0; v < vocabSize; v++) {
      const x = data[t * vocabSize + v] ?? -Infinity;
      if (x > bestV) {
        bestV = x;
        best = v;
      }
    }
    if (best !== prev && best !== blankId) ids.push(best);
    prev = best;
  }
  return ids;
}

function idsToText(
  ids: ArrayLike<number | bigint>,
  vocab: string[] | null,
  blankId: number,
  joiner: string,
): string {
  if (!vocab) throw new Error('vocab is required for this output mode');
  const toks: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = Number(ids[i]);
    if (id === blankId) continue;
    const t = vocab[id];
    if (t !== undefined) toks.push(t);
  }
  return toks.join(joiner).replace(/▁/g, ' ').replace(/\s+/g, ' ').trim();
}

export class ShrutiProvider implements SpeechToTextProvider {
  private readonly cfg: z.output<typeof shrutiConfigSchema>;
  private readonly deps: ShrutiDeps;
  private ort: OrtLike | null = null;
  private session: OrtSessionLike | null = null;
  private vocab: string[] | null = null;
  private initPromise: Promise<InitializeResult> | null = null;

  constructor(config: ShrutiConfig, deps: ShrutiDeps = {}) {
    const parsed = shrutiConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new SpeechProviderError('bad_config', `Invalid Shruti config: ${parsed.error.message}`);
    }
    this.cfg = parsed.data;
    if (this.cfg.outputMode !== 'text' && !this.cfg.vocabUrl) {
      throw new SpeechProviderError(
        'bad_config',
        `vocabUrl is required for "${this.cfg.outputMode}"`,
      );
    }
    this.deps = deps;
  }

  initialize(): Promise<InitializeResult> {
    if (!this.initPromise) {
      this.initPromise = this.load().catch((e: unknown) => {
        this.initPromise = null; // allow retry
        throw e;
      });
    }
    return this.initPromise;
  }

  // The language hint is ignored: the model's language handling is unknown.
  async transcribe(audio: Blob): Promise<TranscriptionResult> {
    await this.initialize();
    const now = this.deps.now ?? Date.now;
    const started = now();
    const work = this.run(audio);
    const text = await this.withTimeout(work);
    return { text, durationMs: Math.max(0, now() - started) };
  }

  private async load(): Promise<InitializeResult> {
    const cfg = this.cfg;
    try {
      const cacheStorage = this.deps.caches ?? globalThis.caches;
      if (!cacheStorage) throw new Error('Cache Storage is not available');
      const cache = await cacheStorage.open(cfg.cacheName);
      const modelRes = await cache.match(cfg.modelUrl);
      if (!modelRes) {
        throw new SpeechProviderError('model_missing', 'Speech model is not downloaded');
      }
      if (cfg.vocabUrl) {
        const vocabRes = await cache.match(cfg.vocabUrl);
        if (!vocabRes) {
          throw new SpeechProviderError('model_missing', 'Speech model vocab is not downloaded');
        }
        this.vocab = parseVocab(await vocabRes.json());
      }
      const bytes = await modelRes.arrayBuffer();

      const ort = await (this.deps.loadOrt ?? defaultLoadOrt)();
      if (cfg.wasmProxy && ort.env?.wasm) ort.env.wasm.proxy = true;
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: cfg.executionProviders,
      });

      const missing: string[] = [];
      for (const n of [cfg.inputName, cfg.lengthInputName]) {
        if (n && !session.inputNames.includes(n)) missing.push(`input "${n}"`);
      }
      if (!session.outputNames.includes(cfg.outputName)) missing.push(`output "${cfg.outputName}"`);
      if (missing.length > 0) {
        await session.release?.();
        throw new SpeechProviderError(
          'bad_config',
          `Configured tensor names not found in model: ${missing.join(', ')}`,
        );
      }
      this.ort = ort;
      this.session = session;
      return { ready: true, modelVersion: cfg.modelVersion };
    } catch (e) {
      if (e instanceof SpeechProviderError) throw e;
      throw new SpeechProviderError('model_load_failed', 'Could not load the speech model', {
        cause: e,
      });
    }
  }

  private async run(audio: Blob): Promise<string> {
    const cfg = this.cfg;
    const ort = this.ort;
    const session = this.session;
    if (!ort || !session) throw new SpeechProviderError('model_load_failed', 'Model not loaded');

    let samples: Float32Array;
    try {
      samples = await (this.deps.decodeAudio ?? decodeToMono16k)(await audio.arrayBuffer());
    } catch (e) {
      throw new SpeechProviderError('decode_failed', 'Could not decode the audio', { cause: e });
    }

    try {
      const feeds: Record<string, unknown> = {
        [cfg.inputName]: new ort.Tensor('float32', samples, [1, samples.length]),
      };
      if (cfg.lengthInputName) {
        feeds[cfg.lengthInputName] = new ort.Tensor(
          'int64',
          BigInt64Array.from([BigInt(samples.length)]),
          [1],
        );
      }
      const out = await session.run(feeds);
      const t = out[cfg.outputName];
      if (!t) throw new Error(`Output "${cfg.outputName}" not returned`);

      if (cfg.outputMode === 'text') return (t.data as string[]).join(' ').trim();
      if (cfg.outputMode === 'ids') {
        return idsToText(t.data as ArrayLike<number | bigint>, this.vocab, cfg.blankId, cfg.joiner);
      }
      if (t.dims.length !== 3) {
        throw new Error(`CTC mode expects [1,T,V] logits, got [${t.dims.join(',')}]`);
      }
      const ids = ctcGreedy(
        t.data as ArrayLike<number>,
        t.dims[1] ?? 0,
        t.dims[2] ?? 0,
        cfg.blankId,
      );
      return idsToText(ids, this.vocab, cfg.blankId, cfg.joiner);
    } catch (e) {
      if (e instanceof SpeechProviderError) throw e;
      throw new SpeechProviderError('inference_failed', 'Transcription failed', { cause: e });
    }
  }

  private withTimeout<T>(work: Promise<T>): Promise<T> {
    const setT = this.deps.setTimeout ?? setTimeout;
    const clearT = this.deps.clearTimeout ?? clearTimeout;
    return new Promise<T>((resolve, reject) => {
      const timer = setT(() => {
        reject(
          new SpeechProviderError(
            'timeout',
            `Transcription took longer than ${this.cfg.timeoutMs / 1000} s`,
          ),
        );
      }, this.cfg.timeoutMs);
      work.then(
        (v) => {
          clearT(timer);
          resolve(v);
        },
        (e: unknown) => {
          clearT(timer);
          reject(e);
        },
      );
    });
  }
}

/** Use as `createProvider("shruti", { adapters: { shruti: shrutiAdapterFactory(config) } })`. */
export function shrutiAdapterFactory(
  config: ShrutiConfig,
  deps: ShrutiDeps = {},
): () => SpeechToTextProvider {
  return () => new ShrutiProvider(config, deps);
}
