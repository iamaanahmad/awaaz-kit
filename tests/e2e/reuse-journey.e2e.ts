import type { Page } from '@playwright/test';
import { test, expect, onboardDemoShop, BILL_URL, ORDER_URL } from './fixtures';

const UTTERANCE = 'तीन किलो आलू और दो किलो प्याज और एक किलो टमाटर';

/** Shared packages every app must list on About (the ten engine packages + two domains). */
const SHARED_PACKAGES = [
  '@awaaz-kit/voice-capture',
  '@awaaz-kit/speech-provider',
  '@awaaz-kit/language-normalizer',
  '@awaaz-kit/intent-engine',
  '@awaaz-kit/catalog-matcher',
  '@awaaz-kit/confidence-engine',
  '@awaaz-kit/confirmation-engine',
  '@awaaz-kit/local-data',
  '@awaaz-kit/sync-engine',
  '@awaaz-kit/shared-ui',
];

interface Recognised {
  name: string;
  qty: number;
}

/** Order Awaaz: product name and quantity per line, read from the Review screen. */
async function recognisedInOrder(page: Page): Promise<Recognised[]> {
  await page.goto(`${ORDER_URL}capture`);
  await page.getByLabel('Order text').fill(UTTERANCE);
  await expect(page.getByTestId('parse-summary')).toHaveText('3 items found.');
  await page.getByRole('button', { name: 'Continue to review items' }).click();
  await expect(page.getByRole('heading', { name: 'Resolve items' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await expect(page.getByRole('heading', { name: 'Review order' })).toBeVisible();
  const items = page.getByRole('list', { name: 'Items' }).getByRole('listitem');
  await expect(items).toHaveCount(3);
  const out: Recognised[] = [];
  for (const item of await items.all()) {
    const name = ((await item.locator('span.font-medium').textContent()) ?? '').trim();
    const detail = (await item.locator('span.block').textContent()) ?? '';
    out.push({ name, qty: Number(/^\s*([\d.]+)/.exec(detail)?.[1] ?? Number.NaN) });
  }
  return out;
}

/** Bill Awaaz: product name and quantity per line, read from the Lines screen. */
async function recognisedInBill(page: Page): Promise<Recognised[]> {
  await page.goto(`${BILL_URL}capture`);
  await page.getByLabel('Bill text').fill(UTTERANCE);
  await expect(page.getByTestId('parse-summary')).toHaveText('3 lines found.');
  await page.getByRole('button', { name: 'Review lines' }).click();
  await expect(page.getByRole('heading', { name: 'Lines' })).toBeVisible();
  const out: Recognised[] = [];
  for (const i of [1, 2, 3]) {
    const line = page.getByRole('group', { name: `Line ${i}` });
    out.push({
      name: await line.getByLabel('Product', { exact: true }).inputValue(),
      qty: Number(await line.getByLabel('Quantity').inputValue()),
    });
  }
  return out;
}

async function packagesListed(page: Page, url: string): Promise<string> {
  await page.goto(url);
  const heading = page.getByRole('heading', { name: 'Powered by Awaaz Kit' });
  await expect(heading).toBeVisible();
  return (await heading.locator('xpath=..').textContent()) ?? '';
}

// Feature: awaaz-kit (example journey)
// **Validates: Requirements 1.3, 1.4**
test.describe('Reuse journey', () => {
  test('same utterance gives the same products and quantities in both apps, with app-specific screens', async ({
    demoPage: page,
  }) => {
    await onboardDemoShop(page);

    const order = await recognisedInOrder(page);
    // Order screen: customer and delivery, no bill wording.
    await expect(page.getByLabel('Delivery or pickup')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm order' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finalize' })).toHaveCount(0);

    await page.goto(BILL_URL); // same origin, same database: already onboarded
    const bill = await recognisedInBill(page);
    // Bill screen: editable prices and totals, no order wording.
    await expect(page.getByTestId('total')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review bill' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm order' })).toHaveCount(0);

    expect(order.map((l) => l.qty)).toEqual([3, 2, 1]);
    expect(bill.map((l) => l.qty)).toEqual([3, 2, 1]);
    expect(bill.map((l) => l.name)).toEqual(order.map((l) => l.name));
    expect(new Set(order.map((l) => l.name)).size).toBe(3);
  });

  test('both About screens show the shared package manifest', async ({ demoPage: page }) => {
    const orderText = await packagesListed(page, `${ORDER_URL}about`);
    const billText = await packagesListed(page, `${BILL_URL}about`);
    for (const pkg of SHARED_PACKAGES) {
      expect(orderText, `order About lists ${pkg}`).toContain(pkg);
      expect(billText, `bill About lists ${pkg}`).toContain(pkg);
    }
    // The version list is the same in both apps.
    const versions = (text: string): string[] =>
      SHARED_PACKAGES.map((p) => new RegExp(`${p}\\s*(\\d+\\.\\d+\\.\\d+)`).exec(text)?.[1] ?? '');
    expect(versions(orderText).every((v) => v !== '')).toBe(true);
    expect(versions(billText)).toEqual(versions(orderText));
  });

  test('a catalog product seeded once is visible in both apps (one shared IndexedDB)', async ({
    demoPage: page,
  }) => {
    await onboardDemoShop(page);

    // Order Awaaz catalog lists potato.
    await page.goto(`${ORDER_URL}catalog`);
    const orderCatalog = page.getByRole('heading', { name: 'Catalog', exact: true });
    await expect(orderCatalog).toBeVisible();
    const productNames = page.locator('li span.font-medium');
    await expect(productNames.first()).toBeVisible();
    const names = (await productNames.allTextContents()).map((n) => n.trim());
    expect(names.length).toBe(24);
    const target = names[0] ?? '';

    // Bill Awaaz needs no second onboarding and offers the same product from the same database.
    await page.goto(`${BILL_URL}capture`);
    await expect(page.getByRole('heading', { name: 'New bill' })).toBeVisible();
    await page.getByLabel('Bill text').fill(UTTERANCE);
    await page.getByRole('button', { name: 'Review lines' }).click();
    await expect(page.getByRole('heading', { name: 'Lines' })).toBeVisible();
    const pick = page.locator('select[id^="pick-"]').first();
    await expect(pick.locator('option')).toHaveCount(25); // "Select product" + 24 products
    const options = (await pick.locator('option').allTextContents()).map((o) => o.trim());
    expect(options).toContain(target);

    // Both apps read one database named awaaz-kit holding the same product count.
    const count = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open('awaaz-kit');
          open.onerror = () => reject(new Error('open failed'));
          open.onsuccess = () => {
            const req = open.result.transaction('products').objectStore('products').count();
            req.onsuccess = () => resolve(req.result);
          };
        }),
    );
    expect(count).toBe(24);
  });
});
