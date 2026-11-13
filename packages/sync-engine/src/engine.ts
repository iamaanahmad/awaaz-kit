/**
 * `createSyncEngine`: wires gating, triggers, coalesced runs, status and
 * optional Background Sync around `push` and `pull`.
 *
 * Local data is reached through the structural `SyncEngineStore` port so this
 * package does not depend on local-data (Req 15.3 dependency rules).
 *
 * Gating (Req 16.1, 16.2, 18.3): nothing is sent unless the user opted in,
 * is signed in and the device is online. Otherwise Mutations stay in the Outbox.
 */
import { SyncError, type SyncRemote } from './contracts';
import { pull, type PullResult, type PullStore } from './pull';
import { push, type PushMutation, type PushResult, type PushStore } from './push';
import type { TranscriptSetting } from './remote-row';

export const SYNC_INTERVAL_MS = 30_000;
export const BACKGROUND_SYNC_TAG = 'awaaz-sync';

export interface Clock {
  now(): Date;
}

/** Minimal event source: `subscribe` returns an unsubscribe function. */
export interface EventSource {
  subscribe(listener: () => void): () => void;
}

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface BackgroundSyncRegistrar {
  register(tag: string): Promise<void>;
}

export interface SyncSettings {
  readonly optedIn: boolean;
  readonly syncTranscripts?: TranscriptSetting | undefined;
  readonly shop: { readonly id: string; readonly name: string } | null;
  readonly deviceId: string;
}

/** Local-data port the engine needs. */
export interface SyncEngineStore<M extends PushMutation = PushMutation> {
  getSettings(): Promise<SyncSettings>;
  readonly push: PushStore<M>;
  readonly pull: PullStore;
  countPending(): Promise<number>;
  countFailed(): Promise<number>;
  getLastSyncedAt(): Promise<string | null>;
  resolveBillRowId?: ((localBillId: string) => string | undefined) | undefined;
}

export interface SyncStatus {
  readonly online: boolean;
  readonly optedIn: boolean;
  readonly signedIn: boolean;
  readonly pending: number;
  readonly failed: number;
  readonly lastSyncedAt: string | null;
  readonly running: boolean;
  /** True when the session expired; Mutations stay in the Outbox ("Sign in to resume sync"). */
  readonly authPaused: boolean;
}

export type SyncSkipReason =
  'not_opted_in' | 'not_signed_in' | 'offline' | 'no_shop' | 'auth_paused';

export interface SyncReport {
  readonly ran: boolean;
  readonly skipped: SyncSkipReason | null;
  readonly push: PushResult | null;
  readonly pull: PullResult | null;
  readonly error: string | null;
}

export interface Observable<T> {
  getValue(): T;
  subscribe(listener: (value: T) => void): () => void;
}

export interface SyncEngine {
  start(): void;
  stop(): void;
  syncNow(): Promise<SyncReport>;
  /** Call after a local write commits; syncs when online (Req 16.7). */
  notifyLocalWrite(): void;
  readonly status: Observable<SyncStatus>;
}

export interface SyncEngineDeps<M extends PushMutation = PushMutation> {
  store: SyncEngineStore<M>;
  remote: SyncRemote;
  clock: Clock;
  random: () => number;
  env: {
    isOnline: () => boolean;
    onlineEvents: EventSource;
    visibility: EventSource;
    timers: Timers;
    backgroundSync?: BackgroundSyncRegistrar | undefined;
  };
  intervalMs?: number | undefined;
}

const INITIAL_STATUS: SyncStatus = {
  online: false,
  optedIn: false,
  signedIn: false,
  pending: 0,
  failed: 0,
  lastSyncedAt: null,
  running: false,
  authPaused: false,
};

function skipped(reason: SyncSkipReason): SyncReport {
  return { ran: false, skipped: reason, push: null, pull: null, error: null };
}

