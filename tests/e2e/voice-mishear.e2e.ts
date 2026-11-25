import { test, expect, onboardDemoShop, resetDemoShop } from './fixtures';
import {
  HAVE_MODEL,
  SKIP_REASON,
  downloadVoice,
  micFrom,
  openCapture,
  serveModelLocally,
  speak,
} from './voice-helpers';

/*
 * A real recognition error, caught by the honesty gate. Spoken: "Two kilo sugar and one litre
 * milk." Shruti writes "leader" for "litre" on this synthetic clip (measured, see
 * docs/model-benchmark.md). The app must not guess a unit: it asks, and Continue stays locked.
 */
test.use(micFrom('order-en-sugar-milk.wav'));

// Feature: awaaz-kit (example journey)
// **Validates: Requirements 10.1, 10.3, 10.10, 11.3**
test.describe('Voice journey: a misheard word is flagged, never guessed', () => {
  test.skip(!HAVE_MODEL, SKIP_REASON);
  test.setTimeout(240_000);

  test('@voice "one litre milk" heard as "one leader milk" blocks confirmation until fixed', async ({
    page,
    context,
  }) => {
    await serveModelLocally(context);
    await resetDemoShop(page);
    await onboardDemoShop(page);
    await openCapture(page);
    await downloadVoice(page);

    const heard = (await speak(page, 4)).toLowerCase();
    expect(heard).toContain('sugar');
    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await expect(page.getByRole('heading', { name: 'Resolve items' })).toBeVisible();

    // The uncertain line is not confirmed for the user: a prompt asks, Continue stays locked.
    await expect(page.getByRole('group', { name: 'Clarification' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
  });
});
