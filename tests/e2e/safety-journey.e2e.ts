import type { Page } from '@playwright/test';
import {
  test,
  expect,
  installFakeMicrophone,
  onboardDemoShop,
  resetDemoShop,
  BILL_URL,
  ORDER_URL,
} from './fixtures';

const ORDER_SAMPLE = 'do kilo aata, ek litre tel aur paanch kilo chawal';
const PHONE = '9876543210';

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

async function openOrderCapture(page: Page): Promise<void> {
  await onboardDemoShop(page);
  await page.getByRole('link', { name: /New Order/ }).click();
  await expect(page.getByRole('heading', { name: 'Capture an order' })).toBeVisible();
}

async function openBillCapture(page: Page): Promise<void> {
  await page.goto(BILL_URL);
  await onboardDemoShop(page);
  await page.getByRole('link', { name: /New Bill/ }).click();
  await expect(page.getByRole('heading', { name: 'New bill' })).toBeVisible();
}

// Feature: awaaz-kit (example journey)
// **Validates: Requirements 11.3, 11.6**
test.describe('Safety journey: Order Awaaz', () => {
  test('Sample submit alone creates no record', async ({ demoPage: page }) => {
    await openOrderCapture(page);
    await page.getByRole('button', { name: `Sample: ${ORDER_SAMPLE}` }).click();
    await expect(page.getByTestId('parse-summary')).toHaveText('3 items found.');
    expect(await countRows(page, 'orders')).toBe(0);
    expect(await countRows(page, 'orderItems')).toBe(0);
    await page.reload();
    expect(await countRows(page, 'orders')).toBe(0);
  });

  test('unmatched item blocks Continue with a visible reason until fixed', async ({
    demoPage: page,
  }) => {
    await openOrderCapture(page);
    await page.getByLabel('Order text').fill('do kilo zzqxv');
    await page.getByRole('button', { name: 'Check order' }).click();
    await expect(page.getByTestId('parse-summary')).toContainText('found');
    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await expect(page.getByRole('heading', { name: 'Resolve items' })).toBeVisible();

    // A clarification prompt and a text status label explain the block.
    await expect(page.getByText(/Item 1 of 1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to review' })).toBeDisabled();

    // The user picks a catalog product, which clears the block.
    await page.getByLabel('Choose from catalog').selectOption({ label: 'Aashirvaad Atta' });

    await expect(page.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
    expect(await countRows(page, 'orders')).toBe(0);
  });

  test('missing quantity blocks Continue until a quantity is entered', async ({
    demoPage: page,
  }) => {
    await openOrderCapture(page);
    await page.getByLabel('Order text').fill('aata chahiye');

    await page.getByRole('button', { name: 'Check order' }).click();
    await expect(page.getByTestId('parse-summary')).toContainText('found');
    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await expect(page.getByRole('heading', { name: 'Resolve items' })).toBeVisible();

    const next = page.getByRole('button', { name: 'Continue to review' });
    await expect(next).toBeDisabled();

    // Product is asked first; then the missing quantity is asked for explicitly.
    await page.getByLabel('Choose from catalog').selectOption({ label: 'Aashirvaad Atta' });
    await expect(next).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: /\?/ })).toBeVisible();
    await page.locator('form').getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Set quantity' }).click();
    if (await page.getByRole('button', { name: 'kg', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'kg', exact: true }).click();
    }
    await expect(next).toBeEnabled();
    expect(await countRows(page, 'orders')).toBe(0);
  });

  test('blank and whitespace transcripts create nothing', async ({ demoPage: page }) => {
    await openOrderCapture(page);
    const text = page.getByLabel('Order text');
    await text.fill('   ');
    await expect(page.getByRole('button', { name: 'Check order' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Continue to review items' })).toBeDisabled();
    await text.fill('');
    await expect(page.getByRole('button', { name: 'Check order' })).toBeDisabled();
    expect(await countRows(page, 'orders')).toBe(0);
    expect(await countRows(page, 'orderItems')).toBe(0);
  });

  test('double-click Confirm saves exactly one order', async ({ demoPage: page }) => {
    await openOrderCapture(page);
    await page.getByRole('button', { name: `Sample: ${ORDER_SAMPLE}` }).click();
    await expect(page.getByTestId('parse-summary')).toHaveText('3 items found.');
    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await expect(page.getByText('All items are clear. Continue to review.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue to review' }).click();
    await expect(page.getByRole('heading', { name: 'Review order' })).toBeVisible();
    const confirmButton = page.getByRole('button', { name: 'Confirm order' });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.dblclick();
    await expect(page.getByRole('heading', { name: 'Saved on this device' })).toBeVisible();
    expect(await countRows(page, 'orders')).toBe(1);
    expect(await countRows(page, 'orderItems')).toBe(3);
  });

  test('console output never contains transcript or phone text', async ({ demoPage: page }) => {
    const messages: string[] = [];
    page.on('console', (m) => messages.push(m.text()));
    page.on('pageerror', (e) => messages.push(String(e.message)));
    await openOrderCapture(page);
    await page.getByLabel('Order text').fill(`${PHONE} ke liye do kilo aata`);
    await page.getByRole('button', { name: 'Check order' }).click();
    await page.getByRole('button', { name: 'Continue to review items' }).click();
    await expect(page.getByRole('heading', { name: 'Resolve items' })).toBeVisible();
    // Phone digits may legitimately need review; the pipeline ran either way.
    const next = page.getByRole('button', { name: 'Continue to review' });
    if (await next.isEnabled()) {
      await next.click();
      await page.getByRole('button', { name: 'Confirm order' }).click();
      await expect(page.getByRole('heading', { name: 'Saved on this device' })).toBeVisible();
    }
    const joined = messages.join('\n');
    expect(joined).not.toContain(PHONE);
    expect(joined).not.toContain('do kilo aata');
  });
});

test.describe('Safety journey: Order Awaaz microphone', () => {
  test('denied microphone shows a message and typed input still works', async ({
    context,
    page,
  }) => {
    await installFakeMicrophone(context, { denied: true });
    await resetDemoShop(page, ORDER_URL);
    await openOrderCapture(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /denied/i })).toBeVisible();
    await page.getByRole('button', { name: 'Type instead' }).click();
    await page.getByLabel('Order text').fill('do kilo aata');
    await page.getByRole('button', { name: 'Check order' }).click();
    await expect(page.getByTestId('parse-summary')).toHaveText('1 item found.');
    expect(await countRows(page, 'orders')).toBe(0);
  });
});

test.describe('Safety journey: Bill Awaaz', () => {
  test('Sample submit alone creates no bill', async ({ demoPage: page }) => {
    await openBillCapture(page);
    await page
      .getByRole('button', { name: /^Sample: / })
      .first()
      .click();
    await expect(page.getByTestId('parse-summary')).toContainText('found');
    expect(await countRows(page, 'bills')).toBe(0);
    expect(await countRows(page, 'billItems')).toBe(0);
  });

  test('unmatched item blocks Finalize with a visible reason', async ({ demoPage: page }) => {
    await openBillCapture(page);
    await page.getByLabel('Bill text').fill('do kilo zzqxv');
    await page.getByRole('button', { name: 'Review lines' }).click();
    await expect(page.getByRole('heading', { name: 'Lines' })).toBeVisible();
    await page.getByRole('button', { name: 'Review bill' }).click();
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finalize' })).toBeDisabled();
    await expect(page.getByText(/Cannot confirm yet/)).toBeVisible();
    expect(await countRows(page, 'bills')).toBe(0);
  });

  test('missing price blocks Finalize', async ({ demoPage: page }) => {
    await openBillCapture(page);
    await page.getByLabel('Bill text').fill('do kilo aata');
    await page.getByRole('button', { name: 'Review lines' }).click();
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByText(/Enter a price for line 2/)).toBeVisible();
    await page.getByRole('button', { name: 'Review bill' }).click();
    await expect(page.getByRole('button', { name: 'Finalize' })).toBeDisabled();
    await expect(page.getByText(/Cannot confirm yet/)).toBeVisible();
    expect(await countRows(page, 'bills')).toBe(0);
  });

  test('blank and whitespace transcripts create nothing', async ({ demoPage: page }) => {
    await openBillCapture(page);
    await page.getByLabel('Bill text').fill('   ');
    await expect(page.getByRole('button', { name: 'Review lines' })).toBeDisabled();
    expect(await countRows(page, 'bills')).toBe(0);
  });

  test('double-click Finalize saves exactly one bill', async ({ demoPage: page }) => {
    await openBillCapture(page);
    await page.getByLabel('Bill text').fill('तीन किलो आलू और दो किलो प्याज');
    await page.getByRole('button', { name: 'Review lines' }).click();
    await page.getByRole('button', { name: 'Review bill' }).click();
    const finalize = page.getByRole('button', { name: 'Finalize' });
    await expect(finalize).toBeEnabled();
    await finalize.dblclick();
    await expect(page.getByRole('status').filter({ hasText: /Receipt #/ })).toBeVisible();
    expect(await countRows(page, 'bills')).toBe(1);
    expect(await countRows(page, 'billItems')).toBe(2);
  });

  test('console output never contains transcript or phone text', async ({ demoPage: page }) => {
    const messages: string[] = [];
    page.on('console', (m) => messages.push(m.text()));
    page.on('pageerror', (e) => messages.push(String(e.message)));
    await openBillCapture(page);
    await page.getByLabel('Bill text').fill(`${PHONE} ka bill, do kilo aata`);
    await page.getByRole('button', { name: 'Review lines' }).click();
    await page.getByRole('button', { name: 'Review bill' }).click();
    const finalize = page.getByRole('button', { name: 'Finalize' });
    if (await finalize.isEnabled()) await finalize.click();
    const joined = messages.join('\n');
    expect(joined).not.toContain(PHONE);
    expect(joined).not.toContain('do kilo aata');
  });

  test('denied microphone shows a message and typed input still works', async ({
    context,
    page,
  }) => {
    await installFakeMicrophone(context, { denied: true });
    await resetDemoShop(page, ORDER_URL);
    await openBillCapture(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /denied/i })).toBeVisible();
    await page.getByLabel('Bill text').fill('do kilo aata');
    await page.getByRole('button', { name: 'Review lines' }).click();
    await expect(page.getByRole('heading', { name: 'Lines' })).toBeVisible();
    expect(await countRows(page, 'bills')).toBe(0);
  });
});


