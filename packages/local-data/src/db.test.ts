import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LocalDataError, mapDbError, openDb } from './index.js';

describe('openDb', () => {
  it('opens the v1 database', async () => {
    const db = await openDb({ name: 't-open', indexedDB: new IDBFactory() });
    expect(db.isOpen()).toBe(true);
    db.close();
  });

  it('maps open failures to open_failed', async () => {
    const bad = {
      open: () => {
        throw new Error('nope');
      },
    } as unknown as IDBFactory;
    await expect(openDb({ name: 't-bad', indexedDB: bad })).rejects.toMatchObject({
      kind: 'open_failed',
    });
  });

  it('closes the connection on versionchange', async () => {
    const factory = new IDBFactory();
    let notified = false;
    const db = await openDb({
      name: 't-vc',
      indexedDB: factory,
      onVersionChange: () => {
        notified = true;
      },
    });
    // Dexie stores version 1 as IDB version 10; request a higher one.
    const req = factory.open('t-vc', 20);
    await new Promise((r) => {
      req.onsuccess = r;
      req.onerror = r;
    });
    expect(db.isOpen()).toBe(false);
    expect(notified).toBe(true);
    req.result?.close();
  });
});

describe('mapDbError', () => {
  it('maps quota errors', () => {
    const e = mapDbError({ name: 'QuotaExceededError' });
    expect(e).toBeInstanceOf(LocalDataError);
    expect(e.kind).toBe('quota_exceeded');
  });
  it('maps nested quota errors', () => {
    expect(mapDbError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } }).kind).toBe(
      'quota_exceeded',
    );
  });
  it('defaults to open_failed', () => {
    expect(mapDbError(new Error('x')).kind).toBe('open_failed');
  });
});
