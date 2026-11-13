import { AppwriteException } from 'appwrite';
import { describe, expect, it, vi } from 'vitest';
import { SyncError } from '../contracts';
import { buildPermissions } from '../remote-row';
import { AppwriteRemote, type AppwritePort } from './appwrite-remote';

const ex = (code: number) => new AppwriteException('boom', code, 'type', '');

function fakePort() {
  const port = {
    account: {
      get: vi.fn(async () => ({ $id: 'u1' })),
      create: vi.fn(async () => ({})),
      createEmailPasswordSession: vi.fn(async () => ({})),
      deleteSession: vi.fn(async () => ({})),
    },
    teams: {
      create: vi.fn(async (p: { teamId: string }) => ({ $id: p.teamId })),
      get: vi.fn(async (p: { teamId: string }) => ({ $id: p.teamId })),
    },
    tables: {
      getRow: vi.fn(async (): Promise<Record<string, unknown>> => {
        throw ex(404);
      }),
      createRow: vi.fn<(p: Record<string, unknown>) => Promise<unknown>>(async () => ({})),
      updateRow: vi.fn(async () => ({})),
      listRows: vi.fn<(p: Record<string, unknown>) => Promise<{ rows: Record<string, unknown>[] }>>(
        async () => ({ rows: [] }),
      ),
    },
  };
  return port;
}

const make = (port = fakePort()) => ({
  port,
  remote: new AppwriteRemote(
    { endpoint: 'https://example.test/v1', projectId: 'proj' },
    port as unknown as AppwritePort,
  ),
});

const perm = buildPermissions('orders', 'team1');

