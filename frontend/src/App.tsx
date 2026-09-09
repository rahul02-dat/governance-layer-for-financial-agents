import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { Shield, Users, Activity, Settings, AlertTriangle, Play, Search, CheckCircle } from 'lucide-react';
import './index.css';

import { ErrorBoundary } from './components/ErrorBoundary';
import FleetOverview from './FleetOverview';
import Agents from './Agents';
import Approvals from './Approvals';
import Policies from './Policies';
import Audit from './Audit';
import Emergency from './Emergency';
import Simulator from './Simulator';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <div className="app-container">
          <aside className="sidebar" aria-label="Main Navigation">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', padding: '0 16px' }}>
              <Shield size={32} color="var(--accent-color)" />
              <h2 style={{ margin: 0, fontSize: '1.5rem', background: 'linear-gradient(90deg, #fff, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                AgentGuard
              </h2>
            </div>
            
            <nav role="navigation" aria-label="Control tower sections">
              <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} end>
                <Activity size={20} /> Overview
              </NavLink>
              <NavLink to="/agents" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Users size={20} /> Agents
              </NavLink>
              <NavLink to="/approvals" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <CheckCircle size={20} /> Approvals
              </NavLink>
              <NavLink to="/policies" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Settings size={20} /> Policies
              </NavLink>
              <NavLink to="/audit" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Shield size={20} /> Audit Log
              </NavLink>
              <NavLink to="/investigation" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Search size={20} /> Investigation
              </NavLink>
              <NavLink to="/simulator" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Play size={20} /> Test Harness
              </NavLink>
              <NavLink
                to="/emergency"
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                style={{ marginTop: 'auto', color: 'var(--danger-color)' }}
              >
                <AlertTriangle size={20} /> Emergency
              </NavLink>
            </nav>
          </aside>

          <main className="main-content" id="main-content" role="main">
            <Routes>
              <Route path="/" element={<FleetOverview />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/policies" element={<Policies />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/investigation" element={<Audit />} />
              <Route path="/simulator" element={<Simulator />} />
              <Route path="/emergency" element={<Emergency />} />
            </Routes>
          </main>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
