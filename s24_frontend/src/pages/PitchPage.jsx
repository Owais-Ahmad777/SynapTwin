import React from 'react';

// UI-ONLY: presentation-friendly organization of EXISTING pitch content only.
// All numbers/text derive from the same simData used by the existing PitchModal.
export default function PitchPage({ simData }) {
  const solarKwh = simData?.environmental_metrics?.clean_solar_generated_kwh_daily || 5021.0;
  const cleanEnergyTotal = simData?.impact_metrics?.grid_electricity_avoided_kwh || (solarKwh + 592.3);
  const co2Avoided = simData?.environmental_metrics?.co2_avoided_kg_daily || simData?.impact_metrics?.co2_avoided_kg || 4602.9;
  const dailyInrSaved = simData?.financial_metrics?.daily_inr_saved || simData?.impact_metrics?.daily_inr_saved || 21328;

  const sections = [
    { t: 'Problem Statement', d: 'Campus blocks waste rooftop solar potential in isolation while grid outages threaten life-safety loads; naive equal battery splits starve the neediest blocks.' },
    { t: 'Solution', d: 'SynapTwin shared second-life battery microgrid with Two-Stage Max-Min Fairness LP day-to-day and 4-Tier Lexicographic Triage during disaster islanding.' },
    { t: 'Innovation', d: 'Real OSM geometry • dual optimization solvers • 120 kW/360 kWh repurposed EV BESS with SoH derating • 12-scooter driEV solar-soak + V2G micro-buffer • Fernet AES-128-CBC privacy vault.' },
    { t: 'Impact', d: `${Number(cleanEnergyTotal).toLocaleString()} kWh grid power avoided/day • ${Number(co2Avoided).toLocaleString()} kg CO₂ abated/day • +₹${Number(dailyInrSaved).toLocaleString()} daily ToU savings • 99.9% Tier-1 availability.` },
    { t: 'Sustainability', d: 'Second-life EV batteries extend useful life; rooftop solar harvest displaces thermal grid imports; fairness guarantees zero starvation across all blocks.' },
    { t: 'Technical Architecture', d: 'Leaflet OSM twin → PuLP/water-filling LP + triage engine → 120 kW BESS dispatch → driEV hub → encrypted RBAC telemetry → SHA-256 audit ledger.' },
    { t: 'Benefits', d: 'Lower TPCODL bills, resilient medical/comms/shelter power, equitable sharing, auditable compliance, and judge-ready live simulation.' },
  ];

  return (
    <div className="st-page">
      <div className="st-page-head">
        <div className="st-eyebrow">Investor Brief</div>
        <h2 className="st-page-title">Judge Pitch</h2>
        <p className="st-page-sub">Problem, solution, impact, and architecture.</p>
      </div>
      <div className="st-pitch-grid">
        <div className="st-pitch-hero">
          <div><span>Grid avoided / day</span><b>{Number(cleanEnergyTotal).toLocaleString()} kWh</b></div>
          <div><span>CO₂ abated / day</span><b>{Number(co2Avoided).toLocaleString()} kg</b></div>
          <div><span>Daily ToU savings</span><b>+₹{Number(dailyInrSaved).toLocaleString()}</b></div>
        </div>
        {sections.map((s) => (
          <div key={s.t} className="panel-card"><div className="panel-header"><div className="panel-title">{s.t}</div></div><div className="panel-body"><p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.d}</p></div></div>
        ))}
      </div>
    </div>
  );
}
