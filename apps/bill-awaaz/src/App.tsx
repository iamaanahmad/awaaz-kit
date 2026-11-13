import { Suspense, lazy, useEffect, type ReactElement } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router';
import { DelayedFallback, GhostMark, ThemeToggle, runWhenIdle } from '@awaaz-kit/shared-ui';
import { AppProviders } from './providers/AppProviders';

const loadHome = () => import('./screens/Home');
const Home = lazy(loadHome);
const loadCapture = () => import('./screens/Capture');
const Capture = lazy(loadCapture);
const loadLines = () => import('./screens/Lines');
const Lines = lazy(loadLines);
const loadReview = () => import('./screens/Review');
const Review = lazy(loadReview);
const loadFinalize = () => import('./screens/Finalize');
const Finalize = lazy(loadFinalize);
const loadBills = () => import('./screens/Bills');
const Bills = lazy(loadBills);
const loadBillDetail = () => import('./screens/BillDetail');
const BillDetail = lazy(loadBillDetail);
const loadAbout = () => import('./screens/About');
const About = lazy(loadAbout);

/** Fetch every route chunk once the first screen is up, so navigation never waits on the network. */
const preloadRoutes = [
  loadHome,
  loadCapture,
  loadLines,
  loadReview,
  loadFinalize,
  loadBills,
  loadBillDetail,
  loadAbout,
];

/** Same chrome on every Bill screen: ghost mark, main nav and the theme toggle. */
function TopBar(): ReactElement {
  return (
    <header className="ak-topbar print:hidden">
      <Link to="/" className="ak-brand touch-target">
        <GhostMark /> Bill Awaaz
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Main">
          <ul className="ak-nav">
            <li>
              <NavLink to="/bills">Bills</NavLink>
            </li>
            <li>
              <NavLink to="/about">About</NavLink>
            </li>
          </ul>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function App() {
  useEffect(() => runWhenIdle(preloadRoutes), []);
  return (
    <AppProviders>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <TopBar />
        <Suspense fallback={<DelayedFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/lines" element={<Lines />} />
            <Route path="/review" element={<Review />} />
            <Route path="/finalize/:id" element={<Finalize />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/bills/:id" element={<BillDetail />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  );
}
