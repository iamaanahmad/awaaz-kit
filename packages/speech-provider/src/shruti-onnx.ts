/**
 * On-device speech-to-text with Shruti Hindi (Udgam Labs, Apache-2.0), through the publisher's
 * own `shruti-onnx` wrapper over `onnxruntime-web`. Hindi, English and Hinglish; Hindi in
 * Devanagari, English words in Latin script, numbers as words (the normalizer turns them into
 * quantities).
 *
 * Measured, not assumed: see docs/model-benchmark.md for word error rate, load time and speed.
 *
 * Privacy and offline rules this file keeps:
 * - Model files are read ONLY from Cache Storage (`awaaz-speech-model-v1`), where `ModelManager`
 *   put them after a user-started, SHA-256-verified download. Transcription never touches the
 *   network; if a file is missing it fails with `model_missing` instead of fetching it.
 * - Audio is decoded in memory, transcribed and dropped. It is never uploaded or stored.
 * - `confidence` is never set: the model has no calibrated score (Req 5.11).
 * - The runtime (~14 MB WASM) and the wrapper are imported lazily, so the app shell stays small.
 */
import type { ModelManifest } from './model-manager.js';
import { MODEL_CACHE_NAME } from './model-manager.js';
import type { ShrutiAsr, ShrutiLoader } from './shruti-types.js';

export type { MissingFile, ShrutiAsr, ShrutiLoader } from './shruti-types.js';
import type {
  InitializeResult,
  SpeechToTextProvider,
  TranscribeOptions,
  TranscriptionResult,
} from './types.js';

export const TARGET_SAMPLE_RATE = 16000;
export const TRANSCRIBE_TIMEOUT_MS = 60_000;

/** Where the published model lives. Files are fetched from here once, on a user action. */
export const SHRUTI_HI_BASE_URL =
  'https://huggingface.co/udgamlabs/Shruti-ONNX/resolve/main/hi/onnx-int8/';

/**
 * Shruti Hindi, int8 build. Chosen over the 4-bit build after measuring both on the same 20
 * Hinglish clips: identical word error rate (25.1%), model load 6.8 s instead of 23.7 s, still
 * 2.4x faster than real time. Sizes and SHA-256 values are copied from the publisher's
 * MANIFEST.json; a file that does not match is rejected and nothing is cached.
 */
export const SHRUTI_HI_MANIFEST: ModelManifest = {
  modelVersion: 'shruti-hi-int8',
  files: [
    {
      url: `${SHRUTI_HI_BASE_URL}frontend.onnx`,
      bytes: 911143,
      sha256: '0457d948c74b62e12b5d652d275269331092e13b22a2cdf64d2773c639a2b276',
    },
    {
      url: `${SHRUTI_HI_BASE_URL}encoder.onnx`,
      bytes: 19633861,
      sha256: 'b26a33cedf74ce11f13ad3854f3c0a34e7272c4e2dfd0d5cd2818185b029b996',
    },
    {
      url: `${SHRUTI_HI_BASE_URL}decoder.onnx`,
      bytes: 32293075,
      sha256: '777870e340af2c5a9513f8bef14ecf0c2d57ba7dbfe8682a99674ec58dbd6f70',
    },
    {
      url: `${SHRUTI_HI_BASE_URL}shruti.json`,
      bytes: 94153,
      sha256: '82aa655fef9ace280b626f5cfbbbe9a9e417c5c997a2708480e65d33ec3bdc45',
    },
  ],
};

export type SpeechFailureReason =
  'timeout' | 'model_missing' | 'model_load_failed' | 'decode_failed' | 'inference_failed';

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

export interface ShrutiOnnxDeps {
  manifest?: ModelManifest;
  caches?: CacheStorage;
  cacheName?: string;
  /** Defaults to a lazy import of `onnxruntime-web/wasm` and `shruti-onnx`. */
  loadModel?: ShrutiLoader;
  /** Defaults to AudioContext decode + resample to mono 16 kHz. */
  decodeAudio?: (encoded: ArrayBuffer) => Promise<Float32Array>;
  timeoutMs?: number;
  now?: () => number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

/**
 * Runs the model in a dedicated worker, so loading (several seconds of WASM work) and
 * transcription never freeze the page. Falls back to the main thread where workers are missing.
 */
const defaultLoadModel: ShrutiLoader = async (args) => {
  if (typeof Worker !== 'undefined') {
    const { loadInWorker } = await import('./shruti-worker-client.js');
    const worker = new Worker(new URL('./shruti.worker.ts', import.meta.url), {
      type: 'module',
      name: 'awaaz-speech',
    });
    return loadInWorker(worker, { baseUrl: args.baseUrl, cacheName: args.cacheName });
  }
  return (await import('./shruti-runtime.js')).loadShruti(args);
};

/** Decodes recorded audio (webm/ogg/wav) and resamples it to mono 16 kHz Float32. */
export async function decodeToMono16k(encoded: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(encoded);
    const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded; // a 1-channel destination down-mixes stereo input
    src.connect(offline.destination);
    src.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    await ctx.close();
  }
}

