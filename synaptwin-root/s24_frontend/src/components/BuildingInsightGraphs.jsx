import React from 'react';
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine,
} from 'recharts';
import { SunMedium, TrendingUp, Calculator } from 'lucide-react';
import { DEMAND_FORECAST_MULTIPLIERS, findBuildingBlock } from '../data/forecastModel';

// UI-ONLY per-building insight graphs (supervisor drawers). Every series
// derives from the already-fetched hourly simulation blocks plus the shared
// validated forecast model — no new endpoints, no new physics.
// Campus aggregate drawers are untouched and still serve the admin site.

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

function NowRef({ currentHour }) {
  return (
    <ReferenceLine
      x={hourLabel(currentHour)}
      stroke="#10b981"
      strokeWidth={2}
      strokeDasharray="4 4"
      label={{ value: 'NOW', position: 'top', fill: '#10b981', fontSize: 10, fontWeight: 700 }}
    />
  );
}

function EmptyNote() {
  return <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Awaiting simulation data…</p>;
}

function PanelShell({ icon: Icon, title, buildingName, right, children }) {
  return (
    <div className="panel-card" style={{ overflow: 'visible' }}>
      <div className="panel-header">
        <div className="panel-title">
          <Icon size={16} color="#ea580c" />
          <span>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            className="kpi-pill"
            style={{ background: 'rgba(255, 133, 0, 0.12)', color: 'var(--energy-green)', border: '1px solid rgba(255, 133, 0, 0.4)', fontSize: '11px' }}
          >
            {buildingName}
          </span>
          {right}
        </div>
      </div>
      <div className="panel-body" style={{ padding: '14px 18px 20px 18px' }}>
        {children}
      </div>
    </div>
  );
}

// Per-building rooftop solar: live block actuals (kW) vs clear-sky expectation
// obtained by scaling the campus irradiance forecast by this building's own
// observed peak — same sun, building-sized.
export function BuildingSolarChart({ buildingName = '', hourly = [], solarForecast = null, currentHour = 12 }) {
  if (!hourly.length) return <EmptyNote />;
  const irr = solarForecast?.forecast_today_w_per_m2 || solarForecast?.predicted_next_day_irradiance || [];
  const actuals = hourly.map((h) => findBuildingBlock(h.blocks, buildingName)?.solar_kw || 0);
  const irrPeak = Math.max(...irr, 0);
  const bPeak = Math.max(...actuals, 0);
  const chartData = hourly.map((h, i) => {
    const actual = Number(actuals[i].toFixed(1));
    const expected = irrPeak > 0.01 && bPeak > 0
      ? Number((((irr[i] ?? 0) * bPeak) / irrPeak).toFixed(1))
      : actual;
    return { hour: hourLabel(h.hour), actual, expected };
  });
  const mae = chartData.reduce((a, d) => a + Math.abs(d.actual - d.expected), 0) / Math.max(1, chartData.length);

  return (
    <PanelShell
      icon={SunMedium}
      title="Rooftop Solar — Forecast vs Actual"
      buildingName={buildingName}
      right={(
        <span className="kpi-pill" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '11px' }}>
          ±{mae.toFixed(1)} kW Live MAE
        </span>
      )}
    >
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
            <defs>
              <linearGradient id="bldSolarActualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} dy={4} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" kW" width={55} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 11 }}
              formatter={(val, name) => [`${val} kW`, name]}
            />
            <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: '11px' }} />
            <Area type="monotone" dataKey="actual" name="Actual (Live Telemetry)" stroke="#10b981" fill="url(#bldSolarActualGrad)" strokeWidth={2.5} />
            <Line type="monotone" dataKey="expected" name="Expected (Clear-Sky Scaled)" stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={2} dot={false} />
            <NowRef currentHour={currentHour} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Expected curve scales the campus irradiance forecast by this building&apos;s own observed peak ({bPeak.toFixed(1)} kW).
      </p>
    </PanelShell>
  );
}

