import { useMemo, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { confirm, type UserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { commitConfirmed, type BillRecord, type BillWithItems } from '@awaaz-kit/local-data';
import { ConfirmButton, SyncBadge } from '@awaaz-kit/shared-ui';
import {
  correctionAdapter,
  formatSignedRupees,
  parseSignedRupees,
  syncBadgeState,
  type CorrectionDraft,
} from '../data/billsLogic';
import { useLive, useRecentBills, useShops } from '../data/homeHooks';
import { useServices } from '../providers/AppProviders';

const qtyLabel = (milli: number): string => String(milli / 1000);

/** Void/correction rows pointing at a bill, kept live from the shop's recent bills. */
function useCorrections(billId: string, shopId: string | undefined): BillRecord[] | undefined {
  const recent = useRecentBills(shopId, 500);
  return useMemo(
    () =>
      shopId === undefined || recent === undefined
        ? undefined
        : recent.filter((b) => b.correctsBillId === billId),
    [recent, billId, shopId],
  );
}

function CorrectionPanel({ detail }: { detail: BillWithItems }): ReactElement {
  const { db } = useServices();
  const [kind, setKind] = useState<'void' | 'correction'>('void');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adjustment = kind === 'correction' ? parseSignedRupees(amount) : 0;
  const draft: CorrectionDraft = {
    id: '',
    mutationId: '',
    kind,
    original: detail.bill,
    originalItems: detail.items,
    adjustmentPaise: adjustment ?? 0,
    reason,
    createdAt: '',
  };
  const valid = correctionAdapter.canConfirm(draft) && adjustment !== null;
  const disabledReason =
    kind === 'correction' && adjustment === null
      ? 'Enter the adjustment in rupees, for example -50 or 20.50.'
      : kind === 'correction' && adjustment === 0
        ? 'Enter a non-zero adjustment.'
        : undefined;

  const submit = async (evidence: UserConfirmationEvidence): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const action = confirm(
        correctionAdapter,
        { ...draft, id: crypto.randomUUID(), mutationId: crypto.randomUUID(), createdAt: now },
        evidence,
      );
      await commitConfirmed(db, action);
      setAmount('');
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the correction.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="correct-heading"
      className="flex flex-col gap-3 rounded-xl border border-border p-4 print:hidden"
    >
      <h2 id="correct-heading" className="text-lg font-semibold">
        Void or correct this bill
      </h2>
      <p className="text-sm text-muted">
        The original bill stays unchanged. A new linked record is saved instead.
      </p>
      <label htmlFor="correction-kind" className="text-sm font-medium">
        Action
      </label>
      <select
        id="correction-kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as 'void' | 'correction')}
        className="touch-target ak-input"
      >
        <option value="void">Void the whole bill</option>
        <option value="correction">Correct the amount</option>
      </select>
      {kind === 'correction' ? (
        <>
          <label htmlFor="correction-amount" className="text-sm font-medium">
            Adjustment in rupees (negative to reduce)
          </label>
          <input
            id="correction-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="touch-target ak-input"
          />
        </>
      ) : null}
      <label htmlFor="correction-reason" className="text-sm font-medium">
        Reason (optional)
      </label>
      <input
        id="correction-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="touch-target ak-input"
      />
      <ConfirmButton
        canConfirm={valid}
        revision={0}
        pending={pending}
        label={kind === 'void' ? 'Confirm void' : 'Confirm correction'}
        disabledReason={disabledReason}
        onConfirm={(ev) => void submit(ev)}
      />
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

export default function BillDetail(): ReactElement {
  const { id = '' } = useParams();
  const { repos } = useServices();
  const shops = useShops();
  const detail = useLive(() => repos.bills.watch(id), [repos, id]);
  const corrections = useCorrections(id, detail?.bill.shopId);

  if (detail === undefined && shops === undefined) return <p role="status">Loading…</p>;
  if (!detail) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p role="alert">Bill not found.</p>
        <Link to="/bills" className="underline underline-offset-4">
          Back to Bills
        </Link>
      </main>
    );
  }

  const { bill, items } = detail;
  const shop = shops?.find((s) => s.id === bill.shopId);
  const isVoided = (corrections ?? []).some((c) => c.kind === 'void' && c.status === 'finalized');
  const canCorrect = bill.kind === 'sale' && bill.status === 'finalized' && !isVoided;
  const title =
    bill.kind === 'void'
      ? 'Void record'
      : bill.kind === 'correction'
        ? 'Correction record'
        : 'Cash memo / receipt';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <nav className="flex items-center justify-between print:hidden" aria-label="Bill">
        <Link to="/bills" className="underline underline-offset-4">
          Back to Bills
        </Link>
        <SyncBadge state={syncBadgeState(bill.syncState)} />
      </nav>

      <article
        aria-labelledby="receipt-title"
        className="receipt flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <header>
          <h1 id="receipt-title" className="text-xl font-bold">
            {title}
          </h1>
          <p className="text-sm">{shop?.name ?? ''}</p>
          <p className="text-sm text-muted">
            #{bill.receiptNumber} · {new Date(bill.finalizedAt ?? bill.createdAt).toLocaleString()}
          </p>
          {isVoided ? <p className="font-semibold">Voided</p> : null}
        </header>

        {items.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th scope="col">Item</th>
                <th scope="col">Qty</th>
                <th scope="col" className="text-right">
                  Price
                </th>
                <th scope="col" className="text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {items
                .slice()
                .sort((a, b) => a.index - b.index)
                .map((it) => (
                  <tr key={it.id}>
                    <td>{it.nameSnapshot}</td>
                    <td>
                      {qtyLabel(it.qtyMilli)} {it.unit}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatSignedRupees(it.unitPricePaise)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatSignedRupees(it.lineTotalPaise)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No line items on this record.</p>
        )}

        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatSignedRupees(bill.subtotalPaise)}</dd>
          </div>
          {bill.discountPaise !== 0 ? (
            <div className="flex justify-between">
              <dt>Discount</dt>
              <dd className="tabular-nums">{formatSignedRupees(bill.discountPaise)}</dd>
            </div>
          ) : null}
          {bill.taxPaise !== 0 ? (
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd className="tabular-nums">{formatSignedRupees(bill.taxPaise)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatSignedRupees(bill.totalPaise)}</dd>
          </div>
        </dl>
      </article>

      {bill.correctsBillId ? (
        <p>
          Corrects{' '}
          <Link to={`/bills/${bill.correctsBillId}`} className="underline underline-offset-4">
            the original bill
          </Link>
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => window.print()}
        className="touch-target ak-btn ak-btn-secondary print:hidden"
      >
        Print again
      </button>

      {corrections && corrections.length > 0 ? (
        <section aria-labelledby="linked-heading" className="print:hidden">
          <h2 id="linked-heading" className="text-lg font-semibold">
            Linked records
          </h2>
          <ul className="flex flex-col gap-2">
            {corrections.map((c) => (
              <li key={c.id}>
                <Link to={`/bills/${c.id}`} className="underline underline-offset-4">
                  {c.kind === 'void' ? 'Void' : 'Correction'} #{c.receiptNumber}
                </Link>{' '}
                {formatSignedRupees(c.totalPaise)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canCorrect ? <CorrectionPanel detail={detail} /> : null}
    </main>
  );
}
