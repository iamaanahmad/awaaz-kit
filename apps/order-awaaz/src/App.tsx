import type { ReactElement } from 'react';
import { RouterProvider } from 'react-router/dom';
import { createBrowserRouter } from 'react-router';
import { AppProviders } from './providers/AppProviders';
import { routes } from './routes';

// Base path comes from Vite (`/order/`), so deep links work when served under a sub-path.
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

export function App(): ReactElement {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
