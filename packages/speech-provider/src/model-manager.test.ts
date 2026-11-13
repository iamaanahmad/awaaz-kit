import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  MODEL_CACHE_NAME,
  ModelIntegrityError,
  createModelManager,
  type MarkerStorage,
  type ModelManifest,
} from './model-manager.js';
import type { ModelStatus } from './types.js';

// Independent oracle: Node's hash, not the manager's own code path.
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const sha256 = async (bytes: Uint8Array): Promise<string> => sha(bytes);

const FILE_A = new Uint8Array([1, 2, 3, 4, 5, 6]);
const FILE_B = new Uint8Array([9, 8, 7, 6]);
const FILES: Record<string, Uint8Array> = {
  'https://models.test/a.onnx': FILE_A,
  'https://models.test/b.json': FILE_B,
};

const manifest: ModelManifest = {
  modelVersion: 'test-1',
  files: Object.entries(FILES).map(([url, data]) => ({
    url,
    sha256: sha(data),
    bytes: data.byteLength,
  })),
};

/** In-memory CacheStorage fake. */
function makeCaches() {
  const stores = new Map<string, Map<string, unknown>>();
  const open = vi.fn(async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (url: string) => store.get(url),
      put: async (url: string, res: unknown) => {
        store.set(url, res);
      },
      delete: async (url: string) => store.delete(url),
    };
  });
  const del = vi.fn(async (name: string) => stores.delete(name));
  return { caches: { open, delete: del } as unknown as CacheStorage, stores, open, del };
}

function makeMarker(): MarkerStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** Streams each file in 2-byte chunks. */
function streamOf(data: Uint8Array): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= data.byteLength) return controller.close();
      controller.enqueue(data.slice(i, i + 2));
      i += 2;
    },
  });
}

function makeFetch(files: Record<string, Uint8Array> = FILES) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const data = files[String(url)];
    if (!data) return { ok: false, status: 404 } as Response;
    return { ok: true, status: 200, body: streamOf(data) } as unknown as Response;
  });
}

function setup(opts: { files?: Record<string, Uint8Array> } = {}) {
  const c = makeCaches();
  const marker = makeMarker();
  const fetchFn = makeFetch(opts.files);
  const manager = createModelManager({
    manifest,
    fetch: fetchFn as unknown as typeof fetch,
    caches: c.caches,
    marker,
    sha256,
  });
  return { ...c, marker, fetchFn, manager };
}

// Validates: Requirements 5.5, 5.7, 5.8
describe('ModelManager', () => {
  it('reports not_installed with approx bytes on a fresh device', async () => {
    const { manager } = setup();
    expect(await manager.status()).toEqual({ kind: 'not_installed', approxBytes: 10 });
  });

  it('status() never calls fetch', async () => {
    const { manager, fetchFn } = setup();
    await manager.status();
    await manager.remove();
    await manager.status();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not touch the network at construction', () => {
    const { fetchFn } = setup();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('downloads with monotonic progress, caches files and becomes ready', async () => {
    const { manager, stores, marker } = setup();
    const events: ModelStatus[] = [];
    await manager.download((s) => events.push(s));

    const downloading = events.filter((e) => e.kind === 'downloading');
    const received = downloading.map((e) => (e.kind === 'downloading' ? e.receivedBytes : -1));
    expect(received[0]).toBe(0);
    expect(received.at(-1)).toBe(10);
    expect([...received].sort((a, b) => a - b)).toEqual(received);
    for (const e of downloading) {
      if (e.kind === 'downloading') expect(e.totalBytes).toBe(10);
    }
    expect(events.at(-1)).toEqual({ kind: 'ready', modelVersion: 'test-1' });
    expect([...stores.get(MODEL_CACHE_NAME)!.keys()].sort()).toEqual(Object.keys(FILES).sort());
    expect(marker.data.size).toBe(1);
    expect(await manager.status()).toEqual({ kind: 'ready', modelVersion: 'test-1' });
  });

  it('SHA-256 mismatch rejects and deletes already stored files', async () => {
    const tampered = { ...FILES, 'https://models.test/b.json': new Uint8Array([0, 0, 0, 0]) };
    const { manager, stores, marker } = setup({ files: tampered });
    const events: ModelStatus[] = [];
    await expect(manager.download((s) => events.push(s))).rejects.toBeInstanceOf(
      ModelIntegrityError,
    );
    expect(stores.get(MODEL_CACHE_NAME)!.size).toBe(0);
    expect(events.some((e) => e.kind === 'ready')).toBe(false);
    expect(marker.data.size).toBe(0);
    expect((await manager.status()).kind).toBe('not_installed');
  });

  it('HTTP failure rejects and leaves no files', async () => {
    const { manager, stores } = setup({ files: { 'https://models.test/a.onnx': FILE_A } });
    await expect(manager.download(() => undefined)).rejects.toThrow(/404/);
    expect(stores.get(MODEL_CACHE_NAME)!.size).toBe(0);
  });

  it('abort before start rejects with AbortError and stores nothing', async () => {
    const { manager, stores, fetchFn } = setup();
    const ac = new AbortController();
    ac.abort();
    await expect(manager.download(() => undefined, ac.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(stores.get(MODEL_CACHE_NAME)?.size ?? 0).toBe(0);
  });

  it('abort mid-download cleans up files already stored', async () => {
    const { manager, stores, marker } = setup();
    const ac = new AbortController();
    let sawSecondFile = false;
    await expect(
      manager.download((s) => {
        // Abort once the first file (6 bytes) is complete and the second has started.
        if (s.kind === 'downloading' && s.receivedBytes > 6) {
          sawSecondFile = true;
          ac.abort();
        }
      }, ac.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(sawSecondFile).toBe(true);
    expect(stores.get(MODEL_CACHE_NAME)!.size).toBe(0);
    expect(marker.data.size).toBe(0);
    expect((await manager.status()).kind).toBe('not_installed');
  });

  it('detects eviction when marker exists but files are gone', async () => {
    const { manager, stores } = setup();
    await manager.download(() => undefined);
    stores.delete(MODEL_CACHE_NAME);
    expect(await manager.status()).toEqual({ kind: 'evicted' });
  });

  it('detects partial eviction when only some files remain', async () => {
    const { manager, stores } = setup();
    await manager.download(() => undefined);
    stores.get(MODEL_CACHE_NAME)!.delete('https://models.test/b.json');
    expect(await manager.status()).toEqual({ kind: 'evicted' });
  });

  it('remove() clears the cache and marker, returning to not_installed', async () => {
    const { manager, stores, marker } = setup();
    await manager.download(() => undefined);
    await manager.remove();
    expect(stores.has(MODEL_CACHE_NAME)).toBe(false);
    expect(marker.data.size).toBe(0);
    expect((await manager.status()).kind).toBe('not_installed');
  });

  it('status() reports error when Cache Storage fails', async () => {
    const caches = {
      open: async () => {
        throw new Error('storage unavailable');
      },
      delete: async () => false,
    } as unknown as CacheStorage;
    const fetchFn = makeFetch();
    const manager = createModelManager({
      manifest,
      fetch: fetchFn as unknown as typeof fetch,
      caches,
      marker: makeMarker(),
      sha256,
    });
    expect(await manager.status()).toEqual({ kind: 'error', message: 'storage unavailable' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
