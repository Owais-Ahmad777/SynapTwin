import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

// Day-Ahead Load Forecast panel: displays 24h per-building forecasts
// from /api/forecast/day-ahead (16 trained GradientBoosting models).
// Fetches on mount; shows loading/error states; no logic changes elsewhere.
export default function DayAheadForecastPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    fetch('/api/forecast/day-ahead', { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        clearTimeout(timer);
        setData(json);
        const buildings = Object.keys(json.forecast || {});
        if (buildings.length > 0) {
          setSelectedBuilding((prev) => prev && json.forecast[prev] ? prev : buildings[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        clearTimeout(timer);
        if (err.name !== 'AbortError') setError(err.message);
        else setError('Request timed out (90s) — backend cold start or slow. Retry.');
        setLoading(false);
      });
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <TrendingUp size={16} color="#38bdf8" />
            <span>Day-Ahead Load Forecast</span>
          </div>
        </div>
        <div className="panel-body">
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Loading 24h forecasts from 16 trained models…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <AlertTriangle size={16} color="#f59e0b" />
            <span>Day-Ahead Load Forecast</span>
          </div>
        </div>
        <div className="panel-body">
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Forecast unavailable: {error || 'No data'}. The backend trains 16 per-building models from the campus dataset.
          </p>
        </div>
      </div>
    );
  }

  const forecast = data.forecast || {};
  const buildings = Object.keys(forecast);
  const activeBuilding = selectedBuilding && forecast[selectedBuilding] ? selectedBuilding : buildings[0];
  const buildingData = forecast[activeBuilding];

  if (!buildingData) return null;

  const chartData = (buildingData.hourly || []).map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    solar: h.solar_kw || 0,
    load: h.forecast_kw || 0,
  }));

  const totalSolar = chartData.reduce((a, d) => a + d.solar, 0);
  const peakSolar = Math.max(...chartData.map((d) => d.solar), 0);
  // Real per-building MAPE attached by backend (not hardcoded 3.8%)
  const mapeText = buildingData.mape_pct != null ? `${buildingData.mape_pct}%` : '—';
  const maeText = buildingData.mae_kwh != null ? `${buildingData.mae_kwh} kWh` : '—';

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <TrendingUp size={16} color="#38bdf8" />
          <span>Day-Ahead Load Forecast</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="kpi-pill" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '11px', fontWeight: 600 }}>
            <CheckCircle2 size={12} />
            <span>{buildings.length} models • {data.date || 'tomorrow'}</span>
          </span>
        </div>
      </div>
      <div className="panel-body">
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
          24-hour ahead predictions from per-building GradientBoosting models trained on the 3.3 Cr-row campus dataset (Jan-Sep train, Oct-Dec test).
          {data.note && <span style={{ color: 'var(--text-muted)' }}> {data.note}</span>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {buildings.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setSelectedBuilding(b)}
              className={`btn-ctrl${activeBuilding === b ? ' active' : ''}`}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              {b}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Building</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{buildingData.building}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Solar Capacity</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>{(buildingData.solar_kwp || 0).toFixed(1)} kWp</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>24h Solar Est.</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--battery-cyan)' }}>{totalSolar.toFixed(0)} kWh</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Peak Solar</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--energy-green)' }}>{peakSolar.toFixed(1)} kW</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }} title="Mean Absolute Percentage Error on Oct-Dec 2026 test set">
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Model MAPE</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>{mapeText}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }} title="Mean Absolute Error on test set">
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Model MAE</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{maeText}</div>
          </div>
        </div>

        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area type="monotone" dataKey="solar" name="Solar (kW)" stroke="#f59e0b" fill="rgba(245, 158, 11, 0.2)" strokeWidth={2} />
              <Area type="monotone" dataKey="load" name="Load Forecast (kW)" stroke="#38bdf8" fill="rgba(56, 189, 248, 0.15)" strokeWidth={2} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: 'var(--text-muted)', marginTop: 8 }}>
          <Clock size={12} />
          <span>Models retrained from campus meters. Solar curve from Open-Meteo irradiance × rooftop capacity.</span>
        </div>
      </div>
    </div>
  );
}
