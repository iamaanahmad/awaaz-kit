import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  AwaazDb,
  MutationSchema,
  OrderBundleSchema,
  OrderItemRecordSchema,
  DB_V1_STORES,
} from './index.js';

const ts = '2026-01-01T00:00:00.000Z';

describe('Dexie v1 schema', () => {
  it('declares ten stores at version 1', async () => {
    const db = new AwaazDb('t-' + Math.random(), { indexedDB: new IDBFactory(), IDBKeyRange });
    await db.open();
    expect(db.verno).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(DB_V1_STORES).sort());
    expect(db.tables).toHaveLength(10);
    db.close();
  });

  it('enforces unique [shopId+localNumber] on orders', async () => {
    const db = new AwaazDb('t-' + Math.random(), { indexedDB: new IDBFactory(), IDBKeyRange });
    const order = {
      id: 'o1',
      shopId: 's',
      localNumber: 'ORD-0001',
      customerId: null,
      walkIn: true,
      status: 'confirmed' as const,
      fulfillment: 'pickup' as const,
      note: null,
      totalEstimatePaise: 0,
      rawTranscript: '',
      normalizedText: '',
      extraction: null,
      mutationId: 'm1',
      syncState: 'local_only' as const,
      createdAt: ts,
      updatedAt: ts,
    };
    await db.orders.add(order);
    await expect(db.orders.add({ ...order, id: 'o2' })).rejects.toThrow();
    db.close();
  });
});

describe('Zod schemas', () => {
  it('rejects non-integer quantities and accepts a valid bundle', () => {
    const item = {
      id: 'i1',
      orderId: 'o1',
      index: 0,
      productId: null,
      nameSnapshot: 'Atta',
      qtyMilli: 1500,
      unit: 'kg',
      unitPricePaise: 4000,
      lineTotalPaise: 6000,
      resolutionStatus: 'confirmed',
    };
    expect(OrderItemRecordSchema.safeParse(item).success).toBe(true);
    expect(OrderItemRecordSchema.safeParse({ ...item, qtyMilli: 1.5 }).success).toBe(false);

    const bundle = {
      kind: 'order',
      order: {
        id: 'o1',
        shopId: 's',
        customerId: null,
        walkIn: true,
        status: 'confirmed',
        fulfillment: 'pickup',
        note: null,
        totalEstimatePaise: 6000,
        rawTranscript: 'r',
        normalizedText: 'n',
        extraction: {},
        mutationId: 'm1',
        createdAt: ts,
      },
      items: [item],
      auditEvent: {
        id: 'a1',
        entityType: 'order',
        entityId: 'o1',
        action: 'confirm',
        actor: 'local_user',
        createdAt: ts,
        metadata: {},
      },
    };
    expect(OrderBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it('validates a Mutation with a UUID id', () => {
    const m = {
      mutationId: '5b0f7a3e-2f6e-4a7b-9c1d-3e8f1a2b4c5d',
      entityType: 'product',
      entityId: 'p1',
      operation: 'upsert',
      createdAt: ts,
      attempts: 0,
      nextAttemptAt: ts,
      state: 'pending',
      lastError: null,
      payload: {
        kind: 'product',
        product: {
          id: 'p1',
          shopId: 's',
          name: 'Atta',
          aliases: [],
          unit: 'kg',
          pricePaise: 4000,
          active: true,
          updatedAt: ts,
          deletedAt: null,
        },
      },
    };
    expect(MutationSchema.safeParse(m).success).toBe(true);
  });
});
