import { useEffect, useState } from 'react';
import { DEMO_SHOP_ID } from '@awaaz-kit/local-data';
import { useData } from '../providers/AppProviders';

/** Map of customer id to name for display and search. */
export function useCustomerNames(shopId: string = DEMO_SHOP_ID): ReadonlyMap<string, string> {
  const { repos } = useData();
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    repos.customers
      .list(shopId)
      .then((list) => {
        if (!cancelled) setNames(new Map(list.map((c) => [c.id, c.name])));
      })
      .catch(() => {
        /* names are optional decoration */
      });
    return () => {
      cancelled = true;
    };
  }, [repos, shopId]);
  return names;
}
