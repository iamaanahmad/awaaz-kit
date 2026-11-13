import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import type { OrderWithItems } from '@awaaz-kit/local-data';
import { SyncBadge } from '@awaaz-kit/shared-ui';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useData } from '../providers/AppProviders';
import { formatQty, formatRupees, toSyncBadgeState } from '../orders/orderView';
import { useCustomerNames } from '../orders/useCustomerNames';

export default function OrderDetail(): ReactElement {
  const { id = '' } = useParams();
  const { repos } = useData();
  // Wrap so "not found" (undefined result) is distinguishable from "still loading".
  const result = useLiveQuery<{ value: OrderWithItems | undefined }>(
    () => ({
      subscribe: (observer) =>
        repos.orders
          .watch(id)
          .subscribe({ ...observer, next: (v) => observer.next?.({ value: v }) }),
    }),
    [repos, id],
  );
  const names = useCustomerNames();

  const back = (
    <Link to="/orders" className="inline-block min-h-[44px] py-2 underline">
      Back to orders
    </Link>
  );

  if (result === undefined) return <p role="status">Loading order…</p>;
  const found = result.value;
  if (found === undefined) {
    return (
      <section>
        <h2 className="text-lg font-semibold">Order not found</h2>
        {back}
      </section>
    );
  }

  const { order, items } = found;
  const customer = order.walkIn ? 'Walk-in' : (names.get(order.customerId ?? '') ?? 'Customer');

  return (
    <section className="space-y-3" aria-labelledby="order-heading">
      {back}
      <h2 id="order-heading" className="text-lg font-semibold">
        Order {order.localNumber}
      </h2>
      <SyncBadge state={toSyncBadgeState(order.syncState)} />
      {order.syncState === 'conflict' && order.conflict ? (
        <p role="alert">Conflict: {order.conflict.message}</p>
      ) : null}
      <dl className="space-y-1">
        <div>
          <dt className="text-sm">Customer</dt>
          <dd>{customer}</dd>
        </div>
        <div>
          <dt className="text-sm">Status</dt>
          <dd>{order.status}</dd>
        </div>
        <div>
          <dt className="text-sm">Fulfillment</dt>
          <dd>{order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</dd>
        </div>
        <div>
          <dt className="text-sm">Saved</dt>
          <dd>{new Date(order.createdAt).toLocaleString()}</dd>
        </div>
        {order.note ? (
          <div>
            <dt className="text-sm">Note</dt>
            <dd>{order.note}</dd>
          </div>
        ) : null}
      </dl>
      <h3 className="font-semibold">Items</h3>
      <ul className="space-y-2">
        {[...items]
          .sort((a, b) => a.index - b.index)
          .map((it) => (
            <li key={it.id} className="rounded-md border p-3">
              <span className="font-medium">{it.nameSnapshot}</span>
              <span className="block text-sm">
                {formatQty(it.qtyMilli)} {it.unit}
                {it.unitPricePaise !== null
                  ? ` × ${formatRupees(it.unitPricePaise)}`
                  : ' · price not set'}
                {it.lineTotalPaise !== null ? ` = ${formatRupees(it.lineTotalPaise)}` : ''}
              </span>
            </li>
          ))}
      </ul>
      <p className="font-semibold">Estimated total: {formatRupees(order.totalEstimatePaise)}</p>
    </section>
  );
}
