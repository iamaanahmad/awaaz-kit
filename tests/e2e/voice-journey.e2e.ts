import { test, expect, onboardDemoShop, resetDemoShop, ORDER_URL } from './fixtures';
import {
  HAVE_MODEL,
  SKIP_REASON,
  controlledBySw,
  downloadVoice,
  micFrom,
  openCapture,
  serveModelLocally,
  speak,
} from './voice-helpers';

/*
 * Real on-device voice, end to end, in Chromium:
 *   WAV -> fake microphone -> MediaRecorder -> decode + resample -> Shruti (int8, onnxruntime-web
 *   WASM) -> editable transcript -> normalizer -> parser -> catalog match.
 * Then the same again with the network off. Spoken: "Two kilo sugar and five kilo rice."
 */
test.use(micFrom('order-en-sugar-rice.wav'));

// Feature: awaaz-kit (example journey)
// **Validates: Requirements 5.1, 5.2, 5.5, 5.6, 5.12, 2.2**
test.describe('Voice journey: real on-device speech to order', () => {
  test.skip(!HAVE_MODEL, SKIP_REASON);
  test.setTimeout(240_000);

  test('@voice spoken order is transcribed on the device, parsed, and still works offline', async ({
    page,
    context,
    network,
  }) => {
    const model = await serveModelLocally(context);
    await resetDemoShop(page);
    await onboardDemoShop(page);
    await controlledBySw(page);

    // Before the download the app says plainly that voice is not available yet.
    await openCapture(page);
    await expect(page.getByTestId('voice-hint')).toBeVisible();
    await downloadVoice(page);
    expect(model.hits()).toBe(4);

    const heard = (await speak(page, 4)).toLowerCase();
    expect(heard).toContain('sugar');
    expect(heard).toContain('rice');
    await expect(page.getByTestId('parse-summary')).toHaveText('2 items found.');
    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await expect(page.getByText('All items are clear. Continue to review.')).toBeVisible();

    // Offline: reload and record again. The model comes from Cache Storage and the runtime from
    // the service worker; nothing is requested from the network.
    await network.goOffline();
    const before = model.hits();
    await page.goto(ORDER_URL);
    await page.reload();
    await expect(page.getByText('Sharma Kirana (Demo)')).toBeVisible();
    await openCapture(page);
    await expect(page.getByText(/Voice is ready on this device/)).toBeVisible();
    const offlineHeard = (await speak(page, 4)).toLowerCase();
    expect(offlineHeard).toContain('sugar');
    await expect(page.getByTestId('parse-summary')).toHaveText('2 items found.');
    expect(model.hits()).toBe(before);
  });
});
