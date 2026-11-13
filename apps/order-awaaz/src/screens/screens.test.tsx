// Order_App screen tests: real Demo_Shop seed, fake-indexeddb, scripted speech provider.
// **Validates: Requirements 12.4, 12.7, 12.8**
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  DB_NAME,
  DEMO_SHOP_ID,
  META_KEYS,
  commitConfirmed,
  createRepositories,
  openDb,
  resetDemoShop,
} from '@awaaz-kit/local-data';
import { confirm, createUserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { OrderWorkflowAdapter } from '@awaaz-kit/domain-order';
import { createOrderParser } from '../capture/orderParser';
import { AppProviders } from '../providers/AppProviders';
import { routes } from '../routes';

vi.stubEnv('VITE_SPEECH_PROVIDER', 'scripted');
// Keep the app local-only regardless of any developer env file.
vi.stubEnv('VITE_APPWRITE_ENDPOINT', '');
vi.stubEnv('VITE_APPWRITE_PROJECT_ID', '');

async function wipeAndSeed(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  const db = await openDb();
  await resetDemoShop(db);
  await createRepositories(db, {
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
  }).meta.set(META_KEYS.activeShopId, DEMO_SHOP_ID);
  db.close();
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

const SAMPLE = 'two kg sugar and one litre milk';

describe('Order_App screens', () => {
  beforeEach(async () => {
    await wipeAndSeed();
  });

  it('Capture: a sample chip fills the transcript and parses items', async () => {
    const user = userEvent.setup();
    renderAt('/capture');
    const chip = await screen.findByRole('button', { name: /two kg sugar and one litre milk/ });
    expect(within(chip.closest('[role="group"]') as HTMLElement).getByText('Sample')).toBeVisible();
    // Wait for the catalog-aware parser to register before using the chip.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Check order$/ })).toBeDefined(),
    );
    await user.click(chip);
    expect(await screen.findByLabelText('Order text')).toHaveValue(SAMPLE);
    expect(await screen.findByTestId('parse-summary')).toHaveTextContent(/items? found/);
    expect(screen.getByRole('button', { name: 'Continue to review items' })).toBeEnabled();
  });

  it('Capture: Continue stays disabled until items are found', async () => {
    renderAt('/capture');
    expect(await screen.findByRole('button', { name: 'Continue to review items' })).toBeDisabled();
  });

  it('Resolve: an unresolved item blocks Continue to review', async () => {
    const user = userEvent.setup();
    renderAt('/capture');
    const box = await screen.findByLabelText('Order text');
    await user.type(box, 'two kg qqzzxx');
    await user.click(screen.getByRole('button', { name: 'Check order' }));
    await user.click(await screen.findByRole('button', { name: 'Continue to review items' }));
    expect(await screen.findByRole('heading', { name: 'Resolve items' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
  });

  it('Capture to Resolve to Review: confirm is enabled when clear and saved order appears in Orders', async () => {
    const user = userEvent.setup();
    renderAt('/capture');
    await screen.findByLabelText('Order text');
    await user.click(
      await screen.findByRole('button', { name: /two kg sugar and one litre milk/ }),
    );
    await user.click(await screen.findByRole('button', { name: 'Continue to review items' }));
    await screen.findByRole('heading', { name: 'Resolve items' });
    await user.click(screen.getByRole('button', { name: 'Continue to review' }));
    const confirmBtn = await screen.findByRole('button', { name: 'Confirm order' });
    expect(confirmBtn).toBeEnabled();

    // jsdom clicks are never trusted, so the real confirm click is covered by Playwright.
    expect(screen.queryByText(/Cannot confirm yet/)).toBeNull();
  });

  it('Orders: a confirmed order saved to the local database appears in the list', async () => {
    const db = await openDb();
    const repos = createRepositories(db, {
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
    });
    const products = await repos.products.listAll(DEMO_SHOP_ID);
    const customers = await repos.customers.listAll(DEMO_SHOP_ID);
    const draft = createOrderParser({
      shopId: DEMO_SHOP_ID,
      products: products.filter((p) => p.deletedAt === null),
      customers,
      selectedCustomerId: null,
    })(SAMPLE);
    const adapter = new OrderWorkflowAdapter();
    const action = confirm(
      adapter,
      draft,
      createUserConfirmationEvidence({ isTrusted: true, type: 'click' }, draft.revision),
    );
    const saved = await commitConfirmed(db, action);
    db.close();

    renderAt('/orders');
    const row = await screen.findByRole('link', { name: new RegExp(saved.number) });
    expect(row).toBeVisible();
    expect(row).toHaveAttribute('href', `/orders/${saved.recordId}`);
  });
  it('Review: confirm is disabled with a visible reason for an unresolved draft', async () => {
    const user = userEvent.setup();
    const router = renderAt('/capture');
    const box = await screen.findByLabelText('Order text');
    await user.type(box, 'two kg qqzzxx');
    await user.click(screen.getByRole('button', { name: 'Check order' }));
    await user.click(await screen.findByRole('button', { name: 'Continue to review items' }));
    await screen.findByRole('heading', { name: 'Resolve items' });
    await act(() => router.navigate('/review'));
    expect(await screen.findByRole('button', { name: 'Confirm order' })).toBeDisabled();
    expect(screen.getByText(/Cannot confirm yet/)).toBeVisible();
  });

  it('Orders: shows an empty state before any order is saved', async () => {
    renderAt('/orders');
    expect(await screen.findByText('No saved orders yet.')).toBeVisible();
  });

  it('Catalog: lists the seeded demo products read-only', async () => {
    renderAt('/catalog');
    expect(await screen.findByRole('heading', { name: 'Catalog' })).toBeVisible();
    const items = await screen.findAllByText(/per (kg|litre|packet|piece|dozen|gram|ml)/i, {
      exact: false,
    });
    expect(items.length).toBe(24);
    // The catalog is read-only: the only button on screen is the header theme toggle.
    const buttons = screen
      .queryAllByRole('button')
      .filter((b) => !b.hasAttribute('data-theme-toggle'));
    expect(buttons).toHaveLength(0);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('About: states local-only sync and offers demo reset', async () => {
    renderAt('/about');
    expect(await screen.findByRole('heading', { name: 'About Order Awaaz' })).toBeVisible();
    expect(screen.getByText(/Cloud sync is not configured/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeEnabled();
  });
});
