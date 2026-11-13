import { describe, expect, it } from 'vitest';
import type { BillRecord } from '@awaaz-kit/local-data';
import { todayFinalizedTotalPaise } from './todayTotal';

const now = new Date(2026, 0, 15, 12, 0, 0);
const mk = (o: Partial<BillRecord>): BillRecord => ({
  id: 'b',
  shopId: 's',
  receiptNumber: '1',
  kind: 'sale',
  correctsBillId: null,
  customerId: null,
  status: 'finalized',
  subtotalPaise: 0,
  discountPaise: 0,
  taxPaise: 0,
  totalPaise: 0,
  rawTranscript: '',
  normalizedText: '',
  mutationId: 'm',
  syncState: 'pending',
  createdAt: now.toISOString(),
  finalizedAt: now.toISOString(),
  ...o,
});

describe('todayFinalizedTotalPaise', () => {
  it('sums today sales, skipping other days, drafts and voided sales', () => {
    const bills = [
      mk({ id: 'a', totalPaise: 10050 }),
      mk({ id: 'b', totalPaise: 500 }),
      mk({ id: 'c', totalPaise: 999, finalizedAt: new Date(2026, 0, 14, 12).toISOString() }),
      mk({ id: 'd', totalPaise: 777, status: 'draft', finalizedAt: null }),
      mk({ id: 'v', kind: 'void', correctsBillId: 'b', totalPaise: 500 }),
    ];
    expect(todayFinalizedTotalPaise(bills, now)).toBe(10050);
  });
});
