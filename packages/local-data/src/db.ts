import { AwaazDb, DB_NAME } from './schema.js';

export type LocalDataErrorKind = 'quota_exceeded' | 'open_failed' | 'blocked_upgrade';

/** Typed storage error the UI maps to a banner (Req 2.5). */
export class LocalDataError extends Error {
  readonly kind: LocalDataErrorKind;
  override readonly cause?: unknown;

  constructor(kind: LocalDataErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'LocalDataError';
    this.kind = kind;
    this.cause = cause;
  }
}

function errorNames(err: unknown): string[] {
  const names: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const e = cur as { name?: unknown; inner?: unknown; cause?: unknown };
    if (typeof e.name === 'string') names.push(e.name);
    cur = e.inner ?? e.cause;
  }
  return names;
}

/** Maps any thrown storage error to a `LocalDataError`. */
export function mapDbError(err: unknown): LocalDataError {
  if (err instanceof LocalDataError) return err;
  const names = errorNames(err);
  if (names.some((n) => n === 'QuotaExceededError' || n === 'QuotaExceeded')) {
    return new LocalDataError('quota_exceeded', 'Device storage is full.', err);
  }
  if (names.includes('BlockedUpgrade')) {
    return new LocalDataError(
      'blocked_upgrade',
      'Database upgrade is blocked by another tab or app.',
      err,
    );
  }
  return new LocalDataError('open_failed', 'Could not open local storage.', err);
}

/**
 * Opens the database. `versionchange` closes the connection so another
 * tab/app can upgrade; a blocked upgrade rejects with `blocked_upgrade`.
 */
export async function openDb(
  opts: { name?: string; indexedDB?: IDBFactory; onVersionChange?: () => void } = {},
): Promise<AwaazDb> {
  const db = new AwaazDb(
    opts.name ?? DB_NAME,
    opts.indexedDB ? { indexedDB: opts.indexedDB } : undefined,
  );
  db.on('versionchange', () => {
    // Close so the other app's upgrade can proceed; UI shows "Reload to update".
    db.close({ disableAutoOpen: true });
    opts.onVersionChange?.();
    return false; // suppress Dexie's default console.warn handler
  });
  let onBlocked: (() => void) | undefined;
  const blocked = new Promise<never>((_, reject) => {
    onBlocked = () =>
      reject(
        new LocalDataError('blocked_upgrade', 'Database upgrade is blocked by another tab or app.'),
      );
    db.on('blocked', onBlocked);
  });
  try {
    await Promise.race([db.open(), blocked]);
    return db;
  } catch (err) {
    db.close();
    throw mapDbError(err);
  } finally {
    if (onBlocked) db.on('blocked').unsubscribe(onBlocked);
    blocked.catch(() => undefined);
  }
}