export function createSyncEngine<M extends PushMutation = PushMutation>(
  deps: SyncEngineDeps<M>,
): SyncEngine {
  const { store, remote, clock, random, env } = deps;
  const listeners = new Set<(s: SyncStatus) => void>();
  let current: SyncStatus = { ...INITIAL_STATUS, online: env.isOnline() };
  let inFlight: Promise<SyncReport> | null = null;
  let unsubscribers: Array<() => void> = [];
  let intervalHandle: unknown = null;
  let started = false;

  const setStatus = (patch: Partial<SyncStatus>): void => {
    const next = { ...current, ...patch };
    if ((Object.keys(next) as Array<keyof SyncStatus>).every((k) => next[k] === current[k])) return;
    current = next;
    for (const l of [...listeners]) l(current);
  };

  const status: Observable<SyncStatus> = {
    getValue: () => current,
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  async function refreshCounts(): Promise<void> {
    const [pending, failed, lastSyncedAt, settings] = await Promise.all([
      store.countPending(),
      store.countFailed(),
      store.getLastSyncedAt(),
      store.getSettings(),
    ]);
    setStatus({ pending, failed, lastSyncedAt, optedIn: settings.optedIn, online: env.isOnline() });
  }

  async function run(): Promise<SyncReport> {
    const settings = await store.getSettings();
    setStatus({ optedIn: settings.optedIn, online: env.isOnline() });

    if (!settings.optedIn) {
      await refreshCounts();
      return skipped('not_opted_in');
    }
    if (!env.isOnline()) {
      await refreshCounts();
      return skipped('offline');
    }

    let session: { userId: string } | null;
    try {
      session = await remote.signedIn();
    } catch (e) {
      await refreshCounts();
      const kind = e instanceof SyncError ? e.kind : 'network';
      if (kind === 'auth') {
        setStatus({ signedIn: false, authPaused: true });
        return skipped('auth_paused');
      }
      return {
        ran: false,
        skipped: null,
        push: null,
        pull: null,
        error: e instanceof Error ? e.message : 'error',
      };
    }
    if (!session) {
      setStatus({ signedIn: false, authPaused: true });
      await refreshCounts();
      return skipped('not_signed_in');
    }
    if (!settings.shop) {
      setStatus({ signedIn: true });
      await refreshCounts();
      return skipped('no_shop');
    }

    setStatus({ signedIn: true, authPaused: false, running: true });
    try {
      const { remoteShopId } = await remote.ensureShopTeam({
        shopId: settings.shop.id,
        name: settings.shop.name,
      });
      const pushResult = await push<M>({
        remote,
        store: store.push,
        settings: {
          remoteShopId,
          deviceId: settings.deviceId,
          syncTranscripts: settings.syncTranscripts,
        },
        resolveBillRowId: store.resolveBillRowId,
        now: () => clock.now(),
        random,
      });
      let pullResult: PullResult | null = null;
      if (pushResult.stoppedBy === null) {
        pullResult = await pull({
          remote,
          store: store.pull,
          remoteShopId,
          deviceId: settings.deviceId,
          now: () => clock.now(),
        });
      }
      const stoppedBy = pushResult.stoppedBy ?? pullResult?.stoppedBy ?? null;
      if (stoppedBy === 'auth') setStatus({ authPaused: true, signedIn: false });
      return {
        ran: true,
        skipped: null,
        push: pushResult,
        pull: pullResult,
        error: stoppedBy,
      };
    } catch (e) {
      const kind = e instanceof SyncError ? e.kind : 'server';
      if (kind === 'auth') setStatus({ authPaused: true, signedIn: false });
      return {
        ran: true,
        skipped: null,
        push: null,
        pull: null,
        error: e instanceof Error ? e.message : kind,
      };
    } finally {
      setStatus({ running: false });
      await refreshCounts().catch(() => undefined);
    }
  }

  /** Concurrent triggers coalesce into the single in-flight run. */
  function syncNow(): Promise<SyncReport> {
    if (inFlight) return inFlight;
    const p = run().finally(() => {
      inFlight = null;
    });
    inFlight = p;
    return p;
  }

  const trigger = (): void => {
    void syncNow().catch(() => undefined);
  };

  const registerBackground = (): void => {
    const bg = env.backgroundSync;
    if (!bg) return;
    // Additional trigger only; failure never affects correctness (Req 16.8).
    void bg.register(BACKGROUND_SYNC_TAG).catch(() => undefined);
  };

  return {
    status,
    syncNow,
    notifyLocalWrite() {
      if (!started) return;
      setStatus({ online: env.isOnline() });
      void refreshCounts().catch(() => undefined);
      if (env.isOnline()) trigger();
      else registerBackground();
    },
    start() {
      if (started) return;
      started = true;
      unsubscribers = [
        env.onlineEvents.subscribe(() => {
          setStatus({ online: env.isOnline() });
          if (env.isOnline()) trigger();
        }),
        env.visibility.subscribe(trigger),
      ];
      intervalHandle = env.timers.setInterval(trigger, deps.intervalMs ?? SYNC_INTERVAL_MS);
      registerBackground();
      trigger(); // app launch
    },
    stop() {
      if (!started) return;
      started = false;
      for (const u of unsubscribers) u();
      unsubscribers = [];
      if (intervalHandle !== null) env.timers.clearInterval(intervalHandle);
      intervalHandle = null;
    },
  };
}
