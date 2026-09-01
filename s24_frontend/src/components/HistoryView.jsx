import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap, Calendar, TrendingUp, ArrowLeft, Sun, Cloud, CloudRain, 
  AlertTriangle, IndianRupee, Leaf, Award, 
  Activity, Info 
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, Bar,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine
} from 'recharts';
import MultiYearTrends from './MultiYearTrends';

export default function HistoryView() {
  const [historyData, setHistoryData] = useState(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(8); // Default to Day 8 (Monsoon outage day for demo interest)
  const [activeChartTab, setActiveChartTab] = useState('energy'); // 'energy', 'financial', 'fairness'
  const [viewMode, setViewMode] = useState('30day'); // '30day' | 'multiyear'
  const [loading, setLoading] = useState(true);
  const [fetchDurationMs, setFetchDurationMs] = useState(0);

  useEffect(() => {
    const startTime = performance.now();
    fetch('/data/historical_30day.json')
      .then(res => res.json())
      .then(data => {
        const endTime = performance.now();
        setFetchDurationMs(Math.round(endTime - startTime));
        setHistoryData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load 30-day historical data:', err);
        setLoading(false);
      });
  }, []);

  const selectedDay = useMemo(() => {
    if (!historyData?.days) return null;
    return historyData.days.find(d => d.day === selectedDayIndex) || historyData.days[0];
  }, [historyData, selectedDayIndex]);

  const selectedDayHourly = useMemo(() => {
    if (!historyData?.hourly) return [];
    return historyData.hourly.filter(h => h.day === selectedDayIndex);
  }, [historyData, selectedDayIndex]);

  const handleReturnToDashboard = () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/';
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#090e17',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ width: 44, height: 44, border: '3px solid rgba(56, 189, 248, 0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: '#38bdf8' }}>Loading SynapTwin 30-Day Historical Telemetry...</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>Static pre-computed dataset • &lt;100ms load target</div>
      </div>
    );
  }

  if (!historyData) {
    return (
      <div style={{ minHeight: '100vh', background: '#090e17', color: '#f8fafc', padding: 40 }}>
        <h2>Failed to load historical data</h2>
        <button onClick={handleReturnToDashboard} className="btn-secondary" style={{ marginTop: 20 }}>
          <ArrowLeft size={16} /> Return to Live Dashboard
        </button>
      </div>
    );
  }

  const totals = historyData.cumulative_totals;
  const days = historyData.days;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 0%, #111a2e 0%, #090e17 70%)',
      color: '#f8fafc',
      fontFamily: 'Inter, sans-serif',
      paddingBottom: 60
    }}>
      {/* Top Sticky Header */}
      <header style={{
        background: 'rgba(9, 14, 23, 0.85)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: 'linear-gradient(135deg, #10b981, #06b6d4)',
            color: '#000',
            fontWeight: 800,
            fontSize: '12px',
            letterSpacing: '0.5px',
            padding: '4px 10px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
          }}>
            <Zap size={15} />
            <span>SYNAPTWIN</span>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                30-Day Historical Trends &amp; Multi-Day Optimization Analysis
              </h1>
              <span className="kpi-pill" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '10px', fontWeight: 700 }}>
                Full Calendar Month (720 Hours)
              </span>
              <span className="kpi-pill" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '10px' }}>
                Loaded in {fetchDurationMs}ms (Static Dataset)
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>
              Siksha 'O' Anusandhan (SOA) ITER Campus &bull; Bhubaneswar, Odisha &bull; Max-Min LP &amp; Triage Multi-Day Audit
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Mandatory Simulated Data Disclaimer Badge */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <Info size={13} />
            <span>SIMULATED / DIGITAL-TWIN DATA</span>
          </div>

          <button
            onClick={handleReturnToDashboard}
            className="btn-secondary"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              gap: 6,
              borderColor: 'rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
            }}
            title="Return to the live 24-hour interactive digital twin dashboard"
          >
            <ArrowLeft size={14} />
            <span>Back to Live Dashboard</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Navigation Switcher: 30-Day Historical Trend vs Multi-Year Projection */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{
            display: 'flex',
            gap: 8,
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '5px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <button
              type="button"
              onClick={() => setViewMode('30day')}
              style={{
                background: viewMode === '30day' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'transparent',
                color: viewMode === '30day' ? '#ffffff' : '#94a3b8',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s',
              }}
            >
              <Calendar size={14} />
              <span>30-Day Historical Trend (720 Hours)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('multiyear')}
              style={{
                background: viewMode === 'multiyear' ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent',
                color: viewMode === 'multiyear' ? '#ffffff' : '#94a3b8',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s',
              }}
            >
              <TrendingUp size={14} />
              <span>Multi-Year Projected Benchmark (5–10 Years)</span>
            </button>
          </div>

          <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
            {viewMode === '30day' 
              ? '📊 30-day simulated physics dataset (hourly resolution)' 
              : '📈 Multi-year projected synthetic benchmark (PV degradation & tariff escalation)'}
          </div>
        </div>

        {viewMode === 'multiyear' ? (
          <MultiYearTrends />
        ) : (
          <>
            {/* SECTION 1: Cumulative Monthly Totals Banner */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                  <Award size={18} color="#10b981" />
                  <span>30-Day Cumulative Performance &amp; Savings Summary</span>
                </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Calculated across 30 authentic daily optimization cycles (22 Weekdays, 8 Weekends)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {/* Total Solar */}
            <div className="panel-card" style={{ padding: '16px 18px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                <span>Clean Solar Harvested</span>
                <Sun size={15} color="#10b981" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', margin: '6px 0 2px' }}>
                {totals.total_solar_harvested_kwh.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600 }}>kWh</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Avg: {Math.round(totals.total_solar_harvested_kwh / 30).toLocaleString()} kWh / day
              </div>
            </div>

            {/* Grid Power Avoided */}
            <div className="panel-card" style={{ padding: '16px 18px', background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                <span>Grid Power Avoided</span>
                <Zap size={15} color="#38bdf8" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#38bdf8', fontFamily: 'JetBrains Mono, monospace', margin: '6px 0 2px' }}>
                {totals.total_grid_power_avoided_kwh.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600 }}>kWh</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Solar ({Math.round(totals.total_solar_harvested_kwh/1000)}k) + Battery ({Math.round((totals.total_grid_power_avoided_kwh - totals.total_solar_harvested_kwh)/1000)}k) Dispatched
              </div>
            </div>

            {/* CO2 Avoided */}
            <div className="panel-card" style={{ padding: '16px 18px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                <span>CO₂ Emissions Abated</span>
                <Leaf size={15} color="#34d399" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399', fontFamily: 'JetBrains Mono, monospace', margin: '6px 0 2px' }}>
                {totals.total_co2_avoided_kg.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600 }}>kg</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                CEA: 0.82 kg CO₂/kWh &times; {totals.total_grid_power_avoided_kwh.toLocaleString()} kWh
              </div>
            </div>

            {/* Financial Savings */}
            <div className="panel-card" style={{ padding: '16px 18px', background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                <span>Net TPCODL ₹ Savings</span>
                <IndianRupee size={15} color="#fbbf24" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace', margin: '6px 0 2px' }}>
                +₹{totals.total_inr_saved.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 700 }}>
                ₹{totals.monthly_savings_lakhs} Lakhs / month saved
              </div>
            </div>

            {/* Fairness Index */}
            <div className="panel-card" style={{ padding: '16px 18px', background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                <span>30-Day Avg Fairness</span>
                <Activity size={15} color="#818cf8" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#818cf8', fontFamily: 'JetBrains Mono, monospace', margin: '6px 0 2px' }}>
                {totals.average_fairness_index}
              </div>
              <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 700 }}>
                +{totals.fairness_improvement_pct}% vs {totals.average_baseline_fairness_index} Baseline
              </div>
            </div>

            {/* Outages Handled */}
            <div className="panel-card" style={{ padding: '16px 18px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                <span>Outages Handled</span>
                <AlertTriangle size={15} color="#f87171" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#f87171', fontFamily: 'JetBrains Mono, monospace', margin: '6px 0 2px' }}>
                {totals.outage_event_count} <span style={{ fontSize: '13px', fontWeight: 600 }}>Events</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Days 8, 19, 26 (99.9% Critical Availability)
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: 30-Day Trend Charts with Tab Switcher */}
        <section className="panel-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TrendingUp size={18} color="#38bdf8" />
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  30-Day Longitudinal Operational Trends
                </h2>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Click any bar or data point to inspect that specific day's 24-hour telemetry below
                </div>
              </div>
            </div>

            {/* Chart Mode Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => setActiveChartTab('energy')}
                style={{
                  background: activeChartTab === 'energy' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  color: activeChartTab === 'energy' ? '#38bdf8' : '#94a3b8',
                  border: activeChartTab === 'energy' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ⚡ Energy Mix &amp; Grid Import
              </button>

              <button
                onClick={() => setActiveChartTab('financial')}
                style={{
                  background: activeChartTab === 'financial' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                  color: activeChartTab === 'financial' ? '#fbbf24' : '#94a3b8',
                  border: activeChartTab === 'financial' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ₹ Financial Savings &amp; CO₂
              </button>

              <button
                onClick={() => setActiveChartTab('fairness')}
                style={{
                  background: activeChartTab === 'fairness' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  color: activeChartTab === 'fairness' ? '#818cf8' : '#94a3b8',
                  border: activeChartTab === 'fairness' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ⚖️ Jain's Fairness Index
              </button>
            </div>
          </div>

          {/* Chart Content */}
          <div style={{ height: 340, width: '100%' }}>
            {activeChartTab === 'energy' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={days} onClick={(e) => e?.activePayload?.[0]?.payload?.day && setSelectedDayIndex(e.activePayload[0].payload.day)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis dataKey="date_label" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#090e17', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 8, fontSize: 12 }}
                    formatter={(val, name) => [`${Number(val).toLocaleString()} kWh`, name]}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total_solar_kwh" name="Rooftop Solar Harvested" fill="#10b981" stackId="mix" />
                  <Bar dataKey="total_battery_kwh" name="2nd-Life Battery Dispatched" fill="#06b6d4" stackId="mix" />
                  <Bar dataKey="total_grid_import_kwh" name="Utility Grid Import" fill="#64748b" stackId="mix" />
                  <Line type="monotone" dataKey="total_demand_kwh" name="Gross Campus Demand" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {activeChartTab === 'financial' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={days} onClick={(e) => e?.activePayload?.[0]?.payload?.day && setSelectedDayIndex(e.activePayload[0].payload.day)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis dataKey="date_label" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke="#fbbf24" tick={{ fontSize: 10 }} label={{ value: 'Daily Savings (₹)', angle: -90, position: 'insideLeft', fill: '#fbbf24', fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#34d399" tick={{ fontSize: 10 }} label={{ value: 'CO₂ Abated (kg)', angle: 90, position: 'insideRight', fill: '#34d399', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#090e17', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="daily_inr_saved" name="Daily TPCODL ₹ Savings" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="co2_avoided_kg" name="CO₂ Emissions Avoided (kg)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {activeChartTab === 'fairness' && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={days} onClick={(e) => e?.activePayload?.[0]?.payload?.day && setSelectedDayIndex(e.activePayload[0].payload.day)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis dataKey="date_label" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0.5, 1.0]} stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: "Jain's Fairness Index (0 to 1)", angle: -90, position: 'insideLeft', fill: '#818cf8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#090e17', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0.80} stroke="#10b981" strokeDasharray="4 4" label={{ value: 'Target Equity Floor (0.80)', fill: '#10b981', fontSize: 10 }} />
                  <Line type="monotone" dataKey="fairness_index" name="SynapTwin Orchestrated LP (Run B)" stroke="#818cf8" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="baseline_fairness_index" name="Naive Uncoordinated Baseline (Run A)" stroke="#64748b" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* SECTION 3: Interactive 30-Day Day Selector Track */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
              <Calendar size={16} color="#38bdf8" />
              <span>Day-by-Day Calendar Selector (Select Any Day to Inspect 24h Telemetry):</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Selected: <b style={{ color: '#38bdf8' }}>Day {selectedDay?.day} ({selectedDay?.day_name})</b> &bull; Weather: <b style={{ textTransform: 'capitalize' }}>{selectedDay?.weather?.replace('_', ' ')}</b>
            </div>
          </div>

          <div style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 10,
            paddingTop: 4,
          }}>
            {days.map((d) => {
              const isSelected = d.day === selectedDayIndex;
              const isOutage = d.is_outage_day;
              return (
                <button
                  key={d.day}
                  onClick={() => setSelectedDayIndex(d.day)}
                  style={{
                    flexShrink: 0,
                    width: 76,
                    padding: '8px 6px',
                    background: isSelected ? 'rgba(56, 189, 248, 0.18)' : (isOutage ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.03)'),
                    border: isSelected ? '1.5px solid #38bdf8' : (isOutage ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)'),
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 14px rgba(56, 189, 248, 0.3)' : 'none',
                  }}
                >
                  <div style={{ fontSize: '10px', color: isSelected ? '#38bdf8' : '#94a3b8', fontWeight: 700 }}>
                    {d.day_name}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: isSelected ? '#f8fafc' : '#cbd5e1' }}>
                    D{d.day}
                  </div>
                  
                  {/* Weather / Outage Indicator Icon */}
                  {isOutage ? (
                    <span style={{ color: '#ef4444', fontSize: '9px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <AlertTriangle size={11} /> Outage
                    </span>
                  ) : d.weather === 'clear' ? (
                    <span style={{ color: '#fbbf24', fontSize: '9px', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Sun size={11} /> Clear
                    </span>
                  ) : d.weather === 'partly_cloudy' ? (
                    <span style={{ color: '#38bdf8', fontSize: '9px', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Cloud size={11} /> Part
                    </span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '9px', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <CloudRain size={11} /> Rain
                    </span>
                  )}

                  <div style={{ fontSize: '9px', color: '#10b981', fontWeight: 700, marginTop: 2 }}>
                    +₹{Math.round(d.daily_inr_saved / 1000)}k
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* SECTION 4: Selected Day 24-Hour Profile Deep-Dive */}
        {selectedDay && (
          <section className="panel-card" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                    {selectedDay.date_label} &mdash; 24-Hour Energy Dispatch Profile
                  </h3>
                  <span className="kpi-pill" style={{
                    background: selectedDay.is_outage_day ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                    color: selectedDay.is_outage_day ? '#f87171' : '#34d399',
                    border: selectedDay.is_outage_day ? '1px solid #ef4444' : '1px solid rgba(16, 185, 129, 0.4)',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {selectedDay.is_outage_day ? `🚨 OUTAGE DAY (${selectedDay.disaster_type.replace('_', ' ')})` : '⚡ NORMAL OPERATIONS'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 3 }}>
                  Day Type: <b style={{ color: '#cbd5e1', textTransform: 'capitalize' }}>{selectedDay.day_type}</b> &bull; Weather Multiplier: <b>{selectedDay.solar_multiplier}x</b> &bull; Load Multiplier: <b>{selectedDay.load_multiplier}x</b>
                </div>
              </div>

              {/* Day Metrics Highlights */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Solar Harvested</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#10b981' }}>{selectedDay.total_solar_kwh.toLocaleString()} kWh</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>TPCODL Savings</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#fbbf24' }}>+₹{selectedDay.daily_inr_saved.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Fairness Ratio</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#818cf8' }}>{selectedDay.fairness_index}</div>
                </div>
              </div>
            </div>

            {/* 24-Hour Area Chart for Selected Day */}
            <div style={{ height: 280, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selectedDayHourly}>
                  <defs>
                    <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="batGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gridGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis dataKey="hour" stroke="#64748b" tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Power (kW)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#090e17', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 8, fontSize: 12 }}
                    formatter={(val, name) => [`${val} kW`, name]}
                    labelFormatter={(h) => `Hour ${h}:00`}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="solar_kw" name="Rooftop Solar (kW)" stroke="#10b981" fillOpacity={1} fill="url(#solarGrad)" />
                  <Area type="monotone" dataKey="battery_dispatched_kw" name="Battery Dispatched (kW)" stroke="#06b6d4" fillOpacity={1} fill="url(#batGrad)" />
                  <Area type="monotone" dataKey="grid_import_kw" name="Grid Import (kW)" stroke="#64748b" fillOpacity={1} fill="url(#gridGrad)" />
                  <Line type="monotone" dataKey="demand_kw" name="Campus Demand (kW)" stroke="#f43f5e" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </>
    )}

      </main>
    </div>
  );
}
