import type { Page } from '@playwright/test';
import { test, expect, onboardDemoShop } from './fixtures';

const SAMPLE_TEXT = 'do kilo aata, ek litre tel aur paanch kilo chawal';

/** Counts rows in a raw IndexedDB object store, independent of the app's own code. */
async function countRows(page: Page, store: string): Promise<number> {
  return page.evaluate(
    (name: string) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('awaaz-kit');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction(name, 'readonly').objectStore(name).count();
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
          req.onerror = () => reject(new Error('count failed'));
        };
      }),
    store,
  );
}

async function openCapture(page: Page): Promise<void> {
  // First run: choose the Demo_Shop (seeds the catalog), then open Capture.
  await onboardDemoShop(page);
  await page.getByRole('link', { name: /New Order/ }).click();
  await expect(page.getByRole('heading', { name: 'Capture an order' })).toBeVisible();
}

// Feature: awaaz-kit (example journey)
// **Validates: Requirements 12.5, 12.8, 12.11, 19.5**
test.describe('Order journey', () => {
  test('a Sample alone creates no order before Confirm', async ({ demoPage: page }) => {
    await openCapture(page);
    await page.getByRole('button', { name: `Sample: ${SAMPLE_TEXT}` }).click();
    await expect(page.getByTestId('parse-summary')).toHaveText('3 items found.');
    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await expect(page.getByRole('heading', { name: 'Resolve items' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to review' }).click();
    await expect(page.getByRole('heading', { name: 'Review order' })).toBeVisible();

    expect(await countRows(page, 'orders')).toBe(0);
    expect(await countRows(page, 'orderItems')).toBe(0);

    await page.reload();
    expect(await countRows(page, 'orders')).toBe(0);
  });

  test('sample to confirmed order, listed and kept after reload', async ({ demoPage: page }) => {
    await openCapture(page);

    // The chip is labelled "Sample" and fills the transcript, then submits.
    await page.getByRole('button', { name: `Sample: ${SAMPLE_TEXT}` }).click();
    await expect(page.getByTestId('parse-summary')).toHaveText('3 items found.');

    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await expect(page.getByRole('heading', { name: 'Resolve items' })).toBeVisible();
    await expect(page.getByText('All items are clear. Continue to review.')).toBeVisible();

    await page.getByRole('button', { name: 'Continue to review' }).click();
    await expect(page.getByRole('heading', { name: 'Review order' })).toBeVisible();

    // Real trusted click on the ConfirmButton.
    const confirmButton = page.getByRole('button', { name: 'Confirm order' });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.getByRole('heading', { name: 'Saved on this device' })).toBeVisible();
    const status = page.getByRole('status').filter({ hasText: /Order .+ is saved\./ });
    await expect(status).toBeVisible();
    const statusText = (await status.textContent()) ?? '';
    const match = /^Order (.+) is saved\.$/.exec(statusText.trim());
    expect(match).not.toBeNull();
    const orderNumber = match?.[1] ?? '';
    expect(orderNumber.length).toBeGreaterThan(0);

    expect(await countRows(page, 'orders')).toBe(1);
    expect(await countRows(page, 'orderItems')).toBe(3);

    // Appears in the Orders list.
    await page.goto('/order/orders');
    await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
    const row = page.getByRole('link', { name: new RegExp(orderNumber) });
    await expect(row).toHaveCount(1);

    // Survives a reload.
    await page.reload();
    await expect(page.getByRole('link', { name: new RegExp(orderNumber) })).toHaveCount(1);
    expect(await countRows(page, 'orders')).toBe(1);
  });
});
