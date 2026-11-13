import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';
import {
  loadAbout,
  loadCapture,
  loadCatalog,
  loadHome,
  loadOrderDetail,
  loadOrders,
  loadResolve,
  loadReview,
} from './screenLoaders';

const Home = lazy(loadHome);
const Capture = lazy(loadCapture);
const Resolve = lazy(loadResolve);
const Review = lazy(loadReview);
const Orders = lazy(loadOrders);
const OrderDetail = lazy(loadOrderDetail);
const Catalog = lazy(loadCatalog);
const About = lazy(loadAbout);

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