/** The base URL the manifest files share (the loader asks for `<base>frontend.onnx`, ...). */
function baseUrlOf(manifest: ModelManifest): string {
  const first = manifest.files[0]?.url ?? '';
  return first.slice(0, first.lastIndexOf('/') + 1);
}

export class ShrutiOnnxProvider implements SpeechToTextProvider {
  private readonly manifest: ModelManifest;
  private readonly deps: ShrutiOnnxDeps;
  private asr: Promise<ShrutiAsr> | null = null;

  constructor(deps: ShrutiOnnxDeps = {}) {
    this.deps = deps;
    this.manifest = deps.manifest ?? SHRUTI_HI_MANIFEST;
  }

  private async openCache(): Promise<Cache> {
    const storage = this.deps.caches ?? globalThis.caches;
    if (!storage) throw new SpeechProviderError('model_missing', 'Cache Storage is not available');
    return storage.open(this.deps.cacheName ?? MODEL_CACHE_NAME);
  }

  /** True only when every manifest file is in the cache. Never fetches. */
  async isInstalled(): Promise<boolean> {
    try {
      const cache = await this.openCache();
      for (const f of this.manifest.files) if (!(await cache.match(f.url))) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reports ready when the model is downloaded, and starts loading it in the background so the
   * first recording does not wait. Not downloaded is `ready: false`, never an error.
   */
  async initialize(): Promise<InitializeResult> {
    if (!(await this.isInstalled())) return { ready: false };
    void this.load().catch(() => undefined);
    return { ready: true, modelVersion: this.manifest.modelVersion };
  }

  /** Loads the model once; later calls share the same promise. Safe to call early (warm-up). */
  load(): Promise<ShrutiAsr> {
    this.asr ??= this.loadOnce().catch((e: unknown) => {
      this.asr = null; // allow a retry after a failure
      throw e;
    });
    return this.asr;
  }

  private async loadOnce(): Promise<ShrutiAsr> {
    if (!(await this.isInstalled())) {
      throw new SpeechProviderError(
        'model_missing',
        'The speech model is not downloaded yet. Download it, or type your request.',
      );
    }
    const cache = await this.openCache();
    // Cache-only fetch: the model can be loaded with no network at all.
    const fetchFn = async (url: string) =>
      (await cache.match(url)) ?? { ok: false as const, status: 404 };
    try {
      return await (this.deps.loadModel ?? defaultLoadModel)({
        baseUrl: baseUrlOf(this.manifest),
        cacheName: this.deps.cacheName ?? MODEL_CACHE_NAME,
        fetchFn,
      });
    } catch (e) {
      throw new SpeechProviderError('model_load_failed', 'Could not load the speech model', {
        cause: e,
      });
    }
  }

  async transcribe(audio: Blob, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    const now = this.deps.now ?? Date.now;
    const started = now();
    const asr = await this.load();

    let samples: Float32Array;
    try {
      samples = await (this.deps.decodeAudio ?? decodeToMono16k)(await audio.arrayBuffer());
    } catch (e) {
      throw new SpeechProviderError('decode_failed', 'Could not read the recording', { cause: e });
    }

    // "auto" lets the model pick between Hindi and English per clip, which its authors found
    // scores the same as setting it; a hint is passed through when the caller is sure.
    const language =
      options.language === 'hi' || options.language === 'en' ? options.language : null;
    let result: { text: string; language?: string | null };
    try {
      // loops: "cut" keeps the first copy of a repeated phrase, so a stuck decode cannot fill
      // the transcript with repeats. The user still reviews and edits the text.
      result = await this.withTimeout(asr.transcribe(samples, { language, loops: 'cut' }));
    } catch (e) {
      if (e instanceof SpeechProviderError) throw e;
      throw new SpeechProviderError('inference_failed', 'Transcription failed', { cause: e });
    }
    const out: TranscriptionResult = {
      text: result.text.trim(),
      durationMs: Math.max(0, now() - started),
    };
    if (result.language) out.language = result.language;
    return out;
  }

  private withTimeout<T>(work: Promise<T>): Promise<T> {
    const ms = this.deps.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS;
    const setT = this.deps.setTimeout ?? setTimeout;
    const clearT = this.deps.clearTimeout ?? clearTimeout;
    return new Promise<T>((resolve, reject) => {
      const timer = setT(
        () =>
          reject(
            new SpeechProviderError('timeout', `Transcription took longer than ${ms / 1000} s`),
          ),
        ms,
      );
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
