#!/usr/bin/env node
// Applies appwrite/appwrite.json to an Appwrite project (Cloud or self-hosted)
// through the TablesDB REST API. Idempotent: safe to run repeatedly.
//
// Credentials come ONLY from the developer's environment, never from files:
//   APPWRITE_ENDPOINT    e.g. https://cloud.appwrite.io/v1
//   APPWRITE_PROJECT_ID
//   APPWRITE_API_KEY     server key with databases.*, tables.*, columns.*, indexes.* scopes
//
// Usage:
//   node appwrite/setup.mjs --dry-run   validate the definitions, no network, no env needed
//   node appwrite/setup.mjs             apply to the project named by the environment
//
// Additive only: existing columns and indexes are never deleted or changed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = new URL('./appwrite.json', import.meta.url);
const REQUIRED_TABLES = ['products', 'customers', 'orders', 'order_items', 'bills', 'bill_items'];
const COLUMN_TYPES = new Set(['string', 'integer', 'boolean', 'datetime']);
const INDEX_TYPES = new Set(['key', 'unique']);
const SYSTEM_ATTRS = new Set(['$id', '$createdAt', '$updatedAt']);

export function loadConfig(url = CONFIG_PATH) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Returns a list of problems (empty when the definitions are valid). */
export function validateConfig(config) {
  const errors = [];
  const dbIds = new Set((config.tablesDB ?? []).map((d) => d.$id));
  if (dbIds.size === 0) errors.push('tablesDB: no database defined');
  if (config.projectId) errors.push('projectId must be empty in the committed file');
  const names = (config.tables ?? []).map((t) => t.$id);
  for (const t of REQUIRED_TABLES) if (!names.includes(t)) errors.push(`missing table ${t}`);
  for (const t of config.tables ?? []) {
    const where = `table ${t.$id}`;
    if (!dbIds.has(t.databaseId)) errors.push(`${where}: unknown databaseId`);
    if (t.rowSecurity !== true) errors.push(`${where}: rowSecurity must be true`);
    if (JSON.stringify(t.$permissions) !== JSON.stringify(['create("users")'])) {
      errors.push(`${where}: table permissions must be exactly create("users")`);
    }
    const cols = new Map();
    for (const c of t.columns ?? []) {
      if (cols.has(c.key)) errors.push(`${where}: duplicate column ${c.key}`);
      cols.set(c.key, c);
      if (!COLUMN_TYPES.has(c.type)) errors.push(`${where}.${c.key}: unsupported type ${c.type}`);
      if (c.type === 'string' && !(Number.isInteger(c.size) && c.size > 0)) {
        errors.push(`${where}.${c.key}: string needs a positive size`);
      }
      if (c.required && c.array) errors.push(`${where}.${c.key}: array cannot be required`);
      if (c.required && c.default !== undefined)
        errors.push(`${where}.${c.key}: required has default`);
    }
    for (const i of t.indexes ?? []) {
      if (!INDEX_TYPES.has(i.type)) errors.push(`${where}.${i.key}: unsupported index type`);
      for (const col of i.columns) {
        if (!cols.has(col) && !SYSTEM_ATTRS.has(col))
          errors.push(`${where}.${i.key}: unknown column ${col}`);
      }
    }
    const has = (key, type) =>
      (t.indexes ?? []).some((i) => i.type === type && i.columns.join() === key);
    const shopUpdated = (t.indexes ?? []).some((i) => i.columns.join() === 'shopId,$updatedAt');
    if (!shopUpdated) errors.push(`${where}: missing (shopId, $updatedAt) index`);
    if (!cols.has('shopId')) errors.push(`${where}: missing shopId`);
    if ((t.$id === 'orders' || t.$id === 'bills') && !has('mutationId', 'unique')) {
      errors.push(`${where}: missing unique mutationId index`);
    }
    if ((t.$id === 'orders' || t.$id === 'bills') && cols.get('rawTranscript')?.required) {
      errors.push(`${where}: rawTranscript must be optional`);
    }
    if ((t.$id === 'orders' || t.$id === 'bills') && cols.get('normalizedText')?.required) {
      errors.push(`${where}: normalizedText must be optional`);
    }
  }
  return errors;
}

