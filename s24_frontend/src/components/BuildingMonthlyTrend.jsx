import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, LineChart,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { CalendarDays, TrendingUp, Sun, Zap, Battery, Activity, AlertTriangle } from 'lucide-react';
import BuildingDayChart from './BuildingDayChart';

// UI-ONLY per-building 30-day view mirroring the admin HistoryView format:
// cumulative banner, tabbed trends (energy + Jain's fairness), day selector
// track, and selected-day deep dive — all from the backend per-building keys
// (per_building_daily_summary, per_building_cumulative_totals, days[] for the
// campus Jain's index, per_building_hourly for the deep dive). Display only.
export default function BuildingMonthlyTrend({ buildingName = '' }) {
  const [dataset, setDataset] = useState(null);
  const [buildingsFile, setBuildingsFile] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selectedDay, setSelectedDay] = useState(8);
  const [activeTab, setActiveTab] = useState('energy'); // 'energy' | 'fairness'

  useEffect(() => {
    Promise.all([
      fetch('/data/historical_30day.json').then((r) => r.json()),
      fetch('/data/historical_30day_buildings.json').then((r) => r.json()),
    ])
      .then(([main, bld]) => {
        setDataset(main);
        setBuildingsFile(bld);
      })
      .catch(() => setFailed(true));
  }, []);

  const daily = useMemo(
    () => ((dataset?.per_building_daily_summary || []).filter((d) => d.building === buildingName)),
    [dataset, buildingName],
  );
  const cumulative = dataset?.per_building_cumulative_totals?.[buildingName] || null;
  const campusDays = dataset?.days || [];

  const outageDays = useMemo(() => {
    if (!buildingsFile) return [];
    const days = new Set();
    (buildingsFile.per_building_hourly || []).forEach((r) => {
      if (r.building === buildingName && r.is_outage) days.add(r.day);
    });
    return [...days].sort((a, b) => a - b);
  }, [buildingsFile, buildingName]);

  const selectedDaily = daily.find((d) => d.day === selectedDay) || daily[0];
  const selectedHourly = useMemo(() => (
    ((buildingsFile?.per_building_hourly || []).filter((r) => r.building === buildingName && r.day === (selectedDaily?.day || selectedDay)))
      .map((r) => ({ hour: r.hour, load: r.load_kw, solar: r.solar_kw, battery: r.allocated_battery_kw }))
  ), [buildingsFile, buildingName, selectedDaily, selectedDay]);

  if (failed) {
    return (
      <div className="panel-card">
        <div className="panel-body">
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Per-building history is unavailable right now.</p>
        </div>
      </div>
    );
  }

  if (!dataset || !buildingsFile) {
    return <div className="panel-card skeleton-card" style={{ height: 340 }}></div>;
  }

  if (!daily.length || !cumulative) {
    return (
      <div className="panel-card">
        <div className="panel-body">
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No 30-day history rows found for {buildingName || 'this building'} yet.</p>
        </div>
      </div>
    );
  }

  const energyData = daily.map((d) => ({
    day: `D${d.day}`,
    solar: d.total_solar_kwh,
    battery: d.total_battery_allocated_kwh,
    grid: d.total_grid_import_kwh,
    demand: d.total_load_kwh,
  }));

  const fairnessData = daily.map((d) => {
    const campus = campusDays.find((c) => c.day === d.day);
    return {
      day: `D${d.day}`,
      building: Number(((d.avg_service_ratio_pct || 0) / 100).toFixed(3)),
      campus: campus?.fairness_index ?? null,
    };
  });

  const stats = [
    { label: '30-day solar', value: `${Number(cumulative.total_solar_kwh).toLocaleString()} kWh`, icon: Sun },
    { label: '30-day demand', value: `${Number(cumulative.total_load_kwh).toLocaleString()} kWh`, icon: Zap },
    { label: '30-day battery', value: `${Number(cumulative.total_battery_allocated_kwh).toLocaleString()} kWh`, icon: Battery },
    { label: '30-day grid', value: `${Number(cumulative.total_grid_import_kwh).toLocaleString()} kWh`, icon: Activity },
    { label: 'Avg coverage', value: `${Number(cumulative.avg_service_ratio_pct).toFixed(1)}%`, icon: Activity },
    { label: 'Outage days', value: `${outageDays.length}`, icon: AlertTriangle },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* SECTION 1: cumulative banner */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
          <CalendarDays size={18} color="#ea580c" />
          <span>{buildingName} — 30-Day Cumulative Performance</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="panel-card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600 }}>
                  <span>{s.label}</span>
                  <Icon size={15} color="#ea580c" />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>
                  {s.value}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: tabbed trends */}
      <section className="panel-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TrendingUp size={18} color="#ea580c" />
            <h2 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              {buildingName} — 30-Day Trends
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', padding: '3px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('energy')}
              style={{
                background: activeTab === 'energy' ? 'rgba(255, 133, 0, 0.2)' : 'transparent',
                color: activeTab === 'energy' ? 'var(--energy-green)' : 'var(--text-muted)',
                border: activeTab === 'energy' ? '1px solid rgba(255, 133, 0, 0.45)' : '1px solid transparent',
                borderRadius: 6, padding: '5px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              ⚡ Energy Mix
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('fairness')}
              style={{
                background: activeTab === 'fairness' ? 'rgba(255, 133, 0, 0.2)' : 'transparent',
                color: activeTab === 'fairness' ? 'var(--energy-green)' : 'var(--text-muted)',
                border: activeTab === 'fairness' ? '1px solid rgba(255, 133, 0, 0.45)' : '1px solid transparent',
                borderRadius: 6, padding: '5px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              ⚖️ Jain&apos;s Fairness Index
            </button>
          </div>
        </div>

        <div style={{ height: 320, width: '100%' }}>
          {activeTab === 'energy' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={energyData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" kWh" width={60} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="solar" name="Solar (kWh)" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={12} />
                <Bar dataKey="battery" name="Battery (kWh)" fill="#ea580c" radius={[3, 3, 0, 0]} maxBarSize={12} />
                <Bar dataKey="grid" name="Grid (kWh)" fill="#78716c" radius={[3, 3, 0, 0]} maxBarSize={12} />
                <Line type="monotone" dataKey="demand" name="Demand (kWh)" stroke="#57534e" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fairnessData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis domain={[0, 1]} stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0.8} stroke="#ea580c" strokeDasharray="4 4" label={{ value: 'Equity floor (0.80)', fill: '#ea580c', fontSize: 10 }} />
                <Line type="monotone" dataKey="campus" name="Campus Jain's Fairness Index" stroke="#78716c" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                <Line type="monotone" dataKey="building" name={`${buildingName} Coverage (0–1)`} stroke="#ea580c" strokeWidth={3} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* SECTION 3: day selector */}
      <section>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          Day-by-Day Selector — {buildingName}:
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, paddingTop: 4 }}>
          {daily.map((d) => {
            const isSelected = d.day === (selectedDaily?.day ?? selectedDay);
            const isOutage = outageDays.includes(d.day);
            return (
              <button
                key={d.day}
                type="button"
                onClick={() => setSelectedDay(d.day)}
                style={{
                  flexShrink: 0, width: 76, padding: '8px 6px',
                  background: isSelected ? 'rgba(255, 133, 0, 0.2)' : (isOutage ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-card)'),
                  border: isSelected ? '1.5px solid #ea580c' : (isOutage ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-subtle)'),
                  borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3, transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 0 14px rgba(255, 133, 0, 0.35)' : 'none',
                }}
              >
                <div style={{ fontSize: '10px', color: isSelected ? 'var(--energy-green)' : 'var(--text-muted)', fontWeight: 700 }}>{d.day_name}</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>D{d.day}</div>
                {isOutage && <span style={{ color: '#ef4444', fontSize: '9px', fontWeight: 800 }}>Outage</span>}
                <div style={{ fontSize: '9px', color: 'var(--energy-green)', fontWeight: 700, marginTop: 2 }}>
                  {Math.round(d.total_solar_kwh)} kWh
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* SECTION 4: selected-day deep dive */}
      {selectedDaily && (
        <section className="panel-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 16, marginBottom: 18 }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              {selectedDaily.date_label} — {buildingName} 24-Hour Profile
            </h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Solar</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--energy-green)' }}>{selectedDaily.total_solar_kwh.toLocaleString()} kWh</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Demand</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>{selectedDaily.total_demand_kwh ?? selectedDaily.total_load_kwh} kWh</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Coverage</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--energy-green)' }}>{selectedDaily.avg_service_ratio_pct}%</div>
              </div>
            </div>
          </div>
          <BuildingDayChart
            data={selectedHourly}
            buildingName={`${buildingName} ${selectedDaily.date_label}`}
          />
        </section>
      )}
    </div>
  );
}
