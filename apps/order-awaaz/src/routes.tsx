import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';

const Home = lazy(() => import('./screens/Home'));
const Capture = lazy(() => import('./screens/Capture'));
const Resolve = lazy(() => import('./screens/Resolve'));
const Review = lazy(() => import('./screens/Review'));
const Orders = lazy(() => import('./screens/Orders'));
const OrderDetail = lazy(() => import('./screens/OrderDetail'));
const Catalog = lazy(() => import('./screens/Catalog'));
const About = lazy(() => import('./screens/About'));

/** All Order_App routes are declared up front; screens are filled in by later tasks. */
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/capture', element: <Capture /> },
      { path: '/resolve', element: <Resolve /> },
      { path: '/review', element: <Review /> },
      { path: '/orders', element: <Orders /> },
      { path: '/orders/:id', element: <OrderDetail /> },
      { path: '/catalog', element: <Catalog /> },
      { path: '/about', element: <About /> },
    ],
  },
];
