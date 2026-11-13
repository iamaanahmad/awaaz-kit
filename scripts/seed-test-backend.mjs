#!/usr/bin/env node
// Seeds a LOCAL test Appwrite (see docs/test-backend.md) by reusing appwrite/setup.mjs
// (schema) and then creating two idempotent test users for the isolation / contract tests.
//
// Environment (shell only, never committed):
//   APPWRITE_TEST_ENDPOINT    e.g. http://localhost/v1
//   APPWRITE_TEST_PROJECT_ID
//   APPWRITE_TEST_API_KEY     server key: databases/tables/columns/indexes + users.write
//   APPWRITE_TEST_USER_PASSWORD  optional; default is a fixed local-only value
//
// Usage:
//   node scripts/seed-test-backend.mjs --dry-run       validate only, no network
//   node scripts/seed-test-backend.mjs                 seed (local endpoints only)
//   node scripts/seed-test-backend.mjs --allow-remote  explicitly allow a non-local endpoint

import { fileURLToPath } from 'node:url';
import { apply, loadConfig, validateConfig } from '../appwrite/setup.mjs';

const TEST_USERS = [
  { userId: 'test-user-a', email: 'test-user-a@awaaz.test', name: 'Test User A' },
  { userId: 'test-user-b', email: 'test-user-b@awaaz.test', name: 'Test User B' },
];

export function isLocalEndpoint(endpoint) {
  try {
    const h = new URL(endpoint).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

export function readTestEnv(env = process.env) {
  const keys = ['APPWRITE_TEST_ENDPOINT', 'APPWRITE_TEST_PROJECT_ID', 'APPWRITE_TEST_API_KEY'];
  const missing = keys.filter((k) => !env[k]);
  return {
    missing,
    endpoint: env.APPWRITE_TEST_ENDPOINT,
    projectId: env.APPWRITE_TEST_PROJECT_ID,
    apiKey: env.APPWRITE_TEST_API_KEY,
    password: env.APPWRITE_TEST_USER_PASSWORD || 'awaaz-local-test-password',
  };
}

async function ensureUser(t, user) {
  const res = await fetch(t.endpoint.replace(/\/+$/, '') + '/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': t.projectId,
      'X-Appwrite-Key': t.apiKey,
    },
    body: JSON.stringify({ ...user, password: t.password }),
  });
  if (res.status === 409) return console.log(`user ${user.userId}: exists`);
  if (!res.ok) throw new Error(`create user ${user.userId} -> ${res.status}`);
  console.log(`user ${user.userId}: created`);
}

async function main() {
  const config = loadConfig();
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error('Invalid appwrite/appwrite.json:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  if (process.argv.includes('--dry-run')) {
    console.log(`OK: definitions valid, ${TEST_USERS.length} test users. Nothing was sent.`);
    return;
  }
  const t = readTestEnv();
  if (t.missing.length > 0) {
    console.error(
      `Missing environment variables: ${t.missing.join(', ')} (see docs/test-backend.md)`,
    );
    process.exit(1);
  }
  if (!isLocalEndpoint(t.endpoint) && !process.argv.includes('--allow-remote')) {
    console.error('Refusing to seed a non-local endpoint. Pass --allow-remote to override.');
    process.exit(1);
  }
  try {
    await apply(config, {
      APPWRITE_ENDPOINT: t.endpoint,
      APPWRITE_PROJECT_ID: t.projectId,
      APPWRITE_API_KEY: t.apiKey,
    });
    for (const u of TEST_USERS) await ensureUser(t, u);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
