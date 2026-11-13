import type { AwaazDb } from './schema.js';
import { DB_VERSION } from './schema.js';
import { ShopRecordSchema, type ShopRecord } from './records.js';
import type { RepoDeps } from './repositories.js';

/** Well-known `syncMeta` keys (design: syncMeta key-value rows). */
export const META_KEYS = {
  deviceId: 'deviceId',
  activeShopId: 'activeShopId',
  syncOptIn: 'syncOptIn',
  syncTranscripts: 'syncTranscripts',
  persistentStorage: 'persistentStorage',
  schemaVersion: 'schemaVersion',
} as const;

export type PersistentStorageStatus = 'granted' | 'denied' | 'unsupported';
export interface Toggle {
  enabled: boolean;
  at: string;
}

/** Keys that are never exported: credentials or tokens would live here (design: exportAll). */
const SECRET_META_PATTERN = /secret|token|password|session|credential|apikey/i;

export interface ExportBlob {
  format: 'awaaz-kit-export';
  version: 1;
  schemaVersion: number;
  exportedAt: string;
  stores: {
    shops: unknown[];
    products: unknown[];
    customers: unknown[];
    orders: unknown[];
    orderItems: unknown[];
    bills: unknown[];
    billItems: unknown[];
    outbox: unknown[];
    syncMeta: unknown[];
    auditEvents: unknown[];
  };
}

/** Local data export (Req 15.9). Reads every store in one snapshot transaction. */
export async function exportAll(
  db: AwaazDb,
  now: () => Date = () => new Date(),
): Promise<ExportBlob> {
  return db.transaction(
    'r',
    [
      db.shops,
      db.products,
      db.customers,
      db.orders,
      db.orderItems,
      db.bills,
      db.billItems,
      db.outbox,
      db.syncMeta,
      db.auditEvents,
    ],
    async () => ({
      format: 'awaaz-kit-export' as const,
      version: 1 as const,
      schemaVersion: DB_VERSION,
      exportedAt: now().toISOString(),
      stores: {
        shops: await db.shops.toArray(),
        products: await db.products.toArray(),
        customers: await db.customers.toArray(),
        orders: await db.orders.toArray(),
        orderItems: await db.orderItems.toArray(),
        bills: await db.bills.toArray(),
        billItems: await db.billItems.toArray(),
        outbox: await db.outbox.toArray(),
        syncMeta: (await db.syncMeta.toArray()).filter((r) => !SECRET_META_PATTERN.test(r.key)),
        auditEvents: await db.auditEvents.toArray(),
      },
    }),
  );
}

/** Local data clear (Req 15.9). Callers must confirm with the user first. Empties every store in one transaction. */
export async function clearAll(db: AwaazDb): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.shops,
      db.products,
      db.customers,
      db.orders,
      db.orderItems,
      db.bills,
      db.billItems,
      db.outbox,
      db.syncMeta,
      db.auditEvents,
    ],
    async () => {
      await db.purgeAllTables();
    },
  );
}

/**
 * Creates a local shop with currency INR, no sign-in required (Req 3.5, 3.6).
 * Sets it as the active shop. The shop stays `local_only` until the user opts in to sync (Req 3.7).
 */
export async function createLocalShop(
  db: AwaazDb,
  deps: RepoDeps,
  input: { name: string; locale?: ShopRecord['locale'] },
): Promise<ShopRecord> {
  const ts = deps.now().toISOString();
  const shop = ShopRecordSchema.parse({
    id: deps.newId(),
    name: input.name.trim(),
    currency: 'INR',
    locale: input.locale ?? 'en-IN',
    isDemo: false,
    nextOrderSeq: 1,
    nextReceiptSeq: 1,
    remoteShopId: null,
    createdAt: ts,
    updatedAt: ts,
    syncVersion: 0,
  });
  await db.transaction('rw', db.shops, db.syncMeta, async () => {
    await db.shops.put(shop);
    await db.syncMeta.put({ key: META_KEYS.activeShopId, value: shop.id });
  });
  return shop;
}

export interface SettingsRepo {
  /** Returns the stored device id, creating a UUID on first call. */
  getOrCreateDeviceId(): Promise<string>;
  getActiveShopId(): Promise<string | undefined>;
  setActiveShopId(shopId: string): Promise<void>;
  /** Cloud sync is off until the user opts in (Req 16.1). */
  getSyncOptIn(): Promise<Toggle>;
  setSyncOptIn(enabled: boolean): Promise<Toggle>;
  /** Defaults to disabled (Req 16.20). */
  getSyncTranscripts(): Promise<Toggle>;
  setSyncTranscripts(enabled: boolean): Promise<Toggle>;
  getPersistentStorage(): Promise<PersistentStorageStatus | undefined>;
  setPersistentStorage(status: PersistentStorageStatus): Promise<void>;
}

export function createSettingsRepo(db: AwaazDb, deps: RepoDeps): SettingsRepo {
  const read = async <T>(key: string) => (await db.syncMeta.get(key))?.value as T | undefined;
  const write = (key: string, value: unknown) => db.syncMeta.put({ key, value });
  const toggle = async (key: string): Promise<Toggle> =>
    (await read<Toggle>(key)) ?? { enabled: false, at: new Date(0).toISOString() };
  const setToggle = async (key: string, enabled: boolean): Promise<Toggle> => {
    const value: Toggle = { enabled, at: deps.now().toISOString() };
    await write(key, value);
    return value;
  };

  return {
    async getOrCreateDeviceId() {
      return db.transaction('rw', db.syncMeta, async () => {
        const existing = await read<string>(META_KEYS.deviceId);
        if (existing) return existing;
        const created = deps.newId();
        await write(META_KEYS.deviceId, created);
        return created;
      });
    },
    getActiveShopId: () => read<string>(META_KEYS.activeShopId),
    async setActiveShopId(shopId) {
      await write(META_KEYS.activeShopId, shopId);
    },
    getSyncOptIn: () => toggle(META_KEYS.syncOptIn),
    setSyncOptIn: (enabled) => setToggle(META_KEYS.syncOptIn, enabled),
    getSyncTranscripts: () => toggle(META_KEYS.syncTranscripts),
    setSyncTranscripts: (enabled) => setToggle(META_KEYS.syncTranscripts, enabled),
    getPersistentStorage: () => read<PersistentStorageStatus>(META_KEYS.persistentStorage),
    async setPersistentStorage(status) {
      await write(META_KEYS.persistentStorage, status);
    },
  };
}

/**
 * Requests persistent storage where supported and records the result (Req 2.3).
 * A `denied` result drives the "storage can be cleared" message (Req 2.4).
 */
export async function requestPersistentStorage(
  settings: Pick<SettingsRepo, 'setPersistentStorage'>,
  /** Pass `null` to simulate an unsupported browser. */
  storage: Pick<StorageManager, 'persist' | 'persisted'> | null | undefined = typeof navigator !==
  'undefined'
    ? navigator.storage
    : null,
): Promise<PersistentStorageStatus> {
  let status: PersistentStorageStatus = 'unsupported';
  if (storage && typeof storage.persist === 'function') {
    try {
      const already = typeof storage.persisted === 'function' ? await storage.persisted() : false;
      status = already || (await storage.persist()) ? 'granted' : 'denied';
    } catch {
      status = 'denied';
    }
  }
  await settings.setPersistentStorage(status);
  return status;
}
