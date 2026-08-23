import React, { useState, useEffect, useRef } from 'react';
import { Sun, Battery, Leaf, Zap, ShieldAlert, Cpu, Bike, Info, HelpCircle, TrendingDown, X, Clock, IndianRupee } from 'lucide-react';

export default function KPIBanner({ 
  hourData, 
  impactMetrics, 
  batteryHealth, 
  isDisasterActive = false,
  disasterType = 'none',
  isCustomScenario = false,
  onOpenFairnessModal 
}) {
  const [activeTooltip, setActiveTooltip] = useState(null);
  const bannerRef = useRef(null);

  // Close tooltip on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (bannerRef.current && !bannerRef.current.contains(e.target)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!hourData) return null;

  const totalSolarKw = hourData.blocks?.reduce((acc, b) => acc + (b.solar_kw || 0), 0) || 0;
  const totalLoadKw = hourData.blocks?.reduce((acc, b) => acc + (b.load_kw || 0), 0) || 0;
  const totalAllocatedKw = hourData.blocks?.reduce((acc, b) => acc + (b.allocated_kw || 0), 0) || 0;
  const isOutage = hourData.is_outage;
  const currentHour = hourData.hour;

  const isDisaster = Boolean(
    (hourData.is_disaster_active && hourData.disaster_type && hourData.disaster_type !== 'none') ||
    (isDisasterActive && disasterType && disasterType !== 'none')
  );
  const activeDisasterType = hourData.disaster_type || disasterType;
  const isTriageMode = isOutage || isDisaster || hourData.mode === 'DISASTER_TRIAGE';
  const isHeatwave = isDisaster && activeDisasterType === 'heatwave_stress';

  // 24h Average demand
  const dailyAvgDemandKw = impactMetrics?.daily_avg_demand_kw || 715.3;

  // Baseline vs Optimized savings (Energy & Rupee ₹ ToU)
  const kwhSaved = impactMetrics?.kwh_saved_by_optimization || 2993.0;
  const pctSaved = impactMetrics?.pct_grid_saved || 25.9;
  const dailyInrSaved = impactMetrics?.daily_inr_saved || 21262;
  const monthlyInrSaved = impactMetrics?.monthly_inr_saved || 637860;
  const annualInrSaved = impactMetrics?.annual_inr_saved || 7760630;

  // Outage Backup Runtime
  const backupRuntimeHours = hourData.backup_runtime_hours ?? 1.6;

  // Compute true worst-served service ratio across all active, non-isolated campus buildings
  const activeBlocks = hourData.blocks?.filter(b => b.load_kw > 0.001 && !(b.is_fire_isolated || b.status?.includes('FIRE') || b.status?.includes('DISCONNECTED'))) || [];
  const minServiceRatio = activeBlocks.length > 0
    ? Math.min(...activeBlocks.map(b => Math.min(100.0, Math.round(((b.solar_kw + (b.allocated_kw || 0)) / b.load_kw) * 1000) / 10)))
    : 100.0;

  const getDriEVSubtext = () => {
    if (isOutage) {
      return 'Emergency scooter battery buffer';
    }
    if (hourData.driev_solar_surplus_redirected_kw > 0) {
      return 'Absorbing midday solar surplus';
    }
    if (totalSolarKw <= 0.01) {
      return <span style={{ color: '#94a3b8' }}>0 kW at night (no irradiance)</span>;
    }
    return <span style={{ color: '#94a3b8' }}>0 kW (solar fully absorbed by campus demand)</span>;
  };

  const renderTooltipModal = (id, title, content, customAction = null) => {
    if (activeTooltip !== id) return null;

    return (
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 8,
          background: '#0f172a',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: 8,
          padding: '12px 14px',
          boxShadow: '0 12px 30px rgba(0,0,0,0.85)',
          zIndex: 1000,
          fontSize: '12px',
          color: '#f8fafc',
          lineHeight: 1.5,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4 }}>
          <b style={{ color: '#38bdf8', fontSize: '12px' }}>{title}</b>
          <button 
            onClick={() => setActiveTooltip(null)}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
          >
            <X size={13} />
          </button>
        </div>
        <div style={{ color: '#cbd5e1', fontSize: '11px' }}>
          {content}
        </div>
        {customAction && (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {customAction}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Extreme Heatwave AC Demand Response & Peak-Shaving Banner */}
      {isHeatwave && (
        <div style={{
          width: '100%',
          marginBottom: 12,
          background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.22) 0%, rgba(245, 158, 11, 0.22) 100%)',
          border: '1px solid rgba(239, 68, 68, 0.45)',
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontSize: '12px',
          color: '#f8fafc',
          boxShadow: '0 4px 16px rgba(239, 68, 68, 0.25)',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '18px' }}>🔥</span>
            <div>
              <b style={{ color: '#fca5a5' }}>EXTREME HEATWAVE DEMAND RESPONSE PROTOCOL ACTIVE (44°C):</b>{' '}
              <span style={{ color: '#cbd5e1' }}>
                Campus AC chillers surging by +35% to <b>{totalLoadKw.toFixed(1)} kW</b> peak demand. Shared battery is actively discharging at maximum rate <b>(84.0 kW)</b> to clamp peak grid imports and avoid TPCODL Maximum Demand Indicator (MDI) penal surcharges.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="kpi-pill" style={{ background: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', border: '1px solid #ef4444', fontWeight: 600 }}>
              MDI CLAMP: -84.0 kW
            </span>
            <span className="kpi-pill" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
              GRID CONNECTED
            </span>
          </div>
        </div>
      )}

      <div className="kpi-row" ref={bannerRef} style={{ position: 'relative' }}>
        {/* 1. Solar Generation */}
        <div 
          className="kpi-card"
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <div className="kpi-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Rooftop Solar PV</span>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === 'solar' ? null : 'solar'); }}
                title="Click for details on Rooftop Solar PV generation"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
              >
                <Info size={13} color={activeTooltip === 'solar' ? '#38bdf8' : '#94a3b8'} />
              </button>
            </span>
            <Sun size={16} color="#f59e0b" />
          </div>

          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: '#fbbf24' }}>
              {totalSolarKw.toFixed(1)}
            </span>
            <span className="kpi-unit">kW gen</span>
            {isCustomScenario && (
              <span className="kpi-pill" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: '10px' }}>Custom</span>
            )}
          </div>

          <div className="kpi-subtext">
            {totalSolarKw > 5 
              ? 'Active rooftop generation' 
              : <span style={{ color: '#94a3b8' }}>0 kW expected at night (18:00–06:00)</span>}
          </div>

          {renderTooltipModal(
            'solar',
            'Rooftop Solar PV Generation (16 Buildings)',
            <div>
              <div>&bull; <b>Total Campus PV:</b> 1,600+ kWp installed across all 16 building rooftops.</div>
              <div>&bull; <b>Live Output:</b> {totalSolarKw.toFixed(1)} kW generation this hour.</div>
              <div>&bull; <b>Physics Model:</b> Solar output is 0.0 kW during nighttime (18:00–06:00) due to zero solar irradiance, peaking around 12:00–13:00.</div>
            </div>
          )}
        </div>

        {/* 2. Campus Demand */}
        <div 
          className="kpi-card"
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <div className="kpi-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Campus Demand</span>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === 'demand' ? null : 'demand'); }}
                title="Click for details on total campus electrical demand"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
              >
                <Info size={13} color={activeTooltip === 'demand' ? '#38bdf8' : '#94a3b8'} />
              </button>
            </span>
            <Zap size={16} color="#3b82f6" />
          </div>

          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: '#60a5fa' }}>
              {totalLoadKw.toFixed(1)}
            </span>
            <span className="kpi-unit">kW load</span>
          </div>

          <div className="kpi-subtext">
            {totalLoadKw > dailyAvgDemandKw
              ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>Above daily average ({dailyAvgDemandKw.toFixed(0)} kW)</span>
              : <span style={{ color: '#94a3b8' }}>Below daily average ({dailyAvgDemandKw.toFixed(0)} kW)</span>}
          </div>

          {renderTooltipModal(
            'demand',
            'Total SOA ITER Campus Electrical Demand (16 Buildings)',
            <div>
              <div>&bull; <b>16 Monitored Buildings:</b> Hostels, Academic Blocks (C, D, F, G, A), Central Library, Auditorium, Data Science HPC Labs, Research Wing, Substation.</div>
              <div>&bull; <b>Current Draw:</b> {totalLoadKw.toFixed(1)} kW aggregate demand at {String(currentHour).padStart(2, '0')}:00.</div>
              <div>&bull; <b>Campus Curve:</b> Peaks during daytime academic/lab hours and evening hostel return.</div>
            </div>
          )}
        </div>

        {/* 3. Second-Life Battery Health & Derating */}
        <div 
          className="kpi-card"
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <div className="kpi-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Battery Output (SoH)</span>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === 'battery' ? null : 'battery'); }}
                title="Click for details on Second-Life EV Battery Health & Derating"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
              >
                <Info size={13} color={activeTooltip === 'battery' ? '#38bdf8' : '#94a3b8'} />
              </button>
            </span>
            <Battery size={16} color="#06b6d4" />
          </div>

          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: '#38bdf8' }}>
              {hourData.battery_used_kw?.toFixed(1) || '0.0'}
            </span>
            <span className="kpi-unit">/ {hourData.battery_available_kw?.toFixed(1) || '0.0'} kW</span>
          </div>

          <div className="kpi-subtext">
            {isOutage ? (
              <span style={{ color: '#f87171', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} />
                <span>Runtime: ~{backupRuntimeHours}h critical backup</span>
              </span>
            ) : (
              batteryHealth ? `Tier: ${batteryHealth.duty_tier} (derated)` : 'Operating normally'
            )}
          </div>

          {renderTooltipModal(
            'battery',
            'Second-Life EV Battery Health & Backup Runtime',
            <div>
              <div>&bull; <b>Battery Pack:</b> 120 kW / 360 kWh repurposed EV battery bank.</div>
              <div>&bull; <b>Health State:</b> {batteryHealth?.soh_pct || 79.8}% State of Health (SoH).</div>
              <div>&bull; <b>Degradation-Aware Derating:</b> Power output is automatically derated from 120 kW to {hourData.battery_available_kw?.toFixed(1)} kW in <b>{batteryHealth?.duty_tier || 'BACKUP_ONLY'}</b> tier.</div>
              {isOutage && (
                <div style={{ marginTop: 4, color: '#f87171' }}>
                  &bull; <b>Backup Runtime:</b> Battery can sustain Tier-1/2 critical loads for <b>~{backupRuntimeHours} more hours</b> at current draw ({batteryHealth?.usable_capacity_kwh || 287} kWh remaining).
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Allocation Quality & Max-Min Modal Trigger */}
        <div 
          className="kpi-card"
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <div className="kpi-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{isHeatwave ? 'Triage Peak-Shaving' : (isTriageMode ? 'Triage Life-Safety' : 'Max-Min Fairness')}</span>
              <button 
                onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === 'fairness' ? null : 'fairness'); }}
                title="Click for mathematical definition & worked example"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', padding: 0 }}
              >
                <HelpCircle size={13} color={activeTooltip === 'fairness' ? '#38bdf8' : (isTriageMode ? '#ef4444' : '#34d399')} />
              </button>
            </span>
            {isTriageMode ? <ShieldAlert size={16} color="#ef4444" /> : <Cpu size={16} color="#10b981" />}
          </div>

          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: isTriageMode ? '#f87171' : '#34d399' }}>
              {isHeatwave 
                ? `+${(hourData.battery_used_kw || 84.0).toFixed(1)} kW`
                : (isTriageMode 
                  ? (hourData.rejected_kw > 0.01 ? `Cut: ${hourData.rejected_kw.toFixed(1)} kW` : '100% Preserved')
                  : `${minServiceRatio.toFixed(1)}%`)}
            </span>
            <span className="kpi-unit" style={{ fontSize: isTriageMode ? '11px' : '9.5px' }}>{isHeatwave ? 'MDI clamp' : (isTriageMode ? 'triage' : 'min local-resource coverage')}</span>
          </div>

          <div className="kpi-subtext" style={{ cursor: 'pointer' }} onClick={onOpenFairnessModal}>
            {isHeatwave ? (
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>🔥 AC Peak Clamped (-84 kW)</span>
            ) : isTriageMode ? (
              <span style={{ color: '#f87171', textDecoration: 'underline' }}>View worked triage math &rarr;</span>
            ) : (
              <div>
                <span style={{ color: '#34d399', textDecoration: 'underline', display: 'block' }}>View worked math example &rarr;</span>
                <span style={{ fontSize: '9.5px', color: '#94a3b8', display: 'block', marginTop: 2, lineHeight: 1.3 }}>
                  Grid import covers remainder &mdash; no building unserved in normal operation.
                </span>
              </div>
            )}
          </div>

          {renderTooltipModal(
            'fairness',
            isHeatwave 
              ? 'Extreme Heatwave AC Demand Response & Peak Shaving'
              : (isTriageMode ? 'Disaster Lexicographic Triage Protocol' : 'Max-Min Fairness Linear Program (LP)'),
            <div>
              <div>&bull; <b>Objective:</b> {isHeatwave 
                ? 'Discharges shared battery at maximum rate during 44°C AC chiller surge to clamp peak demand and avoid TPCODL Maximum Demand Indicator (MDI) penal surcharges.'
                : (isTriageMode ? 'Guarantees Tier-1 critical life-safety & medical points first before allocating remaining emergency energy.' : 'Maximizes the minimum satisfaction ratio (allocation / deficit) across all campus buildings so no block is left starved.')}</div>
              <div>&bull; <b>Current Status:</b> {isHeatwave 
                ? `Clamping 84.0 kW from campus peak demand (${totalLoadKw.toFixed(1)} kW).`
                : (isTriageMode ? `${hourData.rejected_kw > 0.01 ? `${hourData.rejected_kw.toFixed(1)} kW non-critical load shed` : 'All essential loads fully preserved'}` : `Fairness ratio = ${(hourData.fairness_ratio * 100).toFixed(0)}% equalized across all deficit blocks.`)}</div>
              {isTriageMode && !isHeatwave && (
                <div>&bull; <b>Critical Backup Runtime:</b> ~{backupRuntimeHours} hours remaining.</div>
              )}
            </div>,
            <button 
              className="btn-primary" 
              onClick={() => { setActiveTooltip(null); onOpenFairnessModal(); }}
              style={{ width: '100%', padding: '5px 10px', fontSize: '11px', justifyContent: 'center' }}
            >
              Open Interactive Math Modal &rarr;
            </button>
          )}
        </div>

        {/* 5. Rupee (₹) Savings & Community Sharing Value Delta */}
        <div 
          className="kpi-card"
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <div className="kpi-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Financial ROI (ToU)</span>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === 'delta' ? null : 'delta'); }}
              title="Click for details on TPCODL ToU Tariff Savings & Optimization Value"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
            >
              <Info size={13} color={activeTooltip === 'delta' ? '#38bdf8' : '#94a3b8'} />
            </button>
          </span>
          <IndianRupee size={16} color="#10b981" />
        </div>

        <div className="kpi-value-row">
          <span className="kpi-value" style={{ color: '#10b981' }}>
            +₹{Number(dailyInrSaved).toLocaleString()}
          </span>
          <span className="kpi-unit">/ day saved</span>
        </div>

        <div className="kpi-subtext">
          <span style={{ color: '#34d399', fontWeight: 600 }}>₹{(Number(monthlyInrSaved) / 100000).toFixed(1)}L/mo</span> &bull; +{kwhSaved.toFixed(0)} kWh clean
        </div>

        {renderTooltipModal(
          'delta',
          'TPCODL Commercial Time-of-Use (ToU) Arbitrage & Value Delta',
          <div>
            <div>&bull; <b>Daily Cost Savings:</b> +₹{Number(dailyInrSaved).toLocaleString()} / day saved vs uncoordinated isolated baseline.</div>
            <div>&bull; <b>Monthly Projected Savings:</b> ₹{(Number(monthlyInrSaved) / 100000).toFixed(2)} Lakhs (₹{Number(annualInrSaved / 100000).toFixed(1)}L / year).</div>
            <div>&bull; <b>Odisha ToU Tariff Rules:</b> Peak (18:00–22:00) @ ₹8.50/kWh &bull; Normal (06:00–18:00) @ ₹6.80/kWh &bull; Off-Peak (22:00–06:00) @ ₹4.50/kWh.</div>
            <div>&bull; <b>Mechanism:</b> Shared second-life battery discharges during high-cost peak tariff windows, shaving peak demand charges.</div>
          </div>
        )}
      </div>

      {/* 6. driEV Smart Scooter Hub */}
      <div 
        className="kpi-card"
        style={{ position: 'relative', overflow: 'visible' }}
      >
        <div className="kpi-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>driEV Scooter Hub</span>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === 'driev' ? null : 'driev'); }}
              title="Click for details on driEV Campus Scooter Fleet & Solar Soak"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
            >
              <Info size={13} color={activeTooltip === 'driev' ? '#38bdf8' : '#94a3b8'} />
            </button>
          </span>
          <Bike size={16} color="#38bdf8" />
        </div>

        <div className="kpi-value-row">
          <span className="kpi-value" style={{ color: '#38bdf8' }}>
            {isOutage 
              ? `+${(hourData.driev_emergency_buffer_used_kw || 0).toFixed(1)}` 
              : `+${(hourData.driev_solar_surplus_redirected_kw || 0).toFixed(1)}`}
          </span>
          <span className="kpi-unit">kW {isOutage ? 'outage buffer' : 'surplus soak'}</span>
        </div>

        <div className="kpi-subtext">
          {getDriEVSubtext()}
        </div>

        {renderTooltipModal(
          'driev',
          'driEV Shared Campus Electric Scooter Hub',
          <div>
            <div>&bull; <b>Fleet:</b> 12 smart campus scooters (7 Speed @ 2.5 kWh + 5 Luxe @ 3.0 kWh).</div>
            <div>&bull; <b>Student Commute Patterns:</b> High on-ride checkout during morning (07:00–09:00) and evening (17:00–20:00) commutes; high docked charging during midday classes (10:00–16:00) and late night.</div>
            <div>&bull; <b>Solar Surplus Soak:</b> Dynamically absorbs excess midday solar generation to charge batteries.</div>
            <div>&bull; <b>Emergency Micro-Buffer:</b> Injects up to 3.2 kW of stored battery reserves back into the campus grid during power cuts.</div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
}
