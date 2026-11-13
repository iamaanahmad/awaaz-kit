import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import type { BillRecord } from '@awaaz-kit/local-data';
import { EmptyState, SyncBadge } from '@awaaz-kit/shared-ui';
import { useRecentBills, useShops } from '../data/homeHooks';
import {
  filterBills,
  formatSignedRupees,
  syncBadgeState,
  voidedBillIds,
  type BillFilter,
} from '../data/billsLogic';

const FILTERS: { value: BillFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sales', label: 'Sales' },
  { value: 'voids', label: 'Voids' },
  { value: 'corrections', label: 'Corrections' },
  { value: 'unsynced', label: 'Not synced' },
];

const timeLabel = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function BillRow({ bill, voided }: { bill: BillRecord; voided: boolean }): ReactElement {
  const tag =
    bill.kind === 'void'
      ? 'Void'
      : bill.kind === 'correction'
        ? 'Correction'
        : voided
          ? 'Voided'
          : null;
  return (
    <li>
      <Link
        to={`/bills/${bill.id}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
      >
        <span className="flex flex-col gap-1">
          <span className="font-semibold">
            #{bill.receiptNumber}
            {tag ? <span className="ml-2 text-sm font-normal text-muted">{tag}</span> : null}
          </span>
          <span className="text-sm text-muted">
            {timeLabel(bill.finalizedAt ?? bill.createdAt)}
          </span>
          <SyncBadge state={syncBadgeState(bill.syncState)} />
        </span>
        <span className={`text-lg font-bold tabular-nums ${voided ? 'line-through' : ''}`}>
          {formatSignedRupees(bill.totalPaise)}
        </span>
      </Link>
    </li>
  );
}

export default function Bills(): ReactElement {
  const shops = useShops();
  const shop = shops?.[0];
  const bills = useRecentBills(shop?.id, 500);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BillFilter>('all');

  const voided = useMemo(() => voidedBillIds(bills ?? []), [bills]);
  const visible = useMemo(() => filterBills(bills ?? [], query, filter), [bills, query, filter]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bills</h1>
        <Link to="/" className="underline underline-offset-4">
          Home
        </Link>
      </header>

      <div className="flex flex-col gap-2">
        <label htmlFor="bill-search" className="text-sm font-medium">
          Search by receipt number or items
        </label>
        <input
          id="bill-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-[44px] rounded-md border border-border px-3"
        />
        <label htmlFor="bill-filter" className="text-sm font-medium">
          Show
        </label>
        <select
          id="bill-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as BillFilter)}
          className="min-h-[44px] rounded-md border border-border px-3"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {bills === undefined ? (
        <p role="status">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState lead={bills.length === 0 ? 'Boo!' : 'Hmm.'}>
          <p role="status">{bills.length === 0 ? 'No saved bills yet.' : 'No bills match.'}</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Saved bills">
          {visible.map((b) => (
            <BillRow key={b.id} bill={b} voided={voided.has(b.id)} />
          ))}
        </ul>
      )}
    </main>
  );
}
