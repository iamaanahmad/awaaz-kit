import { describe, expect, it } from 'vitest';
import { loadInWorker, type WorkerLike } from './shruti-worker-client.js';
import type { WorkerRequest, WorkerResponse } from './shruti-worker-protocol.js';

/** In-memory worker that answers like shruti.worker.ts, driven by a handler. */
function fakeWorker(handle: (req: WorkerRequest, send: (r: WorkerResponse) => void) => void) {
  const listeners: {
    message: ((e: MessageEvent<WorkerResponse>) => void)[];
    error: ((e: ErrorEvent) => void)[];
  } = {
    message: [],
    error: [],
  };
  const sent: { req: WorkerRequest; transfer?: Transferable[] }[] = [];
  let terminated = false;
  const send = (r: WorkerResponse): void => {
    queueMicrotask(() =>
      listeners.message.forEach((l) => l({ data: r } as MessageEvent<WorkerResponse>)),
    );
  };
  const worker: WorkerLike = {
    postMessage(req, transfer) {
      sent.push(transfer ? { req, transfer } : { req });
      handle(req, send);
    },
    addEventListener(type: 'message' | 'error', l: never) {
      (listeners[type] as unknown[]).push(l);
    },
    terminate() {
      terminated = true;
    },
  };
  return {
    worker,
    sent,
    isTerminated: () => terminated,
    crash: (msg: string) => listeners.error.forEach((l) => l({ message: msg } as ErrorEvent)),
  };
}

describe('Shruti worker client', () => {
  it('loads with the cache name and base URL, then transcribes by transferring the samples', async () => {
    const f = fakeWorker((req, send) => {
      if (req.type === 'load') send({ type: 'loaded' });
      if (req.type === 'transcribe')
        send({ type: 'result', id: req.id, text: `heard ${req.samples.length}`, language: 'hi' });
    });
    const asr = await loadInWorker(f.worker, { baseUrl: 'https://m/', cacheName: 'c' });
    expect(f.sent[0]?.req).toEqual({ type: 'load', baseUrl: 'https://m/', cacheName: 'c' });

    const samples = new Float32Array(16000);
    const r = await asr.transcribe(samples, { language: null, loops: 'cut' });
    expect(r).toEqual({ text: 'heard 16000', language: 'hi' });
    const t = f.sent[1];
    expect(t?.req).toMatchObject({ type: 'transcribe', language: null, loops: 'cut' });
    expect(t?.transfer).toEqual([samples.buffer]);
  });

  it('matches concurrent results to their requests by id', async () => {
    const f = fakeWorker((req, send) => {
      if (req.type === 'load') send({ type: 'loaded' });
      // Answer in reverse order.
      if (req.type === 'transcribe')
        setTimeout(
          () => send({ type: 'result', id: req.id, text: `#${req.id}`, language: null }),
          10 - req.id,
        );
    });
    const asr = await loadInWorker(f.worker, { baseUrl: 'b/', cacheName: 'c' });
    const [a, b] = await Promise.all([
      asr.transcribe(new Float32Array(1)),
      asr.transcribe(new Float32Array(1)),
    ]);
    expect([a.text, b.text]).toEqual(['#1', '#2']);
  });

  it('rejects and terminates the worker when loading fails', async () => {
    const f = fakeWorker((req, send) => {
      if (req.type === 'load') send({ type: 'load-error', message: 'wasm blocked' });
    });
    await expect(loadInWorker(f.worker, { baseUrl: 'b/', cacheName: 'c' })).rejects.toThrow(
      'wasm blocked',
    );
    expect(f.isTerminated()).toBe(true);
  });

  it('surfaces a transcription error, and fails pending work if the worker crashes', async () => {
    const f = fakeWorker((req, send) => {
      if (req.type === 'load') send({ type: 'loaded' });
      if (req.type === 'transcribe' && req.id === 1)
        send({ type: 'transcribe-error', id: 1, message: 'session crashed' });
    });
    const asr = await loadInWorker(f.worker, { baseUrl: 'b/', cacheName: 'c' });
    await expect(asr.transcribe(new Float32Array(1))).rejects.toThrow('session crashed');
    const stuck = asr.transcribe(new Float32Array(1)); // id 2 never answers
    f.crash('out of memory');
    await expect(stuck).rejects.toThrow('out of memory');
    expect(f.isTerminated()).toBe(true);
  });
});
