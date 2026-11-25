// Minimal ambient declarations for the two lazily imported runtime modules. Only
// shruti-runtime.ts imports them; everything else sees the typed `ShrutiAsr` interface.
declare module 'onnxruntime-web/wasm' {
  export const env: { wasm: { numThreads?: number; proxy?: boolean; wasmPaths?: unknown } };
  const ort: unknown;
  export default ort;
}

declare module 'shruti-onnx' {
  import type { ShrutiAsr } from './shruti-types.js';
  export function createShruti(options: {
    ort: unknown;
    baseUrl: string;
    fetchFn?: (url: string) => Promise<unknown>;
    variant?: '4bit' | 'int8';
    sessionOptions?: Record<string, unknown>;
  }): Promise<ShrutiAsr>;
  export function decodeWav(buf: ArrayBuffer): Float32Array;
  export const RATE: number;
}
