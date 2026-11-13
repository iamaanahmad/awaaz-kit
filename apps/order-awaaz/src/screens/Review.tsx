import { useId, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import {
  buildReview,
  confirm,
  type UserConfirmationEvidence,
} from '@awaaz-kit/confirmation-engine';
import { OrderWorkflowAdapter, setFulfillment, setNote } from '@awaaz-kit/domain-order';
import { commitConfirmed, type CommitResult, type OrderWithItems } from '@awaaz-kit/local-data';
import { ReviewCard, SyncBadge } from '@awaaz-kit/shared-ui';
import { useResolvedDraft } from '../capture/resolveDraft';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { formatQty, formatRupees, toSyncBadgeState } from '../orders/orderView';
import { useCustomerNames } from '../orders/useCustomerNames';
import { useData, useOrderCapture } from '../providers/AppProviders';

const adapter = new OrderWorkflowAdapter();

function Saved({ result }: { result: CommitResult }): ReactElement {
  const { repos } = useData();
  const order = useLiveQuery<{ value: OrderWithItems | undefined }>(
    () => ({
      subscribe: (observer) =>
        repos.orders.watch(result.recordId).subscribe({
          ...observer,
          next: (v) => observer.next?.({ value: v }),
        }),
    }),
    [repos, result.recordId],
  );
  const record = order?.value?.order;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="saved-heading">
      <h2 id="saved-heading" className="text-lg font-semibold">
        Saved on this device
      </h2>
      <p role="status" aria-live="polite">
        {result.status === 'already_exists'
          ? `Order ${result.number} was already saved.`
          : `Order ${result.number} is saved.`}
      </p>
      {record ? <SyncBadge state={toSyncBadgeState(record.syncState)} /> : null}
      <div className="flex flex-wrap gap-3">
        <Link
          to={`/orders/${result.recordId}`}
          className="touch-target rounded-[var(--radius)] bg-accent px-4 py-3 font-semibold text-accent-contrast"
        >
          View order
        </Link>
        <Link
          to="/"
          className="touch-target rounded-[var(--radius)] border border-border px-4 py-3 font-semibold"
        >
          Home
        </Link>
      </div>
    </section>
  );
}

export default function Review(): ReactElement {
  const { db } = useData();
  const { session, reset } = useOrderCapture();
  const { draft, update } = useResolvedDraft(session.draft);
  const names = useCustomerNames();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<CommitResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const noteId = useId();
  const fulfillmentId = useId();

  const review = useMemo(
    () => (draft ? buildReview(adapter, draft, draft.revision) : null),
    [draft],
  );

  if (saved !== null) return <Saved result={saved} />;

  if (draft === null || review === null) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="review-heading">
        <h2 id="review-heading" className="text-lg font-semibold">
          Review order
        </h2>
        <p role="status">No order to review yet.</p>
        <Link to="/capture" className="touch-target font-semibold underline">
          Back to capture
        </Link>
      </section>
    );
  }

  const onConfirm = (evidence: UserConfirmationEvidence): void => {
    if (pending) return;
    setPending(true);
    setSaveError(null);
    void (async () => {
      try {
        const action = confirm(adapter, draft, evidence);
        const result = await commitConfirmed(db, action);
        setSaved(result);
        reset();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'The order could not be saved.');
      } finally {
        setPending(false);
      }
    })();
  };

  const customer =
    draft.walkIn || draft.customerId === null
      ? 'Walk-in'
      : (names.get(draft.customerId) ?? 'Customer');
  const total = review.draft.lines.reduce((sum, l) => sum + (l.lineTotalPaise ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <ReviewCard
        title="Review order"
        revision={review.revision}
        issues={review.issues}
        canConfirm={review.canConfirm}
        pending={pending}
        confirmLabel="Confirm order"
        onConfirm={onConfirm}
      >
        <dl className="flex flex-col gap-1">
          <div>
            <dt className="text-sm">Customer</dt>
            <dd>{customer}</dd>
          </div>
        </dl>
        <ul className="my-3 flex flex-col gap-2" aria-label="Items">
          {draft.lines.map((l) => (
            <li key={l.lineId} className="rounded-md border border-border p-3">
              <span className="font-medium">{l.product.value?.name ?? l.spokenName}</span>
              <span className="block text-sm">
                {l.quantityMilli.value === null
                  ? 'Quantity missing'
                  : formatQty(l.quantityMilli.value)}{' '}
                {l.unit.value ?? 'unit missing'}
                {l.unitPricePaise !== null
                  ? ` × ${formatRupees(l.unitPricePaise)}`
                  : ' · price not set'}
                {l.lineTotalPaise !== null ? ` = ${formatRupees(l.lineTotalPaise)}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={fulfillmentId}>Delivery or pickup</label>
            <select
              id={fulfillmentId}
              value={draft.fulfillment}
              onChange={(e) =>
                update((d) =>
                  setFulfillment(d, e.target.value === 'delivery' ? 'delivery' : 'pickup'),
                )
              }
              disabled={pending}
              className="touch-target rounded-[var(--radius)] border border-border bg-white p-2"
            >
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={noteId}>Note (optional)</label>
            <textarea
              id={noteId}
              value={draft.note}
              onChange={(e) => update((d) => setNote(d, e.target.value))}
              disabled={pending}
              rows={2}
              className="rounded-[var(--radius)] border border-border bg-white p-2"
            />
          </div>
          <p className="font-semibold">Estimated total: {formatRupees(total)}</p>
        </div>
      </ReviewCard>
      {saveError !== null ? (
        <p role="alert" className="text-danger">
          Could not save the order: {saveError} Your draft is still here. Try again.
        </p>
      ) : null}
      <Link to="/resolve" className="touch-target font-semibold underline">
        Back to resolve
      </Link>
    </div>
  );
}
