import { Suspense, useEffect, type ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  BatIcon,
  DelayedFallback,
  PumpkinIcon,
  ThemeToggle,
  runWhenIdle,
} from '@awaaz-kit/shared-ui';
import { preloadRoutes } from './screenLoaders';

const links: ReadonlyArray<readonly [string, string]> = [
  ['/', 'Home'],
  ['/orders', 'Orders'],
  ['/catalog', 'Catalog'],
  ['/about', 'About'],
];

export function AppLayout(): ReactElement {
  // Warm every route chunk after the first screen is up; navigation then never waits.
  useEffect(() => runWhenIdle(preloadRoutes), []);
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">
      <header className="ak-app-header">
        <h1 className="ak-brand">
          <PumpkinIcon /> Order Awaaz <BatIcon size={22} />
        </h1>
        <ThemeToggle />
        <nav aria-label="Main" className="basis-full">
          <ul className="ak-nav">
            {links.map(([to, label]) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="flex-1">
        <Suspense fallback={<DelayedFallback />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
