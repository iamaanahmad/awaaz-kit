import type { Page } from '@playwright/test';
import { test, expect, onboardDemoShop, BILL_URL, ORDER_URL } from './fixtures';

const ORDER_SAMPLE = 'do kilo aata, ek litre tel aur paanch kilo chawal';
const BILL_TEXT = 'तीन किलो आलू और दो किलो प्याज और एक किलो टमाटर';

async function swReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // First load is not controlled yet; a reload hands the page to the active worker.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

// Feature: awaaz-kit (example journey)
// **Validates: Requirements 2.2, 19.10, 19.5**
test.describe('Offline journey', () => {
  test('@offline order and bill are created, confirmed and kept with no network', async ({
    demoPage: page,
    network,
  }) => {
    // Online once: seed the Demo_Shop and activate both service workers.
    await onboardDemoShop(page);
    await swReady(page);
    await page.goto(BILL_URL);
    await expect(page.getByRole('link', { name: /New Bill/ })).toBeVisible();
    await swReady(page);
    await page.goto(ORDER_URL);
    await expect(page.getByRole('link', { name: /New Order/ })).toBeVisible();

    await network.goOffline();

    // Shell loads offline.
    await page.reload();
    await expect(page.getByText('Sharma Kirana (Demo)')).toBeVisible();

    // Order, offline.
    await page.getByRole('link', { name: /New Order/ }).click();
    await page.getByRole('button', { name: `Sample: ${ORDER_SAMPLE}` }).click();
    await expect(page.getByTestId('parse-summary')).toHaveText('3 items found.');
    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await page.getByRole('button', { name: 'Continue to review' }).click();
    const confirmOrder = page.getByRole('button', { name: 'Confirm order' });
    await expect(confirmOrder).toBeEnabled();
    await confirmOrder.click();
    await expect(page.getByRole('heading', { name: 'Saved on this device' })).toBeVisible();
    const orderStatus = page.getByRole('status').filter({ hasText: /Order .+ is saved\./ });
    const orderNumber = /^Order (.+) is saved\.$/.exec(
      ((await orderStatus.textContent()) ?? '').trim(),
    )?.[1];
    expect(orderNumber).toBeTruthy();

    // Pending sync state is shown on the order home screen.
    await page.goto(ORDER_URL);
    await expect(page.getByTestId('pending-count')).toContainText(/[1-9]\d* pending sync/);

    // Bill, offline.
    await page.goto(BILL_URL);
    await page.getByRole('link', { name: /New Bill/ }).click();
    await page.getByLabel('Bill text').fill(BILL_TEXT);
    await expect(page.getByTestId('parse-summary')).toHaveText('3 lines found.');
    await page.getByRole('button', { name: 'Review lines' }).click();
    await expect(page.getByTestId('total')).toHaveText('₹200.00');
    await page.getByRole('button', { name: 'Review bill' }).click();
    const finalize = page.getByRole('button', { name: 'Finalize' });
    await expect(finalize).toBeEnabled();
    await finalize.click();
    const billStatus = page.getByRole('status').filter({ hasText: /Receipt #/ });
    await expect(billStatus).toBeVisible();
    const receipt = /Receipt #(\S+?)\.$/.exec(((await billStatus.textContent()) ?? '').trim())?.[1];
    expect(receipt).toBeTruthy();

    await page.goto(BILL_URL);
    await expect(page.getByTestId('pending-count')).toContainText(/Pending sync: [1-9]\d*/);

    // Reload offline: both records persist and nothing blocks the user.
    await page.goto(`${BILL_URL}bills`);
    await page.reload();
    await expect(page.getByRole('link', { name: new RegExp(receipt ?? '') })).toHaveCount(1);
    await page.goto(`${ORDER_URL}orders`);
    await page.reload();
    await expect(page.getByRole('link', { name: new RegExp(orderNumber ?? '') })).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
