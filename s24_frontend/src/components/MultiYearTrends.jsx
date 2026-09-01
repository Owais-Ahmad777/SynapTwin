import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Sun, IndianRupee, Leaf, Battery, 
  Info, RotateCcw 
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Area, Bar,
  Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine
} from 'recharts';

export const MULTIYEAR_DISCLAIMER_TEXT = "Projected using documented industry-standard assumptions; not derived from real historical campus records, which are not publicly available.";

export default function MultiYearTrends() {
  const [years, setYears] = useState(5);
  const [solarDegradation, setSolarDegradation] = useState(0.5);
  const [tariffEscalation, setTariffEscalation] = useState(3.5);
  const [includeBatteryAging, setIncludeBatteryAging] = useState(true);
  
  const [projectionData, setProjectionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('financial'); // 'financial' | 'energy' | 'battery'

  // Fetch projection from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      years: years.toString(),
      solar_degradation_pct: solarDegradation.toString(),
      tariff_escalation_pct: tariffEscalation.toString(),
      include_battery_aging: includeBatteryAging ? 'true' : 'false',
    });

    fetch(`/api/history/multiyear?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setProjectionData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load multi-year projection:', err);
        setLoading(false);
      });
  }, [years, solarDegradation, tariffEscalation, includeBatteryAging]);

  const handleResetAssumptions = () => {
    setYears(5);
    setSolarDegradation(0.5);
    setTariffEscalation(3.5);
    setIncludeBatteryAging(true);
  };

  const totals = projectionData?.totals;
  const yearly = projectionData?.yearly_summary || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1. Top Assumption Control Panel & KPIs */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 14,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} color="#38bdf8" />
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                Multi-Year Strategic Energy &amp; Financial Projections ({years} Years)
              </h2>
              <span style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                textTransform: 'uppercase',
              }}>
                Synthetic Benchmark
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Extending the 30-day weather variability engine across multi-year horizon with silicon PV degradation and TPCODL tariff escalation.
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetAssumptions}
            className="btn-secondary"
            style={{ fontSize: '11px', padding: '6px 12px' }}
            title="Reset projection parameters to documented industry defaults"
          >
            <RotateCcw size={13} />
            <span>Reset Defaults</span>
          </button>
        </div>

        {/* Interactive Assumption Sliders */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '14px 18px',
          borderRadius: 10,
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          {/* Horizon Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: 6 }}>
              <span style={{ color: '#94a3b8' }}>Projection Horizon:</span>
              <b style={{ color: '#38bdf8' }}>{years} Years</b>
            </div>
            <input 
              type="range"
              min={1}
              max={10}
              step={1}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          {/* PV Degradation Rate */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: 6 }}>
              <span style={{ color: '#94a3b8' }}>PV Degradation / Year:</span>
              <b style={{ color: '#fbbf24' }}>{solarDegradation}% / yr</b>
            </div>
            <input 
              type="range"
              min={0.0}
              max={1.5}
              step={0.1}
              value={solarDegradation}
              onChange={(e) => setSolarDegradation(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fbbf24' }}
            />
          </div>

          {/* TPCODL Tariff Escalation Rate */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: 6 }}>
              <span style={{ color: '#94a3b8' }}>Tariff Escalation / Year:</span>
              <b style={{ color: '#34d399' }}>+{tariffEscalation}% / yr</b>
            </div>
            <input 
              type="range"
              min={0.0}
              max={8.0}
              step={0.5}
              value={tariffEscalation}
              onChange={(e) => setTariffEscalation(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#34d399' }}
            />
          </div>

          {/* Battery Aging Toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: 6 }}>Battery Aging Model:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '12px', color: '#e2e8f0' }}>
              <input 
                type="checkbox"
                checked={includeBatteryAging}
                onChange={(e) => setIncludeBatteryAging(e.target.checked)}
                style={{ accentColor: '#06b6d4', width: 16, height: 16 }}
              />
              <span>Empirical NMC Li-ion fade</span>
            </label>
          </div>
        </div>

        {/* 4 Cumulative KPI Summary Cards */}
        {totals && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
          }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <IndianRupee size={13} color="#34d399" />
                <span>Cumulative {years}-Year Savings</span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                ₹{totals.cumulative_savings_lakhs} <span style={{ fontSize: '13px' }}>Lakhs</span>
              </div>
              <div style={{ fontSize: '10px', color: '#6ee7b7', marginTop: 2 }}>
                vs. Uncoordinated Campus Baseline
              </div>
            </div>

            <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sun size={13} color="#38bdf8" />
                <span>Total Clean Solar Generation</span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {totals.cumulative_solar_mwh} <span style={{ fontSize: '13px' }}>MWh</span>
              </div>
              <div style={{ fontSize: '10px', color: '#7dd3fc', marginTop: 2 }}>
                16 Rooftops with {solarDegradation}%/yr fade
              </div>
            </div>

            <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Leaf size={13} color="#4ade80" />
                <span>Carbon Emissions Abated</span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#4ade80', marginTop: 4 }}>
                {totals.cumulative_co2_abated_tonnes} <span style={{ fontSize: '13px' }}>Tonnes</span>
              </div>
              <div style={{ fontSize: '10px', color: '#86efac', marginTop: 2 }}>
                0.82 kg CO₂/kWh Indian Grid Factor
              </div>
            </div>

            <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Battery size={13} color="#22d3ee" />
                <span>Year {years} Battery Health (SoH)</span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#22d3ee', marginTop: 4 }}>
                {totals.final_battery_soh_pct}% <span style={{ fontSize: '12px' }}>({totals.final_battery_duty_tier})</span>
              </div>
              <div style={{ fontSize: '10px', color: '#a5f3fc', marginTop: 2 }}>
                Second-Life Degradation Trajectory
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Chart View Tab Switcher */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: 10 }}>
        <button
          type="button"
          className={`btn-secondary ${activeTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveTab('financial')}
          style={{
            borderColor: activeTab === 'financial' ? '#34d399' : 'rgba(255, 255, 255, 0.15)',
            color: activeTab === 'financial' ? '#34d399' : '#94a3b8',
            background: activeTab === 'financial' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
            padding: '8px 16px',
            fontSize: '12px',
          }}
        >
          <IndianRupee size={14} />
          <span>Financial Trajectory &amp; Tariff Escalation</span>
        </button>

        <button
          type="button"
          className={`btn-secondary ${activeTab === 'energy' ? 'active' : ''}`}
          onClick={() => setActiveTab('energy')}
          style={{
            borderColor: activeTab === 'energy' ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
            color: activeTab === 'energy' ? '#38bdf8' : '#94a3b8',
            background: activeTab === 'energy' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            padding: '8px 16px',
            fontSize: '12px',
          }}
        >
          <Sun size={14} />
          <span>Solar PV Harvest &amp; CO₂ Abatement</span>
        </button>

        <button
          type="button"
          className={`btn-secondary ${activeTab === 'battery' ? 'active' : ''}`}
          onClick={() => setActiveTab('battery')}
          style={{
            borderColor: activeTab === 'battery' ? '#22d3ee' : 'rgba(255, 255, 255, 0.15)',
            color: activeTab === 'battery' ? '#22d3ee' : '#94a3b8',
            background: activeTab === 'battery' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
            padding: '8px 16px',
            fontSize: '12px',
          }}
        >
          <Battery size={14} />
          <span>Battery SoH Degradation &amp; Fairness</span>
        </button>
      </div>

      {/* 3. Main Chart Panel */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 14,
        padding: '24px',
        position: 'relative',
      }}>
        {loading ? (
          <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
            Simulating {years}-year multi-year trajectory...
          </div>
        ) : (
          <>
            {/* Tab 1: Financial & Tariff Trajectory */}
            {activeTab === 'financial' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0', color: '#34d399' }}>
                    Annual Cost Savings &amp; Utility Tariff Inflation Benchmark
                  </h3>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    Demonstrating expanding savings margin as TPCODL commercial tariffs escalate (+{tariffEscalation}%/yr) against fixed solar PV investment.
                  </span>
                </div>

                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={yearly} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="year_label" stroke="#94a3b8" />
                      <YAxis yAxisId="left" stroke="#34d399" label={{ value: 'Savings (₹ Lakhs)', angle: -90, position: 'insideLeft', fill: '#34d399' }} />
                      <YAxis yAxisId="right" orientation="right" stroke="#fbbf24" domain={[4, 12]} label={{ value: 'Avg Tariff (₹/kWh)', angle: 90, position: 'insideRight', fill: '#fbbf24' }} />
                      <Tooltip 
                        contentStyle={{ background: '#090e17', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: '12px' }} 
                        formatter={(val, name) => [name.includes('Tariff') ? `₹${val}/kWh` : (name.includes('Lakhs') ? `₹${val} Lakhs` : val), name]}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="annual_savings_lakhs" name="Annual Savings (₹ Lakhs)" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Line yAxisId="left" type="monotone" dataKey="cumulative_savings_lakhs" name="Cumulative Savings (₹ Lakhs)" stroke="#60a5fa" strokeWidth={3} dot={{ r: 5 }} />
                      <Line yAxisId="right" type="monotone" dataKey="effective_tariff_inr" name="Escalated Tariff (₹/kWh)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Tab 2: Solar Generation & Carbon Abatement */}
            {activeTab === 'energy' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0', color: '#38bdf8' }}>
                    Annual Solar PV Harvest &amp; Avoided Carbon Emissions
                  </h3>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    Modeling ~{solarDegradation}%/year PV efficiency decline and 0.82 kg CO₂/kWh thermal grid abatement.
                  </span>
                </div>

                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={yearly} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="year_label" stroke="#94a3b8" />
                      <YAxis yAxisId="left" stroke="#38bdf8" label={{ value: 'Clean Solar (MWh)', angle: -90, position: 'insideLeft', fill: '#38bdf8' }} />
                      <YAxis yAxisId="right" orientation="right" stroke="#4ade80" label={{ value: 'CO₂ Abated (Tonnes)', angle: 90, position: 'insideRight', fill: '#4ade80' }} />
                      <Tooltip contentStyle={{ background: '#090e17', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: '12px' }} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="solar_mwh" name="Rooftop Solar Harvest (MWh/yr)" fill="#0284c7" radius={[6, 6, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="co2_abated_tonnes" name="Annual CO₂ Abated (Tonnes)" stroke="#4ade80" strokeWidth={3} dot={{ r: 5 }} />
                      <Line yAxisId="right" type="monotone" dataKey="cumulative_co2_tonnes" name="Cumulative CO₂ Abated (Tonnes)" stroke="#86efac" strokeWidth={2} strokeDasharray="3 3" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Tab 3: Battery SoH & Fairness Index */}
            {activeTab === 'battery' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0', color: '#22d3ee' }}>
                    Second-Life EV Battery SoH Trajectory &amp; Max-Min Fairness Stability
                  </h3>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    Simulating empirical Li-ion capacity fade across duty tiers (FULL_DUTY &rarr; BACKUP_ONLY &rarr; SECOND_LIFE_LOW).
                  </span>
                </div>

                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={yearly} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="year_label" stroke="#94a3b8" />
                      <YAxis yAxisId="left" stroke="#22d3ee" domain={[40, 90]} label={{ value: 'Battery SoH (%)', angle: -90, position: 'insideLeft', fill: '#22d3ee' }} />
                      <YAxis yAxisId="right" orientation="right" stroke="#a78bfa" domain={[85, 100]} label={{ value: 'Fairness Index (%)', angle: 90, position: 'insideRight', fill: '#a78bfa' }} />
                      <Tooltip contentStyle={{ background: '#090e17', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: '12px' }} />
                      <Legend />
                      <ReferenceLine yAxisId="left" y={80} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '80% Full Duty Threshold', fill: '#f59e0b', fontSize: 10 }} />
                      <ReferenceLine yAxisId="left" y={60} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '60% Backup Only Threshold', fill: '#ef4444', fontSize: 10 }} />
                      <Area yAxisId="left" type="monotone" dataKey="battery_soh_pct" name="Battery State of Health (SoH %)" fill="rgba(6, 182, 212, 0.2)" stroke="#06b6d4" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="fairness_pct" name="Max-Min Fairness Index (%)" stroke="#c084fc" strokeWidth={3} dot={{ r: 5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. Tabular Summary of Yearly Benchmark Data */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 14,
        padding: '20px 24px',
        overflowX: 'auto',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0', color: '#f8fafc' }}>
          Year-by-Year Aggregated Projection Breakdown
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.12)', color: '#94a3b8' }}>
              <th style={{ padding: '8px 12px' }}>Horizon</th>
              <th style={{ padding: '8px 12px' }}>Solar Harvest (MWh)</th>
              <th style={{ padding: '8px 12px' }}>Annual Savings (₹ Lakhs)</th>
              <th style={{ padding: '8px 12px' }}>Cumulative Savings</th>
              <th style={{ padding: '8px 12px' }}>CO₂ Abated (Tonnes)</th>
              <th style={{ padding: '8px 12px' }}>Battery SoH (%)</th>
              <th style={{ padding: '8px 12px' }}>Duty Tier</th>
              <th style={{ padding: '8px 12px' }}>Tariff Rate</th>
              <th style={{ padding: '8px 12px' }}>Fairness Index</th>
            </tr>
          </thead>
          <tbody>
            {yearly.map((row) => (
              <tr key={row.year} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#f8fafc' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#38bdf8' }}>{row.year_label}</td>
                <td style={{ padding: '10px 12px' }}>{row.solar_mwh} MWh</td>
                <td style={{ padding: '10px 12px', color: '#34d399', fontWeight: 700 }}>₹{row.annual_savings_lakhs} L</td>
                <td style={{ padding: '10px 12px', color: '#6ee7b7' }}>₹{row.cumulative_savings_lakhs} L</td>
                <td style={{ padding: '10px 12px', color: '#4ade80' }}>{row.co2_abated_tonnes} t</td>
                <td style={{ padding: '10px 12px', color: '#22d3ee', fontWeight: 600 }}>{row.battery_soh_pct}%</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    background: row.battery_duty_tier === 'FULL_DUTY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: row.battery_duty_tier === 'FULL_DUTY' ? '#34d399' : '#fbbf24',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: '10.5px',
                    fontWeight: 600,
                  }}>
                    {row.battery_duty_tier}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: '#fbbf24' }}>₹{row.effective_tariff_inr}/kWh</td>
                <td style={{ padding: '10px 12px', color: '#c084fc' }}>{row.fairness_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 5. MANDATORY HONESTY DISCLAIMER BANNER (ALWAYS VISIBLE IN CAPTION / FOOTER) */}
      <div style={{
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1.5px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 10,
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        color: '#fbbf24',
        fontSize: '11.5px',
        lineHeight: 1.5,
      }}>
        <Info size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <b>PROJECTED / SYNTHETIC BENCHMARK DISCLAIMER:</b>{' '}
          {projectionData?.disclaimer || MULTIYEAR_DISCLAIMER_TEXT}
          <div style={{ marginTop: 4, color: '#fef08a', fontSize: '10.5px' }}>
            &bull; <b>PV Degradation:</b> ~{solarDegradation}%/yr silicon solar cell efficiency loss (NREL/IEC 61215). &bull; <b>Tariff Inflation:</b> +{tariffEscalation}%/yr planning escalation assumption. &bull; <b>Battery:</b> Empirical NMC degradation from <code>optimizer/battery_health.py</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
