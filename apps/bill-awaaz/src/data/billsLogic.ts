import { formatRupees } from '@awaaz-kit/domain-billing';
import type { ValidationIssue, WorkflowAdapter } from '@awaaz-kit/confirmation-engine';
import type {
  BillItemRecord,
  BillRecord,
  CorrectionBundle,
  SyncState,
} from '@awaaz-kit/local-data';
import type { SyncBadgeState } from '@awaaz-kit/shared-ui';

export type BillFilter = 'all' | 'sales' | 'voids' | 'corrections' | 'unsynced';

/** Bills that a finalized void points at (sales shown as voided). */
export function voidedBillIds(bills: readonly BillRecord[]): Set<string> {
  return new Set(
    bills
      .filter((b) => b.kind === 'void' && b.status === 'finalized' && b.correctsBillId)
      .map((b) => b.correctsBillId as string),
  );
}

/** Search by receipt number or transcript text, then filter by kind or sync state (Req 13.15). */
export function filterBills(
  bills: readonly BillRecord[],
  query: string,
  filter: BillFilter,
): BillRecord[] {
  const q = query.trim().toLowerCase();
  return bills.filter((b) => {
    if (filter === 'sales' && b.kind !== 'sale') return false;
    if (filter === 'voids' && b.kind !== 'void') return false;
    if (filter === 'corrections' && b.kind !== 'correction') return false;
    if (filter === 'unsynced' && b.syncState === 'synced') return false;
    if (!q) return true;
    return (
      b.receiptNumber.toLowerCase().includes(q) ||
      b.rawTranscript.toLowerCase().includes(q) ||
      b.normalizedText.toLowerCase().includes(q)
    );
  });
}

/** Maps a record Sync_State to the shared badge state (Req 16.9). */
export function syncBadgeState(state: SyncState): SyncBadgeState {
  switch (state) {
    case 'local_only':
      return { kind: 'local-only' };
    case 'pending':
      return { kind: 'pending', count: 1 };
    case 'syncing':
      return { kind: 'syncing' };
    case 'synced':
      return { kind: 'synced' };
    case 'failed':
      return { kind: 'failed' };
    case 'conflict':
      return { kind: 'conflict' };
  }
}

/** Parses a signed rupee amount ("-50", "12.5") into integer Paise; null when invalid. */
export function parseSignedRupees(text: string): number | null {
  const m = /^\s*([+-])?\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const paise = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(paise)) return null;
  return m[1] === '-' ? -paise : paise;
}

/** Like formatRupees but shows a leading minus for reversal records. */
export function formatSignedRupees(paise: number): string {
  return paise < 0 ? `-${formatRupees(-paise)}` : formatRupees(paise);
}

export interface CorrectionDraft {
  id: string;
  mutationId: string;
  kind: 'void' | 'correction';
  original: BillRecord;
  originalItems: readonly BillItemRecord[];
  /** Signed Paise change applied by a correction; ignored for voids. */
  adjustmentPaise: number;
  reason: string;
  createdAt: string;
}

/**
 * Builds a void or correction record linked to a finalized sale. The original bill is
 * never modified (Req 13.14). Pass it to `confirm()` and then `commitConfirmed`.
 */
export const correctionAdapter: WorkflowAdapter<CorrectionDraft> & {
  toBundle(draft: CorrectionDraft): CorrectionBundle;
} = {
  id: 'bill',
  parse() {
    throw new Error('Corrections are created from an existing bill, not from text.');
  },
  validate(draft): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (draft.original.status !== 'finalized' || draft.original.kind !== 'sale') {
      issues.push({
        code: 'invalid_target',
        message: 'Only a finalized sale can be voided or corrected.',
      });
    }
    if (draft.kind === 'correction' && draft.adjustmentPaise === 0) {
      issues.push({
        code: 'zero_adjustment',
        field: 'adjustment',
        message: 'Enter a non-zero adjustment.',
      });
    }
    return issues;
  },
  canConfirm(draft) {
    return correctionAdapter.validate(draft).length === 0;
  },
  toBundle(draft) {
    if (!correctionAdapter.canConfirm(draft)) throw new Error('Correction is not confirmable.');
    const o = draft.original;
    const isVoid = draft.kind === 'void';
    // A void reverses the original line by line; a correction carries only the adjustment.
    const items: BillItemRecord[] = isVoid
      ? draft.originalItems.map((it, index) => ({
          id: `${draft.mutationId}:item:${it.id}`,
          billId: draft.id,
          index,
          productId: it.productId,
          nameSnapshot: it.nameSnapshot,
          qtyMilli: -it.qtyMilli,
          unit: it.unit,
          unitPricePaise: it.unitPricePaise,
          lineTotalPaise: -it.lineTotalPaise,
        }))
      : [];
    const total = isVoid ? -o.totalPaise : draft.adjustmentPaise;
    return {
      kind: 'correction',
      bill: {
        id: draft.id,
        shopId: o.shopId,
        kind: draft.kind,
        correctsBillId: o.id,
        customerId: o.customerId,
        status: 'finalized',
        subtotalPaise: isVoid ? -o.subtotalPaise : total,
        discountPaise: isVoid ? -o.discountPaise : 0,
        taxPaise: isVoid ? -o.taxPaise : 0,
        totalPaise: total,
        rawTranscript: '',
        normalizedText: '',
        mutationId: draft.mutationId,
        createdAt: draft.createdAt,
        finalizedAt: draft.createdAt,
      },
      items,
      auditEvent: {
        id: `${draft.mutationId}:audit`,
        entityType: 'bill',
        entityId: draft.id,
        action: isVoid ? 'bill_voided' : 'bill_corrected',
        actor: 'local_user',
        createdAt: draft.createdAt,
        // Reason text is user-entered; only its length is recorded.
        metadata: { correctsBillId: o.id, totalPaise: total, reasonLength: draft.reason.length },
      },
    };
  },
};