function readEnv(env) {
  const out = {};
  const missing = [];
  for (const k of ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY']) {
    if (!env[k]) missing.push(k);
    out[k] = env[k];
  }
  return { out, missing };
}

function client({ APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY }) {
  const base = APPWRITE_ENDPOINT.replace(/\/+$/, '');
  return async function api(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
        'X-Appwrite-Key': APPWRITE_API_KEY,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      const err = new Error(`${method} ${path} -> ${res.status} ${json?.message ?? ''}`.trim());
      err.status = res.status;
      throw err;
    }
    return json;
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(label, check, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await check()) return;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export async function apply(config, env = process.env, log = console.log) {
  const { out, missing } = readEnv(env);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const api = client(out);
  const notFound = (e) => e.status === 404;

  for (const db of config.tablesDB) {
    try {
      await api('GET', `/tablesdb/${db.$id}`);
      log(`database ${db.$id}: exists`);
    } catch (e) {
      if (!notFound(e)) throw e;
      await api('POST', '/tablesdb', {
        databaseId: db.$id,
        name: db.name,
        enabled: db.enabled !== false,
      });
      log(`database ${db.$id}: created`);
    }
  }

  for (const t of config.tables) {
    const tp = `/tablesdb/${t.databaseId}/tables/${t.$id}`;
    const props = {
      name: t.name,
      permissions: t.$permissions,
      rowSecurity: t.rowSecurity,
      enabled: t.enabled !== false,
    };
    try {
      await api('GET', tp);
      await api('PUT', tp, props);
      log(`table ${t.$id}: updated`);
    } catch (e) {
      if (!notFound(e)) throw e;
      await api('POST', `/tablesdb/${t.databaseId}/tables`, { tableId: t.$id, ...props });
      log(`table ${t.$id}: created`);
    }

    const existingCols = new Map(
      ((await api('GET', `${tp}/columns`))?.columns ?? []).map((c) => [c.key, c]),
    );
    for (const c of t.columns) {
      if (existingCols.has(c.key)) continue;
      const body = { key: c.key, required: c.required, array: c.array };
      if (c.type === 'string') body.size = c.size;
      if (c.default !== undefined && c.default !== null) body.default = c.default;
      await api('POST', `${tp}/columns/${c.type}`, body);
      log(`  column ${t.$id}.${c.key}: created`);
    }
    await waitFor(`columns of ${t.$id}`, async () => {
      const cols = (await api('GET', `${tp}/columns`))?.columns ?? [];
      const failed = cols.find((c) => c.status === 'failed');
      if (failed) throw new Error(`column ${t.$id}.${failed.key} failed: ${failed.error ?? ''}`);
      return t.columns.every((c) => cols.find((x) => x.key === c.key)?.status === 'available');
    });

    const existingIdx = new Set(
      ((await api('GET', `${tp}/indexes`))?.indexes ?? []).map((i) => i.key),
    );
    for (const i of t.indexes) {
      if (existingIdx.has(i.key)) continue;
      await api('POST', `${tp}/indexes`, {
        key: i.key,
        type: i.type,
        columns: i.columns,
        orders: i.orders,
      });
      log(`  index ${t.$id}.${i.key}: created`);
    }
    await waitFor(`indexes of ${t.$id}`, async () => {
      const idxs = (await api('GET', `${tp}/indexes`))?.indexes ?? [];
      const failed = idxs.find((i) => i.status === 'failed');
      if (failed) throw new Error(`index ${t.$id}.${failed.key} failed: ${failed.error ?? ''}`);
      return t.indexes.every((i) => idxs.find((x) => x.key === i.key)?.status === 'available');
    });
  }
  log('Appwrite schema is up to date.');
}

async function main() {
  const config = loadConfig();
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error('Invalid appwrite/appwrite.json:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  if (process.argv.includes('--dry-run')) {
    const cols = config.tables.reduce((n, t) => n + t.columns.length, 0);
    console.log(`OK: ${config.tables.length} tables, ${cols} columns. Nothing was sent.`);
    return;
  }
  try {
    await apply(config);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
