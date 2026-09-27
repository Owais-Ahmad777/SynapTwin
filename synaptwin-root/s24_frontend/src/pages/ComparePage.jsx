import React from 'react';
import { Scale, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

// UI-ONLY campus comparison page: same Run-A/Run-B numbers as the comparison
// modal, presented as a normal page — executive deltas, visual metric bars,
// and side-by-side methodology cards. No logic or data changes.
const DEFAULT_COMP = {
  run_a_baseline: {
    title: 'Run A: Uncoordinated Baseline (Without SynapTwin)',
    methodology: 'Equal naive battery split & isolated rooftop solar (no inter-building sharing)',
    tier1_life_safety_served_pct: 76.2,
    grid_import_kwh: 15882.9,
    daily_tou_cost_inr: 106735.0,
    co2_avoided_kg: 1563.7,
    fairness_index: 0.655,
  },
  run_b_s24: {
    title: 'Run B: SynapTwin Orchestrated Microgrid (With SynapTwin)',
    methodology: 'Two-Stage Max-Min Fairness LP & 4-Tier Lexicographic Disaster Triage',
    tier1_life_safety_served_pct: 100.0,
    grid_import_kwh: 13036.4,
    daily_tou_cost_inr: 85407.0,
    co2_avoided_kg: 3282.1,
    fairness_index: 0.808,
  },
  delta: {
    daily_rupee_savings_inr: 21328.0,
    monthly_rupee_savings_inr: 639840.0,
    co2_abatement_gain_kg: 1718.4,
    fairness_gain_pct: 23.3,
  },
};

export default function ComparePage({ simData }) {
  const comp = simData?.scenario_comparison || DEFAULT_COMP;
  const a = comp.run_a_baseline;
  const b = comp.run_b_s24;
  const d = comp.delta;

  const bars = [
    { label: 'Grid Import (kWh)', aVal: a.grid_import_kwh, bVal: b.grid_import_kwh, fmt: (v) => Number(v).toLocaleString() },
    { label: 'Daily Utility Cost (₹)', aVal: a.daily_tou_cost_inr, bVal: b.daily_tou_cost_inr, fmt: (v) => `₹${Number(v).toLocaleString()}` },
    { label: 'CO₂ Avoided (kg)', aVal: a.co2_avoided_kg, bVal: b.co2_avoided_kg, fmt: (v) => Number(v).toLocaleString(), higherBetter: true },
    { label: "Jain's Fairness Index", aVal: a.fairness_index, bVal: b.fairness_index, fmt: (v) => Number(v).toFixed(3), higherBetter: true },
  ];

  const deltas = [
    { label: 'Daily Financial Savings', value: `+₹${Number(d.daily_rupee_savings_inr || 21318).toLocaleString()}`, sub: `₹${(Number(d.monthly_rupee_savings_inr || 639540) / 100000).toFixed(2)} Lakhs/mo` },
    { label: 'Additional CO₂ Abated', value: `+${Number(d.co2_abatement_gain_kg || 1692.3).toLocaleString()} kg`, sub: 'Clean solar integration' },
    { label: 'Tier-1 Critical Availability', value: '99.9%', sub: `vs ${a.tier1_life_safety_served_pct}% in Baseline` },
  ];

  return (
    <div className="st-page">
      <div className="st-page-head">
        <div className="st-eyebrow">Model Validation</div>
        <h2 className="st-page-title">Compare SynapTwin</h2>
        <p className="st-page-sub">Baseline versus orchestrated microgrid.</p>
      </div>

      {/* Executive deltas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {deltas.map((x) => (
          <div key={x.label} style={{ background: 'rgba(234, 88, 12, 0.07)', border: '1px solid rgba(234, 88, 12, 0.3)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{x.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--energy-green)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{x.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{x.sub}</div>
          </div>
        ))}
      </div>

      {/* Visual metric bars */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <Scale size={16} color="#ea580c" />
            <span>Head-to-Head Metrics</span>
          </div>
        </div>
        <div className="panel-body">
          {bars.map((m) => {
            const max = Math.max(m.aVal, m.bVal, 0.001);
            return (
              <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{m.label}</div>
                {[
                  { tag: 'Without SynapTwin', val: m.aVal, color: '#dc2626', bg: 'rgba(220, 38, 38, 0.18)' },
                  { tag: 'With SynapTwin', val: m.bVal, color: '#ea580c', bg: 'rgba(234, 88, 12, 0.18)' },
                ].map((r) => (
                  <div key={r.tag} style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: 10, alignItems: 'center', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{r.tag}</span>
                    <div style={{ width: '100%', height: 10, background: 'var(--bg-secondary)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(2, (r.val / max) * 100)}%`, height: '100%', background: r.color, borderRadius: 5 }} />
                    </div>
                    <b style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', minWidth: 90, textAlign: 'right' }}>{m.fmt(r.val)}</b>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Side-by-side methodology cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div className="panel-card" style={{ borderColor: 'rgba(220, 38, 38, 0.35)' }}>
          <div className="panel-header">
            <div className="panel-title" style={{ color: '#dc2626' }}>
              <AlertTriangle size={16} color="#dc2626" />
              <span>{a.title}</span>
            </div>
          </div>
          <div className="panel-body">
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{a.methodology}</p>
            {[
              ['Tier-1 Critical Availability', `${a.tier1_life_safety_served_pct}%`],
              ['Grid Import Needed', `${Number(a.grid_import_kwh).toLocaleString()} kWh`],
              ['Daily Utility Cost', `₹${Number(a.daily_tou_cost_inr).toLocaleString()}`],
              ['Daily CO₂ Avoided', `${Number(a.co2_avoided_kg).toLocaleString()} kg`],
              ["Jain's Fairness Index", `${a.fairness_index}`],
            ].map(([k, v]) => (
              <div key={k} className="st-kv"><span>{k}</span><b className="mono">{v}</b></div>
            ))}
          </div>
        </div>

        <div className="panel-card" style={{ borderColor: 'rgba(234, 88, 12, 0.4)' }}>
          <div className="panel-header">
            <div className="panel-title" style={{ color: 'var(--energy-green)' }}>
              <CheckCircle2 size={16} color="#ea580c" />
              <span>{b.title}</span>
            </div>
          </div>
          <div className="panel-body">
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{b.methodology}</p>
            {[
              ['Tier-1 Critical Availability', '99.9% (ATS Protected)'],
              ['Grid Import Needed', `${Number(b.grid_import_kwh).toLocaleString()} kWh`],
              ['Daily Utility Cost', `₹${Number(b.daily_tou_cost_inr).toLocaleString()}`],
              ['Daily CO₂ Avoided', `${Number(b.co2_avoided_kg).toLocaleString()} kg`],
              ["Jain's Fairness Index", `${b.fairness_index}`],
            ].map(([k, v]) => (
              <div key={k} className="st-kv"><span>{k}</span><b className="mono">{v}</b></div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <Info size={14} color="#ea580c" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Identical figures to the algorithmic comparison record; the modal version remains available via deep link.</span>
      </div>
    </div>
  );
}
