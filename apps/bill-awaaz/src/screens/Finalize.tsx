import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { commitConfirmed, type BillWithItems, type CommitResult } from '@awaaz-kit/local-data';
import { formatRupees } from '@awaaz-kit/domain-billing';
import { clearPendingConfirmed, peekPendingConfirmed } from '../capture/confirmedActionStore';
import { setBillDraft } from '../capture/billDraftStore';
import { useLive, useShops } from '../data/homeHooks';
import { useServices } from '../providers/AppProviders';

type Phase =
  | { kind: 'saving' }
  | { kind: 'done'; result: CommitResult }
  | { kind: 'error'; message: string }
  | { kind: 'missing' };

const qtyLabel = (milli: number): string => String(milli / 1000);

/** Plain-text receipt used by Web Share and the copy fallback. No tax-invoice claims. */
export function receiptSummary(shopName: string, detail: BillWithItems): string {
  const { bill, items } = detail;
  const lines = items
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(
      (it) =>
        `${it.nameSnapshot} ${qtyLabel(it.qtyMilli)} ${it.unit} = ${formatRupees(it.lineTotalPaise)}`,
    );
  return [
    `Cash memo / receipt #${bill.receiptNumber}`,
    shopName,
    ...lines,
    `Total: ${formatRupees(bill.totalPaise)}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export default function Finalize(): ReactElement {
  const { id = '' } = useParams();
  const { db, repos } = useServices();
  const shops = useShops();
  const [phase, setPhase] = useState<Phase>({ kind: 'saving' });
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Guard against double-invocation (StrictMode): commit at most once per mount.
    if (started.current) return;
    started.current = true;
    const action = peekPendingConfirmed(id);
    if (action === null) {
      setPhase({ kind: 'missing' });
      return;
    }
    commitConfirmed(db, action)
      .then((result) => {
        clearPendingConfirmed();
        setBillDraft(null);
        setPhase({ kind: 'done', result });
      })
      .catch((e: unknown) => {
        // Keep the confirmed action so the user can retry the save.
        started.current = false;
        setPhase({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Could not save the bill.',
        });
      });
  }, [db, id]);

  const retry = (): void => {
    const action = peekPendingConfirmed(id);
    if (action === null) {
      setPhase({ kind: 'missing' });
      return;
    }
    started.current = true;
    setPhase({ kind: 'saving' });
    commitConfirmed(db, action)
      .then((result) => {
        clearPendingConfirmed();
        setBillDraft(null);
        setPhase({ kind: 'done', result });
      })
      .catch((e: unknown) => {
        started.current = false;
        setPhase({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Could not save the bill.',
        });
      });
  };

  const recordId = phase.kind === 'done' ? phase.result.recordId : '';
  const detail = useLive(() => repos.bills.watch(recordId), [repos, recordId]);

  if (phase.kind === 'saving') return <p role="status">Saving bill…</p>;

  if (phase.kind === 'missing') {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="text-2xl font-bold">Finalize</h1>
        <p role="alert">
          There is no confirmed bill to save here. Nothing was saved from this page.
        </p>
        <Link to="/bills" className="underline underline-offset-4">
          Check Bills
        </Link>
      </main>
    );
  }

  if (phase.kind === 'error') {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
        <h1 className="text-2xl font-bold">Finalize</h1>
        <p role="alert">The bill was not saved. {phase.message}</p>
        <button
          type="button"
          onClick={retry}
          className="touch-target ak-btn ak-btn-secondary"
        >
          Try saving again
        </button>
        <Link to="/review" className="underline underline-offset-4">
          Back to review
        </Link>
      </main>
    );
  }

  const shopName = detail ? (shops?.find((s) => s.id === detail.bill.shopId)?.name ?? '') : '';
  const summary = detail ? receiptSummary(shopName, detail) : '';

  const share = async (): Promise<void> => {
    setNotice(null);
    try {
      await navigator.share({ title: 'Cash memo / receipt', text: summary });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        setNotice('Sharing did not work. Try Copy summary.');
    }
  };
  const copy = async (): Promise<void> => {
    setNotice(null);
    try {
      await navigator.clipboard.writeText(summary);
      setNotice('Summary copied.');
    } catch {
      setNotice('Could not copy. Select the receipt text and copy it manually.');
    }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <div role="status" className="print:hidden">
        {phase.result.status === 'already_exists'
          ? `This bill was already saved earlier as #${phase.result.number}. Nothing new was added.`
          : `Bill saved. Receipt #${phase.result.number}.`}
      </div>
      {detail ? (
        <article
          aria-labelledby="receipt-title"
          className="receipt flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <header>
            <h1 id="receipt-title" className="text-xl font-bold">
              Cash memo / receipt
            </h1>
            <p className="text-sm">{shopName}</p>
            <p className="text-sm text-muted">
              #{detail.bill.receiptNumber} ·{' '}
              {new Date(detail.bill.finalizedAt ?? detail.bill.createdAt).toLocaleString()}
            </p>
          </header>
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
              {detail.items
                .slice()
                .sort((a, b) => a.index - b.index)
                .map((it) => (
                  <tr key={it.id}>
                    <td>{it.nameSnapshot}</td>
                    <td>
                      {qtyLabel(it.qtyMilli)} {it.unit}
                    </td>
                    <td className="text-right tabular-nums">{formatRupees(it.unitPricePaise)}</td>
                    <td className="text-right tabular-nums">{formatRupees(it.lineTotalPaise)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatRupees(detail.bill.subtotalPaise)}</dd>
            </div>
            {detail.bill.discountPaise > 0 ? (
              <div className="flex justify-between">
                <dt>Discount</dt>
                <dd className="tabular-nums">−{formatRupees(detail.bill.discountPaise)}</dd>
              </div>
            ) : null}
            {detail.bill.taxPaise > 0 ? (
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd className="tabular-nums">{formatRupees(detail.bill.taxPaise)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatRupees(detail.bill.totalPaise)}</dd>
            </div>
          </dl>
        </article>
      ) : (
        <p role="status">Loading receipt…</p>
      )}
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          disabled={!detail}
          onClick={() => window.print()}
          className="touch-target ak-btn ak-btn-secondary"
        >
          Print
        </button>
        {canShare ? (
          <button
            type="button"
            disabled={!detail}
            onClick={() => void share()}
            className="touch-target ak-btn ak-btn-secondary"
          >
            Share
          </button>
        ) : null}
        <button
          type="button"
          disabled={!detail}
          onClick={() => void copy()}
          className="touch-target ak-btn ak-btn-secondary"
        >
          Copy summary
        </button>
      </div>
      {notice ? (
        <p role="status" className="print:hidden">
          {notice}
        </p>
      ) : null}
      <nav className="flex gap-4 print:hidden" aria-label="Next">
        <Link to="/capture" className="underline underline-offset-4">
          New bill
        </Link>
        <Link to="/bills" className="underline underline-offset-4">
          All bills
        </Link>
      </nav>
    </main>
  );
}
