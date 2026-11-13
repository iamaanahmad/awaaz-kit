/**
 * Shared `SyncRemote` contract test suite (Req 16.4, 19.11).
 *
 * Call `runRemoteContract(target)` from a `*.test.ts` file for each implementation:
 * `InMemoryRemote`, `AppwriteRemote` over a mocked SDK port, and `AppwriteRemote`
 * against a real test project (skipped with a visible reason when not configured).
 *
 * The suite asserts only behaviour every implementation must share: create-once
 * idempotency, unique `mutationId`, guarded upsert, shop-scoped ordered pagination
 * and the signed-out error. Permission matrices are covered by the Appwrite isolation
 * test, not here. This file is test support and is not exported from the package index.
 */
import { describe, expect, it } from 'vitest';
import type { RemoteRow, RemoteTable, SyncRemote } from '../contracts';
import {
  buildPermissions,
  toRemoteRow,
  type MutationLike,
  type RemoteProduct,
} from '../remote-row';
import { uuidV5 } from '../row-ids';

export interface RemoteContractHarness {
  readonly remote: SyncRemote;
  /** Signs out so the next write must fail with an `auth` error. Omit to skip that test. */
  readonly signOut?: () => Promise<void>;
  /** Releases resources after one test. */
  readonly cleanup?: () => Promise<void> | void;
}

export interface RemoteContractTarget {
  readonly name: string;
  /** Creates a fresh, signed-in remote. Called once per test. */
  readonly setup: () => Promise<RemoteContractHarness>;
  /** When set, the whole suite is registered as skipped with this visible reason. */
  readonly skipReason?: string;
}

const runId = globalThis.crypto.randomUUID();
let counter = 0;
/** Unique, Appwrite-valid (UUID) ids so reruns against a real backend never collide. */
const newId = (label: string): string => uuidV5(`${runId}:${label}:${counter++}`);

const FIRST_TIME = Date.UTC(2025, 0, 1);
const iso = (offsetMs: number): string => new Date(FIRST_TIME + offsetMs).toISOString();

function productData(shopId: string, name: string, clientUpdatedAt: string): RemoteProduct {
  return {
    shopId,
    name,
    aliases: [name.toLowerCase()],
    unit: 'kg',
    pricePaise: 4500,
    active: true,
    deletedAt: null,
    deviceId: 'contract-device',
    clientUpdatedAt,
  };
}

/** A realistic order header produced by the real mapper, so the data matches the schema. */
function orderHeader(remoteShopId: string, mutationId: string) {
  const mutation: MutationLike = {
    mutationId,
    payload: {
      kind: 'order',
      items: [],
      order: {
        id: newId('order'),
        localNumber: 'O-1',
        customerId: null,
        walkIn: true,
        status: 'confirmed',
        fulfillment: 'pickup',
        note: null,
        totalEstimatePaise: 0,
        rawTranscript: '',
        normalizedText: '',
        createdAt: iso(0),
      },
    },
  };
  const write = toRemoteRow(mutation, { remoteShopId, deviceId: 'contract-device' }).find(
    (w) => w.table === 'orders',
  );
  if (!write) throw new Error('order header write missing');
  return write;
}

async function pullAll(
  remote: SyncRemote,
  table: RemoteTable,
  shopId: string,
  pageSize: number,
): Promise<RemoteRow[]> {
  const all: RemoteRow[] = [];
  let cursor: Awaited<ReturnType<SyncRemote['pull']>>['next'] = null;
  for (let page = 0; page < 50; page += 1) {
    const result = await remote.pull(table, shopId, cursor, pageSize);
    if (result.rows.length === 0) {
      expect(result.next).toBeNull();
      return all;
    }
    expect(result.rows.length).toBeLessThanOrEqual(pageSize);
    all.push(...result.rows);
    expect(result.next).not.toBeNull();
    cursor = result.next;
  }
  throw new Error('pull did not terminate');
}

