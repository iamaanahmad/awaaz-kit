/**
 * Dedicated worker that owns the Shruti model, so loading (several seconds of WASM work) and
 * transcription never block the page. The page decodes audio (AudioContext is not available in
 * workers) and sends 16 kHz samples here; text comes back.
 *
 * Same rules as on the main thread: model bytes are read ONLY from Cache Storage, never fetched.
 */
import { loadShruti } from './shruti-runtime.js';
import type { ShrutiAsr } from './shruti-types.js';
import type { WorkerRequest, WorkerResponse } from './shruti-worker-protocol.js';

let asr: Promise<ShrutiAsr> | null = null;

const reply = (msg: WorkerResponse): void => {
  (self as unknown as Worker).postMessage(msg);
};
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === 'load') {
    asr ??= (async () => {
      const cache = await caches.open(req.cacheName);
      const fetchFn = async (url: string) =>
        (await cache.match(url)) ?? { ok: false as const, status: 404 };
      return loadShruti({ baseUrl: req.baseUrl, cacheName: req.cacheName, fetchFn });
    })();
    asr.then(
      () => reply({ type: 'loaded' }),
      (e: unknown) => {
        asr = null;
        reply({ type: 'load-error', message: message(e) });
      },
    );
    return;
  }
  if (req.type === 'transcribe') {
    const pending = asr;
    if (!pending) {
      reply({ type: 'transcribe-error', id: req.id, message: 'Model is not loaded' });
      return;
    }
    pending
      .then((m) => m.transcribe(req.samples, { language: req.language, loops: req.loops }))
      .then(
        (r) => reply({ type: 'result', id: req.id, text: r.text, language: r.language ?? null }),
        (e: unknown) => reply({ type: 'transcribe-error', id: req.id, message: message(e) }),
      );
  }
});
