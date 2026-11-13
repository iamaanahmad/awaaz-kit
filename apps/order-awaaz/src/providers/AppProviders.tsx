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
  createRepositories,
  openDb,
  createSettingsRepo,
  requestPersistentStorage,
  LocalDataError,
  type AwaazDb,
  type Repositories,
} from '@awaaz-kit/local-data';
import type { OrderDraft } from '@awaaz-kit/domain-order';
import {
  createProvider,
  resolveProviderId,
  type SpeechToTextProvider,
} from '@awaaz-kit/speech-provider';
import {
  StorageBanner,
  useCaptureSession,
  type StorageIssue,
  type UseCaptureSession,
} from '@awaaz-kit/shared-ui';

import { SyncProvider } from './SyncProvider';

export interface DataContextValue {
  db: AwaazDb;
  repos: Repositories;
}

export type OrderParser = (transcript: string) => OrderDraft | null | Promise<OrderDraft | null>;

export interface CaptureContextValue extends UseCaptureSession<OrderDraft> {
  /** The Capture screen registers its parser (catalog + customer aware) here. */
  setParser: (parser: OrderParser | null) => void;
}

const DataContext = createContext<DataContextValue | null>(null);
const SpeechContext = createContext<SpeechToTextProvider | null>(null);
const CaptureContext = createContext<CaptureContextValue | null>(null);

function toIssue(err: unknown): StorageIssue {
  if (err instanceof LocalDataError) {
    if (err.kind === 'quota_exceeded') return { kind: 'quota-exceeded' };
    if (err.kind === 'blocked_upgrade') return { kind: 'reload-required' };
  }
  return { kind: 'open-error', detail: err instanceof Error ? err.message : undefined };
}

function CaptureProvider({ children }: { children: ReactNode }): ReactElement {
  const parserRef = useRef<OrderParser | null>(null);
  const capture = useCaptureSession<OrderDraft>({
    parse: (transcript) => (parserRef.current ? parserRef.current(transcript) : null),
  });
  const setParser = useCallback((parser: OrderParser | null) => {
    parserRef.current = parser;
  }, []);
  const value = useMemo(() => ({ ...capture, setParser }), [capture, setParser]);
  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

/** Providers: database, repositories, speech provider and capture session. */
export function AppProviders({ children }: { children: ReactNode }): ReactElement {
  const [data, setData] = useState<DataContextValue | null>(null);
  const [issue, setIssue] = useState<StorageIssue | null>(null);
  const [attempt, setAttempt] = useState(0);

  const speech = useMemo(
    () => createProvider(resolveProviderId(import.meta.env.VITE_SPEECH_PROVIDER)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let opened: AwaazDb | null = null;
    openDb({ onVersionChange: () => setIssue({ kind: 'reload-required' }) })
      .then((db) => {
        if (cancelled) {
          db.close();
          return;
        }
        opened = db;
        setIssue(null);
        setData({
          db,
          repos: createRepositories(db, {
            now: () => new Date(),
            newId: () => crypto.randomUUID(),
          }),
        });
        const settings = createSettingsRepo(db, {
          now: () => new Date(),
          newId: () => crypto.randomUUID(),
        });
        requestPersistentStorage(settings)
          .then((status) => {
            if (!cancelled && status === 'denied') {
              setIssue((current) => current ?? { kind: 'persist-denied' });
            }
          })
          .catch(() => undefined);
      })
      .catch((err: unknown) => {
        if (!cancelled) setIssue(toIssue(err));
      });
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [attempt]);

  return (
    <>
      <StorageBanner
        issue={issue}
        onRetry={() => setAttempt((n) => n + 1)}
        onReload={() => window.location.reload()}
      />
      {data ? (
        <DataContext.Provider value={data}>
          <SpeechContext.Provider value={speech}>
            <SyncProvider db={data.db} repos={data.repos}>
              <CaptureProvider>{children}</CaptureProvider>
            </SyncProvider>
          </SpeechContext.Provider>
        </DataContext.Provider>
      ) : issue ? null : (
        <p role="status" className="p-4">
          Opening local storage…
        </p>
      )}
    </>
  );
}

function need<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} used outside AppProviders`);
  return value;
}

export const useData = (): DataContextValue => need(useContext(DataContext), 'useData');
export const useSpeechProvider = (): SpeechToTextProvider =>
  need(useContext(SpeechContext), 'useSpeechProvider');
export const useOrderCapture = (): CaptureContextValue =>
  need(useContext(CaptureContext), 'useOrderCapture');
