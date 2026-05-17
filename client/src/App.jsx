import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Audit from './pages/Audit.jsx';
import DailyBatch from './pages/DailyBatch.jsx';
import Monitoring from './pages/Monitoring.jsx';
import History from './pages/History.jsx';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="nav">
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/audit">Audit</NavLink>
          <NavLink to="/batch">Daily Batch</NavLink>
          <NavLink to="/monitoring">Monitoring</NavLink>
          <NavLink to="/history">History</NavLink>
        </nav>

        <main className="page">
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
