/**
 * The only module that imports `onnxruntime-web` and `shruti-onnx`. It is reached through a
 * dynamic import from `shruti-onnx.ts`, so neither lands in the app shell or in unit tests.
 *
 * `onnxruntime-web/wasm` is the CPU-only build: it uses the ~14 MB WASM file instead of the
 * ~28 MB WebGPU-capable one, and Shruti runs on the WASM backend anyway.
 */
// shruti-onnx ships plain JS with no type declarations, so its types live in an ambient file.
// A path reference is the only way to pull that file into every program that compiles this one
// (each app typechecks package sources); an `import` cannot load a declarations-only script.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./onnxruntime-web.d.ts" />
import type { ShrutiAsr, ShrutiLoader } from './shruti-types.js';

export const loadShruti: ShrutiLoader = async ({ baseUrl, fetchFn }) => {
  const [ort, shruti] = await Promise.all([import('onnxruntime-web/wasm'), import('shruti-onnx')]);
  // Threads need cross-origin isolation (SharedArrayBuffer). Without it, one thread is the only
  // option; with it, use a few cores but leave some for the page.
  const isolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  const cores = (globalThis.navigator?.hardwareConcurrency as number | undefined) ?? 1;
  ort.env.wasm.numThreads = isolated ? Math.max(1, Math.min(4, cores - 1)) : 1;
  const asr: ShrutiAsr = await shruti.createShruti({
    ort,
    baseUrl,
    fetchFn,
    // Measured: "basic" loads as fast as any level and transcribes fastest in WASM.
    sessionOptions: { graphOptimizationLevel: 'basic' },
  });
  return asr;
};
