import { useEffect, useState, type ReactElement } from 'react';
import { DEMO_SHOP_ID, type ProductRecord } from '@awaaz-kit/local-data';
import { useActiveShop } from '../hooks/useActiveShop';
import { formatRupees } from '../orders/orderView';
import { useData } from '../providers/AppProviders';

/** Read-only view of the shared Catalog (Req 12.12, 3.8). */
export default function Catalog(): ReactElement {
  const { repos } = useData();
  const { state } = useActiveShop();
  const shopId = state.status === 'ready' ? state.shop.id : DEMO_SHOP_ID;
  const [products, setProducts] = useState<ProductRecord[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    repos.products
      .listAll(shopId)
      .then((rows) => {
        if (cancelled) return;
        setProducts(
          rows.filter((p) => p.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repos, shopId]);

  return (
    <section className="space-y-3" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading" className="text-lg font-semibold">
        Catalog
      </h2>
      {products === undefined ? (
        <p role="status">Loading catalog…</p>
      ) : products.length === 0 ? (
        <p role="status">No products in the catalog yet.</p>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => (
            <li key={p.id} className="rounded-md border p-3">
              <span className="font-medium">{p.name}</span>
              {p.brand ? <span className="text-sm"> · {p.brand}</span> : null}
              <span className="block text-sm">
                {formatRupees(p.pricePaise)} per {p.unit} · {p.active ? 'Available' : 'Unavailable'}
              </span>
              <span className="block text-sm">
                Aliases: {p.aliases.length > 0 ? p.aliases.join(', ') : 'none'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
