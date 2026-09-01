import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { Shield, Users, Activity, Settings, AlertTriangle, Play, Search, CheckCircle } from 'lucide-react';
import './index.css';

import FleetOverview from './FleetOverview';
import Agents from './Agents';
import Simulator from './Simulator';
import InvestigationConsole from './InvestigationConsole';
import Approvals from './Approvals';

// Placeholder Pages
const Policies = () => <div className="glass-panel"><h1>Policies & Budgets</h1><p>Configure governance rules</p></div>;
const Audit = () => <div className="glass-panel"><h1>Audit Log</h1><p>Review all authorization events</p></div>;
const Emergency = () => <div className="glass-panel" style={{borderColor: 'var(--danger-color)'}}><h1 style={{color: 'var(--danger-color)'}}>Emergency Controls</h1><p>Fleet halt and resume operations</p></div>;

function App() {
  return (
    <Router>
      <div className="app-container">
        <aside className="sidebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', padding: '0 16px' }}>
            <Shield size={32} color="var(--accent-color)" />
            <h2 style={{ margin: 0, fontSize: '1.5rem', background: 'linear-gradient(90deg, #fff, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              AgentGuard
            </h2>
          </div>
          
          <nav>
            <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} end>
              <Activity size={20} /> Overview
            </NavLink>
            <NavLink to="/agents" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
              <Users size={20} /> Agents
            </NavLink>
            <NavLink to="/investigation" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
              <Search size={20} /> Investigation
            </NavLink>
            <NavLink to="/approvals" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
              <CheckCircle size={20} /> Approvals
            </NavLink>
            <NavLink to="/policies" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
              <Settings size={20} /> Policies
            </NavLink>
            <NavLink to="/audit" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
              <Shield size={20} /> Audit Log
            </NavLink>
            <NavLink to="/simulator" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
              <Play size={20} /> Simulator
            </NavLink>
            <NavLink to="/emergency" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} style={{marginTop: 'auto', color: 'var(--danger-color)'}}>
              <AlertTriangle size={20} /> Emergency
            </NavLink>
          </nav>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<FleetOverview />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/investigation" element={<InvestigationConsole />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/policies" element={<Policies />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/emergency" element={<Emergency />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
