import React from 'react';
import { 
  Sun, Zap, Battery, Bike, Building2, ArrowRight, ArrowDownRight, ArrowUpRight, 
  CheckCircle2, Activity, Scale, ShieldAlert, Info 
} from 'lucide-react';

export default function EnergyFlowDiagram({ hourData, currentHour = 12 }) {
  if (!hourData) return null;

  // Extract authentic per-hour energy telemetry
  const totalSolarKw = Number((hourData.energy_mix?.solar_kw ?? hourData.blocks?.reduce((acc, b) => acc + (b.solar_kw || 0), 0) ?? 0).toFixed(1));
  const gridImportKw = Number((hourData.energy_mix?.grid_import_kw ?? 0).toFixed(1));
  const batteryDischargeKw = Number((hourData.energy_mix?.battery_kw ?? hourData.battery_used_kw ?? 0).toFixed(1));
  const drievV2GKw = hourData.is_outage ? Number((hourData.driev_emergency_buffer_used_kw ?? 0).toFixed(1)) : 0.0;

  const totalDemandKw = Number((hourData.energy_mix?.total_demand_kw ?? hourData.blocks?.reduce((acc, b) => acc + (b.load_kw || 0), 0) ?? 0).toFixed(1));
  const batteryChargeKw = Number((hourData.battery_charge_kw ?? 0).toFixed(1));
  const drievChargingKw = Number((hourData.driev_solar_surplus_redirected_kw ?? hourData.driev_charging_bay_allocation_kw ?? 0).toFixed(1));

  // Power served to buildings vs unmet demand
  const servedToBuildingsKw = Number(Math.min(totalDemandKw, totalSolarKw + gridImportKw + batteryDischargeKw).toFixed(1));
  const unmetDemandKw = Number(Math.max(0.0, totalDemandKw - servedToBuildingsKw).toFixed(1));

  // Derived directional flow magnitudes
  const solarToBuildingsKw = Math.min(totalSolarKw, servedToBuildingsKw);
  const solarToBessKw = batteryChargeKw;
  const solarToDrievKw = drievChargingKw;
  const gridToBuildingsKw = gridImportKw;
  const bessToBuildingsKw = batteryDischargeKw;
  const drievToCampusKw = drievV2GKw;

  // Generation & Consumption balance terms
  const generationTerms = [];
  if (totalSolarKw > 0) generationTerms.push({ label: 'Solar PV', kw: totalSolarKw, color: '#f59e0b' });
  if (gridImportKw > 0) generationTerms.push({ label: 'Grid Import', kw: gridImportKw, color: '#f59e0b' });
  if (batteryDischargeKw > 0) generationTerms.push({ label: 'BESS Discharge', kw: batteryDischargeKw, color: '#f59e0b' });
  if (drievV2GKw > 0) generationTerms.push({ label: 'driEV Micro-Buffer', kw: drievV2GKw, color: '#f59e0b' });

  const totalGenKw = Number(generationTerms.reduce((acc, t) => acc + t.kw, 0).toFixed(1));

  const consumptionTerms = [];
  if (servedToBuildingsKw > 0) consumptionTerms.push({ label: 'Campus Buildings', kw: servedToBuildingsKw, color: '#f59e0b' });
  if (drievV2GKw > 0) consumptionTerms.push({ label: 'Critical Comms', kw: drievV2GKw, color: '#f59e0b' });
  if (batteryChargeKw > 0) consumptionTerms.push({ label: 'BESS Charging', kw: batteryChargeKw, color: '#f59e0b' });
  if (drievChargingKw > 0) consumptionTerms.push({ label: 'driEV Charging Bay', kw: drievChargingKw, color: '#f59e0b' });

  const totalServedKw = Number(consumptionTerms.reduce((acc, t) => acc + t.kw, 0).toFixed(1));

  return (
    <div className="panel-card" style={{ marginBottom: 16 }}>
      {/* Header */}
      <div className="panel-header" style={{ marginBottom: 14 }}>
        <div className="panel-title">
          <Activity size={16} color="#f59e0b" />
          <span>Power Flow, Live</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: 'var(--text-secondary)' }}>
          <span className="kpi-pill" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)' }}>
            {String(currentHour).padStart(2, '0')}:00 IST
          </span>
          <span className={`status-pill ${hourData.is_outage ? 'status-pill-offline' : 'status-pill-active'}`}>
            {hourData.is_outage ? '🚨 ISLANDED / OUTAGE' : '⚡ GRID CONNECTED'}
          </span>
        </div>
      </div>

      {/* Directional Energy Flow Architecture */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
        gap: 12,
        marginBottom: 16,
      }}>
        {/* Source Nodes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Primary Energy Sources (Generation)
          </div>

          {/* Solar Node */}
          <div style={{
            background: totalSolarKw > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${totalSolarKw > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sun size={18} color={totalSolarKw > 0 ? '#f59e0b' : 'var(--text-muted)'} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: totalSolarKw > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Rooftop Solar PV
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>16 Building Arrays (648.5 kWp)</div>
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: totalSolarKw > 0 ? '#f59e0b' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {totalSolarKw} kW
            </div>
          </div>

          {/* Grid Node */}
          <div style={{
            background: gridImportKw > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${gridImportKw > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={18} color={gridImportKw > 0 ? '#f59e0b' : 'var(--text-muted)'} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: gridImportKw > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  11kV Utility Grid (TPCODL)
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  {hourData.tariff_window || 'ToU Commercial Rate'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: gridImportKw > 0 ? '#f59e0b' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {gridImportKw} kW
            </div>
          </div>

          {/* Shared Battery Node */}
          <div style={{
            background: batteryDischargeKw > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${batteryDischargeKw > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Battery size={18} color={batteryDischargeKw > 0 ? '#f59e0b' : 'var(--text-muted)'} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: batteryDischargeKw > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Shared 2nd-Life BESS
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>120 kW / 360 kWh Bank</div>
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: batteryDischargeKw > 0 ? '#f59e0b' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {batteryDischargeKw} kW
            </div>
          </div>
        </div>

        {/* Directional Flow Channels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Active Directional Channels
          </div>

          {/* Solar -> Campus Flow */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: '11px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: solarToBuildingsKw > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
              <Sun size={13} />
              <span>Solar &rarr; Campus Buildings</span>
            </div>
            <b style={{ color: solarToBuildingsKw > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {solarToBuildingsKw.toFixed(1)} kW
            </b>
          </div>

          {/* Grid -> Campus Flow */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: '11px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: gridToBuildingsKw > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
              <Zap size={13} />
              <span>Grid &rarr; Campus Buildings</span>
            </div>
            <b style={{ color: gridToBuildingsKw > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {gridToBuildingsKw.toFixed(1)} kW
            </b>
          </div>

          {/* Battery -> Campus Flow */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: '11px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: bessToBuildingsKw > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
              <Battery size={13} />
              <span>BESS &rarr; Campus Buildings</span>
            </div>
            <b style={{ color: bessToBuildingsKw > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {bessToBuildingsKw.toFixed(1)} kW
            </b>
          </div>

          {/* Solar -> driEV Soak Flow */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: '11px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: solarToDrievKw > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
              <Bike size={13} />
              <span>Solar &rarr; driEV Scooter Hub</span>
            </div>
            <b style={{ color: solarToDrievKw > 0 ? '#f59e0b' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {solarToDrievKw > 0 ? `+${solarToDrievKw.toFixed(1)} kW` : '0.0 kW'}
            </b>
          </div>

          {/* Emergency Outage Micro-Buffer Flow (minimal) */}
          {hourData.is_outage && drievV2GKw > 0 && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.06)',
              border: '1px dashed rgba(245, 158, 11, 0.3)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: '11px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b' }}>
                <Bike size={13} />
                <span>driEV &rarr; Critical Comms (Micro-Buffer: minimal)</span>
              </div>
              <b style={{ color: '#f59e0b', fontFamily: 'JetBrains Mono, monospace' }}>
                +{drievV2GKw.toFixed(1)} kW
              </b>
            </div>
          )}
        </div>

        {/* Demand Sinks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Campus Demand Sinks (Consumption)
          </div>

          {/* 16 Campus Buildings Node */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Building2 size={18} color="#f59e0b" />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  16 Campus Buildings
                </div>
                <div style={{ fontSize: '10px', color: unmetDemandKw > 0 ? '#f87171' : 'var(--text-secondary)' }}>
                  {unmetDemandKw > 0 
                    ? `Demand: ${totalDemandKw} kW (${unmetDemandKw} kW shedded in triage)`
                    : `${hourData.blocks?.filter(b => b.load_kw > 0).length || 0} active consumers`}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#f59e0b', fontFamily: 'JetBrains Mono, monospace' }}>
              {servedToBuildingsKw} kW <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>served</span>
            </div>
          </div>

          {/* driEV Scooter Hub Consumer Node */}
          <div style={{
            background: drievChargingKw > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${drievChargingKw > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bike size={18} color={drievChargingKw > 0 ? '#f59e0b' : 'var(--text-muted)'} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: drievChargingKw > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  driEV Charging Hub
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>12 Scooter Bay</div>
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: drievChargingKw > 0 ? '#f59e0b' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {drievChargingKw} kW
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Energy Balance Bar Summary */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: '11px',
      }}>
        {/* Generation = Served Consumption Equation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Scale size={14} color="#f59e0b" />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Energy Balance (Dispatched):</span>
          </div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontSize: '11px' }}>
            <span style={{ color: '#f59e0b' }}>Generation ({generationTerms.map(t => `${t.label}: ${t.kw} kW`).join(' + ') || '0 kW'} = {totalGenKw} kW)</span>
            <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>=</span>
            <span style={{ color: '#f59e0b' }}>Consumption Served ({consumptionTerms.map(t => `${t.label}: ${t.kw} kW`).join(' + ') || '0 kW'} = {totalServedKw} kW)</span>
          </div>
        </div>

        {/* Demand Triage Equation (Visible when unmet load > 0) */}
        {unmetDemandKw > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={14} color="#f87171" />
              <span style={{ color: '#f87171', fontWeight: 600 }}>Demand Triage Breakdown:</span>
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
              <span style={{ color: 'var(--text-primary)' }}>Gross Campus Demand ({totalDemandKw} kW)</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>=</span>
              <span style={{ color: '#f59e0b' }}>Served ({servedToBuildingsKw} kW)</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>+</span>
              <span style={{ color: '#f87171' }}>Unmet / Rationed Demand ({unmetDemandKw} kW)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
