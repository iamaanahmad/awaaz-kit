import { confirm, createUserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import Dexie from 'dexie';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commitConfirmed,
  createLocalShop,
  createSettingsRepo,
  openDb,
  resetDemoShop,
  DEMO_SEED,
  DEMO_SHOP_ID,
  type OrderBundle,
} from './index.js';
import { AwaazDb, DB_V1_STORES } from './schema.js';

// Requirements 15.4, 3.7, 3.8
const T = '2025-01-01T00:00:00.000Z';

const product = (id: string, shopId: string) => ({
  id,
  shopId,
  name: id,
  aliases: [],
  unit: 'kg' as const,
  pricePaise: 100,
  active: true,
  updatedAt: T,
  deletedAt: null,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('schema migration', () => {
  it('opens a plain v1 fixture database with the AwaazDb schema and keeps its rows', async () => {
    const factory = new IDBFactory();
    // Fixture written by a bare Dexie instance using only the frozen v1 store definitions.
    const fixture = new Dexie('mig-v1', { indexedDB: factory });
    fixture.version(1).stores(DB_V1_STORES);
    await fixture.table('products').put(product('p1', 's1'));
    fixture.close();

    const db = await openDb({ name: 'mig-v1', indexedDB: factory });
    expect(db.verno).toBe(1);
    expect(await db.products.get('p1')).toMatchObject({ id: 'p1', pricePaise: 100 });
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(DB_V1_STORES).sort());
    db.close();
  });

  it('runs an upgrade when a simulated future version is opened, preserving data', async () => {
    const factory = new IDBFactory();
    const v1 = await openDb({ name: 'mig-up', indexedDB: factory });
    await v1.products.put(product('p1', 's1'));
    await v1.orders.put({
      id: 'o1',
      syncState: 'local_only',
    } as never);
    v1.close();

    const upgraded: string[] = [];
    const v2 = new AwaazDb('mig-up', { indexedDB: factory });
    v2.version(2)
      .stores({ notes: 'id' })
      .upgrade(async (tx) => {
        upgraded.push('ran');
        await tx
          .table('products')
          .toCollection()
          .modify((p: { pricePaise: number }) => {
            p.pricePaise += 1;
          });
      });
    await v2.open();

    expect(upgraded).toEqual(['ran']);
    expect(v2.verno).toBe(2);
    expect((await v2.products.get('p1'))?.pricePaise).toBe(101);
    expect((await v2.orders.get('o1'))?.syncState).toBe('local_only');
    expect(v2.tables.map((t) => t.name)).toContain('notes');
    v2.close();
  });

  it('closes on versionchange so a future-version upgrade is not blocked', async () => {
    const factory = new IDBFactory();
    let notified = 0;
    const v1 = await openDb({
      name: 'mig-vc',
      indexedDB: factory,
      onVersionChange: () => {
        notified++;
      },
    });
    await v1.products.put(product('p1', 's1'));

    const v2 = new AwaazDb('mig-vc', { indexedDB: factory });
    v2.version(2).stores({ notes: 'id' });
    await v2.open(); // would reject with blocked/hang if v1 kept its connection

    expect(notified).toBe(1);
    expect(v1.isOpen()).toBe(false);
    expect(v2.verno).toBe(2);
    expect(await v2.products.count()).toBe(1);
    v2.close();
  });
});

describe('local-only behaviour before sign-in', () => {
  it('creates shop and committed records as local_only with no network calls', async () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const wsSpy = vi.fn();
    const beaconSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('XMLHttpRequest', xhrSpy);
    vi.stubGlobal('WebSocket', wsSpy);
    vi.stubGlobal('EventSource', wsSpy);
    if (typeof navigator !== 'undefined') {
      vi.stubGlobal('navigator', { ...navigator, sendBeacon: beaconSpy });
    }

    let n = 0;
    const db = await openDb({ name: 'local-only', indexedDB: new IDBFactory() });
    const deps = { now: () => new Date(T), newId: () => `id-${++n}` };
    const shop = await createLocalShop(db, deps, { name: 'My Shop' });
    expect(shop.remoteShopId).toBeNull();

    const bundle: OrderBundle = {
      kind: 'order',
      order: {
        id: 'o1',
        shopId: shop.id,
        customerId: null,
        walkIn: true,
        status: 'confirmed',
        fulfillment: 'pickup',
        note: null,
        totalEstimatePaise: 500,
        rawTranscript: '',
        normalizedText: '',
        extraction: null,
        mutationId: 'm-o1',
        createdAt: T,
      },
      items: [
        {
          id: 'o1-i1',
          orderId: 'o1',
          index: 0,
          productId: 'p1',
          nameSnapshot: 'Atta',
          qtyMilli: 1000,
          unit: 'kg' as const,
          unitPricePaise: 500,
          lineTotalPaise: 500,
          resolutionStatus: 'confirmed',
        },
      ],
      auditEvent: {
        id: 'a1',
        entityType: 'order',
        entityId: 'o1',
        action: 'confirm',
        actor: 'local_user',
        createdAt: T,
        metadata: {},
      },
    };
    const adapter = {
      id: 'order' as const,
      parse: () => bundle,
      validate: () => [],
      canConfirm: () => true,
      toBundle: () => bundle,
    };
    const evidence = createUserConfirmationEvidence(
      { isTrusted: true, type: 'click' },
      1,
      () => new Date(T),
    );
    const action = confirm(adapter as never, bundle, evidence) as never as Parameters<
      typeof commitConfirmed
    >[1];
    await commitConfirmed(db, action);

    expect((await db.orders.get('o1'))?.syncState).toBe('local_only');
    // Opt-in is off and the mutation waits in the outbox rather than being sent.
    expect((await createSettingsRepo(db, deps).getSyncOptIn()).enabled).toBe(false);
    expect((await db.outbox.toArray()).map((m) => m.state)).toEqual(['pending']);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(wsSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
    db.close();
  });

  it('two connections (both apps) on the same database read the same catalog', async () => {
    const factory = new IDBFactory();
    const orderApp = await openDb({ name: 'awaaz-kit', indexedDB: factory });
    await resetDemoShop(orderApp);
    const billApp = await openDb({ name: 'awaaz-kit', indexedDB: factory });

    const a = await orderApp.products.where('shopId').equals(DEMO_SHOP_ID).primaryKeys();
    const b = await billApp.products.where('shopId').equals(DEMO_SHOP_ID).primaryKeys();
    expect(a.length).toBe(DEMO_SEED.products.length);
    expect(b.sort()).toEqual(a.sort());
    orderApp.close();
    billApp.close();
  });
});
