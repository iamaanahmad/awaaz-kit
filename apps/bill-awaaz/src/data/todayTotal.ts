import type { BillRecord } from '@awaaz-kit/local-data';

/** True when two instants fall on the same local calendar day. */
export function isSameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Total (integer Paise) of today's finalized sale bills, ignoring sales that have a
 * finalized void row pointing at them (Req 13.2).
 */
export function todayFinalizedTotalPaise(bills: readonly BillRecord[], now: Date): number {
  const voided = new Set(
    bills
      .filter((b) => b.kind === 'void' && b.status === 'finalized' && b.correctsBillId)
      .map((b) => b.correctsBillId),
  );
  let total = 0;
  for (const b of bills) {
    if (b.kind !== 'sale' || b.status !== 'finalized' || !b.finalizedAt) continue;
    if (voided.has(b.id) || !isSameLocalDay(b.finalizedAt, now)) continue;
    total += b.totalPaise;
  }
  return total;
}