describe('AppwriteRemote', () => {
  it('createOnce passes SDK-format permissions and maps 409 to already_exists', async () => {
    const { port, remote } = make();
    expect(await remote.createOnce('orders', 'r1', { a: 1 }, perm)).toBe('created');
    const call = port.tables.createRow.mock.calls[0]![0] as {
      databaseId: string;
      tableId: string;
      permissions: string[];
    };
    expect(call.databaseId).toBe('awaaz');
    expect(call.tableId).toBe('orders');
    expect(call.permissions).toEqual([
      'read("team:team1")',
      'update("team:team1")',
      'delete("team:team1/owner")',
    ]);

    port.tables.createRow.mockRejectedValueOnce(ex(409));
    expect(await remote.createOnce('orders', 'r1', { a: 1 }, perm)).toBe('already_exists');
  });

  it('createOnce sends read-only permissions for bills', async () => {
    const { port, remote } = make();
    await remote.createOnce('bills', 'b1', {}, buildPermissions('bills', 'team1'));
    const call = port.tables.createRow.mock.calls[0]![0] as { permissions: string[] };
    expect(call.permissions).toEqual(['read("team:team1")']);
  });

  it('createOnce maps other failures to typed SyncErrors', async () => {
    const { port, remote } = make();
    port.tables.createRow.mockRejectedValueOnce(ex(401));
    await expect(remote.createOnce('orders', 'r', {}, perm)).rejects.toMatchObject({
      kind: 'auth',
    });
    port.tables.createRow.mockRejectedValueOnce(ex(403));
    await expect(remote.createOnce('orders', 'r', {}, perm)).rejects.toMatchObject({
      kind: 'permission',
    });
    port.tables.createRow.mockRejectedValueOnce(ex(503));
    await expect(remote.createOnce('orders', 'r', {}, perm)).rejects.toMatchObject({
      kind: 'server',
    });
    port.tables.createRow.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(remote.createOnce('orders', 'r', {}, perm)).rejects.toBeInstanceOf(SyncError);
    port.tables.createRow.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(remote.createOnce('orders', 'r', {}, perm)).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('upsertGuarded creates when missing, updates when newer, stale when older', async () => {
    const { port, remote } = make();
    const p = buildPermissions('products', 'team1');
    expect(await remote.upsertGuarded('products', 'p1', { clientUpdatedAt: '2025-01-02' }, p)).toBe(
      'written',
    );
    expect(port.tables.createRow).toHaveBeenCalledTimes(1);

    port.tables.getRow.mockResolvedValue({ clientUpdatedAt: '2025-01-02' });
    expect(await remote.upsertGuarded('products', 'p1', { clientUpdatedAt: '2025-01-03' }, p)).toBe(
      'written',
    );
    expect(port.tables.updateRow).toHaveBeenCalledTimes(1);

    expect(await remote.upsertGuarded('products', 'p1', { clientUpdatedAt: '2025-01-01' }, p)).toBe(
      'stale',
    );
    expect(port.tables.updateRow).toHaveBeenCalledTimes(1);
  });

  it('upsertGuarded retries as an update when create races with a 409', async () => {
    const { port, remote } = make();
    port.tables.getRow
      .mockRejectedValueOnce(ex(404))
      .mockResolvedValueOnce({ clientUpdatedAt: '2025-01-01' });
    port.tables.createRow.mockRejectedValueOnce(ex(409));
    const p = buildPermissions('products', 'team1');
    expect(await remote.upsertGuarded('products', 'p1', { clientUpdatedAt: '2025-01-02' }, p)).toBe(
      'written',
    );
    expect(port.tables.updateRow).toHaveBeenCalledTimes(1);
  });

  it('pull builds a shop-scoped ordered cursor query and returns the next cursor', async () => {
    const { port, remote } = make();
    port.tables.listRows.mockResolvedValueOnce({
      rows: [
        { $id: 'a', $updatedAt: '2025-01-01T00:00:00.000Z' },
        { $id: 'b', $updatedAt: '2025-01-02T00:00:00.000Z' },
      ],
    });
    const out = await remote.pull(
      'products',
      'team1',
      { updatedAt: '2025-01-01T00:00:00.000Z', rowId: 'a0' },
      50,
    );
    expect(out.next).toEqual({ updatedAt: '2025-01-02T00:00:00.000Z', rowId: 'b' });
    const q = (port.tables.listRows.mock.calls[0]![0] as { queries: string[] }).queries;
    const joined = q.join('|');
    expect(joined).toContain('"shopId"');
    expect(joined).toContain('team1');
    expect(joined).toContain('orderAsc');
    expect(joined).toContain('cursorAfter');
    expect(joined).toContain('limit');
  });

  it('pull on an empty page returns a null cursor', async () => {
    const { remote } = make();
    expect(await remote.pull('bills', 'team1', null, 10)).toEqual({ rows: [], next: null });
  });

  it('signedIn returns null on 401 and the user otherwise', async () => {
    const { port, remote } = make();
    expect(await remote.signedIn()).toEqual({ userId: 'u1' });
    port.account.get.mockRejectedValueOnce(ex(401));
    expect(await remote.signedIn()).toBeNull();
  });

  it('ensureShopTeam creates a team with the shop id, and reuses it on 409', async () => {
    const { port, remote } = make();
    expect(await remote.ensureShopTeam({ shopId: 'shop-1', name: 'Sharma Store' })).toEqual({
      remoteShopId: 'shop-1',
    });
    port.teams.create.mockRejectedValueOnce(ex(409));
    expect(await remote.ensureShopTeam({ shopId: 'shop-1', name: 'Sharma Store' })).toEqual({
      remoteShopId: 'shop-1',
    });
    expect(port.teams.get).toHaveBeenCalledWith({ teamId: 'shop-1' });
  });

  it('ensureShopTeam requires a session', async () => {
    const { port, remote } = make();
    port.account.get.mockRejectedValueOnce(ex(401));
    await expect(remote.ensureShopTeam({ shopId: 's', name: 'n' })).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('signIn creates an email/password session; signOut ignores an already-ended session', async () => {
    const { port, remote } = make();
    expect(await remote.signIn('a@b.co', 'pw123456')).toEqual({ userId: 'u1' });
    expect(port.account.createEmailPasswordSession).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'pw123456',
    });
    port.account.deleteSession.mockRejectedValueOnce(ex(401));
    await expect(remote.signOut()).resolves.toBeUndefined();
  });
});
