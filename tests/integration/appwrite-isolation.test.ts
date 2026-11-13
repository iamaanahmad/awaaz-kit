// Feature: awaaz-kit, Appwrite isolation (task 22.7)
// **Validates: Requirements 16.15, 19.13**
//
// Two users, two shop teams: neither can read, update or delete the other's rows, and
// bills are not client-updatable or client-deletable even by their own team owner.
//
// Needs a real Appwrite TEST project (see docs/test-backend.md and scripts/seed-test-backend.mjs,
// which creates `test-user-a` and `test-user-b`). Without APPWRITE_TEST_* variables the suite is
// SKIPPED with a visible message. A skip is not a pass: nothing is asserted without a backend.
//
// This file talks to the REST API with fetch on purpose: only AppwriteRemote may import the
// `appwrite` SDK. The API key is used only to mint short-lived user JWTs and to clean up rows.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const env = process.env;
const endpoint = env['APPWRITE_TEST_ENDPOINT']?.replace(/\/+$/, '');
const projectId = env['APPWRITE_TEST_PROJECT_ID'];
const apiKey = env['APPWRITE_TEST_API_KEY'];
const enabled = Boolean(endpoint && projectId && apiKey);

const DB = 'awaaz';
const DENIED = [401, 403, 404];

if (!enabled) {
  const missing = ['APPWRITE_TEST_ENDPOINT', 'APPWRITE_TEST_PROJECT_ID', 'APPWRITE_TEST_API_KEY']
    .filter((k) => !env[k])
    .join(', ');
  process.stderr.write(
    `\n[appwrite-isolation] SKIPPED: missing ${missing}. ` +
      `This test has NOT run against a real Appwrite project (see docs/test-backend.md).\n`,
  );
}

interface Res {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  path: string,
  auth: { jwt: string } | 'key',
  body?: unknown,
): Promise<Res> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId as string,
  };
  if (auth === 'key') headers['X-Appwrite-Key'] = apiKey as string;
  else headers['X-Appwrite-JWT'] = auth.jwt;
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  return { status: res.status, body: parsed };
}

const rowPath = (table: string, rowId?: string): string =>
  `/tablesdb/${DB}/tables/${table}/rows${rowId ? `/${rowId}` : ''}`;

