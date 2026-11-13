import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createRepositories,
  createSettingsRepo,
  LocalDataError,
  openDb,
  requestPersistentStorage,
  type AwaazDb,
  type Repositories,
} from '@awaaz-kit/local-data';
import {
  createProvider,
  resolveProviderId,
  type SpeechToTextProvider,
} from '@awaaz-kit/speech-provider';

import { StorageBanner, type StorageIssue } from '@awaaz-kit/shared-ui';

import { SyncProvider } from './SyncProvider';

export interface AppServices {
  db: AwaazDb;
  repos: Repositories;
  speech: SpeechToTextProvider;
}

const ServicesContext = createContext<AppServices | null>(null);

function toIssue(err: unknown): StorageIssue {
  if (err instanceof LocalDataError) {
    if (err.kind === 'quota_exceeded') return { kind: 'quota-exceeded' };
    if (err.kind === 'blocked_upgrade') return { kind: 'reload-required' };
  }
  return { kind: 'open-error', detail: err instanceof Error ? err.message : undefined };
}

/** Provides db, repositories and the speech provider to all screens. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<AwaazDb | null>(null);
  const [issue, setIssue] = useState<StorageIssue | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let current: AwaazDb | null = null;
    openDb({ onVersionChange: () => setIssue({ kind: 'reload-required' }) })
      .then((opened) => {
        if (cancelled) {
          opened.close();
          return;
        }
        current = opened;
        setIssue(null);
        setDb(opened);
        const settings = createSettingsRepo(opened, {
          now: () => new Date(),
          newId: () => crypto.randomUUID(),
        });
        requestPersistentStorage(settings)
          .then((status) => {
            if (!cancelled && status === 'denied') {
              setIssue((prev) => prev ?? { kind: 'persist-denied' });
            }
          })
          .catch(() => undefined);
      })
      .catch((e: unknown) => {
        if (!cancelled) setIssue(toIssue(e));
      });
    return () => {
      cancelled = true;
      current?.close();
    };
  }, [attempt]);

  const services = useMemo<AppServices | null>(() => {
    if (!db) return null;
    const repos = createRepositories(db, {
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
    });
    const speech = createProvider(
      resolveProviderId(import.meta.env.VITE_SPEECH_PROVIDER as string | undefined),
    );
    return { db, repos, speech };
  }, [db]);

  return (
    <>
      <StorageBanner
        issue={issue}
        onRetry={() => setAttempt((n) => n + 1)}
        onReload={() => window.location.reload()}
      />
      {services ? (
        <ServicesContext.Provider value={services}>
          <SyncProvider db={services.db} repos={services.repos}>
            {children}
          </SyncProvider>
        </ServicesContext.Provider>
      ) : issue ? null : (
        <p role="status">Loading...</p>
      )}
    </>
  );
}

export function useServices(): AppServices {
  const value = useContext(ServicesContext);
  if (!value) throw new Error('useServices must be used inside AppProviders');
  return value;
}
