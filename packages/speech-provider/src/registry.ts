import { createModelManager, type ModelManagerDeps } from './model-manager.js';
import { ScriptedProvider } from './scripted.js';
import { SHRUTI_HI_MANIFEST, ShrutiOnnxProvider, type ShrutiOnnxDeps } from './shruti-onnx.js';
import type { ModelManager, SpeechToTextProvider } from './types.js';

export type ProviderId = 'shruti' | 'whisper-wasm' | 'scripted';

export const PROVIDER_IDS: readonly ProviderId[] = ['shruti', 'whisper-wasm', 'scripted'];

/**
 * Shruti is the default now that it has been measured on real audio (docs/model-benchmark.md).
 * It only works after the user downloads the model; until then typed input and the labelled
 * Sample chips are the path, and the mic says so instead of pretending.
 */
export const DEFAULT_PROVIDER_ID: ProviderId = 'shruti';

export interface ProviderDeps {
  /** Fixture clips for the scripted provider (clip id -> transcript). */
  scriptedClips?: Record<string, string>;
  /** Overrides for real adapters (tests, or another model behind the same interface). */
  adapters?: Partial<Record<Exclude<ProviderId, 'scripted'>, () => SpeechToTextProvider>>;
  /** Passed to the built-in Shruti provider. */
  shruti?: ShrutiOnnxDeps;
}

export class ProviderUnavailableError extends Error {
  constructor(public readonly providerId: ProviderId) {
    super(`Speech provider "${providerId}" is not available in this build`);
    this.name = 'ProviderUnavailableError';
  }
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Picks a provider id from an env value (e.g. `import.meta.env.VITE_SPEECH_PROVIDER`).
 * Unset or invalid values fall back to the default.
 */
export function resolveProviderId(
  envValue: string | undefined | null,
  fallback: ProviderId = DEFAULT_PROVIDER_ID,
): ProviderId {
  return isProviderId(envValue) ? envValue : fallback;
}

export function createProvider(id: ProviderId, deps: ProviderDeps = {}): SpeechToTextProvider {
  if (id === 'scripted') {
    return new ScriptedProvider(deps.scriptedClips ? { clips: deps.scriptedClips } : {});
  }
  const factory = deps.adapters?.[id];
  if (factory) return factory();
  if (id === 'shruti') return new ShrutiOnnxProvider(deps.shruti);
  throw new ProviderUnavailableError(id);
}

export interface OnDeviceVoice {
  provider: SpeechToTextProvider;
  /** Null for the scripted provider, which needs no model. */
  manager: ModelManager | null;
  /** Approximate one-time download, shown before the user agrees to it. */
  approxBytes: number;
}

/**
 * One call both apps make: the speech provider plus the manager that downloads its model. The
 * provider and the manager share one manifest and one cache, so "downloaded" means the same
 * thing to both.
 */
export function createOnDeviceVoice(
  id: ProviderId = DEFAULT_PROVIDER_ID,
  deps: ProviderDeps & { manager?: Omit<ModelManagerDeps, 'manifest'> } = {},
): OnDeviceVoice {
  const provider = createProvider(id, deps);
  if (id !== 'shruti') return { provider, manager: null, approxBytes: 0 };
  const manifest = deps.shruti?.manifest ?? SHRUTI_HI_MANIFEST;
  const manager = createModelManager({ ...deps.manager, manifest });
  return {
    provider,
    manager,
    approxBytes: manifest.files.reduce((n, f) => n + f.bytes, 0),
  };
}
