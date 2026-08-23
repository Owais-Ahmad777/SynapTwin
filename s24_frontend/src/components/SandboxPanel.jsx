import React, { useState } from 'react';
import { 
  Sliders, Play, RotateCcw, AlertTriangle, ShieldAlert, 
  Battery, Sun, Flame, Wind, Droplets, Info, ChevronDown, ChevronUp, Power, Clock, Zap, Check 
} from 'lucide-react';

export default function SandboxPanel({ 
  simParams, 
  onParamChange, 
  onRunSimulation, 
  onResetDemoDefaults,
  isRunning = false,
  batteryHealth,
  outageComparison,
  currentHour = 12,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [guardrailModalTarget, setGuardrailModalTarget] = useState(null);

  const isolatableBuildings = [
    { id: 'C-Block (Academic)', label: 'C-Block (Academic)', isTier1: false },
    { id: 'F-Block', label: 'F-Block (Academic)', isTier1: false },
    { id: 'G-Block', label: 'G-Block (Academic)', isTier1: false },
    { id: 'A-Block', label: 'A-Block (Academic)', isTier1: false },
    { id: 'D-Block', label: 'D-Block (Computer Labs)', isTier1: false },
    { id: 'ITER Boys Hostel 1', label: 'ITER Boys Hostel 1 (Dorm / In-Place Shelter)', isTier1: simParams.disaster_type === 'cyclone_severe_storm' },
    { id: 'ITER Boys Hostel 2', label: 'ITER Boys Hostel 2 (Dorm / In-Place Shelter)', isTier1: simParams.disaster_type === 'cyclone_severe_storm' },
    { id: 'ITER Boys Hostel 7', label: 'ITER Boys Hostel 7 (Dorm / In-Place Shelter & Sump)', isTier1: simParams.disaster_type === 'monsoon_waterlogging' || simParams.disaster_type === 'cyclone_severe_storm' },
    { id: 'Central Library', label: 'Central Library', isTier1: false },
    { id: 'ITER Administrative Block', label: 'ITER Administrative Block', isTier1: false },
    { id: 'ITER Cafeteria & Dining', label: 'ITER Cafeteria & Dining', isTier1: false },
    { id: 'Bansuri Guru Auditorium', label: 'Bansuri Guru Auditorium (Staff/Overflow)', isTier1: false },
    { id: 'Centre for Data Science', label: 'Centre for Data Science (HPC Lab)', isTier1: false },
    { id: 'Research & Innovation Wing', label: 'Research & Innovation Wing', isTier1: false },
    { id: 'S-Block (Sports Complex)', label: 'S-Block (Sports Complex)', isTier1: false },
    { id: 'Campus Medical Point', label: 'Campus Medical Point (Clinic)', isTier1: true },
    { id: 'Campus Server/Comms Room', label: 'Campus Server/Comms Room', isTier1: true },
  ];

  const handleBuildingIsolationSelect = (buildingId) => {
    const targetObj = isolatableBuildings.find(b => b.id === buildingId) || { id: buildingId, isTier1: false };
    
    // Check if Tier-1 Life-Safety guardrail is triggered
    if (targetObj.isTier1) {
      setGuardrailModalTarget(targetObj);
    } else {
      onParamChange({
        disaster_type: 'electrical_fire',
        is_disaster_active: true,
        isolated_building: buildingId,
      }, true);
    }
  };

  const confirmTier1Override = () => {
    if (guardrailModalTarget) {
      onParamChange({
        disaster_type: 'electrical_fire',
        is_disaster_active: true,
        isolated_building: guardrailModalTarget.id,
      }, true);
      setGuardrailModalTarget(null);
    }
  };

  const cancelTier1Override = () => {
    setGuardrailModalTarget(null);
  };

  const DEFAULT_DISASTER_WINDOWS = {
    cyclone_severe_storm: { start: 12, end: 22, causes_outage: true, label: 'Cyclone Safety Disconnect Window', icon: Wind, color: '#f59e0b' },
    grid_transformer_fault: { start: 12, end: 15, causes_outage: true, label: 'Transformer Fault Emergency Repair', icon: Zap, color: '#ef4444' },
    extended_outage: { start: 12, end: 15, causes_outage: true, label: '33kV Feeder Outage Repair', icon: AlertTriangle, color: '#ef4444' },
    electrical_fire: { start: 11, end: 13, causes_outage: true, label: 'Riser Isolation & Safety Clearance', icon: Flame, color: '#f97316' },
    monsoon_waterlogging: { start: 17, end: 22, causes_outage: true, label: 'Torrential Downpour & Sump Drainage', icon: Droplets, color: '#38bdf8' },
    heatwave_stress: { start: 11, end: 16, causes_outage: false, label: 'Peak AC Load & Thermal Surge', icon: Sun, color: '#fbbf24' },
  };

  const disasterOptions = [
    { id: 'monsoon_waterlogging', label: '🌧️ Monsoon Waterlogging (Odisha Peak)', desc: 'Groundwater table rises (17:00–22:00); drainage pumps in Hostel 7 basements require emergency prioritization.' },
    { id: 'cyclone_severe_storm', label: '🌀 Cyclone Warning (Bay of Bengal)', desc: 'Pre-emptive 11kV grid safety disconnect (Hours 12–22); hostel blocks (1, 2, 7) prioritized for in-place student shelter.' },
    { id: 'electrical_fire', label: '🔥 Electrical Fire & Feeder Isolation', desc: `Main electrical riser fault in ${simParams.isolated_building || 'C-Block (Academic)'} (Hours 11–13); block isolated and +18.4 kW redirected.` },
    { id: 'grid_transformer_fault', label: '⚡ Substation Transformer Explosion', desc: 'Catastrophic 11kV campus incomer failure (Hours 12–15 repair window) requiring second-life battery islanding.' },
    { id: 'heatwave_stress', label: '☀️ Extreme Heatwave Load Surge', desc: 'Ambient 44°C triggers massive AC load surge (Hours 11–16) across all academic blocks and hostels.' },
  ];

  const currentDisaster = disasterOptions.find(d => d.id === simParams.disaster_type) || disasterOptions[0];
  const isDisasterEnabled = simParams.is_disaster_active;
  const currentDisasterConfig = DEFAULT_DISASTER_WINDOWS[simParams.disaster_type] || DEFAULT_DISASTER_WINDOWS.monsoon_waterlogging;
  const DisasterWindowIcon = currentDisasterConfig.icon || ShieldAlert;
  const causesOutage = currentDisasterConfig.causes_outage;

  // Configurable disaster window
  const disasterStart = simParams.disaster_start_hour ?? (simParams.disaster_type === 'cyclone_severe_storm' ? simParams.cyclone_start_hour : null) ?? currentDisasterConfig.start;
  const disasterEnd = simParams.disaster_end_hour ?? (simParams.disaster_type === 'cyclone_severe_storm' ? simParams.cyclone_end_hour : null) ?? currentDisasterConfig.end;
  const disasterDuration = Math.max(1, disasterEnd - disasterStart + 1);

  // Backward compatibility alias for cyclone
  const cycloneStart = disasterStart;
  const cycloneEnd = disasterEnd;
  const cycloneDuration = disasterDuration;

  // Locked & Outage states for current hour
  const isCurrentHourDisasterLocked = isDisasterEnabled && causesOutage && currentHour >= disasterStart && currentHour <= disasterEnd;
  const isCurrentHourManualCut = (simParams.outage_hours || []).includes(currentHour);
  const isCurrentHourOutage = isCurrentHourManualCut || isCurrentHourDisasterLocked;
  const totalManualOutageHoursCount = (simParams.outage_hours || []).length;

  // Toggle single hour in outage schedule (no-op if locked by active disaster protocol)
  const toggleSingleHourOutage = (hourToToggle) => {
    const isLocked = isDisasterEnabled && causesOutage && hourToToggle >= disasterStart && hourToToggle <= disasterEnd;
    if (isLocked) return;

    const currentList = simParams.outage_hours || [];
    let updated;
    if (currentList.includes(hourToToggle)) {
      updated = currentList.filter(h => h !== hourToToggle);
    } else {
      updated = [...currentList, hourToToggle].sort((a, b) => a - b);
    }
    onParamChange({ outage_hours: updated }, true);
  };

  // Main Action for Current Hour Outage / Restore
  const handleCurrentHourPowerAction = () => {
    if (isCurrentHourDisasterLocked) {
      // Ends active disaster protocol early to restore 11kV grid connection immediately
      onParamChange({ is_disaster_active: false }, true);
    } else if (isCurrentHourManualCut) {
      // Clear manual cut for current hour
      toggleSingleHourOutage(currentHour);
    } else {
      // Trigger manual cut for current hour
      toggleSingleHourOutage(currentHour);
    }
  };

  // Button labels and colors based on precise cause of outage
  let currentHourBtnLabel = 'CUT POWER NOW';
  let currentHourBtnTitle = `Click to cut power and trigger islanded triage at Hour ${currentHour}:00`;
  let currentHourBtnBg = 'rgba(16,185,129,0.2)';
  let currentHourBtnColor = '#34d399';
  let currentHourBtnBorder = '1px solid #10b981';

  if (isCurrentHourDisasterLocked) {
    const shortLabel = simParams.disaster_type === 'cyclone_severe_storm' ? 'Cyclone' : (simParams.disaster_type === 'grid_transformer_fault' ? 'Fault' : 'Disaster');
    currentHourBtnLabel = `RESTORE GRID (Ends ${shortLabel} Early)`;
    currentHourBtnTitle = `Hour ${currentHour}:00 is locked under ${currentDisaster.label} (Hours ${disasterStart}–${disasterEnd}). Click to end disaster protocol early and restore 11kV grid power.`;
    currentHourBtnBg = currentDisasterConfig.color === '#ef4444' ? '#ef4444' : (currentDisasterConfig.color === '#f59e0b' ? '#f59e0b' : '#38bdf8');
    currentHourBtnColor = currentDisasterConfig.color === '#ef4444' ? '#ffffff' : '#000000';
    currentHourBtnBorder = `1px solid ${currentDisasterConfig.color}`;
  } else if (isCurrentHourManualCut) {
    currentHourBtnLabel = `RESTORE GRID (Hour ${currentHour}h)`;
    currentHourBtnTitle = `Hour ${currentHour}:00 is manually cut. Click to restore 11kV utility grid connection.`;
    currentHourBtnBg = '#ef4444';
    currentHourBtnColor = '#ffffff';
    currentHourBtnBorder = '1px solid #f87171';
  }

  return (
    <div className="panel-card sandbox-card" style={{ border: '1px solid rgba(245, 158, 11, 0.4)' }}>
      {/* Sandbox Header */}
      <div className="panel-header" style={{ background: 'rgba(245, 158, 11, 0.08)' }}>
        <div className="panel-title" style={{ color: '#fbbf24' }}>
          <Sliders size={16} color="#fbbf24" />
          <span>Judge &amp; Operator Simulation Sandbox</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            type="button"
            className="btn-secondary"
            onClick={onResetDemoDefaults}
            style={{ padding: '4px 10px', fontSize: '11px', gap: 5 }}
            title="Reset sandbox to full presentation default scenario"
          >
            <RotateCcw size={12} />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ padding: '16px 20px', gap: 14 }}>
        {/* Sandbox Instruction Banner */}
        <div style={{
          background: 'rgba(245, 158, 11, 0.06)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          fontSize: '11px',
          color: '#cbd5e1',
          lineHeight: 1.4,
        }}>
          Live interactive microgrid simulator: Trigger manual power cuts on any hour, simulate Odisha disasters, and watch the Max-Min LP and Lexicographic Triage engine re-solve in real-time.
        </div>

        {/* CONTROLS SECTION */}
        <div className="control-group">
          {/* 1. MANUAL POWER CUT CONTROLLER (ANY HOUR / LIVE TOGGLE) */}
          <div className="control-item" style={{
            background: isCurrentHourOutage ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.02)',
            border: isCurrentHourOutage ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px',
          }}>
            {/* Live Power Cut Row */}
            <div className="control-label-row" style={{ marginBottom: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <Power size={16} color={isCurrentHourOutage ? (isCurrentHourDisasterLocked ? currentDisasterConfig.color : '#ef4444') : '#10b981'} />
                <span>Manual Power Cut (Grid Outage)</span>
              </span>

              {/* Instant Current Hour Toggle Switch */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  color: isCurrentHourOutage ? (isCurrentHourDisasterLocked ? currentDisasterConfig.color : '#f87171') : '#34d399',
                  background: isCurrentHourOutage ? (isCurrentHourDisasterLocked ? `${currentDisasterConfig.color}25` : 'rgba(239,68,68,0.18)') : 'rgba(16,185,129,0.15)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: isCurrentHourOutage ? (isCurrentHourDisasterLocked ? `1px solid ${currentDisasterConfig.color}` : '1px solid #ef4444') : '1px solid rgba(16,185,129,0.4)',
                }}>
                  {isCurrentHourOutage ? `Hour ${currentHour}:00: CUT` : `Hour ${currentHour}:00: GRID ON`}
                </span>
                
                <button
                  type="button"
                  onClick={handleCurrentHourPowerAction}
                  style={{
                    background: currentHourBtnBg,
                    color: currentHourBtnColor,
                    border: currentHourBtnBorder,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: isCurrentHourOutage ? (isCurrentHourDisasterLocked ? `0 0 12px ${currentDisasterConfig.color}40` : '0 0 12px rgba(239,68,68,0.4)') : 'none',
                    transition: 'all 0.2s ease',
                  }}
                  title={currentHourBtnTitle}
                >
                  <Power size={13} />
                  <span>{currentHourBtnLabel}</span>
                </button>
              </div>
            </div>

            {/* Subtext info */}
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: 10 }}>
              Click any hour below to toggle power cut ON/OFF arbitrarily across the 24-hour day:
            </div>

            {/* 24-HOUR INTERACTIVE OUTAGE MATRIX */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gap: 4,
              marginBottom: 10,
            }}>
              {Array.from({ length: 24 }).map((_, h) => {
                const isManualCut = (simParams.outage_hours || []).includes(h);
                const isDisasterCut = isDisasterEnabled && causesOutage && (h >= disasterStart && h <= disasterEnd);
                const isLocked = isDisasterCut;
                const isOut = isManualCut || isLocked;
                const isCur = h === currentHour;

                let btnBg = 'rgba(255,255,255,0.03)';
                let btnBorder = '1px solid rgba(255,255,255,0.08)';
                let btnColor = '#94a3b8';
                let btnTitle = `Hour ${h}:00 - Grid Connected (Click to cut power)`;
                let btnCursor = 'pointer';
                let btnOpacity = 1;

                if (isDisasterCut) {
                  btnBg = `${currentDisasterConfig.color}20`;
                  btnBorder = `1px dashed ${currentDisasterConfig.color}`;
                  btnColor = currentDisasterConfig.color;
                  btnCursor = 'not-allowed';
                  btnOpacity = 0.75;
                  btnTitle = `Locked by ${currentDisaster.label} (Hours ${disasterStart}–${disasterEnd}) — disable Odisha Disaster Protocol above to release this hour, or use RESTORE GRID to end early.`;
                } else if (isManualCut) {
                  btnBg = 'rgba(239, 68, 68, 0.35)';
                  btnBorder = '1px solid #ef4444';
                  btnColor = '#fca5a5';
                  btnTitle = `Hour ${h}:00 - MANUAL OPERATOR POWER CUT (Click to restore)`;
                }

                if (isCur) {
                  btnBorder = isLocked ? `1.5px solid ${currentDisasterConfig.color}` : '1.5px solid #38bdf8';
                  if (!isOut) {
                    btnBg = 'rgba(56, 189, 248, 0.15)';
                    btnColor = '#38bdf8';
                  }
                }

                return (
                  <button
                    key={h}
                    type="button"
                    disabled={isLocked}
                    onClick={() => toggleSingleHourOutage(h)}
                    style={{
                      padding: '4px 2px',
                      fontSize: '10px',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: isOut || isCur ? 700 : 500,
                      borderRadius: 4,
                      cursor: btnCursor,
                      opacity: btnOpacity,
                      border: btnBorder,
                      background: btnBg,
                      color: btnColor,
                      boxShadow: isOut ? `0 0 6px ${currentDisasterConfig.color}40` : 'none',
                      transition: 'all 0.15s ease',
                      textAlign: 'center',
                    }}
                    title={btnTitle}
                  >
                    {h}h{isLocked ? ' 🔒' : ''}
                  </button>
                );
              })}
            </div>

            {/* Quick Outage Action Presets */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '11px' }}>
              <span style={{ color: '#64748b', fontSize: '10px' }}>Presets:</span>
              <button
                type="button"
                className={`btn-ctrl ${(simParams.outage_hours || []).includes(12) && !(isDisasterEnabled && causesOutage) ? 'active' : ''}`}
                style={{ fontSize: '10px', padding: '3px 8px' }}
                onClick={() => onParamChange({ outage_hours: [11, 12, 13] }, true)}
                title="Set daytime manual outage (11:00-13:00) during active solar generation"
              >
                <Sun size={11} /> Daytime (11–13h)
              </button>
              <button
                type="button"
                className={`btn-ctrl ${(simParams.outage_hours || []).includes(20) && !(isDisasterEnabled && causesOutage) ? 'active' : ''}`}
                style={{ fontSize: '10px', padding: '3px 8px' }}
                onClick={() => onParamChange({ outage_hours: [19, 20, 21] }, true)}
                title="Set evening peak manual outage (19:00-21:00) when solar is zero"
              >
                <Clock size={11} /> Evening (19–21h)
              </button>
              <button
                type="button"
                className="btn-ctrl"
                style={{ fontSize: '10px', padding: '3px 8px', color: '#34d399' }}
                onClick={() => onParamChange({ outage_hours: [] }, true)}
                title="Clear all manual operator cuts (leaves disaster protocol untouched if active)"
              >
                <Check size={11} /> Clear Manual Cuts
              </button>

              {isDisasterEnabled && (
                <button
                  type="button"
                  className="btn-ctrl"
                  style={{ fontSize: '10px', padding: '3px 8px', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}
                  onClick={() => onParamChange({ is_disaster_active: false }, true)}
                  title="End active disaster protocol early and return to 100% routine grid operation"
                >
                  <ShieldAlert size={11} /> End Disaster Protocol
                </button>
              )}

              {totalManualOutageHoursCount > 0 ? (
                <span style={{ fontSize: '10px', color: '#fca5a5', marginLeft: 'auto', fontWeight: 600 }}>
                  ⚡ {totalManualOutageHoursCount}h Manual Outage
                </span>
              ) : (
                <span style={{ fontSize: '10px', color: '#34d399', marginLeft: 'auto', fontWeight: 600 }}>
                  {isDisasterEnabled ? '🚨 Disaster Islanding Active' : '✓ Grid 100% Connected'}
                </span>
              )}
            </div>
          </div>

          {/* 2. REALISTIC DISASTER PROTOCOLS */}
          <div className="control-item">
            <div className="control-label-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldAlert size={15} color={isDisasterEnabled ? '#f59e0b' : '#64748b'} />
                <span>Odisha Disaster Protocol</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  color: isDisasterEnabled ? '#fbbf24' : '#64748b',
                  background: isDisasterEnabled ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: isDisasterEnabled ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.1)',
                }}>
                  {isDisasterEnabled ? 'ACTIVE' : 'STANDBY'}
                </span>
                <label className="toggle-switch" title="Toggle disaster emergency protocol. When ON, priority triage and hazard routing activate.">
                  <input 
                    type="checkbox" 
                    checked={isDisasterEnabled}
                    onChange={(e) => {
                      onParamChange({
                        is_disaster_active: e.target.checked,
                        disaster_type: e.target.checked ? (simParams.disaster_type || 'monsoon_waterlogging') : 'none',
                      }, true);
                    }}
                  />
                  <span className="toggle-slider amber"></span>
                </label>
              </div>
            </div>

            {/* Disaster Dropdown Selector */}
            <select
              value={simParams.disaster_type || 'monsoon_waterlogging'}
              onChange={(e) => {
                const nextType = e.target.value;
                const nextCfg = DEFAULT_DISASTER_WINDOWS[nextType] || DEFAULT_DISASTER_WINDOWS.monsoon_waterlogging;
                onParamChange({
                  disaster_type: nextType,
                  is_disaster_active: true,
                  disaster_start_hour: nextCfg.start,
                  disaster_end_hour: nextCfg.end,
                  cyclone_start_hour: nextCfg.start,
                  cyclone_end_hour: nextCfg.end,
                }, true);
              }}
              className="custom-select"
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '7px 10px',
                background: '#090e17',
                border: `1px solid ${currentDisasterConfig.color}60`,
                borderRadius: 'var(--radius-sm)',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 600,
              }}
              title="Select a disaster scenario to simulate: Monsoon waterlogging, Cyclone alert, Electrical fire isolation, Grid transformer fault, or Heatwave AC surge."
            >
              {disasterOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
              {currentDisaster.desc}
            </div>

            {/* CONFIGURABLE DISASTER ACTIVE WINDOW SLIDERS (FOR ALL DISASTER TYPES) */}
            {isDisasterEnabled && (
              <div style={{
                marginTop: 8,
                background: `${currentDisasterConfig.color}10`,
                border: `1px solid ${currentDisasterConfig.color}40`,
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: currentDisasterConfig.color, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <DisasterWindowIcon size={13} color={currentDisasterConfig.color} />
                    <span>{currentDisasterConfig.label}:</span>
                  </span>
                  <span style={{ fontSize: '10px', background: `${currentDisasterConfig.color}25`, color: currentDisasterConfig.color, padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontFamily: 'monospace' }}>
                    Hours {disasterStart}:00 – {disasterEnd}:00 ({disasterDuration}h {causesOutage ? 'Islanded' : 'Peak Surge'})
                  </span>
                </div>

                <div style={{ fontSize: '10.5px', color: '#94a3b8', lineHeight: 1.3 }}>
                  {causesOutage 
                    ? 'Adjust start/end hours to demonstrate shorter or longer emergency outage/repair window:' 
                    : 'Adjust start/end hours to demonstrate duration of thermal stress and peak AC surge:'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#cbd5e1', marginBottom: 3 }}>
                      <span>{causesOutage ? 'Disconnection Start:' : 'Surge Start:'}</span>
                      <b style={{ color: currentDisasterConfig.color, fontFamily: 'monospace' }}>{disasterStart}:00</b>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={disasterEnd}
                      value={disasterStart}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onParamChange({ 
                          disaster_start_hour: val, 
                          cyclone_start_hour: val 
                        }, true);
                      }}
                      style={{ width: '100%', accentColor: currentDisasterConfig.color, cursor: 'pointer' }}
                      title={`Adjust emergency window start hour (currently ${disasterStart}:00)`}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#cbd5e1', marginBottom: 3 }}>
                      <span>{causesOutage ? 'Re-connection End:' : 'Surge End:'}</span>
                      <b style={{ color: currentDisasterConfig.color, fontFamily: 'monospace' }}>{disasterEnd}:00</b>
                    </div>
                    <input
                      type="range"
                      min={disasterStart}
                      max={23}
                      value={disasterEnd}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onParamChange({ 
                          disaster_end_hour: val, 
                          cyclone_end_hour: val 
                        }, true);
                      }}
                      style={{ width: '100%', accentColor: currentDisasterConfig.color, cursor: 'pointer' }}
                      title={`Adjust emergency window end hour (currently ${disasterEnd}:00)`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Isolated Building Power Redirection & Manual Selector */}
            {simParams.disaster_type === 'electrical_fire' && (
              <div style={{
                marginTop: 8,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Flame size={13} color="#f87171" />
                    <span>Fire Fault Isolation Target:</span>
                  </span>
                  <span style={{ fontSize: '10px', background: 'rgba(239,68,68,0.2)', color: '#f87171', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                    +18.4 kW Redirected
                  </span>
                </div>

                {/* Building Selector */}
                <select
                  value={simParams.isolated_building || 'C-Block (Academic)'}
                  onChange={(e) => handleBuildingIsolationSelect(e.target.value)}
                  className="custom-select"
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    background: '#070c14',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: 'var(--radius-sm)',
                    color: '#f8fafc',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                  title="Select which campus building main electrical riser to isolate"
                >
                  {isolatableBuildings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.label} {b.isTier1 ? '⚠️ [TIER-1 LIFE-SAFETY]' : ''}
                    </option>
                  ))}
                </select>

                <div style={{ fontSize: '10px', color: '#cbd5e1', lineHeight: 1.35 }}>
                  Main electrical riser isolated for <b>{simParams.isolated_building || 'C-Block (Academic)'}</b> (0 kW). Power redirected to active deficit nodes.
                </div>
              </div>
            )}
          </div>

          {/* 3. Daytime vs. Evening Outage Comparison Callout */}
          {outageComparison && (
            <div style={{
              background: 'rgba(56, 189, 248, 0.05)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              fontSize: '11px',
              color: '#f8fafc',
              lineHeight: 1.4,
            }}>
              <b style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <Info size={12} /> Daytime vs. Night Solar Resilience:
              </b>
              <span>
                Daytime cut: <b>solar directly covers {outageComparison.daytime_solar_coverage_pct}%</b> of load; battery only supplies {outageComparison.daytime_battery_coverage_pct}%. At night, battery must cover 100% alone.
              </span>
            </div>
          )}

          {/* 4. Second-Life Battery Aging Slider */}
          <div className="control-item">
            <div className="control-label-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Battery size={15} color="#06b6d4" />
                <span>Battery Service Age</span>
              </span>
              <span className="control-val">
                {simParams.days_in_service} Days ({batteryHealth ? `${batteryHealth.soh_pct}% SoH` : 'Aging'})
              </span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="600" 
              step="20"
              value={simParams.days_in_service} 
              onChange={(e) => onParamChange({ days_in_service: Number(e.target.value) }, true)}
              className="custom-range"
              title="Simulates multi-month cycling and calendar degradation; automatically triggers duty tier demotions and power derating."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
              <span>Day 0 (82% SoH: Full Duty)</span>
              <span>Day 200 (80% SoH: Backup)</span>
              <span>Day 500 (65% SoH: Low)</span>
            </div>
          </div>

          {/* 5. Collapsible Custom Scenario Overrides */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '4px 0',
              }}
            >
              <span>Custom Solar &amp; Load Multipliers</span>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 4 }}>
                <div>
                  <div className="control-label-row">
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Solar Irradiance Multiplier</span>
                    <span className="control-val">{simParams.solar_multiplier}x</span>
                  </div>
                  <input 
                    type="range" min="0.0" max="2.0" step="0.1"
                    value={simParams.solar_multiplier}
                    onChange={(e) => onParamChange({ solar_multiplier: Number(e.target.value) }, true)}
                    className="custom-range"
                  />
                </div>

                <div>
                  <div className="control-label-row">
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Campus Load Multiplier</span>
                    <span className="control-val">{simParams.load_multiplier}x</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="2.5" step="0.1"
                    value={simParams.load_multiplier}
                    onChange={(e) => onParamChange({ load_multiplier: Number(e.target.value) }, true)}
                    className="custom-range"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mandatory Tier-1 Life-Safety Override Confirmation Modal */}
      {guardrailModalTarget && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(6px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={cancelTier1Override}
        >
          <div 
            style={{
              background: '#090e17',
              border: '2px solid #ef4444',
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.9), 0 0 30px rgba(239,68,68,0.3)',
              color: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'rgba(239,68,68,0.2)', padding: 8, borderRadius: 8 }}>
                <AlertTriangle size={24} color="#ef4444" />
              </div>
              <div>
                <b style={{ color: '#f87171', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Life-Safety System Override Warning
                </b>
                <div style={{ color: '#94a3b8', fontSize: '11px' }}>Mandatory Operator Guardrail Verification</div>
              </div>
            </div>

            <div style={{ fontSize: '12px', lineHeight: 1.55, color: '#cbd5e1', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              You are attempting to manually disconnect power to <b style={{ color: '#f87171' }}>{guardrailModalTarget.label}</b>, which is currently classified as <b>Tier-1 Critical Life-Safety</b> infrastructure.
              <br/><br/>
              <span style={{ color: '#fca5a5' }}>
                ⚠️ An inadvertent manual power cutoff will compromise medical refrigeration, campus communication servers, emergency sump drainage, or designated cyclone shelter operations.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
              <button 
                type="button" 
                onClick={cancelTier1Override}
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                Cancel &amp; Protect Life-Safety
              </button>
              <button 
                type="button" 
                onClick={confirmTier1Override}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: '1px solid #f87171',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(239,68,68,0.4)',
                }}
              >
                Confirm Override &amp; Isolate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
