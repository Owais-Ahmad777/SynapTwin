import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { Scale, Info } from 'lucide-react';

// UI-ONLY per-building comparison page: year switcher, building-vs-campus
// share cards, 5-year savings trend, and share bars — all from the Year-1..5
// projected shares in /api/history/multiyear. Display formatting only; the
// campus Run-A/Run-B comparison stays on the campus page untouched.
export default function BuildingCompare({ buildingName = '' }) {
  const [payload, setPayload] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selectedYear, setSelectedYear] = useState(1);

  useEffect(() => {
    fetch('/api/history/multiyear?years=5')
      .then((res) => res.json())
      .then((data) => setPayload(data))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <div className="panel-card">
        <div className="panel-body">
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Per-building comparison is unavailable right now.
          </p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return <div className="panel-card skeleton-card" style={{ height: 340 }}></div>;
  }

  const years = payload.per_building_yearly || [];
  const campusYears = payload.yearly_summary || [];
  const yearEntry = years.find((y) => y.year === selectedYear) || years[0];
  const campusEntry = campusYears.find((y) => y.year === (yearEntry?.year || 1)) || {};
  const row = (yearEntry?.buildings || []).find((b) => b.building === buildingName) || null;

  if (!row) {
    return (
      <div className="panel-card">
        <div className="panel-body">
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            No projection rows found for {buildingName || 'this building'} yet.
          </p>
        </div>
      </div>
    );
  }

  const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

  const metrics = [
    {
      label: 'Annual Savings',
      building: `₹${Number(row.annual_savings_inr || 0).toLocaleString()}`,
      campus: `₹${Number(campusEntry.annual_savings_inr || 0).toLocaleString()} campus`,
      share: pct(row.annual_savings_inr || 0, campusEntry.annual_savings_inr || 0),
    },
    {
      label: 'Annual Solar',
      building: `${Number(row.solar_kwh || 0).toLocaleString()} kWh`,
      campus: `${Number(campusEntry.solar_kwh || 0).toLocaleString()} kWh campus`,
      share: pct(row.solar_kwh || 0, campusEntry.solar_kwh || 0),
    },
    {
      label: 'Annual CO₂ Abated',
      building: `${Number(row.co2_abated_kg || 0).toLocaleString()} kg`,
      campus: `${Number(campusEntry.co2_abated_kg || 0).toLocaleString()} kg campus`,
      share: pct(row.co2_abated_kg || 0, campusEntry.co2_abated_kg || 0),
    },
    {
      label: 'Annual Demand',
      building: `${Number(row.demand_kwh || 0).toLocaleString()} kWh`,
      campus: `${Number(campusEntry.campus_demand_kwh || 0).toLocaleString()} kWh campus`,
      share: pct(row.demand_kwh || 0, campusEntry.campus_demand_kwh || 0),
    },
  ];

  const trendData = years.map((y) => {
    const b = (y.buildings || []).find((x) => x.building === buildingName) || {};
    const c = campusYears.find((x) => x.year === y.year) || {};
    return {
      year: y.year_label,
      building: Number(((b.annual_savings_inr || 0) / 100000).toFixed(2)),
      campus: Number(((c.annual_savings_inr || 0) / 100000).toFixed(2)),
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Year switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Projection year:</span>
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            onClick={() => setSelectedYear(y.year)}
            className={`btn-ctrl ${selectedYear === y.year ? 'active' : ''}`}
            style={selectedYear === y.year
              ? { background: 'rgba(255, 133, 0, 0.2)', color: 'var(--energy-green)', borderColor: 'rgba(255, 133, 0, 0.5)' }
              : undefined}
          >
            {y.year_label}
          </button>
        ))}
        <span className="kpi-pill" style={{ background: 'rgba(255, 133, 0, 0.15)', color: 'var(--energy-green)', border: '1px solid rgba(255, 133, 0, 0.4)', marginLeft: 'auto' }}>
          {buildingName} vs Campus
        </span>
      </div>

      {/* Share cards */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <Scale size={16} color="#ea580c" />
            <span>{buildingName} — Year {yearEntry?.year} Share of Campus</span>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {metrics.map((m) => (
              <div key={m.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff7ed', background: '#7c2d12', padding: '2px 8px', borderRadius: 20 }}>{m.share.toFixed(1)}%</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--energy-green)', fontFamily: 'JetBrains Mono, monospace' }}>{m.building}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{m.campus}</div>
                <div style={{ width: '100%', height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ width: `${Math.min(100, m.share)}%`, height: '100%', background: 'linear-gradient(90deg, #ea580c, #ffb703)', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Savings trend */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">5-Year Savings Trend — Building vs Campus (₹ Lakh)</div>
        </div>
        <div className="panel-body">
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} dy={4} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" L" width={50} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="campus" name="Campus Savings (₹ Lakh)" fill="#78716c" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Line type="monotone" dataKey="building" name={`${buildingName} (₹ Lakh)`} stroke="#ea580c" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <Info size={14} color="#ea580c" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Shares are this building&apos;s projected portion of campus totals each year.
          The uncoordinated-baseline vs orchestrated-microgrid comparison stays on the campus Compare page.
        </span>
      </div>
    </div>
  );
}
