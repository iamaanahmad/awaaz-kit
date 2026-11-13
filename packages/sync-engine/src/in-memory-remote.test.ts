import { describe, expect, it } from 'vitest';
import { SyncError, type RowPermissions } from './contracts';
import { InMemoryRemote } from './in-memory-remote';

function clock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, n++)).toISOString();
}

const teamPerm = (team: string): RowPermissions => ({
  read: [`read(team:${team})`],
  update: [`update(team:${team})`],
  delete: [`delete(team:${team}/owner)`],
});
const readOnly = (team: string): RowPermissions => ({
  read: [`read(team:${team})`],
  update: [],
  delete: [],
});

describe('InMemoryRemote', () => {
  it('maps duplicate createOnce (same id or same mutationId) to already_exists', async () => {
    const r = new InMemoryRemote({ now: clock() });
    const { remoteShopId } = await r.ensureShopTeam({ shopId: 's1', name: 'Shop' });
    const data = { shopId: 's1', mutationId: 'm1' };
    expect(await r.createOnce('orders', 'm1', data, teamPerm(remoteShopId))).toBe('created');
    expect(await r.createOnce('orders', 'm1', data, teamPerm(remoteShopId))).toBe('already_exists');
    expect(await r.createOnce('orders', 'other', data, teamPerm(remoteShopId))).toBe(
      'already_exists',
    );
    expect(r.count('orders')).toBe(1);
  });

  it('upsertGuarded rejects older clientUpdatedAt as stale', async () => {
    const r = new InMemoryRemote({ now: clock() });
    const { remoteShopId } = await r.ensureShopTeam({ shopId: 's1', name: 'Shop' });
    const p = teamPerm(remoteShopId);
    const row = (t: string, name: string) => ({ shopId: 's1', clientUpdatedAt: t, name });
    expect(await r.upsertGuarded('products', 'p1', row('2026-01-02', 'new'), p)).toBe('written');
    expect(await r.upsertGuarded('products', 'p1', row('2026-01-01', 'old'), p)).toBe('stale');
    expect(r.peek('products', 'p1')?.['name']).toBe('new');
  });

  it('refuses updates on rows without update permission', async () => {
    const r = new InMemoryRemote({ now: clock() });
    const { remoteShopId } = await r.ensureShopTeam({ shopId: 's1', name: 'Shop' });
    const a = { shopId: 's1', clientUpdatedAt: 'a' };
    const b = { shopId: 's1', clientUpdatedAt: 'b' };
    await r.upsertGuarded('bills', 'b1', a, readOnly(remoteShopId));
    await expect(r.upsertGuarded('bills', 'b1', b, readOnly(remoteShopId))).rejects.toMatchObject({
      kind: 'permission',
    });
  });

  it('hides rows from non-members and requires sign-in', async () => {
    const r = new InMemoryRemote({ now: clock() });
    const { remoteShopId } = await r.ensureShopTeam({ shopId: 's1', name: 'Shop' });
    await r.createOnce('orders', 'm1', { shopId: 's1', mutationId: 'm1' }, teamPerm(remoteShopId));
    r.setUser('stranger');
    expect((await r.pull('orders', 's1', null, 10)).rows).toHaveLength(0);
    r.setUser(null);
    await expect(r.pull('orders', 's1', null, 10)).rejects.toBeInstanceOf(SyncError);
    expect(await r.signedIn()).toBeNull();
  });

  it('pulls in pages with a resumable cursor', async () => {
    const r = new InMemoryRemote({ now: clock() });
    const { remoteShopId } = await r.ensureShopTeam({ shopId: 's1', name: 'Shop' });
    for (const id of ['a', 'b', 'c']) {
      await r.createOnce('orders', id, { shopId: 's1', mutationId: id }, teamPerm(remoteShopId));
    }
    const first = await r.pull('orders', 's1', null, 2);
    expect(first.rows.map((x) => x.$id)).toEqual(['a', 'b']);
    const second = await r.pull('orders', 's1', first.next, 2);
    expect(second.rows.map((x) => x.$id)).toEqual(['c']);
    const third = await r.pull('orders', 's1', second.next, 2);
    expect(third.rows).toEqual([]);
  });
});
