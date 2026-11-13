import { test, expect, onboardDemoShop, BILL_URL } from './fixtures';

const HINDI_BILL = 'तीन किलो आलू और दो किलो प्याज और एक किलो टमाटर';
const SAMPLE_BILL = 'Ramesh ka bill banao, dedh kilo cheeni aur ek litre tel';

// Feature: awaaz-kit (example journey)
// **Validates: Requirements 13.9, 13.11, 13.16, 19.5**
test.describe('Bill journey', () => {
  test('a Sample chip builds a bill with exact totals', async ({ demoPage: page }) => {
    await page.goto(BILL_URL);
    await onboardDemoShop(page);
    await page.getByRole('link', { name: /New Bill/ }).click();
    await expect(page.getByRole('heading', { name: 'New bill' })).toBeVisible();

    await page.getByRole('button', { name: `Sample: ${SAMPLE_BILL}` }).click();
    await expect(page.getByTestId('parse-summary')).toHaveText('2 lines found.');
    await page.getByRole('button', { name: 'Review lines' }).click();

    await expect(page.getByRole('heading', { name: 'Lines' })).toBeVisible();
    // sugar 1.5 kg x ₹48 = ₹72.00, oil 1 litre = ₹145.00
    await expect(page.getByTestId('total')).toHaveText('₹217.00');
  });

  test('typed bill to finalized cash memo, kept after reload and immutable', async ({
    demoPage: page,
  }) => {
    await page.goto(BILL_URL);
    await onboardDemoShop(page);
    await page.getByRole('link', { name: /New Bill/ }).click();

    await page.getByLabel('Bill text').fill(HINDI_BILL);
    await expect(page.getByTestId('parse-summary')).toHaveText('3 lines found.');
    await page.getByRole('button', { name: 'Review lines' }).click();

    // Lines: potato 3 kg ₹90, onion 2 kg ₹70, tomato 1 kg ₹40.
    await expect(page.getByRole('heading', { name: 'Lines' })).toBeVisible();
    await expect(page.getByTestId('total')).toHaveText('₹200.00');

    // Quantity correction recomputes exactly.
    const line2 = page.getByRole('group', { name: 'Line 2' });
    await line2.getByLabel('Quantity').fill('3');
    await expect(page.getByTestId('line-total-2')).toHaveText('₹105.00');
    await expect(page.getByTestId('total')).toHaveText('₹235.00');

    // A line with no price blocks Finalize.
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByText('Enter a price for line 4 or remove the line.')).toBeVisible();
    await page.getByRole('button', { name: 'Review bill' }).click();
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finalize' })).toBeDisabled();

    // Remove the incomplete line and finalize.
    await page.getByRole('link', { name: 'Back to lines' }).click();
    await page.getByRole('button', { name: 'Remove line 4' }).click();
    await expect(page.getByTestId('total')).toHaveText('₹235.00');
    await page.getByRole('button', { name: 'Review bill' }).click();
    await expect(page.getByTestId('total')).toHaveText('₹235.00');

    const finalize = page.getByRole('button', { name: 'Finalize' });
    await expect(finalize).toBeEnabled();
    await finalize.click(); // real trusted click

    const status = page.getByRole('status').filter({ hasText: /Receipt #/ });
    await expect(status).toBeVisible();
    const match = /Receipt #(\S+?)\.$/.exec(((await status.textContent()) ?? '').trim());
    expect(match).not.toBeNull();
    const receiptNumber = match?.[1] ?? '';

    // Cash memo wording, no GST text, print/copy actions.
    const receipt = page.getByRole('article');
    await expect(receipt.getByRole('heading', { name: 'Cash memo / receipt' })).toBeVisible();
    await expect(receipt).toContainText('₹235.00');
    await expect(page.locator('body')).not.toContainText(/GST|tax invoice/i);
    await expect(page.getByRole('button', { name: 'Print' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Copy summary' })).toBeEnabled();

    // Print preview shows the receipt and hides the controls.
    await page.emulateMedia({ media: 'print' });
    await expect(receipt).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
    await page.emulateMedia({ media: 'screen' });

    // Persists after reload (Finalize itself is one-shot, so reload the list).
    await page.goto(`${BILL_URL}bills`);
    await page.reload();
    const row = page.getByRole('link', { name: new RegExp(receiptNumber) });
    await expect(row).toHaveCount(1);
    await row.click();

    // Finalized bill is read-only: no line inputs, only a linked void/correction.
    await expect(page.getByRole('heading', { name: 'Cash memo / receipt' })).toBeVisible();
    await expect(page.getByLabel('Quantity')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove line 1' })).toHaveCount(0);
    await expect(
      page.getByText('The original bill stays unchanged. A new linked record is saved instead.'),
    ).toBeVisible();

    // No bill in progress remains to edit.
    await page.goto(`${BILL_URL}lines`);
    await expect(page.getByText('No bill in progress.')).toBeVisible();
  });
});
