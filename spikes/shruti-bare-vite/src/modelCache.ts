export const CACHE_NAME = "awaaz-speech-model-v1";

export interface ManifestFile {
  name: string;
  url: string;
  sha256?: string;
}
export interface Manifest {
  files: ManifestFile[];
}
export type ModelStatus = "unknown" | "missing" | "partial" | "ready" | "downloading" | "failed";

export async function fetchManifest(url: string): Promise<Manifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
  const json: unknown = await res.json();
  const files = (json as { files?: unknown }).files;
  if (!Array.isArray(files)) throw new Error("Manifest has no files array");
  for (const f of files) {
    if (typeof f?.name !== "string" || typeof f?.url !== "string") {
      throw new Error("Manifest entry needs name and url");
    }
  }
  return { files: files as ManifestFile[] };
}

const key = (f: ManifestFile) => new Request(new URL(`/__model__/${f.name}`, location.origin).href);

export async function status(manifest: Manifest): Promise<ModelStatus> {
  if (manifest.files.length === 0) return "missing";
  const cache = await caches.open(CACHE_NAME);
  let found = 0;
  for (const f of manifest.files) if (await cache.match(key(f))) found++;
  if (found === 0) return "missing";
  return found === manifest.files.length ? "ready" : "partial";
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Streams each file with progress, verifies the optional hash, stores in Cache Storage. */
export async function download(
  manifest: Manifest,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const done: number[] = manifest.files.map(() => 0);
  const total: number[] = manifest.files.map(() => 0);
  const report = () => {
    const t = total.reduce((a, b) => a + b, 0);
    onProgress(t > 0 ? done.reduce((a, b) => a + b, 0) / t : 0);
  };
  for (const [i, f] of manifest.files.entries()) {
    const res = await fetch(f.url, { signal });
    if (!res.ok || !res.body) throw new Error(`${f.name}: HTTP ${res.status}`);
    total[i] = Number(res.headers.get("content-length") ?? 0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      done[i] += value.byteLength;
      report();
    }
    const blob = new Blob(chunks as BlobPart[]);
    if (f.sha256) {
      const actual = await sha256Hex(await blob.arrayBuffer());
      if (actual !== f.sha256.toLowerCase()) throw new Error(`${f.name}: SHA-256 mismatch`);
    }
    await cache.put(key(f), new Response(blob));
  }
  onProgress(1);
}

export async function readCached(f: ManifestFile): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(key(f));
  if (!hit) throw new Error(`${f.name} not in cache`);
  return hit.arrayBuffer();
}

export async function remove(): Promise<void> {
  await caches.delete(CACHE_NAME);
}
