import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

// UI-ONLY consumer of the backend per-building projection
// (per_building_yearly in /api/history/multiyear). No calculations here
// beyond display formatting; methodology note is quoted from the payload.
export default function BuildingProjectionPanel({ buildingName = '' }) {
  const [payload, setPayload] = useState(null);
  const [failed, setFailed] = useState(false);

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
            Per-building projection is unavailable right now.
          </p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return <div className="panel-card skeleton-card" style={{ height: 320 }}></div>;
  }

  const yearly = (payload.per_building_yearly || [])
    .map((y) => ({
      year: y.year,
      label: y.year_label,
      row: (y.buildings || []).find((b) => b.building === buildingName) || null,
    }))
    .filter((y) => y.row);

  if (!yearly.length) {
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

  const chartData = yearly.map((y) => ({
    year: y.label,
    solar: Number((y.row.solar_kwh / 1000).toFixed(2)),
    demand: Number((y.row.demand_kwh / 1000).toFixed(2)),
    savings: y.row.annual_savings_lakhs,
  }));

  const totalSavings = yearly.reduce((acc, y) => acc + (y.row.annual_savings_inr || 0), 0);
  const totalSolarMwh = yearly.reduce((acc, y) => acc + (y.row.solar_kwh || 0), 0) / 1000;
  const methodNote = payload?.assumptions?.per_building_allocation_method || '';

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <TrendingUp size={16} color="#ea580c" />
          <span>{buildingName} — 5-Year Projection</span>
        </div>
        <span className="kpi-pill" style={{ background: 'rgba(255, 133, 0, 0.15)', color: 'var(--energy-green)', border: '1px solid rgba(255, 133, 0, 0.4)' }}>
          {yearly.length}-year outlook
        </span>
      </div>
      <div className="panel-body">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Projected solar</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{totalSolarMwh.toFixed(1)} MWh</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Projected savings</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--energy-green)', fontFamily: 'JetBrains Mono, monospace' }}>₹{(totalSavings / 100000).toFixed(2)}L</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Demand share</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{(yearly[0].row.demand_share * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Solar share</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{(yearly[0].row.solar_share * 100).toFixed(1)}%</div>
          </div>
        </div>

        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 15, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} dy={4} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" MWh" width={60} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" L" width={50} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="solar" name="Solar (MWh)" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar yAxisId="left" dataKey="demand" name="Demand (MWh)" fill="#78716c" radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Line yAxisId="right" type="monotone" dataKey="savings" name="Savings (₹ Lakh)" stroke="#ea580c" strokeWidth={3} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '8px 10px' }}>Year</th>
                <th style={{ padding: '8px 10px' }}>Solar (kWh)</th>
                <th style={{ padding: '8px 10px' }}>Demand (kWh)</th>
                <th style={{ padding: '8px 10px' }}>Grid Avoided (kWh)</th>
                <th style={{ padding: '8px 10px' }}>Savings (₹)</th>
                <th style={{ padding: '8px 10px' }}>CO₂ (kg)</th>
              </tr>
            </thead>
            <tbody>
              {yearly.map((y) => (
                <tr key={y.year} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--energy-green)' }}>{y.label}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{Number(y.row.solar_kwh).toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{Number(y.row.demand_kwh).toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--energy-green)' }}>{Number(y.row.grid_avoided_kwh).toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--energy-green)', fontWeight: 700 }}>₹{Number(y.row.annual_savings_inr).toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{Number(y.row.co2_abated_kg).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {methodNote && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Methodology: {methodNote}
          </p>
        )}
      </div>
    </div>
  );
}
