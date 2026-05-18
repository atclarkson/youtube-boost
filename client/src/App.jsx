import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { formatPacificDateTime } from './lib/time.js';
import Dashboard from './pages/Dashboard.jsx';
import Audit from './pages/Audit.jsx';
import DailyBatch from './pages/DailyBatch.jsx';
import Monitoring from './pages/Monitoring.jsx';
import History from './pages/History.jsx';
import VideoDetail from './pages/VideoDetail.jsx';

function AppLayout() {
  const [youtubeTime, setYoutubeTime] = useState(() => formatPacificDateTime(new Date()));
  const location = useLocation();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setYoutubeTime(formatPacificDateTime(new Date()));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const mainClassName = location.pathname.startsWith('/video/')
    ? 'w-full'
    : 'mx-auto max-w-7xl px-6 py-10';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="bg-gray-900 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-100 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/audit"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-100 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              Audit
            </NavLink>
            <NavLink
              to="/batch"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-100 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              Daily Batch
            </NavLink>
            <NavLink
              to="/monitoring"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-100 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              Monitoring
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-100 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              History
            </NavLink>
          </div>
          <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-right text-gray-100">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
              YouTube Time
            </div>
            <div className="mt-1 text-sm font-medium">{youtubeTime}</div>
          </div>
        </div>
      </nav>

      <main className={mainClassName}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/batch" element={<DailyBatch />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/history" element={<History />} />
          <Route path="/video/:youtubeId" element={<VideoDetail />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
