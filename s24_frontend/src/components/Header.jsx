import React from 'react';
import {
  Zap, AlertTriangle, BatteryCharging,
  Activity, Power, Shield, Building2
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
  theme = 'dark',
  identityLabel = 'Admin',
  identityKind = 'admin',
}) {
  const isEmergency = Boolean(isOutage || isDisasterActive || hourData?.mode === 'DISASTER_TRIAGE' || currentMode === 'DISASTER_TRIAGE');
  const IdentityIcon = identityKind === 'admin' ? Shield : Building2;

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

        {/* Group C: read-only session identity chip (Addendum 4 §3) — role is
            fixed at login, so this chip never toggles; it only labels. */}
        <div className="st-identity-chip" title={`Signed in as ${identityLabel}`}>
          <IdentityIcon size={13} />
          <span>{identityLabel}</span>
        </div>

      </div>
    </header>
  );
}
