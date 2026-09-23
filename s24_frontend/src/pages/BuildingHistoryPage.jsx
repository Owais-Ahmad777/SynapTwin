import React from 'react';
import { Building2 } from 'lucide-react';
import BuildingDayChart from '../components/BuildingDayChart';

// UI-ONLY per-building profile: live snapshot + today's 24h series + daily
// totals, all derived from the already-fetched simulation blocks. Campus
// aggregate history views are untouched and still serve the admin site.
export default function BuildingHistoryPage({
  buildingName = '',
  liveBlock = null,
  daily = { solar: 0, load: 0, battery: 0, grid: 0 },
  hourly24 = [],
  currentHour = 12,
}) {
  const load = liveBlock?.load_kw || 0;
  const solar = liveBlock?.solar_kw || 0;
  const alloc = liveBlock?.allocated_kw || 0;
  const ratio = liveBlock?.service_ratio_pct ?? (
    load > 0.001 ? Math.min(100, ((solar + alloc) / load) * 100) : 100
  );

  const stats = [
    { label: 'Solar now', value: `${solar.toFixed(1)} kW`, sub: `${Number(daily.solar || 0).toFixed(0)} kWh today` },
    { label: 'Demand now', value: `${load.toFixed(1)} kW`, sub: `${Number(daily.load || 0).toFixed(0)} kWh today` },
    { label: 'Battery now', value: `+${alloc.toFixed(1)} kW`, sub: `${Number(daily.battery || 0).toFixed(0)} kWh today` },
    { label: 'Coverage now', value: `${Number(ratio).toFixed(1)}%`, sub: 'solar + battery share' },
  ];

  return (
    <div className="st-stack">
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <Building2 size={16} color="#ea580c" />
            <span>{buildingName} — 24-Hour Energy Profile</span>
          </div>
          <span className="kpi-pill" style={{ background: 'rgba(255, 133, 0, 0.15)', color: 'var(--energy-green)', border: '1px solid rgba(255, 133, 0, 0.4)' }}>
            Hour {String(currentHour).padStart(2, '0')}:00 live
          </span>
        </div>
        <div className="panel-body">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}>
            {stats.map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{s.label}</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <BuildingDayChart data={hourly24} buildingName={buildingName} currentHour={currentHour} />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span>Today solar: <b style={{ color: 'var(--energy-green)' }}>{Number(daily.solar || 0).toFixed(0)} kWh</b></span>
            <span>Today demand: <b style={{ color: 'var(--text-primary)' }}>{Number(daily.load || 0).toFixed(0)} kWh</b></span>
            <span>Today battery: <b style={{ color: 'var(--energy-green)' }}>{Number(daily.battery || 0).toFixed(0)} kWh</b></span>
            <span>Today grid: <b style={{ color: 'var(--text-primary)' }}>{Number(daily.grid || 0).toFixed(0)} kWh</b></span>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Live per-building telemetry from the current simulation day. Campus-wide
            30-day and multi-year trends remain available on the campus (admin) site.
          </p>
        </div>
      </div>
    </div>
  );
}
