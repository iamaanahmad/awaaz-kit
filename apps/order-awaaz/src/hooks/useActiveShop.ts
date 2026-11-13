import { useCallback, useEffect, useState } from 'react';
import {
  DEMO_SHOP_ID,
  META_KEYS,
  createLocalShop,
  resetDemoShop,
  type ShopRecord,
} from '@awaaz-kit/local-data';
import { useData } from '../providers/AppProviders';

export type ActiveShopState =
  { status: 'loading' } | { status: 'none' } | { status: 'ready'; shop: ShopRecord };

export interface UseActiveShop {
  state: ActiveShopState;
  /** Seeds the fictional Demo_Shop and makes it active. */
  chooseDemoShop: () => Promise<void>;
  /** Creates a local INR shop with no sign-in and makes it active. */
  createShop: (name: string) => Promise<void>;
}

/** App-local hook: resolves the active shop from `syncMeta` and handles first-run choices. */
export function useActiveShop(): UseActiveShop {
  const { db, repos } = useData();
  const [state, setState] = useState<ActiveShopState>({ status: 'loading' });

  const load = useCallback(async (): Promise<ActiveShopState> => {
    const id = await repos.meta.get<string>(META_KEYS.activeShopId);
    const shop = id ? await repos.shops.get(id) : undefined;
    return shop ? { status: 'ready', shop } : { status: 'none' };
  }, [repos]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'none' });
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const chooseDemoShop = useCallback(async () => {
    await resetDemoShop(db);
    await repos.meta.set(META_KEYS.activeShopId, DEMO_SHOP_ID);
    setState(await load());
  }, [db, repos, load]);

  const createShop = useCallback(
    async (name: string) => {
      await createLocalShop(
        db,
        { now: () => new Date(), newId: () => crypto.randomUUID() },
        { name },
      );
      setState(await load());
    },
    [db, load],
  );

  return { state, chooseDemoShop, createShop };
}

/** Live count of unsynced mutations plus whether the user opted in to sync. */
export function useSyncSummary(): { pending: number | undefined; optedIn: boolean } {
  const { repos } = useData();
  const [pending, setPending] = useState<number | undefined>(undefined);
  const [optedIn, setOptedIn] = useState(false);
  useEffect(() => {
    const a = repos.outbox.watchCountUnsynced().subscribe({ next: setPending });
    const b = repos.meta
      .watch<{ enabled: boolean }>(META_KEYS.syncOptIn)
      .subscribe({ next: (v) => setOptedIn(v?.enabled === true) });
    return () => {
      a.unsubscribe();
      b.unsubscribe();
    };
  }, [repos]);
  return { pending, optedIn };
}
