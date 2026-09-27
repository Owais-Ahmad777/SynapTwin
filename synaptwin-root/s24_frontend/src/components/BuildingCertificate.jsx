import React, { useState, useEffect } from 'react';
import { Award, Printer, ShieldCheck, Info } from 'lucide-react';

// UI-ONLY per-building certificate page: toolbar (print), the official
// certificate document (financial + sustainability rows), a verification
// strip, and methodology context. Figures are pro-rata views (annual / 365,
// annual / 12) of this building's Year-1 projected share from
// /api/history/multiyear — no new formulas. Campus certificate untouched.
export default function BuildingCertificate({ buildingName = '' }) {
  const [row, setRow] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/history/multiyear?years=1')
      .then((res) => res.json())
      .then((data) => {
        const found = ((data?.per_building_yearly?.[0]?.buildings) || [])
          .find((b) => b.building === buildingName) || null;
        setRow(found);
      })
      .catch(() => setFailed(true));
  }, [buildingName]);

  if (failed) {
    return (
      <div className="panel-card">
        <div className="panel-body">
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Per-building certificate data is unavailable right now.
          </p>
        </div>
      </div>
    );
  }

  if (!row) {
    return <div className="panel-card skeleton-card" style={{ height: 340 }}></div>;
  }

  const annual = row.annual_savings_inr || 0;
  const finRows = [
    { label: 'Daily Electricity Saving', value: `₹${Math.round(annual / 365).toLocaleString()}` },
    { label: 'Monthly Projected Saving', value: `₹${Math.round(annual / 12).toLocaleString()}` },
    { label: 'Annualized Utility Cost Cut', value: `₹${Math.round(annual).toLocaleString()}` },
  ];
  const envRows = [
    { label: 'Daily Rooftop Solar Harvested', value: `${Math.round((row.solar_kwh || 0) / 365).toLocaleString()} kWh` },
    { label: 'Emissions Avoided Daily', value: `${Math.round((row.co2_abated_kg || 0) / 365).toLocaleString()} kg CO₂` },
    { label: 'Clean Power Delivered Daily', value: `${Math.round((row.grid_avoided_kwh || 0) / 365).toLocaleString()} kWh` },
  ];
  const checks = [
    'Year-1 projected share loaded',
    'Figures are pro-rata views of that share',
    'Allocation methodology disclosed below',
  ];

  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Official record for <b style={{ color: 'var(--text-primary)' }}>{buildingName}</b> • Issued {today}
        </span>
        <button type="button" className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} onClick={() => window.print()}>
          <Printer size={14} />
          <span>Print / Save PDF</span>
        </button>
      </div>

      {/* Certificate document */}
      <div className="st-cert-doc">
        <div className="st-cert-head">
          <Award size={30} color="#b45309" />
          <div className="st-cert-kicker">SynapTwin Building Energy Certificate</div>
          <h2 className="st-cert-name">{buildingName}</h2>
          <div className="st-cert-date">Issued {today} • Year-1 projected share</div>
        </div>

        <div className="st-cert-section">Financial Impact</div>
        {finRows.map((f) => (
          <div key={f.label} className="st-cert-row">
            <span>{f.label}</span>
            <b>{f.value}</b>
          </div>
        ))}

        <div className="st-cert-section">Decarbonization &amp; Sustainability Audit</div>
        {envRows.map((e) => (
          <div key={e.label} className="st-cert-row">
            <span>{e.label}</span>
            <b>{e.value}</b>
          </div>
        ))}

        <div className="st-cert-foot">
          Daily and monthly figures are pro-rata views of this building&apos;s Year-1
          projected share from the campus multi-year benchmark. Campus certificate unchanged.
        </div>
      </div>

      {/* Verification strip */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <ShieldCheck size={16} color="#ea580c" />
            <span>Record Verification</span>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {checks.map((c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <ShieldCheck size={15} color="#ea580c" style={{ flexShrink: 0 }} />
                <span>{c}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 4 }}>
            <Info size={14} color="#ea580c" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Demand share {(row.demand_share * 100).toFixed(1)}% • Solar share {(row.solar_share * 100).toFixed(1)}% •
              Annual grid avoided {Number(row.grid_avoided_kwh || 0).toLocaleString()} kWh •
              Annual CO₂ abated {Number(row.co2_abated_kg || 0).toLocaleString()} kg.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
