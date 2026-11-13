import {
  REMOTE_TABLES,
  SyncError,
  type PullCursor,
  type RemoteRow,
  type RemoteTable,
  type RowPermissions,
  type SyncRemote,
} from './contracts';

/**
 * In-memory `SyncRemote` that mirrors the Appwrite schema semantics:
 * - create-once duplicates (same row id, or same `mutationId` on orders/bills) -> `already_exists`
 * - `upsertGuarded` returns `stale` for an older `clientUpdatedAt`
 * - row permissions are enforced for update and read; table-level create needs a signed-in user
 */

export interface InMemoryRemoteOptions {
  /** Signed-in user id, or null for signed out. */
  readonly userId?: string | null;
  /** Injected clock returning an ISO 8601 string, used for `$updatedAt`. */
  readonly now?: () => string;
}

interface StoredRow {
  readonly id: string;
  readonly table: RemoteTable;
  readonly createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
  permissions: RowPermissions;
}

/** Tables that carry a unique `mutationId` index (defense in depth). */
const UNIQUE_MUTATION_TABLES: ReadonlySet<RemoteTable> = new Set(['orders', 'bills']);

/** Parses `read(team:abc)`, `read("team:abc/owner")` and bare role strings. */
function parsePermissionRole(entry: string): string {
  const match = /^[a-z]+\(\s*["']?([^"')]*)["']?\s*\)$/.exec(entry.trim());
  return match?.[1] ?? entry.trim();
}

export class InMemoryRemote implements SyncRemote {
  private readonly tables = new Map<RemoteTable, Map<string, StoredRow>>();
  private readonly memberships = new Map<string, Map<string, Set<string>>>(); // teamId -> userId -> roles
  private readonly teamByShop = new Map<string, string>();
  private readonly now: () => string;
  private userId: string | null;
  private pendingFailure: SyncError | null = null;
  private teamCounter = 0;

  constructor(options: InMemoryRemoteOptions = {}) {
    this.userId = options.userId === undefined ? 'user-1' : options.userId;
    this.now = options.now ?? (() => new Date().toISOString());
    for (const table of REMOTE_TABLES) this.tables.set(table, new Map());
  }

  /** Test helper: switch the signed-in user (null signs out). */
  setUser(userId: string | null): void {
    this.userId = userId;
  }

  /** Test helper: make the next remote call throw the given error once. */
  failNext(error: SyncError): void {
    this.pendingFailure = error;
  }

  /** Test helper: add a user to a team with the given extra roles (e.g. `owner`). */
  addMember(teamId: string, userId: string, roles: readonly string[] = []): void {
    let members = this.memberships.get(teamId);
    if (!members) {
      members = new Map();
      this.memberships.set(teamId, members);
    }
    members.set(userId, new Set(roles));
  }

  /** Test helper: number of stored rows in a table. */
  count(table: RemoteTable): number {
    return this.table(table).size;
  }

  /** Test helper: raw stored data for a row, ignoring permissions. */
  peek(table: RemoteTable, rowId: string): Record<string, unknown> | undefined {
    const row = this.table(table).get(rowId);
    return row ? structuredClone(row.data) : undefined;
  }

  async signedIn(): Promise<{ userId: string } | null> {
    this.maybeFail();
    return this.userId === null ? null : { userId: this.userId };
  }

  async ensureShopTeam(local: { shopId: string; name: string }): Promise<{ remoteShopId: string }> {
    this.maybeFail();
    const user = this.requireUser();
    let teamId = this.teamByShop.get(local.shopId);
    if (teamId === undefined) {
      this.teamCounter += 1;
      teamId = `team-${this.teamCounter}`;
      this.teamByShop.set(local.shopId, teamId);
      this.addMember(teamId, user, ['owner']);
    }
    return { remoteShopId: teamId };
  }

  async createOnce(
    table: RemoteTable,
    rowId: string,
    data: object,
    perm: RowPermissions,
  ): Promise<'created' | 'already_exists'> {
    this.maybeFail();
    this.requireUser();
    const rows = this.table(table);
    if (rows.has(rowId)) return 'already_exists';
    const mutationId = (data as Record<string, unknown>)['mutationId'];
    if (UNIQUE_MUTATION_TABLES.has(table) && typeof mutationId === 'string') {
      for (const row of rows.values()) {
        if (row.data['mutationId'] === mutationId) return 'already_exists';
      }
    }
    const at = this.now();
    rows.set(rowId, {
      id: rowId,
      table,
      createdAt: at,
      updatedAt: at,
      data: structuredClone(data) as Record<string, unknown>,
      permissions: clonePerm(perm),
    });
    return 'created';
  }

