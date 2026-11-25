/** Messages between the page and the Shruti worker. Plain data only (structured clone). */

export type WorkerRequest =
  | { type: 'load'; baseUrl: string; cacheName: string }
  | {
      type: 'transcribe';
      id: number;
      /** Mono 16 kHz samples; transferred, not copied. */
      samples: Float32Array;
      language: string | null;
      loops: 'off' | 'cut';
    };

export type WorkerResponse =
  | { type: 'loaded' }
  | { type: 'load-error'; message: string }
  | { type: 'result'; id: number; text: string; language: string | null }
  | { type: 'transcribe-error'; id: number; message: string };
