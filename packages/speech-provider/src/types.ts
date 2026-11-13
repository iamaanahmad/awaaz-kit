import { z } from 'zod';

export const languageHintSchema = z.enum(['hi', 'en', 'auto']);
export type LanguageHint = z.infer<typeof languageHintSchema>;

export const transcriptionResultSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  /** Only present when the adapter has a calibrated source (Req 5.11, 10.9). */
  confidence: z.number().min(0).max(1).optional(),
});
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;

export const initializeResultSchema = z.object({
  ready: z.boolean(),
  modelVersion: z.string().optional(),
});
export type InitializeResult = z.infer<typeof initializeResultSchema>;

export interface TranscribeOptions {
  language?: LanguageHint;
}

export interface SpeechToTextProvider {
  initialize(): Promise<InitializeResult>;
  transcribe(audio: Blob, options?: TranscribeOptions): Promise<TranscriptionResult>;
}

export const modelStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('not_installed'), approxBytes: z.number().nonnegative() }),
  z.object({
    kind: z.literal('downloading'),
    receivedBytes: z.number().nonnegative(),
    totalBytes: z.number().nonnegative().nullable(),
  }),
  z.object({ kind: z.literal('ready'), modelVersion: z.string() }),
  z.object({ kind: z.literal('evicted') }),
  z.object({ kind: z.literal('error'), message: z.string() }),
]);
export type ModelStatus = z.infer<typeof modelStatusSchema>;

export interface ModelManager {
  /** Checked on app start; detects missing or evicted files (Req 5.7, 5.8). */
  status(): Promise<ModelStatus>;
  download(onProgress: (s: ModelStatus) => void, signal?: AbortSignal): Promise<void>;
  remove(): Promise<void>;
}

/**
 * Returns a numeric confidence string only when the result carries a finite
 * confidence value; otherwise null so the UI shows nothing (Req 5.11).
 */
export function formatConfidence(result: { confidence?: number | null }): string | null {
  const c = result.confidence;
  if (typeof c !== 'number' || !Number.isFinite(c)) return null;
  return c.toFixed(2);
}
