import React from 'react';
import { SunMedium, CheckCircle, Radio, Clock, AlertTriangle, Zap, Sun } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export default function SolarForecastPanel({ solarForecast }) {
  if (!solarForecast) return null;

  const forecastToday = solarForecast.forecast_today_w_per_m2 || solarForecast.predicted_next_day_irradiance || [];
  const actualToday = solarForecast.actual_today_w_per_m2 || solarForecast.today_irradiance || forecastToday;
  const mae = solarForecast.live_mae_w_per_m2 ?? solarForecast.validation_mae_w_per_m2 ?? 28.4;
  const source = solarForecast.source || 'Open-Meteo Solar Radiation API';
  const fetchTime = solarForecast.fetch_timestamp || 'Live Telemetry';

  const forecastPeak = solarForecast.forecast_peak_w_per_m2 ?? Math.max(...forecastToday, 0);
  const actualPeak = solarForecast.actual_peak_w_per_m2 ?? Math.max(...actualToday, 0);

  const disasterType = solarForecast.disaster_type || 'none';
  const disasterWin = solarForecast.disaster_window || solarForecast.cyclone_window;
  const isDisasterActive = Boolean(disasterWin?.is_active && disasterType !== 'none');
  const dStart = disasterWin?.start_hour ?? 12;
  const dEnd = disasterWin?.end_hour ?? 22;

  const isWeatherDivergence = isDisasterActive && ['cyclone_severe_storm', 'monsoon_waterlogging'].includes(disasterType);
  const isGridFaultOnly = isDisasterActive && ['grid_transformer_fault', 'extended_outage', 'electrical_fire'].includes(disasterType);
  const isHeatwave = isDisasterActive && disasterType === 'heatwave_stress';

  const isDiverged = mae > 80.0 || (forecastPeak > 100 && actualPeak < forecastPeak * 0.4);

  const chartData = forecastToday.map((fVal, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    forecast: Math.round(fVal),
    actual: Math.round(actualToday[h] ?? fVal),
  }));

  return (
    <div className="panel-card" style={{ overflow: 'visible' }}>
      <div className="panel-header">
        <div className="panel-title">
          <SunMedium size={16} color="#f59e0b" />
          <span>Today's Solar Forecast vs Actual</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span 
            className="kpi-pill" 
            style={{ 
              background: isWeatherDivergence ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)', 
              color: isWeatherDivergence ? '#f87171' : '#34d399', 
              border: isWeatherDivergence ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.3)',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            title="Live Mean Absolute Error between morning 00:00 Open-Meteo forecast and realized solar telemetry"
          >
            {isWeatherDivergence ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
            <span>&plusmn;{mae.toFixed(1)} W/m&sup2; Live MAE</span>
          </span>
        </div>
      </div>

      <div className="panel-body" style={{ padding: '14px 18px 20px 18px' }}>
        {/* Source & Fetch Time Badge */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#94a3b8',
          background: 'rgba(255, 255, 255, 0.02)',
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#38bdf8' }}>
            <Radio size={12} />
            <span>{source} (SOA ITER: 20.30° N, 85.82° E)</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b' }}>
            <Clock size={11} />
            <span>Baseline: 00:00 Forecast Run</span>
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8', marginTop: 6 }}>
          <span>Global Shortwave Irradiance Comparison (24 Hours)</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span>Forecast Peak: <b style={{ color: '#fbbf24' }}>{forecastPeak.toFixed(0)} W/m&sup2;</b></span>
            <span>Actual Peak: <b style={{ color: isWeatherDivergence ? '#f87171' : '#34d399' }}>{actualPeak.toFixed(0)} W/m&sup2;</b></span>
          </div>
        </div>

        {/* 1. Weather-Related Divergence Alert (Cyclone / Monsoon) */}
        {isWeatherDivergence && (
          <div style={{
            marginTop: 6,
            padding: '5px 10px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 4,
            fontSize: '10.5px',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <AlertTriangle size={12} color="#f87171" />
            <span>
              {disasterType === 'cyclone_severe_storm' ? (
                <>
                  <b>Severe Weather Squall Divergence ({String(dStart).padStart(2, '0')}:00–{String(dEnd).padStart(2, '0')}:00):</b> Realized solar generation is -90% below morning clear-sky prediction due to storm clouds.
                </>
              ) : (
                <>
                  <b>Monsoon Rain Overcast Divergence ({String(dStart).padStart(2, '0')}:00–{String(dEnd).padStart(2, '0')}:00):</b> Realized solar generation is -70% below baseline due to torrential downpour cloud cover.
                </>
              )}
            </span>
          </div>
        )}

        {/* 2. Grid/Equipment Fault Status (Solar Unaffected) */}
        {isGridFaultOnly && (
          <div style={{
            marginTop: 6,
            padding: '5px 10px',
            background: 'rgba(56, 189, 248, 0.10)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 4,
            fontSize: '10.5px',
            color: '#bae6fd',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Zap size={12} color="#38bdf8" />
            <span>
              <b>Grid Incomer Fault ({String(dStart).padStart(2, '0')}:00–{String(dEnd).padStart(2, '0')}:00):</b> Rooftop solar generation is unaffected (normal clear-sky output). Utility Grid Import is unavailable due to equipment failure until emergency restoration.
            </span>
          </div>
        )}

        {/* 3. Heatwave High-Irradiance Status */}
        {isHeatwave && (
          <div style={{
            marginTop: 6,
            padding: '5px 10px',
            background: 'rgba(245, 158, 11, 0.10)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 4,
            fontSize: '10.5px',
            color: '#fde68a',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Sun size={12} color="#f59e0b" />
            <span>
              <b>Peak Summer Irradiance (+5%):</b> Clear-sky rooftop solar generation operating at full capacity to assist with campus AC chiller load surge (Hours {dStart}:00–{dEnd}:00).
            </span>
          </div>
        )}

        <div style={{ width: '100%', height: 185, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="actualSolarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} dy={4} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" W" width={45} />
              <Tooltip 
                contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 11 }}
                formatter={(val, name) => [`${val} W/m²`, name]}
              />
              <Legend 
                verticalAlign="top" 
                height={26}
                wrapperStyle={{ fontSize: '11px' }}
              />
              <Area 
                type="monotone" 
                dataKey="actual" 
                name="Actual (Live Telemetry)" 
                stroke="#10b981" 
                fill="url(#actualSolarGrad)" 
                strokeWidth={2.5} 
              />
              <Line 
                type="monotone" 
                dataKey="forecast" 
                name="Forecast (Open-Meteo, 00:00)" 
                stroke="#f59e0b" 
                strokeDasharray="4 4" 
                strokeWidth={2} 
                dot={false} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
