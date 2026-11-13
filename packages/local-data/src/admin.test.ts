import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  clearAll,
  createLocalShop,
  createSettingsRepo,
  exportAll,
  openDb,
  requestPersistentStorage,
  resetDemoShop,
} from './index.js';

const T = '2025-01-01T00:00:00.000Z';
let n = 0;
const deps = { now: () => new Date(T), newId: () => `id-${++n}` };

async function setup() {
  return openDb({ name: `admin-${++n}`, indexedDB: new IDBFactory() });
}

describe('admin, onboarding and settings', () => {
  it('creates a local INR shop and sets it active', async () => {
    const db = await setup();
    const shop = await createLocalShop(db, deps, { name: '  Raj Store ' });
    expect(shop).toMatchObject({
      name: 'Raj Store',
      currency: 'INR',
      isDemo: false,
      remoteShopId: null,
    });
    expect(await db.shops.get(shop.id)).toEqual(shop);
    expect(await createSettingsRepo(db, deps).getActiveShopId()).toBe(shop.id);
  });

  it('keeps a stable device id and defaults sync toggles to disabled', async () => {
    const db = await setup();
    const s = createSettingsRepo(db, deps);
    const a = await s.getOrCreateDeviceId();
    expect(await s.getOrCreateDeviceId()).toBe(a);
    expect((await s.getSyncOptIn()).enabled).toBe(false);
    expect((await s.getSyncTranscripts()).enabled).toBe(false);
    expect(await s.setSyncTranscripts(true)).toEqual({ enabled: true, at: T });
    expect((await s.getSyncTranscripts()).enabled).toBe(true);
  });

  it('exports all stores without secret meta, and clears everything', async () => {
    const db = await setup();
    await resetDemoShop(db, deps.now);
    await db.syncMeta.put({ key: 'authToken', value: 'x' });
    await createSettingsRepo(db, deps).getOrCreateDeviceId();
    const blob = await exportAll(db, deps.now);
    expect(blob.stores.shops).toHaveLength(1);
    expect(blob.stores.products).toHaveLength(24);
    expect(blob.stores.syncMeta.map((r) => (r as { key: string }).key)).toEqual(['deviceId']);
    await clearAll(db);
    const after = await exportAll(db, deps.now);
    expect(Object.values(after.stores).every((rows) => rows.length === 0)).toBe(true);
  });

  it('records persistent storage status', async () => {
    const db = await setup();
    const s = createSettingsRepo(db, deps);
    expect(
      await requestPersistentStorage(s, {
        persisted: async () => false,
        persist: async () => true,
      }),
    ).toBe('granted');
    expect(
      await requestPersistentStorage(s, {
        persisted: async () => false,
        persist: async () => false,
      }),
    ).toBe('denied');
    expect(await s.getPersistentStorage()).toBe('denied');
    expect(await requestPersistentStorage(s, null)).toBe('unsupported');
  });
});
