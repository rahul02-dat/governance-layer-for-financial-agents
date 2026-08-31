import React, { useEffect, useState } from 'react';
import axios from 'axios';

const FleetOverview = () => {
  const [stats, setStats] = useState({
    activeAgents: 0,
    revokedAgents: 0,
    fleetStatus: 'UNKNOWN',
    remainingBudget: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [agentsRes, fleetRes, budgetRes] = await Promise.all([
        axios.get('/agents/'),
        axios.get('/fleet/status'),
        axios.get('/budgets/')
      ]);
      
      const agents = agentsRes.data;
      const fleetBudget = budgetRes.data.find((b: any) => b.scope === 'FLEET_DAILY');
      
      setStats({
        activeAgents: agents.filter((a: any) => a.status === 'ACTIVE').length,
        revokedAgents: agents.filter((a: any) => a.status === 'REVOKED').length,
        fleetStatus: fleetRes.data.fleet_state,
        remainingBudget: fleetBudget ? fleetBudget.limit_amount : 0
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <h1 style={{marginBottom: '32px'}}>Fleet Overview</h1>
      
      <div className="dashboard-grid">
        <div className="glass-panel stat-card">
          <span className="stat-title">Active Agents</span>
          <span className="stat-value" style={{color: 'var(--success-color)'}}>{stats.activeAgents}</span>
        </div>
        
        <div className="glass-panel stat-card">
          <span className="stat-title">Revoked Agents</span>
          <span className="stat-value" style={{color: 'var(--danger-color)'}}>{stats.revokedAgents}</span>
        </div>
        
        <div className="glass-panel stat-card" style={{
          borderColor: stats.fleetStatus === 'HALTED' ? 'var(--danger-color)' : 'var(--success-color)'
        }}>
          <span className="stat-title">Fleet Status</span>
          <span className="stat-value" style={{
            color: stats.fleetStatus === 'HALTED' ? 'var(--danger-color)' : 'var(--success-color)'
          }}>{stats.fleetStatus}</span>
        </div>
        
        <div className="glass-panel stat-card">
          <span className="stat-title">Remaining Daily Budget</span>
          <span className="stat-value">₹{stats.remainingBudget.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default FleetOverview;