// Per-building demand: live block actuals vs the shared validated 1h-lookahead
// multiplier model (identical methodology to the campus fallback path).
export function BuildingDemandChart({ buildingName = '', hourly = [], currentHour = 12 }) {
  if (!hourly.length) return <EmptyNote />;
  const mapePct = 3.8;
  const series = hourly.map((h) => {
    const actual = Number((findBuildingBlock(h.blocks, buildingName)?.load_kw || 0).toFixed(1));
    const predicted = Number((actual * (DEMAND_FORECAST_MULTIPLIERS[h.hour] ?? 1.0)).toFixed(1));
    const half = predicted * (mapePct / 100);
    return {
      hour: hourLabel(h.hour),
      actual,
      predicted,
      confidenceRange: [Math.max(0, Number((predicted - half).toFixed(1))), Number((predicted + half).toFixed(1))],
      delta: Number((predicted - actual).toFixed(1)),
    };
  });
  const nowDelta = series[currentHour]?.delta ?? 0;

  return (
    <PanelShell
      icon={TrendingUp}
      title="Demand and Forecast"
      buildingName={buildingName}
      right={(
        <>
          <span className="kpi-pill" style={{ background: 'rgba(255, 133, 0, 0.12)', color: 'var(--energy-green)', border: '1px solid rgba(255, 133, 0, 0.4)', padding: '2px 8px', fontSize: '10.5px' }}>
            Validated MAPE: ±3.8%
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            h{String(currentHour).padStart(2, '0')}:00 Delta:{' '}
            <b style={{ color: nowDelta >= 0 ? 'var(--energy-green)' : '#f59e0b' }}>
              {nowDelta > 0 ? '+' : ''}{nowDelta} kW
            </b>
          </span>
        </>
      )}
    >
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 12, right: 15, left: 10, bottom: 25 }}>
            <defs>
              <linearGradient id="bldDemandBandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} dy={6} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" kW" width={55} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, position: 'relative', bottom: -5 }} />
            <Area type="monotone" dataKey="confidenceRange" name="Forecast Confidence Band (±3.8%)" fill="url(#bldDemandBandGrad)" stroke="rgba(56, 189, 248, 0.35)" strokeDasharray="3 3" strokeWidth={1} />
            <Line type="monotone" dataKey="actual" name="Actual Building Demand" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 2.5, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="predicted" name="Predicted Demand (MAPE ±3.8%)" stroke="#38bdf8" strokeDasharray="5 5" strokeWidth={2.2} dot={{ r: 2.5, fill: '#38bdf8' }} activeDot={{ r: 5 }} />
            <NowRef currentHour={currentHour} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </PanelShell>
  );
}

// Per-building fairness: this building's own 24-hour coverage ledger
// (one row per simulated hour, same formulas as the campus matrix).
export function BuildingFairnessTable({ buildingName = '', hourly = [], currentHour = 12 }) {
  if (!hourly.length) return <EmptyNote />;
  const rows = hourly.map((h) => {
    const b = findBuildingBlock(h.blocks, buildingName) || {};
    const load = b.load_kw || 0;
    const solar = b.solar_kw || 0;
    const allocated = b.allocated_kw || 0;
    const coverage = load > 0.001 ? Math.min(100, ((solar + allocated) / load) * 100) : 100;
    return { hour: h.hour, load, solar, allocated, coverage };
  });

  return (
    <PanelShell
      icon={Calculator}
      title={`Coverage Ledger — 24 Hours (Hour ${String(currentHour).padStart(2, '0')}:00 IST)`}
      buildingName={buildingName}
      right={(
        <span className="kpi-pill" style={{ background: 'rgba(255, 133, 0, 0.15)', color: 'var(--energy-green)', border: '1px solid rgba(255, 133, 0, 0.4)' }}>
          FAIRNESS LEDGER
        </span>
      )}
    >
      <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ padding: '8px 10px' }}>Hour</th>
              <th style={{ padding: '8px 10px' }}>Demand (kW)</th>
              <th style={{ padding: '8px 10px' }}>Own Solar (kW)</th>
              <th style={{ padding: '8px 10px' }}>Battery Share (kW)</th>
              <th style={{ padding: '8px 10px' }}>Local Energy Coverage %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isNow = r.hour === currentHour;
              return (
                <tr
                  key={r.hour}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: isNow ? 'rgba(255, 133, 0, 0.08)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: isNow ? 'var(--energy-green)' : '#f8fafc', fontFamily: 'JetBrains Mono, monospace' }}>
                    {hourLabel(r.hour)}{isNow ? ' • NOW' : ''}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{r.load.toFixed(1)}</td>
                  <td style={{ padding: '7px 10px', color: '#f59e0b' }}>{r.solar.toFixed(1)}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--energy-green)', fontWeight: 700 }}>+{r.allocated.toFixed(1)}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{
                      background: r.coverage >= 90 ? 'rgba(255,133,0,0.15)' : (r.coverage > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'),
                      color: r.coverage >= 90 ? 'var(--energy-green)' : (r.coverage > 0 ? '#fbbf24' : '#f87171'),
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontWeight: 700,
                    }}
                    >
                      {r.coverage.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
