import { describe, expect, it } from 'vitest';
import { itemRowId } from './row-ids';
import {
  buildPermissions,
  parseRemoteRow,
  toRemoteRow,
  type BillLike,
  type MutationLike,
  type OrderLike,
} from './remote-row';

const order: OrderLike = {
  id: 'o1',
  localNumber: 'ORD-0001',
  customerId: null,
  walkIn: true,
  status: 'confirmed',
  fulfillment: 'pickup',
  note: null,
  totalEstimatePaise: 5000,
  rawTranscript: 'do kilo chawal',
  normalizedText: '2 kg chawal',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const orderMutation: MutationLike = {
  mutationId: 'm-order-1',
  payload: {
    kind: 'order',
    order,
    items: [
      {
        index: 0,
        productId: 'p1',
        nameSnapshot: 'Rice',
        qtyMilli: 2000,
        unit: 'kg',
        unitPricePaise: 2500,
        lineTotalPaise: 5000,
        resolutionStatus: 'confirmed',
      },
    ],
  },
};
const bill: BillLike = {
  id: 'b1',
  receiptNumber: 'RC-1',
  kind: 'sale',
  correctsBillId: null,
  customerId: null,
  status: 'finalized',
  subtotalPaise: 100,
  discountPaise: 0,
  taxPaise: 0,
  totalPaise: 100,
  rawTranscript: 'raw',
  normalizedText: 'norm',
  createdAt: '2026-01-01T00:00:00.000Z',
  finalizedAt: '2026-01-01T00:00:00.000Z',
};
const billMutation: MutationLike = {
  mutationId: 'm-bill-1',
  payload: { kind: 'bill', bill, items: [] },
};
const base = { remoteShopId: 'team1', deviceId: 'dev1' };

describe('toRemoteRow', () => {
  it('omits transcripts by default and when disabled', () => {
    for (const s of [undefined, { enabled: false }]) {
      for (const m of [orderMutation, billMutation]) {
        const header = toRemoteRow(m, { ...base, syncTranscripts: s }).at(-1)!;
        expect(header.data).not.toHaveProperty('rawTranscript');
        expect(header.data).not.toHaveProperty('normalizedText');
      }
    }
  });

  it('includes transcripts when enabled', () => {
    const header = toRemoteRow(orderMutation, {
      ...base,
      syncTranscripts: { enabled: true },
    }).at(-1)!;
    expect(header.data).toMatchObject({
      rawTranscript: 'do kilo chawal',
      normalizedText: '2 kg chawal',
    });
  });

  it('puts children before the header with deterministic ids', () => {
    const rows = toRemoteRow(orderMutation, base);
    expect(rows.map((r) => r.table)).toEqual(['order_items', 'orders']);
    expect(rows[0]!.rowId).toBe(itemRowId(orderMutation, 0));
    expect(rows[1]!.rowId).toBe('m-order-1');
    expect(rows[0]!.data).toMatchObject({ orderRowId: 'm-order-1', shopId: 'team1' });
  });

  it('validates produced rows against the remote schemas', () => {
    for (const r of [...toRemoteRow(orderMutation, base), ...toRemoteRow(billMutation, base)]) {
      expect(parseRemoteRow(r.table, r.data).ok).toBe(true);
    }
  });

  it('rejects malformed remote rows', () => {
    expect(parseRemoteRow('products', { name: 'x' }).ok).toBe(false);
  });
});

describe('buildPermissions', () => {
  it('makes bills and bill items read-only', () => {
    for (const t of ['bills', 'bill_items'] as const) {
      expect(buildPermissions(t, 'team1')).toEqual({
        read: ['read(team:team1)'],
        update: [],
        delete: [],
      });
    }
  });

  it('gives team update and owner delete on mutable tables', () => {
    expect(buildPermissions('orders', 'team1')).toEqual({
      read: ['read(team:team1)'],
      update: ['update(team:team1)'],
      delete: ['delete(team:team1/owner)'],
    });
  });
});
