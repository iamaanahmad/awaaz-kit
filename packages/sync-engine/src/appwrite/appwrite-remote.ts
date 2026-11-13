/**
 * Appwrite implementation of `SyncRemote`.
 *
 * This is the ONLY file in the repository that imports the `appwrite` SDK
 * (verified against appwrite@29.2.0: `Account`, `TablesDB`, `Teams`, `Query`,
 * `Permission`, `Role`, `ID`, `AppwriteException`). `TablesDB` is used rather than the
 * legacy `Databases` service because the schema is defined as tables and rows.
 *
 * Configuration is the public endpoint and project id only. No API key is ever
 * accepted or used here (Req 16.16, 18.4).
 */
import {
  Account,
  AppwriteException,
  Client,
  ID,
  Permission,
  Query,
  Role,
  TablesDB,
  Teams,
} from 'appwrite';
import {
  SyncError,
  type PullCursor,
  type RemoteRow,
  type RemoteTable,
  type RowPermissions,
  type SyncRemote,
} from '../contracts';

export interface AppwriteRemoteConfig {
  /** Public API endpoint, e.g. `https://cloud.appwrite.io/v1` or a self-hosted URL. */
  readonly endpoint: string;
  readonly projectId: string;
  /** Defaults to `awaaz`. */
  readonly databaseId?: string;
}

/** The narrow slice of the SDK this adapter uses. Tests provide a fake of this. */
export interface AppwritePort {
  account: {
    get(): Promise<{ $id: string }>;
    create(p: { userId: string; email: string; password: string; name?: string }): Promise<unknown>;
    createEmailPasswordSession(p: { email: string; password: string }): Promise<unknown>;
    deleteSession(p: { sessionId: string }): Promise<unknown>;
  };
  teams: {
    create(p: { teamId: string; name: string }): Promise<{ $id: string }>;
    get(p: { teamId: string }): Promise<{ $id: string }>;
  };
  tables: {
    getRow(p: {
      databaseId: string;
      tableId: string;
      rowId: string;
      queries?: string[];
    }): Promise<Record<string, unknown>>;
    createRow(p: {
      databaseId: string;
      tableId: string;
      rowId: string;
      data: Record<string, unknown>;
      permissions?: string[];
    }): Promise<unknown>;
    updateRow(p: {
      databaseId: string;
      tableId: string;
      rowId: string;
      data: Record<string, unknown>;
      permissions?: string[];
    }): Promise<unknown>;
    listRows(p: {
      databaseId: string;
      tableId: string;
      queries?: string[];
      total?: boolean;
    }): Promise<{ rows: Record<string, unknown>[] }>;
  };
}

/** Builds the real SDK port from public configuration. */
export function createAppwritePort(config: AppwriteRemoteConfig): AppwritePort {
  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
  return {
    account: new Account(client),
    teams: new Teams(client),
    tables: new TablesDB(client),
  } as unknown as AppwritePort;
}

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

function httpCode(error: unknown): number | undefined {
  if (error instanceof AppwriteException) return error.code;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
}

/** Maps SDK failures to the engine's `SyncError` kinds. */
function toSyncError(error: unknown, action: string): SyncError {
  if (error instanceof SyncError) return error;
  const code = httpCode(error);
  const message = `${action} failed${code ? ` (HTTP ${code})` : ''}`;
  if (code === undefined || code === 0) return new SyncError('network', message, { cause: error });
  if (code === 401) return new SyncError('auth', message, { cause: error });
  if (code === 403) return new SyncError('permission', message, { cause: error });
  if (code === 400 || code === 404 || code === 409 || code === 413 || code === 422) {
    return new SyncError('validation', message, { cause: error });
  }
  return new SyncError('server', message, { cause: error });
}

/** Parses `read(team:abc)` / `delete(team:abc/owner)` style strings into SDK permission strings. */
function toSdkPermission(entry: string): string {
  const m = /^(read|update|delete)\(\s*["']?([^"')]+)["']?\s*\)$/.exec(entry.trim());
  if (!m) throw new SyncError('validation', `Unsupported permission entry: ${entry}`);
  const action = m[1] as 'read' | 'update' | 'delete';
  const role = m[2] as string;
  const team = /^team:([^/]+)(?:\/(.+))?$/.exec(role);
  let sdkRole: string;
  if (team) sdkRole = Role.team(team[1] as string, team[2]);
  else if (role === 'users') sdkRole = Role.users();
  else if (role.startsWith('user:')) sdkRole = Role.user(role.slice(5));
  else throw new SyncError('validation', `Unsupported permission role: ${role}`);
  return Permission[action](sdkRole);
}

function toSdkPermissions(perm: RowPermissions): string[] {
  return [...perm.read, ...perm.update, ...perm.delete].map(toSdkPermission);
}

export class AppwriteRemote implements SyncRemote {
  private readonly port: AppwritePort;
  private readonly databaseId: string;

  constructor(config: AppwriteRemoteConfig, port?: AppwritePort) {
    this.databaseId = config.databaseId ?? 'awaaz';
    this.port = port ?? createAppwritePort(config);
  }

  // ---------- Session ----------

