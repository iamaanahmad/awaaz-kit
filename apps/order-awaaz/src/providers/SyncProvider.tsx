import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  META_KEYS,
  createSettingsRepo,
  createSyncStore,
  type AwaazDb,
  type Repositories,
  type Toggle,
} from '@awaaz-kit/local-data';
import {
  AppwriteRemote,
  createSyncEngine,
  type SyncEngine,
  type SyncReport,
  type SyncStatus,
} from '@awaaz-kit/sync-engine';
import {
  describeReport,
  readSyncConfig,
  toBadgeState,
  useOnlineStatus,
  type SyncBadgeState,
} from '@awaaz-kit/shared-ui';

export interface SyncContextValue {
  /** False when VITE_APPWRITE_* is unset: the app is local-only. */
  configured: boolean;
  optedIn: boolean;
  syncTranscripts: boolean;
  signedIn: boolean;
  accountEmail: string | undefined;
  signInError: string | undefined;
  signingIn: boolean;
  status: SyncStatus | null;
  badge: SyncBadgeState;
  reportText: string | null;
  setOptIn: (enabled: boolean) => Promise<void>;
  setSyncTranscripts: (enabled: boolean) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const repoDeps = { now: () => new Date(), newId: () => crypto.randomUUID() };

/**
 * Wires the shared local-data sync store into `createSyncEngine` with `AppwriteRemote`.
 * Without public Appwrite settings no engine is created and nothing leaves the device.
 */
export function SyncProvider({
  db,
  repos,
  children,
}: {
  db: AwaazDb;
  repos: Repositories;
  children: ReactNode;
}): ReactElement {
  const online = useOnlineStatus();
  const config = useMemo(() => readSyncConfig(import.meta.env), []);
  const settings = useMemo(() => createSettingsRepo(db, repoDeps), [db]);
  const remote = useMemo(() => (config ? new AppwriteRemote(config) : null), [config]);
  const engineRef = useRef<SyncEngine | null>(null);

  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const [transcripts, setTranscripts] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | undefined>(undefined);
  const [signInError, setSignInError] = useState<string | undefined>(undefined);
  const [signingIn, setSigningIn] = useState(false);

  // Engine lifecycle.
  useEffect(() => {
    if (!remote) return;
    const engine = createSyncEngine({
      store: createSyncStore(db),
      remote,
      clock: { now: () => new Date() },
      random: Math.random,
      env: {
        isOnline: () => navigator.onLine,
        onlineEvents: {
          subscribe(listener) {
            window.addEventListener('online', listener);
            return () => window.removeEventListener('online', listener);
          },
        },
        visibility: {
          subscribe(listener) {
            const onChange = (): void => {
              if (document.visibilityState === 'visible') listener();
            };
            document.addEventListener('visibilitychange', onChange);
            return () => document.removeEventListener('visibilitychange', onChange);
          },
        },
        timers: {
          setInterval: (fn, ms) => window.setInterval(fn, ms),
          clearInterval: (handle) => window.clearInterval(handle as number),
        },
      },
    });
    engineRef.current = engine;
    const unsubscribe = engine.status.subscribe(setStatus);
    engine.start();
    return () => {
      engine.stop();
      unsubscribe();
      engineRef.current = null;
    };
  }, [db, remote]);

  // Settings and local writes: opt-in, transcripts, and post-commit notification.
  useEffect(() => {
    let lastPending = -1;
    const subs = [
      repos.meta
        .watch<Toggle>(META_KEYS.syncOptIn)
        .subscribe({ next: (v) => setOptedIn(v?.enabled === true) }),
      repos.meta
        .watch<Toggle>(META_KEYS.syncTranscripts)
        .subscribe({ next: (v) => setTranscripts(v?.enabled === true) }),
      repos.outbox.watchCountUnsynced().subscribe({
        next: (count) => {
          if (lastPending >= 0 && count > lastPending) engineRef.current?.notifyLocalWrite();
          lastPending = count;
        },
      }),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [repos]);

  // Session check once the user has opted in.
  useEffect(() => {
    if (!remote || !optedIn) {
      setSignedIn(false);
      return;
    }
    let cancelled = false;
    remote
      .signedIn()
      .then((s) => {
        if (!cancelled) setSignedIn(s !== null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [remote, optedIn]);

  const runSync = useCallback(async (): Promise<void> => {
    const engine = engineRef.current;
    if (engine) setReport(await engine.syncNow());
  }, []);

  const setOptIn = useCallback(
    async (enabled: boolean): Promise<void> => {
      await settings.setSyncOptIn(enabled);
      if (enabled) await runSync();
    },
    [settings, runSync],
  );

  const setSyncTranscripts = useCallback(
    async (enabled: boolean): Promise<void> => {
      await settings.setSyncTranscripts(enabled);
    },
    [settings],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      if (!remote) return;
      setSigningIn(true);
      setSignInError(undefined);
      try {
        await remote.signIn(email, password);
        setSignedIn(true);
        setAccountEmail(email);
        await runSync();
      } catch (err) {
        setSignInError(err instanceof Error ? err.message : 'Could not sign in.');
      } finally {
        setSigningIn(false);
      }
    },
    [remote, runSync],
  );

  const signOut = useCallback(async (): Promise<void> => {
    if (!remote) return;
    try {
      await remote.signOut();
    } finally {
      setSignedIn(false);
      setAccountEmail(undefined);
    }
  }, [remote]);

  const configured = remote !== null;
  const value = useMemo<SyncContextValue>(
    () => ({
      configured,
      optedIn,
      syncTranscripts: transcripts,
      signedIn,
      accountEmail,
      signInError,
      signingIn,
      status,
      badge: toBadgeState(status, {
        configured,
        online,
        optedIn,
        lastError: report?.error ?? null,
      }),
      reportText: describeReport(report),
      setOptIn,
      setSyncTranscripts,
      signIn,
      signOut,
      syncNow: runSync,
    }),
    [
      configured,
      optedIn,
      transcripts,
      signedIn,
      accountEmail,
      signInError,
      signingIn,
      status,
      online,
      report,
      setOptIn,
      setSyncTranscripts,
      signIn,
      signOut,
      runSync,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync used outside AppProviders');
  return value;
}
