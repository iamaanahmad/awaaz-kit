import { useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatRupees } from '@awaaz-kit/domain-billing';
import { resetDemoShop, type BillRecord, type ShopRecord } from '@awaaz-kit/local-data';
import { Onboarding, OnlineIndicator, SyncBadge } from '@awaaz-kit/shared-ui';
import { todayFinalizedTotalPaise } from '../data/todayTotal';
import { usePendingSyncCount, useRecentBills, useShops } from '../data/homeHooks';
import { useServices } from '../providers/AppProviders';
import { useSync } from '../providers/SyncProvider';

const MODEL_APPROX_BYTES = 150 * 1024 * 1024;

const timeLabel = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function RecentBill({ bill }: { bill: BillRecord }): ReactElement {
  const label = bill.kind === 'void' ? 'Void' : bill.kind === 'correction' ? 'Correction' : null;
  return (
    <li>
      <Link
        to={`/bills/${bill.id}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3"
      >
        <span className="flex flex-col">
          <span className="font-semibold">#{bill.receiptNumber}</span>
          <span className="text-sm text-muted">
            {timeLabel(bill.finalizedAt ?? bill.createdAt)}
            {label ? ` · ${label}` : ''}
          </span>
        </span>
        <span className="text-lg font-bold tabular-nums">{formatRupees(bill.totalPaise)}</span>
      </Link>
    </li>
  );
}

function Dashboard({ shop }: { shop: ShopRecord }): ReactElement {
  const bills = useRecentBills(shop.id, 200);
  const pending = usePendingSyncCount();
  const sync = useSync();
  const total = useMemo(() => (bills ? todayFinalizedTotalPaise(bills, new Date()) : 0), [bills]);
  const recent = (bills ?? []).filter((b) => b.status === 'finalized').slice(0, 5);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Bill Awaaz</h1>
          <p className="text-sm text-muted">
            {shop.name}
            {shop.isDemo ? ' · fictional demo shop' : ''}
          </p>
        </div>
        <nav aria-label="Main" className="flex gap-1">
          <Link
            to="/bills"
            className="inline-flex items-center rounded-md px-3 underline underline-offset-4"
          >
            Bills
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center rounded-md px-3 underline underline-offset-4"
          >
            About
          </Link>
        </nav>
      </header>

      <section
        aria-label="Today"
        className="rounded-2xl bg-accent p-5 text-accent-contrast shadow-sm"
      >
        <p className="text-sm opacity-90">Today&apos;s finalized total</p>
        <p className="text-4xl font-extrabold tabular-nums" data-testid="today-total">
          {bills ? formatRupees(total) : '…'}
        </p>
      </section>

      <Link
        to="/capture"
        className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-ink px-6 text-lg font-bold text-white"
      >
        🎙 New Bill
      </Link>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <OnlineIndicator />
        <SyncBadge
          state={sync.badge}
          onSyncNow={() => void sync.syncNow()}
          onRetry={() => void sync.syncNow()}
        />
        <span data-testid="pending-count" className="text-muted">
          Pending sync: {pending ?? 0}
        </span>
        {sync.reportText && sync.optedIn ? (
          <span className="text-muted" data-testid="sync-report">
            {sync.reportText}
          </span>
        ) : null}
      </div>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="recent-heading" className="text-lg font-semibold">
            Recent bills
          </h2>
          <Link to="/bills" className="underline underline-offset-4">
            View all
          </Link>
        </div>
        {bills === undefined ? (
          <p role="status">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">
            No bills yet. Tap New Bill and say the items out loud.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((b) => (
              <RecentBill key={b.id} bill={b} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function Home(): ReactElement {
  const { db, repos } = useServices();
  const navigate = useNavigate();
  const shops = useShops();
  const [error, setError] = useState<string | null>(null);

  if (shops === undefined) return <p role="status">Loading…</p>;

  if (shops.length === 0) {
    const run = async (task: () => Promise<void>): Promise<void> => {
      try {
        setError(null);
        await task();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not set up the shop.');
      }
    };
    return (
      <div className="mx-auto max-w-md p-4">
        <Onboarding
          modelStatus={{ kind: 'missing' }}
          modelApproxSizeBytes={MODEL_APPROX_BYTES}
          onSelectDemoShop={() => run(() => resetDemoShop(db))}
          onCreateLocalShop={(name) =>
            run(async () => {
              const ts = new Date().toISOString();
              await repos.shops.put({
                id: crypto.randomUUID(),
                name,
                currency: 'INR',
                locale: 'en-IN',
                isDemo: false,
                nextOrderSeq: 1,
                nextReceiptSeq: 1,
                remoteShopId: null,
                createdAt: ts,
                updatedAt: ts,
                syncVersion: 0,
              });
            })
          }
          onDownloadModel={() => void navigate('/capture')}
          onContinueTyping={() => void navigate('/capture')}
        />
        {error ? <p role="alert">{error}</p> : null}
      </div>
    );
  }

  const shop = shops.find((s) => s.isDemo) ?? shops[0]!;
  return <Dashboard shop={shop} />;
}
