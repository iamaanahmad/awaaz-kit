import type { OrderRecord, SyncState } from '@awaaz-kit/local-data';
import type { SyncBadgeState } from '@awaaz-kit/shared-ui';

export type StatusFilter = 'all' | OrderRecord['status'];
export type SyncFilter = 'all' | SyncState;

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const SYNC_OPTIONS: { value: SyncFilter; label: string }[] = [
  { value: 'all', label: 'All sync states' },
  { value: 'local_only', label: 'Local only' },
  { value: 'pending', label: 'Pending' },
  { value: 'syncing', label: 'Syncing' },
  { value: 'synced', label: 'Synced' },
  { value: 'failed', label: 'Failed' },
  { value: 'conflict', label: 'Conflict' },
];

export interface OrderFilters {
  query: string;
  status: StatusFilter;
  syncState: SyncFilter;
}

/** Filters by order number or customer name text, status and Sync_State (Req 12.9). */
export function filterOrders(
  orders: readonly OrderRecord[],
  filters: OrderFilters,
  customerNames: ReadonlyMap<string, string>,
): OrderRecord[] {
  const q = filters.query.trim().toLowerCase();
  return orders.filter((o) => {
    if (filters.status !== 'all' && o.status !== filters.status) return false;
    if (filters.syncState !== 'all' && o.syncState !== filters.syncState) return false;
    if (!q) return true;
    const customer = o.walkIn ? 'walk-in' : (customerNames.get(o.customerId ?? '') ?? '');
    return `${o.localNumber} ${customer}`.toLowerCase().includes(q);
  });
}

export function toSyncBadgeState(state: SyncState): SyncBadgeState {
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

export function formatRupees(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rem = paise % 100;
  return `₹${rupees.toLocaleString('en-IN')}.${String(rem).padStart(2, '0')}`;
}

export function formatQty(qtyMilli: number): string {
  return String(qtyMilli / 1000);
}