  async upsertGuarded(
    table: RemoteTable,
    rowId: string,
    data: Record<string, unknown> & { clientUpdatedAt: string },
    perm: RowPermissions,
  ): Promise<'written' | 'stale'> {
    this.maybeFail();
    this.requireUser();
    const rows = this.table(table);
    const existing = rows.get(rowId);
    const at = this.now();
    if (!existing) {
      rows.set(rowId, {
        id: rowId,
        table,
        createdAt: at,
        updatedAt: at,
        data: structuredClone(data) as Record<string, unknown>,
        permissions: clonePerm(perm),
      });
      return 'written';
    }
    if (!this.hasAny(existing.permissions.update)) {
      throw new SyncError('permission', `No update permission on ${table}/${rowId}`);
    }
    const current = existing.data['clientUpdatedAt'];
    if (typeof current === 'string' && data.clientUpdatedAt < current) return 'stale';
    existing.data = structuredClone(data) as Record<string, unknown>;
    existing.permissions = clonePerm(perm);
    existing.updatedAt = at;
    return 'written';
  }

  async pull(
    table: RemoteTable,
    shopId: string,
    cursor: PullCursor | null,
    limit: number,
  ): Promise<{ rows: RemoteRow[]; next: PullCursor | null }> {
    this.maybeFail();
    this.requireUser();
    const candidates = [...this.table(table).values()]
      .filter((row) => row.data['shopId'] === shopId && this.hasAny(row.permissions.read))
      .filter((row) => cursor === null || compare(row.updatedAt, row.id, cursor) > 0)
      .sort((a, b) =>
        a.updatedAt === b.updatedAt
          ? a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0
          : a.updatedAt < b.updatedAt
            ? -1
            : 1,
      )
      .slice(0, Math.max(0, limit));
    const rows: RemoteRow[] = candidates.map((row) => ({
      ...(structuredClone(row.data) as Record<string, unknown>),
      $id: row.id,
      $createdAt: row.createdAt,
      $updatedAt: row.updatedAt,
      $permissions: [
        ...row.permissions.read.map((r) => `read("${parsePermissionRole(r)}")`),
        ...row.permissions.update.map((r) => `update("${parsePermissionRole(r)}")`),
        ...row.permissions.delete.map((r) => `delete("${parsePermissionRole(r)}")`),
      ],
    }));
    const last = candidates[candidates.length - 1];
    return { rows, next: last ? { updatedAt: last.updatedAt, rowId: last.id } : null };
  }

  private table(table: RemoteTable): Map<string, StoredRow> {
    const rows = this.tables.get(table);
    if (!rows) throw new SyncError('validation', `Unknown table ${String(table)}`);
    return rows;
  }

  private requireUser(): string {
    if (this.userId === null) throw new SyncError('auth', 'Not signed in');
    return this.userId;
  }

  private maybeFail(): void {
    if (this.pendingFailure) {
      const error = this.pendingFailure;
      this.pendingFailure = null;
      throw error;
    }
  }

  /** True when the current user matches any permission role string. */
  private hasAny(entries: readonly string[]): boolean {
    const user = this.userId;
    if (user === null) return false;
    return entries.some((entry) => {
      const role = parsePermissionRole(entry);
      if (role === 'users' || role === 'any') return true;
      if (role === `user:${user}`) return true;
      const team = /^team:([^/]+)(?:\/(.+))?$/.exec(role);
      if (!team) return false;
      const roles = this.memberships.get(team[1] as string)?.get(user);
      if (!roles) return false;
      const required = team[2];
      return required === undefined || roles.has(required);
    });
  }
}

function clonePerm(perm: RowPermissions): RowPermissions {
  return { read: [...perm.read], update: [...perm.update], delete: [...perm.delete] };
}

function compare(updatedAt: string, id: string, cursor: PullCursor): number {
  if (updatedAt !== cursor.updatedAt) return updatedAt < cursor.updatedAt ? -1 : 1;
  return id < cursor.rowId ? -1 : id > cursor.rowId ? 1 : 0;
}
