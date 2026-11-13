// Bill_App screen tests: real Demo_Shop seed, fake-indexeddb, scripted speech provider.
// **Validates: Requirements 13.13, 13.16**
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { buildIndex } from '@awaaz-kit/catalog-matcher';
import { confirm, createUserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { BillingWorkflowAdapter, type BillDraft } from '@awaaz-kit/domain-billing';
import {
  DB_NAME,
  DEMO_SHOP_ID,
  META_KEYS,
  commitConfirmed,
  createRepositories,
  openDb,
  resetDemoShop,
} from '@awaaz-kit/local-data';
import { clearPendingConfirmed, setPendingConfirmed } from '../capture/confirmedActionStore';
import { setBillDraft } from '../capture/billDraftStore';
import { AppProviders } from '../providers/AppProviders';
import About from './About';
import Bills from './Bills';
import Capture from './Capture';
import Finalize from './Finalize';
import Lines from './Lines';
import Review from './Review';

vi.stubEnv('VITE_SPEECH_PROVIDER', 'scripted');
// Keep the app local-only regardless of any developer env file.
vi.stubEnv('VITE_APPWRITE_ENDPOINT', '');
vi.stubEnv('VITE_APPWRITE_PROJECT_ID', '');

const routes: RouteObject[] = [
  { path: '/capture', element: <Capture /> },
  { path: '/lines', element: <Lines /> },
  { path: '/review', element: <Review /> },
  { path: '/finalize/:id', element: <Finalize /> },
  { path: '/bills', element: <Bills /> },
  { path: '/about', element: <About /> },
];

const opts = { now: () => new Date(), newId: () => crypto.randomUUID() };

async function wipeAndSeed(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  const db = await openDb();
  await resetDemoShop(db);
  await createRepositories(db, opts).meta.set(META_KEYS.activeShopId, DEMO_SHOP_ID);
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

/** Parses typed text against the seeded catalog, the same way the Capture screen does. */
async function parseDraft(text: string): Promise<BillDraft> {
  const db = await openDb();
  const repos = createRepositories(db, opts);
  const products = (await repos.products.listAll(DEMO_SHOP_ID)).filter((p) => p.deletedAt === null);
  db.close();
  return new BillingWorkflowAdapter().parse(text, {
    shopId: DEMO_SHOP_ID,
    customers: [],
    catalog: buildIndex(DEMO_SHOP_ID, products),
    makeId: () => crypto.randomUUID(),
    now: () => new Date(),
    config: { taxEnabled: false },
  });
}

/** Marks every extracted field confirmed, as the user does on the Lines screen. */
function confirmAll(d: BillDraft): BillDraft {
  return {
    ...d,
    lines: d.lines.map((l) => ({
      ...l,
      product: { ...l.product, status: 'confirmed' },
      quantityMilli: { ...l.quantityMilli, status: 'confirmed' },
      unit: { ...l.unit, status: 'confirmed' },
      price: { ...l.price, status: 'confirmed' },
    })),
  };
}

const SUGAR_KG = 'two kg sugar'; // Demo_Shop sugar: 4800 paise per kg
const SAMPLE = 'bill for Ramesh, half kg tea and two packets biscuit';

describe('Bill_App screens', () => {
  beforeEach(async () => {
    setBillDraft(null);
    clearPendingConfirmed();
    await wipeAndSeed();
  });

  it('Capture: a sample chip fills the transcript and parses lines', async () => {
    const user = userEvent.setup();
    renderAt('/capture');
    const chip = await screen.findByRole('button', { name: /half kg tea and two packets biscuit/ });
    expect(within(chip.closest('[role="group"]') as HTMLElement).getByText('Sample')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review lines' })).toBeDefined());
    await user.click(chip);
    expect(await screen.findByLabelText('Bill text')).toHaveValue(SAMPLE);
    expect(await screen.findByTestId('parse-summary')).toHaveTextContent(/lines? found/);
    expect(screen.getByRole('button', { name: 'Review lines' })).toBeEnabled();
  });

  it('Capture: blank text blocks Review lines', async () => {
    renderAt('/capture');
    expect(await screen.findByRole('button', { name: 'Review lines' })).toBeDisabled();
  });

  it('Lines: a missing price is flagged, and entering one recomputes totals in exact paise', async () => {
    const user = userEvent.setup();
    setBillDraft(await parseDraft('two kg qqzzxx'));
    renderAt('/lines');
    expect(await screen.findByText(/Enter a price for line 1/)).toBeVisible();
    expect(screen.getByTestId('total')).toHaveTextContent('₹0.00');

    // 2 kg at Rs 10.55 = 2000 milli * 1055 paise / 1000 = 2110 paise.
    await user.type(screen.getByLabelText('Price (₹)'), '10.55');
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('₹21.10'));
    expect(screen.queryByText(/Enter a price for line 1/)).toBeNull();

    // Quantity 2.5 kg at 1055 paise = 2500 * 1055 / 1000 = 2637.5, half-up 2638 paise.
    const qty = screen.getByLabelText('Quantity');
    await user.clear(qty);
    await user.type(qty, '2.5');
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('₹26.38'));
    expect(screen.getByTestId('line-total-1')).toHaveTextContent('₹26.38');
  });

  it('Lines: editing quantity of a catalog item recomputes to exact paise', async () => {
    const user = userEvent.setup();
    setBillDraft(confirmAll(await parseDraft(SUGAR_KG)));
    renderAt('/lines');
    // 2 kg * 4800 = 9600 paise.
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('₹96.00'));
    const qty = screen.getByLabelText('Quantity');
    await user.clear(qty);
    await user.type(qty, '1.5');
    // 1.5 kg * 4800 = 7200 paise.
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('₹72.00'));
  });

  it('Review: Finalize is disabled with a visible reason for an incomplete draft', async () => {
    setBillDraft(await parseDraft('two kg qqzzxx'));
    renderAt('/review');
    expect(await screen.findByRole('button', { name: 'Finalize' })).toBeDisabled();
    expect(screen.getByText(/Cannot confirm yet/)).toBeVisible();
  });

  it('Review: Finalize is enabled when every field is confirmed', async () => {
    setBillDraft(confirmAll(await parseDraft(SUGAR_KG)));
    renderAt('/review');
    expect(await screen.findByRole('button', { name: 'Finalize' })).toBeEnabled();
    expect(screen.queryByText(/Cannot confirm yet/)).toBeNull();
  });

  it('Finalize: the receipt says "Cash memo / receipt" and makes no GST claim', async () => {
    const draft = confirmAll(await parseDraft(SUGAR_KG));
    const action = confirm(
      new BillingWorkflowAdapter(),
      draft,
      createUserConfirmationEvidence({ isTrusted: true, type: 'click' }, draft.revision),
    );
    setPendingConfirmed(draft.id, action);
    renderAt(`/finalize/${draft.id}`);
    expect(await screen.findByRole('heading', { name: 'Cash memo / receipt' })).toBeVisible();
    // Subtotal and Total both read 96.00 (2 kg * 4800 paise).
    expect((await screen.findAllByText('₹96.00', { selector: 'dd' })).length).toBe(2);
    expect(document.body.textContent ?? '').not.toMatch(/GST|tax invoice/i);
  });

  it('Finalize: without a confirmed action nothing is saved', async () => {
    renderAt('/finalize/00000000-0000-4000-8000-0000000000ff');
    expect(await screen.findByText(/Nothing was saved from this page/)).toBeVisible();
  });

  it('Bills: a bill committed through the engine appears in the list', async () => {
    const draft = confirmAll(await parseDraft(SUGAR_KG));
    const action = confirm(
      new BillingWorkflowAdapter(),
      draft,
      createUserConfirmationEvidence({ isTrusted: true, type: 'click' }, draft.revision),
    );
    const db = await openDb();
    const saved = await commitConfirmed(db, action);
    db.close();

    renderAt('/bills');
    const row = await screen.findByRole('link', { name: new RegExp(`#${saved.number}`) });
    expect(row).toBeVisible();
    expect(row).toHaveAttribute('href', `/bills/${saved.recordId}`);
    expect(row).toHaveTextContent('₹96.00');
  });

  it('Bills: shows an empty state before any bill is saved', async () => {
    renderAt('/bills');
    expect(await screen.findByText('No saved bills yet.')).toBeVisible();
  });

  it('About: states local-only sync and offers demo reset', async () => {
    renderAt('/about');
    expect(await screen.findByRole('heading', { name: 'About Bill Awaaz' })).toBeVisible();
    expect(screen.getByText(/Cloud sync is not configured/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeEnabled();
  });
});
