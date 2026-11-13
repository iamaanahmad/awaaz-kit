import { useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import { confirm, type UserConfirmationEvidence } from '@awaaz-kit/confirmation-engine';
import { BillingWorkflowAdapter, formatRupees, summarizeDraft } from '@awaaz-kit/domain-billing';
import { ReviewCard } from '@awaaz-kit/shared-ui';
import { setPendingConfirmed } from '../capture/confirmedActionStore';
import { setBillDraft, useBillDraft } from '../capture/billDraftStore';

export default function Review(): ReactElement {
  const draft = useBillDraft();
  const navigate = useNavigate();
  const adapter = useMemo(() => new BillingWorkflowAdapter(), []);
  const [error, setError] = useState<string | null>(null);

  if (!draft) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="text-2xl font-bold">Review</h1>
        <p>No bill in progress.</p>
        <Link to="/capture" className="underline underline-offset-4">
          Start a new bill
        </Link>
      </main>
    );
  }

  const summary = summarizeDraft(draft);
  const issues = adapter.validate(draft);
  const canConfirm = adapter.canConfirm(draft);

  // Review only mints the ConfirmedAction and hands it to Finalize, which commits it.
  const onConfirm = (evidence: UserConfirmationEvidence): void => {
    setError(null);
    try {
      const action = confirm(adapter, draft, evidence);
      setPendingConfirmed(draft.id, action);
      void navigate(`/finalize/${draft.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm the bill.');
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Review</h1>
        <Link to="/lines" className="underline underline-offset-4">
          Back to lines
        </Link>
      </header>

      <ReviewCard
        title="Review bill"
        revision={draft.revision}
        issues={issues}
        canConfirm={canConfirm}
        confirmLabel="Finalize"
        onConfirm={onConfirm}
        onDiscard={() => {
          setBillDraft(null);
          void navigate('/');
        }}
      >
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
            {draft.lines.map((l, i) => (
              <tr key={l.lineId}>
                <td>{l.product.value?.name ?? l.spokenName}</td>
                <td>
                  {l.quantityMilli.value === null ? '—' : l.quantityMilli.value / 1000}{' '}
                  {l.unit.value ?? ''}
                </td>
                <td className="text-right tabular-nums">
                  {l.price.value === null ? '—' : formatRupees(l.price.value)}
                </td>
                <td className="text-right tabular-nums">
                  {formatRupees(summary.totals.lineTotals[i] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-3 flex flex-col gap-1" data-testid="totals">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd data-testid="subtotal" className="tabular-nums">
              {formatRupees(summary.totals.subtotalPaise)}
            </dd>
          </div>
          {draft.discountPaise > 0 ? (
            <div className="flex justify-between">
              <dt>Discount</dt>
              <dd className="tabular-nums">−{formatRupees(draft.discountPaise)}</dd>
            </div>
          ) : null}
          {draft.taxEnabled ? (
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd className="tabular-nums">{formatRupees(draft.taxPaise)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-bold">
            <dt>Total</dt>
            <dd data-testid="total" className="tabular-nums">
              {formatRupees(summary.totals.totalPaise)}
            </dd>
          </div>
        </dl>
      </ReviewCard>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
