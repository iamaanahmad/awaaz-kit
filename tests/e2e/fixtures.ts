import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

export const ORDER_URL = '/order/';
export const BILL_URL = '/bill/';
export const DB_NAME = 'awaaz-kit';

/** Offline toggle that also keeps `navigator.onLine` consistent for the app's status hook. */
export interface Network {
  goOffline(): Promise<void>;
  goOnline(): Promise<void>;
}

/**
 * Replaces getUserMedia with a silent synthetic stream and MediaRecorder with a tiny stub, so
 * the mic path works without hardware. The speech provider is `ScriptedProvider` (selected at
 * build time with VITE_SPEECH_PROVIDER=scripted), so the recorded bytes are never decoded.
 * Pass `denied: true` to simulate a refused permission.
 */
export async function installFakeMicrophone(
  context: BrowserContext,
  options: { denied?: boolean } = {},
): Promise<void> {
  await context.addInitScript((denied: boolean) => {
    const md = navigator.mediaDevices;
    if (!md) return;
    md.getUserMedia = async () => {
      if (denied) throw new DOMException('Permission denied', 'NotAllowedError');
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createOscillator().connect(dest);
      return dest.stream;
    };
    class FakeRecorder extends EventTarget {
      state: 'inactive' | 'recording' = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: Event) => void) | null = null;
      onstop: ((e: Event) => void) | null = null;
      constructor(public stream: MediaStream) {
        super();
      }
      static isTypeSupported(): boolean {
        return true;
      }
      start(): void {
        this.state = 'recording';
      }
      stop(): void {
        this.state = 'inactive';
        const data = new Event('dataavailable') as Event & { data: Blob };
        data.data = new Blob([new Uint8Array(8)], { type: 'audio/webm' });
        this.ondataavailable?.(data);
        this.dispatchEvent(data);
        const stop = new Event('stop');
        this.onstop?.(stop);
        this.dispatchEvent(stop);
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  }, options.denied ?? false);
}

/** Deletes the shared IndexedDB and caches so the next load seeds a fresh Demo_Shop. */
export async function resetDemoShop(page: Page, path: string = ORDER_URL): Promise<void> {
  await page.goto(path);
  await page.evaluate(async (name: string) => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }, DB_NAME);
  await page.goto(path);
}

/**
 * First-run onboarding for either app: picks "Use Demo Shop" (which seeds the catalog and
 * customers) and waits for the Demo_Shop name to show. Call it on a page at the app's root
 * after `demoPage` (or `resetDemoShop`) has produced an empty database.
 */
export async function onboardDemoShop(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Use Demo Shop/ }).click();
  await expect(page.getByText('Sharma Kirana (Demo)')).toBeVisible();
}

export interface Fixtures {
  network: Network;
  /**
   * Page with the fake microphone installed and an EMPTY database at /order/ (stores and
   * caches cleared). It is not seeded: call `onboardDemoShop(page)` to create the Demo_Shop,
   * and navigate to `BILL_URL` first for Bill Awaaz (the database is shared per origin).
   */
  demoPage: Page;
}

export const test = base.extend<Fixtures>({
  network: async ({ context, page }, use) => {
    const set = async (offline: boolean): Promise<void> => {
      await context.setOffline(offline);
    };
    await use({
      goOffline: () => set(true),
      goOnline: () => set(false),
    });
    await context.setOffline(false);
    void page;
  },
  demoPage: async ({ context, page }, use) => {
    await installFakeMicrophone(context);
    await resetDemoShop(page);
    await use(page);
  },
});

export { expect };
