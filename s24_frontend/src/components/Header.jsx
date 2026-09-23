import React, { useState, useEffect, useRef } from 'react';
import {
  Zap, Shield, AlertTriangle, BatteryCharging,
  Building2, Activity, Power, HelpCircle,
  Sun, Moon, User, Check
} from 'lucide-react';
import AlertCenter from './AlertCenter';

export default function Header({
  currentHour,
  hourData,
  simParams,
  isOutage,
  isDisasterActive = false,
  currentMode,
  batteryHealth,
  impactMetrics: _impactMetrics,
  currentRole,
  onRoleChange,
  theme = 'dark',
  onToggleTheme,
  uiProfile = 'admin',
  onUiProfileChange,
  onNavigate,
  onOpenPitch,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // UI-ONLY: close the profile menu on outside click (same pattern as alerts)
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileOpen]);

  const handleSelectProfile = (id) => {
    if (onUiProfileChange) onUiProfileChange(id);
    if (id === 'admin') {
      onRoleChange('admin');
    } else if (id === 'supervisor' && currentRole === 'admin') {
      onRoleChange('hostel_a');
    }
  };
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
              <span className="kpi-pill" style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)', fontSize: '10px', padding: '2px 8px' }}>
                16 Buildings Active
              </span>
            </h1>
            <span className="subtitle">
              Shared-Battery Microgrid &bull; Real OSM Building Geometry &bull; Max-Min LP &amp; Triage Engine
            </span>
          </div>
        </div>

        {/* Group D: Utility cluster — always visible, in-flow (not floating) */}
        <div className="header-action-group">
          <div className="st-util-cluster">
            <AlertCenter
              hourData={hourData}
              simParams={simParams}
              currentHour={currentHour}
              isEmergency={isEmergency}
              theme={theme}
            />
            <button
              type="button"
              className="btn-secondary btn-header"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <div style={{ position: 'relative' }} ref={profileRef}>
              <button
                type="button"
                className="btn-secondary btn-header"
                onClick={() => setProfileOpen((v) => !v)}
                title="Profile management"
              >
                <User size={13} />
                <span>Profile</span>
              </button>
              {profileOpen && (
                <div className="st-profile-menu">
                  <div className="st-profile-menu-title">Profile Management</div>
                  <button
                    type="button"
                    className={`st-profile-card ${uiProfile === 'admin' ? 'active' : ''}`}
                    onClick={() => handleSelectProfile('admin')}
                  >
                    <b><Shield size={12} /> Admin {uiProfile === 'admin' && <Check size={12} />}</b>
                    <span>Full command-center visibility</span>
                  </button>
                  <button
                    type="button"
                    className={`st-profile-card ${uiProfile === 'supervisor' ? 'active' : ''}`}
                    onClick={() => handleSelectProfile('supervisor')}
                  >
                    <b><User size={12} /> Supervisor {uiProfile === 'supervisor' && <Check size={12} />}</b>
                    <span>Supervise a single building</span>
                  </button>
                  {uiProfile === 'supervisor' && (
                    <select
                      value={currentRole}
                      onChange={(e) => onRoleChange(e.target.value)}
                      className="st-profile-building"
                      aria-label="Supervised building"
                    >
                      {allBuildings.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  )}
                  <div className="st-profile-current">
                    Active: <b>{uiProfile === 'admin' ? 'Admin (all buildings)' : `Supervisor (${currentRole})`}</b>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn-primary btn-header"
              onClick={() => (onOpenPitch ? onOpenPitch() : onNavigate && onNavigate('pitch'))}
              title="Open the judge pitch"
            >
              <HelpCircle size={13} />
              <span>Judge Pitch</span>
            </button>
          </div>
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
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              border: '1px solid var(--line)',
              boxShadow: isOutage ? '0 0 10px rgba(239, 68, 68, 0.35)' : 'none',
            }}
            title={isOutage ? 'Grid is disconnected (Islanded mode active)' : 'Utility 11kV grid is connected normally'}
          >
            <Power size={12} color={isOutage ? '#ef4444' : 'var(--ok-green)'} />
            <span>{isOutage ? 'GRID: CUT (OUTAGE)' : 'GRID: ON'}</span>
          </div>

          {/* Operating Mode Indicator */}
          <div
            className={`mode-badge status-chip ${isEmergency ? 'triage' : 'fairness'}`}
          >
            <div className={`live-dot ${isEmergency ? 'red' : 'green'}`}></div>
            {isEmergency ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={13} color="#ef4444" />
                <span>DISASTER TRIAGE</span>
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Activity size={13} color="var(--ok-green)" />
                <span>ROUTINE FAIRNESS</span>
              </span>
            )}
          </div>

          {/* Current Live Battery SoC Chip */}
          <div
            className="kpi-pill status-chip"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              border: '1px solid var(--line)',
            }}
            title="Current Live State-of-Charge (Instantaneous energy level stored in the battery right now)"
          >
            <BatteryCharging size={13} color="var(--warning-amber)" />
            <span>SoC: {(hourData?.battery_soc_pct ?? 78.4).toFixed(1)}%</span>
          </div>

          {/* Current Live Battery SoH Chip */}
          {batteryHealth && (
            <div
              className="kpi-pill status-chip"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--text-primary)',
                border: '1px solid var(--line)',
              }}
              title={`Current Live State-of-Health: ${batteryHealth.soh_pct}% | Duty Tier: ${batteryHealth.duty_tier}`}
            >
              <Activity size={13} color="var(--ok-green)" />
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
                <option key={b.id} value={b.id} style={{ background: theme === 'light' ? '#fffdf7' : '#0f172a', color: theme === 'light' ? '#1c1917' : '#f8fafc' }}>
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
