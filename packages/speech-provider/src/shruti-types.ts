/** Types shared by the Shruti adapter and its lazily loaded runtime (kept apart to avoid a cycle). */

/** The slice of a loaded Shruti model this adapter uses. */
export interface ShrutiAsr {
  transcribe(
    samples: Float32Array,
    options?: { language?: string | null; loops?: 'off' | 'cut' },
  ): Promise<{ text: string; language?: string | null }>;
}

/** Response shape the loader may receive for a file that is not in the cache. */
export interface MissingFile {
  ok: false;
  status: number;
}

/**
 * Loads the model. Model bytes may only be read from Cache Storage: either through `fetchFn`
 * (main thread) or, in the worker, by opening `cacheName` directly. Never from the network.
 */
export type ShrutiLoader = (args: {
  baseUrl: string;
  cacheName: string;
  fetchFn: (url: string) => Promise<Response | MissingFile>;
}) => Promise<ShrutiAsr>;
