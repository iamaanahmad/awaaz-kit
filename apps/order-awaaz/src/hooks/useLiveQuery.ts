import { useEffect, useState } from 'react';
import { DEMO_SHOP_ID, type LiveQuery, type OrderRecord } from '@awaaz-kit/local-data';
import { useData } from '../providers/AppProviders';

/** Subscribes to a repository LiveQuery; returns `undefined` until the first value. */
export function useLiveQuery<T>(make: () => LiveQuery<T>, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = make().subscribe({ next: setValue });
    return () => sub.unsubscribe();
    // `deps` is supplied by the caller, so the effect re-subscribes only when they change.
  }, deps);
  return value;
}

/** App-local data hooks (the Order_App owns these; repositories come from local-data). */
export function useRecentOrders(
  limit = 10,
  shopId: string = DEMO_SHOP_ID,
): OrderRecord[] | undefined {
  const { repos } = useData();
  return useLiveQuery(() => repos.orders.watchRecent(shopId, limit), [repos, shopId, limit]);
}

export function useOrder(id: string) {
  const { repos } = useData();
  return useLiveQuery(() => repos.orders.watch(id), [repos, id]);
}
