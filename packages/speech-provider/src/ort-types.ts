/** Minimal structural subset of onnxruntime-web used here (so tests can mock it). */
export interface OrtTensorLike {
  data: unknown;
  dims: readonly number[];
}
export interface OrtSessionLike {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorLike | undefined>>;
  release?(): Promise<void>;
}
export interface OrtLike {
  Tensor: new (type: string, data: unknown, dims: readonly number[]) => unknown;
  InferenceSession: {
    create(bytes: ArrayBuffer, options: { executionProviders: string[] }): Promise<OrtSessionLike>;
  };
  env?: { wasm?: { proxy?: boolean } };
}
