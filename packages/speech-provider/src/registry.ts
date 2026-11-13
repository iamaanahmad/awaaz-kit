import { ScriptedProvider } from './scripted.js';
import type { SpeechToTextProvider } from './types.js';

export type ProviderId = 'shruti' | 'whisper-wasm' | 'scripted';

export const PROVIDER_IDS: readonly ProviderId[] = ['shruti', 'whisper-wasm', 'scripted'];

/**
 * Stays "scripted" until the manual spike results in `docs/model-benchmark.md` meet the go
 * criteria. The unverified Shruti adapter is available as "shruti" via
 * `adapters: { shruti: shrutiAdapterFactory(config) }`.
 */
export const DEFAULT_PROVIDER_ID: ProviderId = 'scripted';

export interface ProviderDeps {
  /** Fixture clips for the scripted provider (clip id -> transcript). */
  scriptedClips?: Record<string, string>;
  /** Real adapters are injected here so this package stays free of heavy runtimes. */
  adapters?: Partial<Record<Exclude<ProviderId, 'scripted'>, () => SpeechToTextProvider>>;
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
  if (!factory) throw new ProviderUnavailableError(id);
  return factory();
}
