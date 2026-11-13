import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { SyncBadge } from '@awaaz-kit/shared-ui';
import { useRecentOrders } from '../hooks/useLiveQuery';
import {
  STATUS_OPTIONS,
  SYNC_OPTIONS,
  filterOrders,
  formatRupees,
  toSyncBadgeState,
  type StatusFilter,
  type SyncFilter,
} from '../orders/orderView';
import { useCustomerNames } from '../orders/useCustomerNames';

const fieldClass = 'min-h-[44px] w-full rounded-md border px-3';

export default function Orders(): ReactElement {
  const orders = useRecentOrders(500);
  const names = useCustomerNames();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [syncState, setSyncState] = useState<SyncFilter>('all');

  const visible = useMemo(
    () => (orders ? filterOrders(orders, { query, status, syncState }, names) : []),
    [orders, query, status, syncState, names],
  );

  return (
    <section className="space-y-3" aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="text-lg font-semibold">
        Orders
      </h2>
      <div className="space-y-2">
        <label className="block">
          <span className="text-sm">Search by order number or customer</span>
          <input
            type="search"
            className={fieldClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm">Status</span>
          <select
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm">Sync state</span>
          <select
            className={fieldClass}
            value={syncState}
            onChange={(e) => setSyncState(e.target.value as SyncFilter)}
          >
            {SYNC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {orders === undefined ? (
        <p role="status">Loading orders…</p>
      ) : visible.length === 0 ? (
        <p role="status">
          {orders.length === 0 ? 'No saved orders yet.' : 'No orders match these filters.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((o) => (
            <li key={o.id} className="rounded-md border">
              <Link to={`/orders/${o.id}`} className="block min-h-[44px] p-3">
                <span className="font-medium">{o.localNumber}</span>
                <span className="block text-sm">
                  {o.walkIn ? 'Walk-in' : (names.get(o.customerId ?? '') ?? 'Customer')} ·{' '}
                  {formatRupees(o.totalEstimatePaise)} · {o.status}
                </span>
                <SyncBadge state={toSyncBadgeState(o.syncState)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
