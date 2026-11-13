/**
 * Stateful in-process fake of the narrow SDK slice used by `AppwriteRemote` (`AppwritePort`).
 * It models the server behaviours the adapter relies on: 401 when signed out, 404 on a
 * missing row, 409 on duplicate row ids and on duplicate `mutationId` for orders/bills,
 * and `listRows` with the equal / greaterThanEqual / orderAsc / cursorAfter / limit queries.
 *
 * Only used by tests. It lets the shared `SyncRemote` contract run against the real
 * `AppwriteRemote` adapter code without a network.
 */
import { AppwriteException } from 'appwrite';
import type { AppwritePort } from '../appwrite/appwrite-remote';

interface FakeRow {
  readonly id: string;
  readonly createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
  permissions: string[];
}

interface ParsedQuery {
  method: string;
  attribute?: string;
  values?: unknown[];
}

export interface FakeAppwritePort {
  readonly port: AppwritePort;
  /** Signs the fake session in or out. */
  setSignedIn(value: boolean): void;
  /** Number of stored rows in a table. */
  count(table: string): number;
}

const fail = (code: number, message: string): AppwriteException =>
  new AppwriteException(message, code, 'fake', '');

const BASE_TIME = Date.UTC(2025, 0, 1);

export function createFakeAppwritePort(options: { userId?: string } = {}): FakeAppwritePort {
  const userId = options.userId ?? 'fake-user-1';
  const tables = new Map<string, Map<string, FakeRow>>();
  const teams = new Set<string>();
  let signedIn = true;
  let tick = 0;

  const now = (): string => new Date(BASE_TIME + tick++).toISOString();
  const requireSession = (): void => {
    if (!signedIn) throw fail(401, 'unauthorized');
  };
  const table = (id: string): Map<string, FakeRow> => {
    let rows = tables.get(id);
    if (!rows) {
      rows = new Map();
      tables.set(id, rows);
    }
    return rows;
  };
  const toApi = (row: FakeRow): Record<string, unknown> => ({
    ...structuredClone(row.data),
    $id: row.id,
    $createdAt: row.createdAt,
    $updatedAt: row.updatedAt,
    $permissions: [...row.permissions],
  });

  const port: AppwritePort = {
    account: {
      async get() {
        requireSession();
        return { $id: userId };
      },
      async create() {
        return {};
      },
      async createEmailPasswordSession() {
        signedIn = true;
        return {};
      },
      async deleteSession() {
        signedIn = false;
        return {};
      },
    },
    teams: {
      async create(p) {
        requireSession();
        if (teams.has(p.teamId)) throw fail(409, 'team exists');
        teams.add(p.teamId);
        return { $id: p.teamId };
      },
      async get(p) {
        requireSession();
        if (!teams.has(p.teamId)) throw fail(404, 'team not found');
        return { $id: p.teamId };
      },
    },
    tables: {
      async getRow(p) {
        requireSession();
        const row = table(p.tableId).get(p.rowId);
        if (!row) throw fail(404, 'row not found');
        return toApi(row);
      },
      async createRow(p) {
        requireSession();
        const rows = table(p.tableId);
        if (rows.has(p.rowId)) throw fail(409, 'row exists');
        const mutationId = p.data['mutationId'];
        if ((p.tableId === 'orders' || p.tableId === 'bills') && typeof mutationId === 'string') {
          for (const row of rows.values()) {
            if (row.data['mutationId'] === mutationId) throw fail(409, 'duplicate mutationId');
          }
        }
        const at = now();
        rows.set(p.rowId, {
          id: p.rowId,
          createdAt: at,
          updatedAt: at,
          data: structuredClone(p.data),
          permissions: [...(p.permissions ?? [])],
        });
        return {};
      },
      async updateRow(p) {
        requireSession();
        const row = table(p.tableId).get(p.rowId);
        if (!row) throw fail(404, 'row not found');
        row.data = structuredClone(p.data);
        if (p.permissions) row.permissions = [...p.permissions];
        row.updatedAt = now();
        return {};
      },
      async listRows(p) {
        requireSession();
        const queries = (p.queries ?? []).map((q) => JSON.parse(q) as ParsedQuery);
        let rows = [...table(p.tableId).values()];
        for (const q of queries) {
          if (q.method === 'equal' && q.attribute !== undefined) {
            const attr = q.attribute;
            const wanted = q.values ?? [];
            rows = rows.filter((r) => wanted.includes(r.data[attr]));
          }
        }
        rows.sort((a, b) =>
          a.updatedAt === b.updatedAt
            ? a.id < b.id
              ? -1
              : a.id > b.id
                ? 1
                : 0
            : a.updatedAt < b.updatedAt
              ? -1
              : 1,
        );
        let limit = 25;
        for (const q of queries) {
          const first = q.values?.[0];
          if (q.method === 'greaterThanEqual' && q.attribute === '$updatedAt') {
            rows = rows.filter((r) => r.updatedAt >= String(first));
          } else if (q.method === 'cursorAfter') {
            const at = rows.findIndex((r) => r.id === first);
            if (at >= 0) rows = rows.slice(at + 1);
          } else if (q.method === 'limit') {
            limit = Number(first);
          }
        }
        return { rows: rows.slice(0, limit).map(toApi) };
      },
    },
  };

  return {
    port,
    setSignedIn(value) {
      signedIn = value;
    },
    count(id) {
      return table(id).size;
    },
  };
}
