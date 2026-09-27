import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts';

// Campus meter dataset panel (see s24_backend/data/generate_campus_dataset.py).
// Reads ONLY the new additive /api/history/campus/* endpoints. If the backend
// has no dataset (fresh cloud deploy), shows a message and changes nothing else.
const PALETTE = ['#10b981', '#06b6d4', '#f59e0b', '#818cf8', '#f43f5e', '#a3e635'];

export default function CampusDatasetPanel() {
  const [summary, setSummary] = useState(null);
  const [month, setMonth] = useState(null);
  const [days, setDays] = useState([]);
  const [dayDetail, setDayDetail] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history/campus/summary')
      .then((res) => {
        if (res.status === 404) {
          setMissing(true);
          setLoading(false);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setSummary(data);
        const first = data.months?.[0]?.month || null;
        setMonth(first);
        setLoading(false);
      })
      .catch(() => {
        setMissing(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!month) return;
    fetch(`/api/history/campus/daily?month=${encodeURIComponent(month)}`)
      .then((res) => res.json())
      .then((data) => {
        setDays(data.days || []);
        const first = data.days?.[0]?.date || null;
        setSelectedDate(first);
      })
      .catch(() => setDays([]));
  }, [month]);

  useEffect(() => {
    if (!selectedDate) return;
    fetch(`/api/history/campus/day?date=${encodeURIComponent(selectedDate)}&top=6`)
      .then((res) => res.json())
      .then((data) => setDayDetail(data))
      .catch(() => setDayDetail(null));
  }, [selectedDate]);

  const dayLines = useMemo(() => dayDetail?.top_buildings || [], [dayDetail]);

  if (loading) {
    return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>Loading campus meter year…</div>;
  }

  if (missing || !summary) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
        Campus meter dataset not generated on this server yet. Run
        <span style={{ fontFamily: 'JetBrains Mono, monospace' }}> data/generate_campus_dataset.py --days 365 </span>
        on the backend to enable this view.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
          Campus Meter Year — {summary.manifest?.meters} meters, {summary.manifest?.rows?.toLocaleString()} readings
        </span>
        <select
          value={month || ''}
          onChange={(e) => setMonth(e.target.value)}
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 10px', fontSize: '12px' }}
        >
          {(summary.months || []).map((m) => (
            <option key={m.month} value={m.month}>
              {m.month} — {Math.round(m.kwh / 1000).toLocaleString()} MWh
            </option>
          ))}
        </select>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>15-min room meters • simulated campus telemetry</span>
      </div>

      <div style={{ height: 300, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days} onClick={(e) => e?.activePayload?.[0]?.payload?.date && setSelectedDate(e.activePayload[0].payload.date)}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(8)} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Daily kWh', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#090e17', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 8, fontSize: 12 }} formatter={(val) => [`${Number(val).toLocaleString()} kWh`, 'Campus']} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="kwh" name="Campus Daily Energy" fill="#10b981" radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {dayDetail && (
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            {dayDetail.date} — 24h curves (top {dayLines.length} buildings + campus total)
          </div>
          <div style={{ height: 300, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dayDetail.hours}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(h) => `${h}:00`} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'kWh', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#090e17', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 8, fontSize: 12 }} />
                <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 11 }} />
                {dayLines.map((b, i) => (
                  <Line key={b} type="monotone" dataKey={b} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
                ))}
                <Line type="monotone" dataKey="campus" name="Campus Total" stroke="#f43f5e" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
