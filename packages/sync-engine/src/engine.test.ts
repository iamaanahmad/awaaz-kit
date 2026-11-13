import { describe, expect, it } from 'vitest';
import { SyncError } from './contracts';
import {
  createSyncEngine,
  type EventSource,
  type SyncEngineStore,
  type SyncSettings,
  type Timers,
} from './engine';
import { InMemoryRemote } from './in-memory-remote';
import type { PushMutation } from './push';
import type { MutationPayloadLike } from './remote-row';

interface M extends PushMutation {
  payload: MutationPayloadLike;
  state: 'pending' | 'synced';
}

const T0 = new Date('2026-01-01T00:00:00.000Z');

const product = (id: string): MutationPayloadLike => ({
  kind: 'product',
  product: {
    id,
    shopId: 'local-shop',
    name: id,
    aliases: [],
    unit: 'kg',
    pricePaise: 100,
    active: true,
    updatedAt: T0.toISOString(),
    deletedAt: null,
  },
});

function emitter(): EventSource & { fire(): void } {
  const ls = new Set<() => void>();
  return {
    subscribe(l) {
      ls.add(l);
      return () => ls.delete(l);
    },
    fire: () => ls.forEach((l) => l()),
  };
}

function setup(
  opts: { optedIn?: boolean; online?: boolean; userId?: string | null; count?: number } = {},
) {
  const mutations: M[] = Array.from({ length: opts.count ?? 2 }, (_, i) => ({
    mutationId: `m${i}`,
    payload: product(`p${i}`),
    attempts: 0,
    state: 'pending',
  }));
  const state = { online: opts.online ?? true, settings: { optedIn: opts.optedIn ?? true } };
  const remote = new InMemoryRemote({ userId: opts.userId === undefined ? 'user-1' : opts.userId });
  let lastSynced: string | null = null;
  const store: SyncEngineStore<M> = {
    async getSettings(): Promise<SyncSettings> {
      return {
        optedIn: state.settings.optedIn,
        shop: { id: 'local-shop', name: 'Shop' },
        deviceId: 'dev-1',
      };
    },
    push: {
      async listDue(_now, limit) {
        return mutations.filter((m) => m.state === 'pending').slice(0, limit);
      },
      async markSyncing() {},
      async markSynced(m) {
        mutations.find((x) => x.mutationId === m.mutationId)!.state = 'synced';
        lastSynced = T0.toISOString();
      },
      async markRetry() {},
      async markFailed() {},
    },
    pull: {
      async getCursor() {
        return null;
      },
      async lookup() {
        return undefined;
      },
      async applyPage() {},
    },
    countPending: async () => mutations.filter((m) => m.state === 'pending').length,
    countFailed: async () => 0,
    getLastSyncedAt: async () => lastSynced,
  };
  const onlineEvents = emitter();
  const visibility = emitter();
  const ticks: Array<() => void> = [];
  const cleared: unknown[] = [];
  const timers: Timers = {
    setInterval(fn) {
      ticks.push(fn);
      return ticks.length;
    },
    clearInterval: (h) => void cleared.push(h),
  };
  const registered: string[] = [];
  const engine = createSyncEngine<M>({
    store,
    remote,
    clock: { now: () => T0 },
    random: () => 0,
    env: {
      isOnline: () => state.online,
      onlineEvents,
      visibility,
      timers,
      backgroundSync: { register: async (t) => void registered.push(t) },
    },
  });
  return { engine, remote, state, mutations, onlineEvents, visibility, ticks, cleared, registered };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createSyncEngine', () => {
  it('sends nothing without opt-in', async () => {
    const t = setup({ optedIn: false });
    const r = await t.engine.syncNow();
    expect(r.skipped).toBe('not_opted_in');
    expect(t.remote.count('products')).toBe(0);
    expect(t.engine.status.getValue()).toMatchObject({ pending: 2, optedIn: false });
  });

  it('sends nothing while offline', async () => {
    const t = setup({ online: false });
    expect((await t.engine.syncNow()).skipped).toBe('offline');
    expect(t.remote.count('products')).toBe(0);
    expect(t.engine.status.getValue().online).toBe(false);
  });

  it('pauses in auth state when not signed in and keeps Mutations', async () => {
    const t = setup({ userId: null });
    expect((await t.engine.syncNow()).skipped).toBe('not_signed_in');
    expect(t.engine.status.getValue()).toMatchObject({
      authPaused: true,
      signedIn: false,
      pending: 2,
    });
    expect(t.remote.count('products')).toBe(0);
  });

  it('pushes when opted in, signed in and online, then updates status', async () => {
    const t = setup();
    const r = await t.engine.syncNow();
    expect(r.ran).toBe(true);
    expect(r.push?.synced).toBe(2);
    expect(t.remote.count('products')).toBe(2);
    expect(t.engine.status.getValue()).toMatchObject({
      pending: 0,
      signedIn: true,
      running: false,
      lastSyncedAt: T0.toISOString(),
    });
  });

  it('coalesces concurrent triggers into one run', async () => {
    const t = setup();
    const a = t.engine.syncNow();
    const b = t.engine.syncNow();
    expect(a).toBe(b);
    await a;
  });

  it('triggers on launch, online, visibility, interval and local write; stop unsubscribes', async () => {
    const t = setup({ count: 0 });
    let runs = 0;
    t.engine.status.subscribe((s) => {
      if (s.running) runs += 1;
    });
    t.engine.start();
    await flush();
    const afterLaunch = runs;
    expect(afterLaunch).toBe(1);
    expect(t.registered).toEqual(['awaaz-sync']);

    t.onlineEvents.fire();
    await flush();
    t.visibility.fire();
    await flush();
    t.ticks[0]!();
    await flush();
    t.engine.notifyLocalWrite();
    await flush();
    expect(runs).toBe(afterLaunch + 4);

    t.engine.stop();
    expect(t.cleared).toEqual([1]);
    t.visibility.fire();
    await flush();
    expect(runs).toBe(afterLaunch + 4);
  });

  it('pauses on auth errors during push', async () => {
    const t = setup();
    t.remote.failNext(new SyncError('auth', 'expired'));
    // signedIn() consumes the first injected failure.
    await t.engine.syncNow();
    expect(t.engine.status.getValue().authPaused).toBe(true);
    expect(t.engine.status.getValue().pending).toBe(2);
  });
});
