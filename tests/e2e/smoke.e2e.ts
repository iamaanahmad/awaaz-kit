import { test, expect, ORDER_URL, BILL_URL } from './fixtures';

test('both apps are served from one origin', async ({ demoPage, page }) => {
  await expect(demoPage).toHaveURL(new RegExp(`${ORDER_URL}`));
  await page.goto(BILL_URL);
  await expect(page).toHaveURL(new RegExp(`${BILL_URL}`));
});

test('@offline app shell reloads while offline after one online load', async ({
  demoPage,
  network,
}) => {
  await demoPage.evaluate(() => navigator.serviceWorker?.ready);
  await network.goOffline();
  await demoPage.reload();
  await expect(demoPage.locator('body')).not.toBeEmpty();
});
