import { useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import type { OrderRecord, ShopRecord } from '@awaaz-kit/local-data';
import {
  DelayedFallback,
  EmptyState,
  Onboarding,
  OnlineIndicator,
  MicIcon,
  SyncBadge,
  useOnlineStatus,
} from '@awaaz-kit/shared-ui';
import { useActiveShop, useSyncSummary } from '../hooks/useActiveShop';
import { useRecentOrders } from '../hooks/useLiveQuery';
import { useSync } from '../providers/SyncProvider';

/** Rough size of the on-device speech model, shown before any download (Req 5.4). */
const MODEL_APPROX_BYTES = 150 * 1024 * 1024;

const rupees = (paise: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const orderSyncLabel: Record<OrderRecord['syncState'], string> = {
  local_only: 'Local only',
  pending: 'Pending',
  syncing: 'Syncing',
  synced: 'Synced',
  failed: 'Failed',
  conflict: 'Conflict',
};

function OrderRow({ order }: { order: OrderRecord }): ReactElement {
  return (
    <li>
      <Link to={`/orders/${order.id}`} className="ak-row-link">
        <span className="flex flex-col">
          <span className="font-semibold">{order.localNumber}</span>
          <span className="text-sm text-muted">
            {order.walkIn ? 'Walk-in' : 'Customer order'} · {formatWhen(order.createdAt)}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span className="font-semibold">{rupees(order.totalEstimatePaise)}</span>
          <span className="text-xs text-muted">{orderSyncLabel[order.syncState]}</span>
        </span>
      </Link>
    </li>
  );
}

function RecentOrders({ shopId }: { shopId: string }): ReactElement {
  const orders = useRecentOrders(5, shopId);
  return (
    <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="recent-heading" className="text-lg font-semibold">
          Recent orders
        </h2>
        <Link to="/orders" className="touch-target ak-btn ak-btn-link">
          View all
        </Link>
      </div>
      {orders === undefined ? (
        <p role="status" className="text-muted">
          Loading orders…
        </p>
      ) : orders.length === 0 ? (
        <EmptyState>
          <p>No orders yet. Tap New Order and say or type what the customer wants.</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Dashboard({ shop }: { shop: ShopRecord }): ReactElement {
  const online = useOnlineStatus();
  const { pending } = useSyncSummary();
  const sync = useSync();
  const pendingCount = pending ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Shop" className="ak-card ak-card-raised">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{shop.name}</h2>
          {shop.isDemo ? <span className="ak-pill">Demo Shop</span> : null}
        </div>
        <Link to="/capture" className="touch-target ak-btn ak-btn-primary ak-btn-lg ak-btn-block">
          <MicIcon size={22} /> New Order
        </Link>
      </section>

      <section aria-label="Status" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <OnlineIndicator online={online} />
        <SyncBadge
          state={sync.badge}
          onSyncNow={() => void sync.syncNow()}
          onRetry={() => void sync.syncNow()}
        />
        {pendingCount > 0 ? (
          <span className="text-sm text-muted" data-testid="pending-count">
            {pendingCount} pending sync
          </span>
        ) : null}
        {sync.reportText && sync.optedIn ? (
          <span className="text-sm text-muted" data-testid="sync-report">
            {sync.reportText}
          </span>
        ) : null}
      </section>

      <RecentOrders shopId={shop.id} />
    </div>
  );
}

function FirstRun({
  chooseDemoShop,
  createShop,
}: {
  chooseDemoShop: () => Promise<void>;
  createShop: (name: string) => Promise<void>;
}): ReactElement {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const guard = (fn: () => Promise<void>) => async (): Promise<void> => {
    try {
      setError(null);
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save on this device.');
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Onboarding
        onSelectDemoShop={guard(chooseDemoShop)}
        onCreateLocalShop={(name) => guard(() => createShop(name))()}
        modelStatus={{ kind: 'missing' }}
        modelApproxSizeBytes={MODEL_APPROX_BYTES}
        onDownloadModel={() => void navigate('/capture')}
        onContinueTyping={() => void navigate('/capture')}
      />
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function Home(): ReactElement {
  const { state, chooseDemoShop, createShop } = useActiveShop();
  if (state.status === 'loading') {
    return <DelayedFallback />;
  }
  if (state.status === 'none') {
    return <FirstRun chooseDemoShop={chooseDemoShop} createShop={createShop} />;
  }
  return <Dashboard shop={state.shop} />;
}
