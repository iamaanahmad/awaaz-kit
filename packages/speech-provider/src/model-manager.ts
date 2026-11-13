import { z } from 'zod';
import type { ModelManager, ModelStatus } from './types.js';

export const MODEL_CACHE_NAME = 'awaaz-speech-model-v1';
const INSTALLED_MARKER_KEY = 'awaaz-speech-model-v1:installed';

export const modelManifestSchema = z.object({
  modelVersion: z.string().min(1),
  files: z
    .array(
      z.object({
        /** Cache key and URL the file is fetched from. */
        url: z.string().min(1),
        /** Lowercase hex SHA-256 of the file bytes. */
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        bytes: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
export type ModelManifest = z.infer<typeof modelManifestSchema>;

/** Minimal Storage subset used to remember that the model was installed. */
export interface MarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ModelManagerDeps {
  manifest: ModelManifest;
  fetch?: typeof fetch;
  caches?: CacheStorage;
  marker?: MarkerStorage;
  cacheName?: string;
  /** SHA-256 hex digest; defaults to Web Crypto. */
  sha256?: (data: Uint8Array) => Promise<string>;
}

export class ModelIntegrityError extends Error {
  constructor(public readonly url: string) {
    super(`Downloaded model file failed its integrity check: ${url}`);
    this.name = 'ModelIntegrityError';
  }
}

async function webCryptoSha256(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export function createModelManager(deps: ModelManagerDeps): ModelManager {
  const manifest = modelManifestSchema.parse(deps.manifest);
  const cacheName = deps.cacheName ?? MODEL_CACHE_NAME;
  const hash = deps.sha256 ?? webCryptoSha256;
  const approxBytes = manifest.files.reduce((n, f) => n + f.bytes, 0);

  const getCaches = (): CacheStorage => {
    const c = deps.caches ?? globalThis.caches;
    if (!c) throw new Error('Cache Storage is not available in this browser');
    return c;
  };
  const getMarker = (): MarkerStorage | undefined => {
    if (deps.marker) return deps.marker;
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  };
  // Resolved lazily so status()/remove() never touch the network.
  const getFetch = (): typeof fetch => deps.fetch ?? globalThis.fetch.bind(globalThis);

  async function status(): Promise<ModelStatus> {
    try {
      const cache = await getCaches().open(cacheName);
      let present = 0;
      for (const f of manifest.files) {
        if (await cache.match(f.url)) present += 1;
      }
      if (present === manifest.files.length) {
        return { kind: 'ready', modelVersion: manifest.modelVersion };
      }
      const wasInstalled = present > 0 || getMarker()?.getItem(INSTALLED_MARKER_KEY) !== null;
      return wasInstalled ? { kind: 'evicted' } : { kind: 'not_installed', approxBytes };
    } catch (e) {
      return { kind: 'error', message: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  async function download(
    onProgress: (s: ModelStatus) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const cache = await getCaches().open(cacheName);
    const doFetch = getFetch();
    const totalBytes = approxBytes;
    let received = 0;
    const stored: string[] = [];
    const report = () => onProgress({ kind: 'downloading', receivedBytes: received, totalBytes });

    try {
      report();
      for (const file of manifest.files) {
        if (signal?.aborted) throw new DOMException('Download aborted', 'AbortError');
        const init: RequestInit = signal ? { signal } : {};
        const res = await doFetch(file.url, init);
        if (!res.ok) throw new Error(`Download failed (${res.status}) for ${file.url}`);

        const chunks: Uint8Array[] = [];
        let size = 0;
        if (res.body) {
          const reader = res.body.getReader();
          for (;;) {
            if (signal?.aborted) {
              await reader.cancel();
              throw new DOMException('Download aborted', 'AbortError');
            }
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            size += value.byteLength;
            received += value.byteLength;
            report();
          }
        } else {
          const buf = new Uint8Array(await res.arrayBuffer());
          chunks.push(buf);
          size = buf.byteLength;
          received += size;
          report();
        }

        const bytes = concat(chunks, size);
        if ((await hash(bytes)) !== file.sha256) throw new ModelIntegrityError(file.url);

        await cache.put(file.url, new Response(bytes as BlobPart, { status: 200 }));
        stored.push(file.url);
      }
      getMarker()?.setItem(INSTALLED_MARKER_KEY, manifest.modelVersion);
      onProgress({ kind: 'ready', modelVersion: manifest.modelVersion });
    } catch (e) {
      // Never leave partial or unverified files behind.
      for (const url of stored) await cache.delete(url);
      throw e;
    }
  }

  async function remove(): Promise<void> {
    await getCaches().delete(cacheName);
    getMarker()?.removeItem(INSTALLED_MARKER_KEY);
  }

  return { status, download, remove };
}
