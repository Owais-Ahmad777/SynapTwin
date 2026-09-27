import React from 'react';
import { X, CheckCircle2, Award, Zap, Shield, Battery, Cpu, Building2, Bike } from 'lucide-react';

export default function PitchModal({ isOpen, onClose, simData, impactMetrics }) {
  if (!isOpen) return null;

  const solarKwh = simData?.environmental_metrics?.clean_solar_generated_kwh_daily || 5021.0;
  const cleanEnergyTotal = simData?.impact_metrics?.grid_electricity_avoided_kwh || (solarKwh + 592.3);
  const batteryKwh = Math.round(Math.max(0, cleanEnergyTotal - solarKwh));
  const co2Avoided = simData?.environmental_metrics?.co2_avoided_kg_daily || simData?.impact_metrics?.co2_avoided_kg || 4602.9;
  const dailyInrSaved = simData?.financial_metrics?.daily_inr_saved || simData?.impact_metrics?.daily_inr_saved || 21328;
  
  const comp = simData?.scenario_comparison;
  const runBGridImport = comp?.run_b_s24?.grid_import_kwh || 13036.4;
  const baselineGridImport = comp?.run_a_baseline?.grid_import_kwh || 15882.9;
  const kwhSavedVsBaseline = Math.round(Math.max(0, baselineGridImport - runBGridImport));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Award size={22} color="#10b981" />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
                SynapTwin: SOA ITER Campus Digital Twin
              </h2>
              <p style={{ fontSize: 12, color: '#94a3b8' }}>
                SOA Ideathon 2026 Pitch &bull; Community Energy Flexibility &amp; Shared 2nd-Life Battery
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Executive Headline Metrics (Dynamic from Simulation State) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
              {Number(cleanEnergyTotal).toLocaleString()} kWh
            </div>
            <div style={{ fontSize: 11, color: '#f8fafc', fontWeight: 700, marginTop: 2 }}>Direct Grid Power Avoided / Day</div>
            <div style={{ fontSize: 10, color: '#34d399', marginTop: 2 }}>
              Solar ({Number(solarKwh).toLocaleString()} kWh) + Battery ({batteryKwh} kWh)
            </div>
          </div>

          <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {Number(co2Avoided).toLocaleString()} kg
            </div>
            <div style={{ fontSize: 11, color: '#f8fafc', fontWeight: 700, marginTop: 2 }}>CO₂ Emissions Abated / Day</div>
            <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 2 }}>
              CEA Baseline (0.82 kg CO₂ / kWh avoided)
            </div>
          </div>

          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
              +₹{Number(dailyInrSaved).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#f8fafc', fontWeight: 700, marginTop: 2 }}>Daily TPCODL ToU Savings</div>
            <div style={{ fontSize: 10, color: '#fbbf24', marginTop: 2 }}>
              ₹{(Number(dailyInrSaved * 30) / 100000).toFixed(2)} Lakhs/mo arbitrage
            </div>
          </div>
        </div>

        {/* Traceability Callout Box */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: '11px',
          color: '#cbd5e1',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          <span><b>Campus Daily Demand:</b> {Number(solarKwh + runBGridImport).toLocaleString()} kWh</span>
          <span><b>Grid Import Needed (Run B):</b> {Number(runBGridImport).toLocaleString()} kWh</span>
          <span style={{ color: '#34d399' }}><b>Grid Cut vs Naive Baseline:</b> +{Number(kwhSavedVsBaseline).toLocaleString()} kWh/day</span>
        </div>

        {/* 6 Key Architectural Differentiators */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 10 }}>
            6 Core Innovations Grounded in Real Campus Reality
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
              <b style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Building2 size={15} /> 1. Real OSM Campus Geometry
              </b>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                16 authentic building footprints derived from OpenStreetMap with multi-story dormitory gross floor areas and realistic diurnal schedules.
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
              <b style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Cpu size={15} /> 2. Dual Optimization Solvers
              </b>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Two-Stage Max-Min Fairness LP day-to-day vs 4-Tier Lexicographic Triage during disaster outages (Life-Safety &gt; Servers &gt; Dorms &gt; Flexible).
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
              <b style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Battery size={15} /> 3. 2nd-Life BESS Repurposing
              </b>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                120 kW / 360 kWh repurposed EV battery bank with electrochemical degradation modeling (SoH, capacity fade, internal resistance rise).
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
              <b style={{ color: '#818cf8', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Bike size={15} /> 4. driEV Scooter Mobility Hub
              </b>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                12 campus e-scooters (7 Speed + 5 Luxe) soaking midday rooftop solar surplus and providing +3.2 kW opt-in V2G micro-buffering during blackouts.
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
              <b style={{ color: '#ec4899', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Shield size={15} /> 5. Cryptographic Privacy Vault &amp; RBAC
              </b>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Fernet AES-128-CBC + HMAC-SHA256 authenticated telemetry encryption across 4 role boundaries with SHA-256 tamper-evident logging.
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
              <b style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <CheckCircle2 size={15} /> 6. Dynamic Disaster Telemetry
              </b>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Physical modeling of Cyclones (-90% solar), Monsoon floods (Hostel 7 sump pumps), Electrical Fires, Transformer Faults, and Heatwaves.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <button className="btn-primary" onClick={onClose}>
            Close &amp; Return to Digital Twin
          </button>
        </div>
      </div>
    </div>
  );
}
