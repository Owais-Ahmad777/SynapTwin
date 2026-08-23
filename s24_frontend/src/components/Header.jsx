import React from 'react';
import { 
  Zap, Shield, AlertTriangle, BatteryCharging, Leaf, 
  UserCheck, Building2, HelpCircle, Activity, RotateCcw, ChevronDown, Radio, Power, ShieldCheck, ShieldAlert, Award, FileCheck, Scale, Calendar 
} from 'lucide-react';

export default function Header({ 
  currentHour, 
  hourData,
  isOutage, 
  isDisasterActive = false,
  currentMode, 
  batteryHealth, 
  impactMetrics, 
  currentRole, 
  onRoleChange, 
  onOpenPitch,
  onOpenAudit,
  onOpenCompare,
  onResetDemoDefaults,
}) {
  const allBuildings = [
    { id: 'admin', label: '🛡️ Campus Super-Admin (All 16 Buildings)' },
    { id: 'hostel_a', label: '🏢 ITER Boys Hostel 1' },
    { id: 'hostel_b', label: '🏢 ITER Boys Hostel 7' },
    { id: 'academic', label: '🏢 C-Block (Academic)' },
    { id: 'cafeteria', label: '🍽️ ITER Cafeteria & Dining' },
    { id: 'central_library', label: '🏢 Central Library' },
    { id: 'admin_block', label: '🏢 ITER Administrative Block' },
    { id: 'auditorium', label: '🏢 Bansuri Guru Auditorium' },
    { id: 'd_block', label: '🏢 D-Block' },
    { id: 'a_block', label: '🏢 A-Block' },
    { id: 'hostel_2', label: '🏢 ITER Boys Hostel 2' },
    { id: 'sports', label: '🏢 S-Block (Sports Complex)' },
    { id: 'f_block', label: '🏢 F-Block' },
    { id: 'g_block', label: '🏢 G-Block' },
    { id: 'data_science', label: '🏢 Centre for Data Science' },
    { id: 'research', label: '🏢 Research & Innovation Wing' },
  ];

  const isEmergency = Boolean(isOutage || isDisasterActive || hourData?.mode === 'DISASTER_TRIAGE' || currentMode === 'DISASTER_TRIAGE');

  return (
    <header className="top-header">
      {/* ROW 1: Brand & Action Controls */}
      <div className="header-primary-row">
        {/* Group A: Brand & Subtitle */}
        <div className="brand-section">
          <div className="brand-badge">
            <Zap size={15} />
            <span>SYNAPTWIN</span>
          </div>
          <div className="brand-title">
            <h1>
              SOA ITER Campus Energy Flexibility Twin
              <span className="kpi-pill" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontSize: '10px', padding: '2px 8px' }}>
                16 Buildings Active
              </span>
            </h1>
            <span className="subtitle">
              Shared-Battery Microgrid &bull; Real OSM Building Geometry &bull; Max-Min LP &amp; Triage Engine
            </span>
          </div>
        </div>

        {/* Group D: Action Buttons */}
        <div className="header-action-group">
          {/* 30-Day History Standalone Tab Button */}
          <button 
            className="btn-secondary btn-header"
            onClick={() => window.open('/?view=history', '_blank')}
            style={{
              borderColor: 'rgba(99, 102, 241, 0.4)',
              color: '#818cf8',
            }}
            title="Open SynapTwin 30-Day Historical Trend & Multi-Day Optimization Analysis in a new browser tab"
          >
            <Calendar size={13} color="#818cf8" />
            <span>30-Day History</span>
          </button>

          {/* Reset to Demo Defaults Safety Button */}
          <button 
            className="btn-secondary btn-header"
            onClick={onResetDemoDefaults}
            title="Reset all sandbox controls to default presentation state"
          >
            <RotateCcw size={12} />
            <span>Demo Reset</span>
          </button>

          {/* Algorithmic Comparison Button */}
          <button 
            className="btn-secondary btn-header"
            onClick={onOpenCompare}
            style={{
              borderColor: 'rgba(16, 185, 129, 0.4)',
              color: '#34d399',
            }}
            title="Compare real algorithmic performance: Without SynapTwin Baseline vs. With SynapTwin Digital Twin"
          >
            <Scale size={13} color="#34d399" />
            <span>Compare SynapTwin</span>
          </button>

          {/* Official Audit Certificate Button */}
          <button 
            className="btn-secondary btn-header"
            onClick={onOpenAudit}
            style={{
              borderColor: 'rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
            }}
            title="Open Official Compliance, Financial ROI & Cryptographic Audit Certificate"
          >
            <Award size={13} color="#38bdf8" />
            <span>Audit Certificate</span>
          </button>

          {/* Pitch Summary Button */}
          <button 
            className="btn-primary btn-header" 
            onClick={onOpenPitch}
          >
            <HelpCircle size={13} />
            <span>Judge Pitch</span>
          </button>
        </div>
      </div>

      {/* ROW 2: Live Status & Telemetry Chips + Persona Switcher */}
      <div className="header-secondary-row">
        {/* Group B: Status & Telemetry Chips */}
        <div className="header-telemetry-chips">
          {/* Grid Status Badge */}
          <div 
            className="kpi-pill status-chip"
            style={{
              background: isOutage ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
              color: isOutage ? '#f87171' : '#34d399',
              border: isOutage ? '1px solid #ef4444' : '1px solid rgba(16, 185, 129, 0.4)',
              boxShadow: isOutage ? '0 0 10px rgba(239, 68, 68, 0.3)' : 'none',
            }}
            title={isOutage ? 'Grid is disconnected (Islanded mode active)' : 'Utility 11kV grid is connected normally'}
          >
            <Power size={12} color={isOutage ? '#ef4444' : '#10b981'} />
            <span>{isOutage ? 'GRID: CUT (OUTAGE)' : 'GRID: ON'}</span>
          </div>

          {/* Operating Mode Indicator */}
          <div 
            className={`mode-badge status-chip ${isEmergency ? 'triage' : 'fairness'}`}
            style={{
              background: isEmergency ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.12)',
              color: isEmergency ? '#fca5a5' : '#34d399',
              border: isEmergency ? '1px solid #ef4444' : '1px solid rgba(16, 185, 129, 0.3)',
              boxShadow: isEmergency ? '0 0 16px rgba(239, 68, 68, 0.35)' : 'none',
            }}
          >
            <div className={`live-dot ${isEmergency ? 'red' : 'green'}`}></div>
            {isEmergency ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={13} color="#ef4444" />
                <span>DISASTER TRIAGE</span>
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Activity size={13} color="#10b981" />
                <span>ROUTINE FAIRNESS</span>
              </span>
            )}
          </div>

          {/* Current Live Battery SoC Chip */}
          <div 
            className="kpi-pill status-chip" 
            style={{ 
              background: 'rgba(56, 189, 248, 0.12)', 
              color: '#38bdf8', 
              border: '1px solid rgba(56, 189, 248, 0.3)',
            }}
            title="Current Live State-of-Charge (Instantaneous energy level stored in the battery right now)"
          >
            <BatteryCharging size={13} />
            <span>SoC: {(hourData?.battery_soc_pct ?? 78.4).toFixed(1)}%</span>
          </div>

          {/* Current Live Battery SoH Chip */}
          {batteryHealth && (
            <div 
              className="kpi-pill status-chip" 
              style={{ 
                background: 'rgba(6, 182, 212, 0.12)', 
                color: '#22d3ee', 
                border: '1px solid rgba(6, 182, 212, 0.3)',
              }}
              title={`Current Live State-of-Health: ${batteryHealth.soh_pct}% | Duty Tier: ${batteryHealth.duty_tier}`}
            >
              <Activity size={13} />
              <span>SoH: {batteryHealth.soh_pct}% ({batteryHealth.duty_tier})</span>
            </div>
          )}
        </div>

        {/* Group C: Persona RBAC Switcher */}
        <div className="header-persona-group">
          <span className="persona-label">Persona RBAC:</span>
          <div className="role-selector" title="Switch view persona to test data privacy boundaries">
            <button 
              className={`role-btn ${currentRole === 'admin' ? 'active' : ''}`}
              onClick={() => onRoleChange('admin')}
            >
              <Shield size={12} />
              <span>Admin</span>
            </button>
            <button 
              className={`role-btn ${currentRole === 'hostel_a' ? 'active' : ''}`}
              onClick={() => onRoleChange('hostel_a')}
            >
              <Building2 size={12} />
              <span>Hostel 1</span>
            </button>
            <button 
              className={`role-btn ${currentRole === 'hostel_b' ? 'active' : ''}`}
              onClick={() => onRoleChange('hostel_b')}
            >
              <Building2 size={12} />
              <span>Hostel 7</span>
            </button>
            <button 
              className={`role-btn ${currentRole === 'academic' ? 'active' : ''}`}
              onClick={() => onRoleChange('academic')}
            >
              <Building2 size={12} />
              <span>C-Block</span>
            </button>

            {/* Selector for all 16 buildings */}
            <select
              value={currentRole}
              onChange={(e) => onRoleChange(e.target.value)}
              className="role-dropdown"
              title="Select any of the 16 campus buildings to view its authenticated privacy vault view"
            >
              <option value="" disabled>More Buildings...</option>
              {allBuildings.map(b => (
                <option key={b.id} value={b.id} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
