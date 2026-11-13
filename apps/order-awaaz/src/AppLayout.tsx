import { Suspense, type ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router';

const links: ReadonlyArray<readonly [string, string]> = [
  ['/', 'Home'],
  ['/orders', 'Orders'],
  ['/catalog', 'Catalog'],
  ['/about', 'About'],
];

export function AppLayout(): ReactElement {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Order Awaaz</h1>
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-2">
            {links.map(([to, label]) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className="inline-flex items-center rounded-md px-3 underline-offset-4 aria-[current=page]:bg-accent aria-[current=page]:text-accent-contrast"
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="flex-1">
        <Suspense fallback={<p role="status">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
