/**
 * Push algorithm: sends due outbox Mutations to a `SyncRemote` in batches of 10,
 * in creation order, child rows before the header.
 *
 * The outbox is reached through the structural `PushStore` port so this package
 * does not depend on local-data. `markSynced` must update the Mutation and its
 * record's `syncState` in one local transaction (Req 16.5).
 */
import { SyncError, type RemoteTable, type SyncErrorKind, type SyncRemote } from './contracts';
import {
  toRemoteRow,
  type MutationLike,
  type RemoteRowSettings,
  type RemoteWrite,
} from './remote-row';

export const PUSH_BATCH_SIZE = 10;
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 5 * 60_000;
export const BACKOFF_JITTER = 0.2;

/** Mutation fields push needs. `local-data`'s `Mutation` is assignable to this. */
export interface PushMutation extends MutationLike {
  readonly attempts: number;
}

export interface MutationFailure {
  readonly kind: SyncErrorKind;
  readonly message: string;
  readonly at: string;
}

export interface PushStore<M extends PushMutation = PushMutation> {
  /** Pending Mutations with `nextAttemptAt <= now`, in creation order. */
  listDue(now: Date, limit: number): Promise<M[]>;
  /** Marks the Mutation `syncing`. */
  markSyncing(mutationId: string): Promise<void>;
  /** One transaction: Mutation -> `synced` and its record's `syncState` -> `synced`. */
  markSynced(mutation: M): Promise<void>;
  /** Keeps the Mutation `pending` with a backed-off `nextAttemptAt`. */
  markRetry(
    mutationId: string,
    patch: { attempts: number; nextAttemptAt: string; lastError: MutationFailure },
  ): Promise<void>;
  /** Marks the Mutation (and its record) `failed`, retaining the Mutation. */
  markFailed(mutation: M, patch: { attempts: number; lastError: MutationFailure }): Promise<void>;
}

export interface PushDeps<M extends PushMutation = PushMutation> {
  readonly remote: SyncRemote;
  readonly store: PushStore<M>;
  readonly settings: Omit<RemoteRowSettings, 'resolveBillRowId'>;
  /** Maps a local bill id to its remote row id, for `correctsBillRowId` on corrections. */
  readonly resolveBillRowId?: ((localBillId: string) => string | undefined) | undefined;
  readonly now: () => Date;
  /** Returns a value in [0, 1). */
  readonly random: () => number;
}

export interface PushResult {
  readonly synced: number;
  readonly retried: number;
  readonly failed: number;
  /** Set when the run stopped early because of a retryable error. */
  readonly stoppedBy: SyncErrorKind | null;
}

/** `min(CAP, BASE * 2^attempts) * (1 - JITTER * random())`, in milliseconds. */
export function backoffDelayMs(attempts: number, random: () => number): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts));
  return Math.min(BACKOFF_CAP_MS, exp) * (1 - BACKOFF_JITTER * random());
}

/** `validation` and `permission` errors will not fix themselves by retrying. */
export function isTerminalKind(kind: SyncErrorKind): boolean {
  return kind === 'validation' || kind === 'permission';
}

async function writeAll(remote: SyncRemote, writes: readonly RemoteWrite[]): Promise<void> {
  for (const w of writes) {
    if (w.mode === 'create') {
      // `already_exists` (409) is success: the row was written by an earlier attempt.
      await remote.createOnce(w.table as RemoteTable, w.rowId, w.data, w.permissions);
    } else {
      const clientUpdatedAt = w.data['clientUpdatedAt'];
      if (typeof clientUpdatedAt !== 'string') {
        throw new SyncError('validation', `Missing clientUpdatedAt for ${w.table}`);
      }
      // `stale` means a newer write already won; the Mutation is still done.
      await remote.upsertGuarded(w.table, w.rowId, { ...w.data, clientUpdatedAt }, w.permissions);
    }
  }
}

function toSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  return new SyncError('server', error instanceof Error ? error.message : 'Unknown error', {
    cause: error,
  });
}

/** Runs one push pass. Never throws for per-Mutation errors. */
export async function push<M extends PushMutation>(deps: PushDeps<M>): Promise<PushResult> {
  const { remote, store, settings, resolveBillRowId, now, random } = deps;
  const seen = new Set<string>();
  let synced = 0;
  let retried = 0;
  let failed = 0;

  for (;;) {
    const due = (await store.listDue(now(), PUSH_BATCH_SIZE)).filter(
      (m) => !seen.has(m.mutationId),
    );
    if (due.length === 0) break;

    for (const mutation of due) {
      seen.add(mutation.mutationId);
      await store.markSyncing(mutation.mutationId);
      try {
        const writes = toRemoteRow(mutation, {
          ...settings,
          resolveBillRowId,
        });
        await writeAll(remote, writes);
        await store.markSynced(mutation);
        synced += 1;
      } catch (e) {
        const error = toSyncError(e);
        const at = now();
        const lastError: MutationFailure = {
          kind: error.kind,
          message: error.message,
          at: at.toISOString(),
        };
        const attempts = mutation.attempts + 1;
        if (isTerminalKind(error.kind)) {
          await store.markFailed(mutation, { attempts, lastError });
          failed += 1;
          continue;
        }
        const delay = backoffDelayMs(mutation.attempts, random);
        await store.markRetry(mutation.mutationId, {
          attempts,
          nextAttemptAt: new Date(at.getTime() + delay).toISOString(),
          lastError,
        });
        retried += 1;
        // Stop so later Mutations (e.g. a correction) never overtake this one.
        return { synced, retried, failed, stoppedBy: error.kind };
      }
    }
  }
  return { synced, retried, failed, stoppedBy: null };
}
