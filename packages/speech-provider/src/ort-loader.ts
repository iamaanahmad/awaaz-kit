import type { OrtLike } from './ort-types.js';

/**
 * The only module that references `onnxruntime-web`. It is reached through a dynamic import from
 * the adapter, so the runtime stays out of the app shell and out of tests that inject `loadOrt`.
 */
export async function loadOnnxruntimeWeb(): Promise<OrtLike> {
  return (await import('onnxruntime-web')) as unknown as OrtLike;
}
