/** Dynamic imports for every route chunk, shared by the lazy routes and the idle preloader. */
export const loadHome = () => import('./screens/Home');
export const loadCapture = () => import('./screens/Capture');
export const loadResolve = () => import('./screens/Resolve');
export const loadReview = () => import('./screens/Review');
export const loadOrders = () => import('./screens/Orders');
export const loadOrderDetail = () => import('./screens/OrderDetail');
export const loadCatalog = () => import('./screens/Catalog');
export const loadAbout = () => import('./screens/About');

/** Fetch every route chunk once the first screen is up, so navigation never waits on the network. */
export const preloadRoutes = [
  loadHome,
  loadCapture,
  loadResolve,
  loadReview,
  loadOrders,
  loadOrderDetail,
  loadCatalog,
  loadAbout,
];
