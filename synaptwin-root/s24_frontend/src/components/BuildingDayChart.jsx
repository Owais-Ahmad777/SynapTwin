import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';

// UI-ONLY chart: plots one building's 24-hour load/solar/battery series taken
// straight from the already-fetched simulation hourly blocks. No new data,
// no new calculations beyond display formatting.
export default function BuildingDayChart({ data = [], buildingName = '', currentHour = null }) {
  const chartData = (data || []).map((d) => ({
    hour: `${String(d.hour).padStart(2, '0')}:00`,
    solar: d.solar ?? 0,
    battery: d.battery ?? 0,
    load: d.load ?? 0,
  }));

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 12, right: 15, left: 10, bottom: 20 }}>
          <defs>
            <linearGradient id="bldSolarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="bldBatGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ea580c" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} dy={4} />
          <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" kW" width={50} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 11 }}
            formatter={(val, name) => [`${val} kW`, name]}
            labelFormatter={(h) => `${buildingName} — ${h}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="solar" name="Rooftop Solar PV" stroke="#f59e0b" fill="url(#bldSolarGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="battery" name="Battery Share" stroke="#ea580c" fill="url(#bldBatGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="load" name="Building Demand" stroke="#57534e" fill="none" strokeWidth={2} strokeDasharray="4 4" />
          {currentHour !== null && currentHour !== undefined && (
            <ReferenceLine
              x={`${String(currentHour).padStart(2, '0')}:00`}
              stroke="#ea580c"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{ value: 'NOW', position: 'top', fill: '#ea580c', fontSize: 10, fontWeight: 700 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
