import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from './fixtures';

/*
 * Shared by the voice journeys. The app is not mocked. The test only arranges two inputs:
 *   1. The microphone: Chromium plays a committed, synthetic WAV (Windows SAPI voice, no human
 *      speaker) into getUserMedia.
 *   2. The model download: requests to Hugging Face are answered from the local copy that
 *      scripts/fetch-voice-benchmark.mjs downloads, so the test needs no network. The app still
 *      checks every file's SHA-256 itself before caching it.
 */

export const MODEL_DIR = resolve('.voice-bench/model-int8');
const MODEL_FILES = ['frontend.onnx', 'encoder.onnx', 'decoder.onnx', 'shruti.json'];
export const HAVE_MODEL = MODEL_FILES.every((f) => existsSync(resolve(MODEL_DIR, f)));
export const SKIP_REASON =
  'Local model copy missing: run `node scripts/fetch-voice-benchmark.mjs` first.';

const MODEL_URL =
  /^https:\/\/huggingface\.co\/udgamlabs\/Shruti-ONNX\/resolve\/main\/hi\/onnx-int8\/([^/?]+)$/;

/** Fake-microphone launch options that play one WAV file, once, into getUserMedia. */
export function micFrom(name: string) {
  const file = resolve('tests/fixtures/voice-audio', name);
  return {
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${file}%noloop`,
      ],
    },
  };
}

/** Serves the model from the local copy and counts requests, to prove none happen offline. */
export async function serveModelLocally(context: BrowserContext): Promise<{ hits: () => number }> {
  let hits = 0;
  await context.route(MODEL_URL, async (route) => {
    hits += 1;
    const name = MODEL_URL.exec(route.request().url())?.[1] ?? '';
    await route.fulfill({
      path: resolve(MODEL_DIR, name),
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  return { hits: () => hits };
}

export async function controlledBySw(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

export async function openCapture(page: Page): Promise<void> {
  await page.getByRole('link', { name: /New Order/ }).click();
  await expect(page.getByRole('heading', { name: 'Capture an order' })).toBeVisible();
}

export async function downloadVoice(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Download model' }).click();
  await expect(page.getByText(/Voice is ready on this device/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('voice-hint')).toHaveCount(0);
}

/** Records for `seconds` from the fake mic and returns the transcript the model produced. */
export async function speak(page: Page, seconds: number): Promise<string> {
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.waitForTimeout(seconds * 1000);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  const box = page.getByLabel('Order text');
  await expect(box).not.toHaveValue('', { timeout: 90_000 });
  return box.inputValue();
}
