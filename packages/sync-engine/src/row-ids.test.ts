import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SyncError } from './contracts';
import { entityRowId, headerRowId, isValidAppwriteId, itemRowId, uuidV5 } from './row-ids';

describe('uuidV5', () => {
  it('matches the RFC 4122 DNS namespace vector', () => {
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });
});

describe('row ids', () => {
  const m = { mutationId: '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b' };

  it('uses mutationId for headers and entity id for catalog rows', () => {
    expect(headerRowId(m)).toBe(m.mutationId);
    expect(entityRowId('prod-1')).toBe('prod-1');
  });

  it('derives stable, distinct item ids', () => {
    expect(itemRowId(m, 0)).toBe(itemRowId(m, 0));
    expect(itemRowId(m, 0)).not.toBe(itemRowId(m, 1));
    expect(itemRowId(m, 0)).not.toBe(m.mutationId);
  });

  it('produces Appwrite-valid ids for arbitrary mutations and indexes', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.integer({ min: 0, max: 10_000 }), (mutationId, i) => {
        const id = itemRowId({ mutationId }, i);
        expect(id.length).toBeLessThanOrEqual(36);
        expect(isValidAppwriteId(id)).toBe(true);
        expect(itemRowId({ mutationId }, i)).toBe(id);
      }),
    );
  });

  it('rejects invalid Appwrite ids', () => {
    expect(isValidAppwriteId('_abc')).toBe(false);
    expect(isValidAppwriteId('a'.repeat(37))).toBe(false);
    expect(isValidAppwriteId('')).toBe(false);
  });
});

describe('SyncError', () => {
  it('carries its kind', () => {
    const e = new SyncError('auth', 'nope');
    expect(e.kind).toBe('auth');
    expect(e).toBeInstanceOf(Error);
  });
});
