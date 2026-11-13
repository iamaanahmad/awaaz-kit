import { useEffect, useState } from 'react';
import type { BillRecord, LiveQuery, ShopRecord } from '@awaaz-kit/local-data';
import { useServices } from '../providers/AppProviders';

/** Subscribes to a repository LiveQuery; `undefined` until the first value. */
export function useLive<T>(make: () => LiveQuery<T>, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = make().subscribe({ next: setValue });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}

export function useShops(): ShopRecord[] | undefined {
  const { repos } = useServices();
  return useLive(() => repos.shops.watchAll(), [repos]);
}

export function useRecentBills(
  shopId: string | undefined,
  limit: number,
): BillRecord[] | undefined {
  const { repos } = useServices();
  return useLive(() => repos.bills.watchRecent(shopId ?? '', limit), [repos, shopId, limit]);
}

export function usePendingSyncCount(): number | undefined {
  const { repos } = useServices();
  return useLive(() => repos.outbox.watchCountUnsynced(), [repos]);
}
