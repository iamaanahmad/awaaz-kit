/**
 * Page-side half of the Shruti worker. Exposes the loaded model as a `ShrutiAsr`, so the
 * provider does not care whether the model runs in a worker or on the main thread.
 */
import type { ShrutiAsr } from './shruti-types.js';
import type { WorkerRequest, WorkerResponse } from './shruti-worker-protocol.js';

/** Something with the Worker messaging surface (a real Worker, or a fake in tests). */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

/**
 * Sends `load` and resolves once the worker has the model. Rejects with the worker's error, and
 * terminates the worker, if loading fails.
 */
export function loadInWorker(
  worker: WorkerLike,
  args: { baseUrl: string; cacheName: string },
): Promise<ShrutiAsr> {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (r: { text: string; language: string | null }) => void; reject: (e: Error) => void }
  >();

  return new Promise<ShrutiAsr>((resolveLoad, rejectLoad) => {
    let loaded = false;
    const fail = (msg: string): void => {
      const err = new Error(msg);
      if (!loaded) rejectLoad(err);
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker.terminate();
    };
    worker.addEventListener('error', (event: ErrorEvent) => {
      fail(event.message || 'The speech worker stopped');
    });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'loaded':
          loaded = true;
          resolveLoad({
            transcribe(samples, options = {}) {
              const id = nextId++;
              return new Promise((resolve, reject) => {
                pending.set(id, { resolve, reject });
                // Transfer the buffer: the page does not need the samples again.
                worker.postMessage(
                  {
                    type: 'transcribe',
                    id,
                    samples,
                    language: options.language ?? null,
                    loops: options.loops ?? 'cut',
                  },
                  [samples.buffer],
                );
              });
            },
          });
          return;
        case 'load-error':
          fail(msg.message);
          return;
        case 'result': {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          p?.resolve({ text: msg.text, language: msg.language });
          return;
        }
        case 'transcribe-error': {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          p?.reject(new Error(msg.message));
          return;
        }
      }
    });
    worker.postMessage({ type: 'load', baseUrl: args.baseUrl, cacheName: args.cacheName });
  });
}
