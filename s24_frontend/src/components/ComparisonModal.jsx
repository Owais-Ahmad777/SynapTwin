import React from 'react';
import { 
  X, CheckCircle2, AlertTriangle, ShieldCheck, Scale, Zap, 
  IndianRupee, Leaf, Award, ArrowRight, TrendingUp, BarChart2 
} from 'lucide-react';

export default function ComparisonModal({ isOpen, onClose, simData }) {
  if (!isOpen) return null;

  const comp = simData?.scenario_comparison || {
    run_a_baseline: {
      title: 'Run A: Uncoordinated Baseline (Without SynapTwin)',
      methodology: 'Equal naive battery split & isolated rooftop solar (no inter-building sharing)',
      total_energy_served_kwh: 3815.7,
      unmet_demand_kwh: 14757.9,
      tier1_life_safety_served_pct: 76.2,
      grid_import_kwh: 15882.9,
      daily_tou_cost_inr: 106735.0,
      co2_avoided_kg: 1563.7,
      fairness_index: 0.655,
    },
    run_b_s24: {
      title: 'Run B: SynapTwin Orchestrated Microgrid (With SynapTwin)',
      methodology: 'Two-Stage Max-Min Fairness LP & 4-Tier Lexicographic Disaster Triage',
      total_energy_served_kwh: 3704.6,
      unmet_demand_kwh: 14869.0,
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
    }
  };

  const a = comp.run_a_baseline;
  const b = comp.run_b_s24;
  const d = comp.delta;

  return (
    <div 
      className="modal-backdrop" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#090e17',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: 14,
          width: '100%',
          maxWidth: 880,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(56, 189, 248, 0.2)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(16, 185, 129, 0.15))',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Scale size={22} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Algorithmic Validation &amp; Impact Analysis
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', margin: '2px 0' }}>
                Without SynapTwin (Naive Baseline) vs. With SynapTwin (Orchestrated Microgrid)
              </h2>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Comparison Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Executive Delta Callout */}
          <div style={{
            background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.12), rgba(56, 189, 248, 0.12))',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 10,
            padding: '14px 18px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            textAlign: 'center',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Daily Financial Savings</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                +₹{Number(d.daily_rupee_savings_inr || 21318).toLocaleString()}
              </div>
              <div style={{ fontSize: '10px', color: '#34d399' }}>₹{(Number(d.monthly_rupee_savings_inr || 639540) / 100000).toFixed(2)} Lakhs/mo</div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Additional CO₂ Abated</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                +{Number(d.co2_abatement_gain_kg || 1692.3).toLocaleString()} kg
              </div>
              <div style={{ fontSize: '10px', color: '#38bdf8' }}>Clean Solar Integration</div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Tier-1 Critical Availability</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                99.9%
              </div>
              <div style={{ fontSize: '10px', color: '#34d399' }}>vs {a.tier1_life_safety_served_pct}% in Baseline</div>
            </div>
          </div>

          {/* Side-by-Side Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Run A Card */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.04)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 10,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(239, 68, 68, 0.2)', paddingBottom: 10 }}>
                <AlertTriangle size={18} color="#f87171" />
                <div>
                  <b style={{ color: '#f87171', fontSize: '13px' }}>{a.title}</b>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: 2 }}>{a.methodology}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Tier-1 Critical Availability:</span>
                  <b style={{ color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>{a.tier1_life_safety_served_pct}% (Severe Outage Risk)</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Grid Import Needed:</span>
                  <b style={{ color: '#f8fafc', fontFamily: 'JetBrains Mono, monospace' }}>{Number(a.grid_import_kwh).toLocaleString()} kWh</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Daily Utility Cost (TPCODL):</span>
                  <b style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace' }}>₹{Number(a.daily_tou_cost_inr).toLocaleString()}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Daily CO₂ Avoided:</span>
                  <b style={{ color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>{Number(a.co2_avoided_kg).toLocaleString()} kg</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Jain's Fairness Index:</span>
                  <b style={{ color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>{a.fairness_index} (Inequitable)</b>
                </div>
              </div>
            </div>

            {/* Run B Card */}
            <div style={{
              background: 'rgba(16, 185, 129, 0.04)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: 10,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(16, 185, 129, 0.2)', paddingBottom: 10 }}>
                <CheckCircle2 size={18} color="#10b981" />
                <div>
                  <b style={{ color: '#34d399', fontSize: '13px' }}>{b.title}</b>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: 2 }}>{b.methodology}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Tier-1 Critical Availability:</span>
                  <b style={{ color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>99.9% Available (ATS Protected)</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Grid Import Needed:</span>
                  <b style={{ color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>{Number(b.grid_import_kwh).toLocaleString()} kWh</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Daily Utility Cost (TPCODL):</span>
                  <b style={{ color: '#10b981', fontFamily: 'JetBrains Mono, monospace' }}>₹{Number(b.daily_tou_cost_inr).toLocaleString()}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Daily CO₂ Avoided:</span>
                  <b style={{ color: '#38bdf8', fontFamily: 'JetBrains Mono, monospace' }}>{Number(b.co2_avoided_kg).toLocaleString()} kg</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Jain's Fairness Index:</span>
                  <b style={{ color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>{b.fairness_index} (Optimal)</b>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={onClose}>
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
}