describe.skipIf(!enabled)('Appwrite isolation: two users, two shop teams', () => {
  const run = Date.now().toString(36);
  const teamA = `iso-a-${run}`;
  const teamB = `iso-b-${run}`;
  const productA = `iso-pa-${run}`;
  const productB = `iso-pb-${run}`;
  const billA = `iso-ba-${run}`;
  const billB = `iso-bb-${run}`;
  let jwtA = '';
  let jwtB = '';

  const mintJwt = async (userId: string): Promise<string> => {
    const r = await call('POST', `/users/${userId}/jwts`, 'key', {});
    expect(r.status, `jwt for ${userId}`).toBeLessThan(300);
    return r.body['jwt'] as string;
  };

  const product = (shopId: string) => ({
    shopId,
    name: 'Isolation product',
    unit: 'kg',
    pricePaise: 1000,
    active: true,
    clientUpdatedAt: new Date().toISOString(),
  });

  const bill = (shopId: string, tag: string) => ({
    shopId,
    receiptNumber: `ISO-${tag}`,
    kind: 'sale',
    status: 'finalized',
    subtotalPaise: 1000,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: 1000,
    mutationId: `iso-mut-${tag}-${run}`,
    deviceId: 'iso-device',
    finalizedAt: new Date().toISOString(),
    clientCreatedAt: new Date().toISOString(),
  });

  const permsFor = (teamId: string, table: string): string[] => {
    const read = `read("team:${teamId}")`;
    if (table === 'bills') return [read];
    return [read, `update("team:${teamId}")`, `delete("team:${teamId}/owner")`];
  };

  beforeAll(async () => {
    jwtA = await mintJwt('test-user-a');
    jwtB = await mintJwt('test-user-b');
    for (const [jwt, teamId] of [
      [jwtA, teamA],
      [jwtB, teamB],
    ] as const) {
      const t = await call('POST', '/teams', { jwt }, { teamId, name: `Isolation ${teamId}` });
      expect(t.status, `create team ${teamId}`).toBeLessThan(300);
    }
    const seeds: Array<[string, string, string, string, object]> = [
      ['products', productA, teamA, jwtA, product(teamA)],
      ['products', productB, teamB, jwtB, product(teamB)],
      ['bills', billA, teamA, jwtA, bill(teamA, 'a')],
      ['bills', billB, teamB, jwtB, bill(teamB, 'b')],
    ];
    for (const [table, rowId, teamId, jwt, data] of seeds) {
      const r = await call(
        'POST',
        rowPath(table),
        { jwt },
        {
          rowId,
          data,
          permissions: permsFor(teamId, table),
        },
      );
      expect(r.status, `create ${table}/${rowId}`).toBeLessThan(300);
    }
  }, 60_000);

  afterAll(async () => {
    // Cleanup with the server key; bills cannot be deleted by any client.
    for (const [table, id] of [
      ['products', productA],
      ['products', productB],
      ['bills', billA],
      ['bills', billB],
    ] as const) {
      await call('DELETE', rowPath(table, id), 'key');
    }
    for (const id of [teamA, teamB]) await call('DELETE', `/teams/${id}`, 'key');
  }, 60_000);

  it("owners can read their own team's rows (sanity)", async () => {
    expect((await call('GET', rowPath('products', productA), { jwt: jwtA })).status).toBe(200);
    expect((await call('GET', rowPath('products', productB), { jwt: jwtB })).status).toBe(200);
  });

  it("user B cannot get user A's rows", async () => {
    for (const [table, id] of [
      ['products', productA],
      ['bills', billA],
    ] as const) {
      const r = await call('GET', rowPath(table, id), { jwt: jwtB });
      expect(DENIED, `GET ${table}`).toContain(r.status);
    }
  });

  it("user B listing user A's shop returns no rows", async () => {
    for (const table of ['products', 'bills']) {
      const q = JSON.stringify({ method: 'equal', attribute: 'shopId', values: [teamA] });
      const r = await call('GET', `${rowPath(table)}?queries[]=${encodeURIComponent(q)}`, {
        jwt: jwtB,
      });
      // Either an empty list or an explicit denial; never a row.
      if (r.status === 200) expect(r.body['rows']).toEqual([]);
      else expect(DENIED).toContain(r.status);
    }
  });

  it("user B cannot update user A's rows", async () => {
    const r = await call(
      'PATCH',
      rowPath('products', productA),
      { jwt: jwtB },
      {
        data: { name: 'hijacked' },
      },
    );
    expect(DENIED).toContain(r.status);
    const after = await call('GET', rowPath('products', productA), { jwt: jwtA });
    expect(after.body['name']).toBe('Isolation product');
  });

  it("user B cannot delete user A's rows", async () => {
    const r = await call('DELETE', rowPath('products', productA), { jwt: jwtB });
    expect(DENIED).toContain(r.status);
    expect((await call('GET', rowPath('products', productA), { jwt: jwtA })).status).toBe(200);
  });

  it('user A is equally unable to touch user B rows', async () => {
    expect(DENIED).toContain(
      (await call('GET', rowPath('products', productB), { jwt: jwtA })).status,
    );
    expect(DENIED).toContain(
      (await call('PATCH', rowPath('products', productB), { jwt: jwtA }, { data: { name: 'x' } }))
        .status,
    );
    expect(DENIED).toContain(
      (await call('DELETE', rowPath('products', productB), { jwt: jwtA })).status,
    );
  });

  it('bills are not client-updatable, even by the owning team', async () => {
    const r = await call(
      'PATCH',
      rowPath('bills', billA),
      { jwt: jwtA },
      {
        data: { totalPaise: 1 },
      },
    );
    expect(DENIED).toContain(r.status);
    const after = await call('GET', rowPath('bills', billA), { jwt: jwtA });
    expect(after.body['totalPaise']).toBe(1000);
  });

  it('bills are not client-deletable, even by the owning team', async () => {
    const r = await call('DELETE', rowPath('bills', billA), { jwt: jwtA });
    expect(DENIED).toContain(r.status);
    expect((await call('GET', rowPath('bills', billA), { jwt: jwtA })).status).toBe(200);
  });
});
