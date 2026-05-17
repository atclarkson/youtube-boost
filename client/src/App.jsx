import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Audit from './pages/Audit.jsx';
import DailyBatch from './pages/DailyBatch.jsx';
import Monitoring from './pages/Monitoring.jsx';
import History from './pages/History.jsx';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <nav className="bg-gray-900 shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-4">
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
        </nav>

        <main className="mx-auto max-w-7xl px-6 py-10">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/batch" element={<DailyBatch />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