export function runRemoteContract(target: RemoteContractTarget): void {
  const suite = target.skipReason === undefined ? describe : describe.skip;
  const title =
    target.skipReason === undefined
      ? `SyncRemote contract: ${target.name}`
      : `SyncRemote contract: ${target.name} [SKIPPED: ${target.skipReason}]`;

  suite(title, () => {
    /** Runs one test with a fresh harness, a registered shop team and guaranteed cleanup. */
    const withRemote = (
      fn: (ctx: { harness: RemoteContractHarness; remote: SyncRemote; shop: string }) => Promise<void>,
    ) => async () => {
      const harness = await target.setup();
      try {
        const { remoteShopId } = await harness.remote.ensureShopTeam({
          shopId: newId('shop'),
          name: 'Contract Shop',
        });
        await fn({ harness, remote: harness.remote, shop: remoteShopId });
      } finally {
        await harness.cleanup?.();
      }
    };

    it(
      'reports the signed-in user',
      withRemote(async ({ remote }) => {
        const session = await remote.signedIn();
        expect(session).not.toBeNull();
        expect(session?.userId).toEqual(expect.any(String));
      }),
    );

    it(
      'ensureShopTeam is idempotent for the same shop',
      withRemote(async ({ remote }) => {
        const local = { shopId: newId('shop'), name: 'Same Shop' };
        const first = await remote.ensureShopTeam(local);
        const second = await remote.ensureShopTeam(local);
        expect(second.remoteShopId).toBe(first.remoteShopId);
      }),
    );

    it(
      'createOnce returns created, then already_exists, and keeps a single row',
      withRemote(async ({ remote, shop }) => {
        const header = orderHeader(shop, newId('mutation'));
        expect(await remote.createOnce('orders', header.rowId, header.data, header.permissions)).toBe(
          'created',
        );
        expect(await remote.createOnce('orders', header.rowId, header.data, header.permissions)).toBe(
          'already_exists',
        );
        const rows = await pullAll(remote, 'orders', shop, 10);
        expect(rows.map((r) => r.$id)).toEqual([header.rowId]);
      }),
    );

    it(
      'createOnce treats a second row with the same mutationId as already_exists',
      withRemote(async ({ remote, shop }) => {
        const header = orderHeader(shop, newId('mutation'));
        await remote.createOnce('orders', header.rowId, header.data, header.permissions);
        const otherRowId = newId('other-row');
        expect(await remote.createOnce('orders', otherRowId, header.data, header.permissions)).toBe(
          'already_exists',
        );
        const rows = await pullAll(remote, 'orders', shop, 10);
        expect(rows).toHaveLength(1);
      }),
    );

    it(
      'upsertGuarded writes new, writes newer, and reports stale for older data',
      withRemote(async ({ remote, shop }) => {
        const rowId = newId('product');
        const perm = buildPermissions('products', shop);
        const at = (n: number) => iso(n * 1000);

        expect(
          await remote.upsertGuarded('products', rowId, productData(shop, 'Rice', at(2)), perm),
        ).toBe('written');
        expect(
          await remote.upsertGuarded('products', rowId, productData(shop, 'Rice B', at(3)), perm),
        ).toBe('written');
        expect(
          await remote.upsertGuarded('products', rowId, productData(shop, 'Rice A', at(1)), perm),
        ).toBe('stale');

        const rows = await pullAll(remote, 'products', shop, 10);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.['name']).toBe('Rice B');
        expect(rows[0]?.['clientUpdatedAt']).toBe(at(3));
      }),
    );

    it(
      'pull is scoped to the requested shop',
      withRemote(async ({ remote, shop }) => {
        const perm = buildPermissions('products', shop);
        const mine = newId('mine');
        const foreign = newId('foreign');
        await remote.upsertGuarded('products', mine, productData(shop, 'Mine', iso(1000)), perm);
        await remote.upsertGuarded(
          'products',
          foreign,
          productData(newId('other-shop'), 'Foreign', iso(1000)),
          perm,
        );
        const rows = await pullAll(remote, 'products', shop, 10);
        expect(rows.map((r) => r.$id)).toEqual([mine]);
      }),
    );

    it(
      'pull pages in $updatedAt order with a cursor, returning every row exactly once',
      withRemote(async ({ remote, shop }) => {
        const perm = buildPermissions('products', shop);
        const ids: string[] = [];
        for (let i = 0; i < 5; i += 1) {
          const id = newId('page');
          ids.push(id);
          await remote.upsertGuarded('products', id, productData(shop, `Item ${i}`, iso(i)), perm);
        }
        const rows = await pullAll(remote, 'products', shop, 2);
        expect(rows.map((r) => r.$id).sort()).toEqual([...ids].sort());
        expect(new Set(rows.map((r) => r.$id)).size).toBe(ids.length);
        const stamps = rows.map((r) => r.$updatedAt);
        expect(stamps).toEqual([...stamps].sort());
      }),
    );

    it(
      'pull on an empty table returns no rows and a null cursor',
      withRemote(async ({ remote, shop }) => {
        const result = await remote.pull('customers', shop, null, 10);
        expect(result.rows).toEqual([]);
        expect(result.next).toBeNull();
      }),
    );

    it(
      'rejects writes with an auth error after sign-out',
      withRemote(async ({ harness, remote, shop }) => {
        if (!harness.signOut) return;
        await harness.signOut();
        expect(await remote.signedIn()).toBeNull();
        const header = orderHeader(shop, newId('mutation'));
        await expect(
          remote.createOnce('orders', header.rowId, header.data, header.permissions),
        ).rejects.toMatchObject({ kind: 'auth' });
      }),
    );
  });
}
