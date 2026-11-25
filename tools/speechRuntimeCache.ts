/**
 * Workbox runtime-caching rule shared by both apps' service workers.
 *
 * The speech runtime (onnxruntime-web's ~14 MB CPU WASM build and its JS loader) is too big to
 * precache with the app shell, and most users never need it. It is fetched the first time voice
 * loads, which happens right after the user-started model download while the device is online,
 * and is then served cache-first so voice keeps working with no network.
 *
 * Model weights are not cached here: they live in Cache Storage `awaaz-speech-model-v1`, written
 * by the ModelManager after a SHA-256 check.
 */
/**
 * Modules the bundler must leave alone. shruti-onnx lazily imports `udgam-textnorm` only for
 * `numbers: "digits"`, which this project never requests (our normalizer turns number words into
 * quantities). The package is not on npm, so it is marked external: the import stays in the
 * bundle but never runs.
 */
export const SPEECH_BUILD_EXTERNALS = ['udgam-textnorm'];

export const SPEECH_RUNTIME_CACHE = {
  // The .wasm binary, its .mjs loader, and the ort JS bundle chunk (in case a build ever
  // leaves it out of the precache).
  urlPattern: ({ url }: { url: URL }) =>
    /\/(?:ort-wasm[^/]*\.(?:wasm|mjs)|ort\.[^/]*\.js)$/.test(url.pathname),
  handler: 'CacheFirst' as const,
  options: {
    cacheName: 'awaaz-speech-runtime-v1',
    cacheableResponse: { statuses: [200] },
  },
};
