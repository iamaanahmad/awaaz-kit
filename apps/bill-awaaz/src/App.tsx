import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppProviders } from './providers/AppProviders';

const Home = lazy(() => import('./screens/Home'));
const Capture = lazy(() => import('./screens/Capture'));
const Lines = lazy(() => import('./screens/Lines'));
const Review = lazy(() => import('./screens/Review'));
const Finalize = lazy(() => import('./screens/Finalize'));
const Bills = lazy(() => import('./screens/Bills'));
const BillDetail = lazy(() => import('./screens/BillDetail'));
const About = lazy(() => import('./screens/About'));

export function App() {
  return (
    <AppProviders>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Suspense fallback={<p role="status">Loading...</p>}>
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