  async signIn(email: string, password: string): Promise<{ userId: string }> {
    try {
      await this.port.account.createEmailPasswordSession({ email, password });
      const user = await this.port.account.get();
      return { userId: user.$id };
    } catch (error) {
      throw toSyncError(error, 'Sign in');
    }
  }

  /** Creates an email/password account and signs in. */
  async signUp(email: string, password: string, name?: string): Promise<{ userId: string }> {
    try {
      await this.port.account.create({
        userId: ID.unique(),
        email,
        password,
        ...(name === undefined ? {} : { name }),
      });
    } catch (error) {
      throw toSyncError(error, 'Sign up');
    }
    return this.signIn(email, password);
  }

  async signOut(): Promise<void> {
    try {
      await this.port.account.deleteSession({ sessionId: 'current' });
    } catch (error) {
      if (httpCode(error) === 401) return;
      throw toSyncError(error, 'Sign out');
    }
  }

  async signedIn(): Promise<{ userId: string } | null> {
    try {
      const user = await this.port.account.get();
      return { userId: user.$id };
    } catch (error) {
      if (httpCode(error) === 401) return null;
      throw toSyncError(error, 'Session check');
    }
  }

  // ---------- Tenancy ----------

  /**
   * One team per shop. The local shop id is used as the team id when it is a valid
   * Appwrite id, which makes the call idempotent (409 -> fetch the existing team).
   */
  async ensureShopTeam(local: { shopId: string; name: string }): Promise<{ remoteShopId: string }> {
    await this.requireSession();
    const teamId = VALID_ID.test(local.shopId) ? local.shopId : ID.unique();
    try {
      const team = await this.port.teams.create({ teamId, name: local.name });
      return { remoteShopId: team.$id };
    } catch (error) {
      if (httpCode(error) !== 409) throw toSyncError(error, 'Create shop team');
    }
    try {
      const team = await this.port.teams.get({ teamId });
      return { remoteShopId: team.$id };
    } catch (error) {
      throw toSyncError(error, 'Load shop team');
    }
  }

  // ---------- Writes ----------

  async createOnce(
    table: RemoteTable,
    rowId: string,
    data: object,
    perm: RowPermissions,
  ): Promise<'created' | 'already_exists'> {
    const permissions = toSdkPermissions(perm);
    try {
      await this.port.tables.createRow({
        databaseId: this.databaseId,
        tableId: table,
        rowId,
        data: data as Record<string, unknown>,
        permissions,
      });
      return 'created';
    } catch (error) {
      if (httpCode(error) === 409) return 'already_exists';
      throw toSyncError(error, `Create ${table} row`);
    }
  }

  async upsertGuarded(
    table: RemoteTable,
    rowId: string,
    data: Record<string, unknown> & { clientUpdatedAt: string },
    perm: RowPermissions,
  ): Promise<'written' | 'stale'> {
    const permissions = toSdkPermissions(perm);
    const base = { databaseId: this.databaseId, tableId: table, rowId };
    // Two passes cover the race where another device creates the row between our get and create.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let existing: Record<string, unknown> | null = null;
      try {
        existing = await this.port.tables.getRow({
          ...base,
          queries: [Query.select(['clientUpdatedAt'])],
        });
      } catch (error) {
        if (httpCode(error) !== 404) throw toSyncError(error, `Read ${table} row`);
      }

      if (existing === null) {
        try {
          await this.port.tables.createRow({ ...base, data, permissions });
          return 'written';
        } catch (error) {
          if (httpCode(error) === 409) continue;
          throw toSyncError(error, `Create ${table} row`);
        }
      }

      const current = existing['clientUpdatedAt'];
      if (typeof current === 'string' && data.clientUpdatedAt < current) return 'stale';
      try {
        await this.port.tables.updateRow({ ...base, data, permissions });
        return 'written';
      } catch (error) {
        throw toSyncError(error, `Update ${table} row`);
      }
    }
    throw new SyncError('server', `Upsert ${table} row did not settle`);
  }

  // ---------- Pull ----------

  async pull(
    table: RemoteTable,
    shopId: string,
    cursor: PullCursor | null,
    limit: number,
  ): Promise<{ rows: RemoteRow[]; next: PullCursor | null }> {
    const queries = [Query.equal('shopId', shopId)];
    if (cursor !== null) queries.push(Query.greaterThanEqual('$updatedAt', cursor.updatedAt));
    queries.push(Query.orderAsc('$updatedAt'), Query.orderAsc('$id'));
    if (cursor !== null) queries.push(Query.cursorAfter(cursor.rowId));
    queries.push(Query.limit(Math.max(1, limit)));

    try {
      const result = await this.port.tables.listRows({
        databaseId: this.databaseId,
        tableId: table,
        queries,
        total: false,
      });
      const rows = result.rows as unknown as RemoteRow[];
      const last = rows[rows.length - 1];
      return { rows, next: last ? { updatedAt: last.$updatedAt, rowId: last.$id } : null };
    } catch (error) {
      throw toSyncError(error, `Pull ${table}`);
    }
  }

  private async requireSession(): Promise<void> {
    if ((await this.signedIn()) === null) throw new SyncError('auth', 'Not signed in');
  }
}
