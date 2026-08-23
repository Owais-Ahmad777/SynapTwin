import React from 'react';
import { X, Cpu, CheckCircle2, Calculator, Info, ShieldCheck, ShieldAlert } from 'lucide-react';

export default function FairnessModal({ isOpen, onClose, hourData, batteryHealth }) {
  if (!isOpen || !hourData) return null;

  const blocks = hourData.blocks || [];
  const currentHour = hourData.hour !== undefined ? hourData.hour : 12;
  const batteryAvailable = hourData.battery_available_kw || 84.0;
  const totalAllocated = blocks.reduce((sum, b) => sum + (b.allocated_kw || 0), 0);
  const batteryUsed = totalAllocated > 0 ? totalAllocated : (hourData.battery_used_kw || 0.0);
  // Compute true worst-served service ratio across all active, non-isolated campus buildings
  const activeBlocks = blocks.filter(b => b.load_kw > 0.001 && !(b.is_fire_isolated || b.status?.includes('FIRE') || b.status?.includes('DISCONNECTED')));
  const minServiceRatio = activeBlocks.length > 0
    ? Math.min(...activeBlocks.map(b => Math.min(100.0, Math.round(((b.solar_kw + (b.allocated_kw || 0)) / b.load_kw) * 1000) / 10)))
    : 100.0;

  const isTriage = hourData.mode === 'DISASTER_TRIAGE' || hourData.is_outage || hourData.is_disaster_active;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isTriage ? <ShieldAlert size={22} color="#ef4444" /> : <Cpu size={22} color="#10b981" />}
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                {isTriage ? 'How Disaster Lexicographic Triage Protocol Works' : 'How Max-Min Fairness Optimization Works'}
              </h2>
              <p style={{ fontSize: 11, color: '#94a3b8' }}>
                {isTriage ? 'Strict 4-tier emergency prioritization across SOA ITER campus during outages & hazards' : 'Mathematical basis for community energy sharing across SOA ITER blocks'}
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

        {/* Core Mathematical Definition */}
        <div style={{
          background: isTriage ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.06)',
          border: `1px solid ${isTriage ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.25)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px',
          color: '#f8fafc',
          fontSize: '13px',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: isTriage ? '#fca5a5' : '#34d399', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={16} />
            <span>{isTriage ? 'The Lexicographical Safety Principle:' : 'The Max-Min Allocation Principle:'}</span>
          </div>
          {isTriage ? (
            <span>
              During outages or active climate crises, equal sharing is superseded by <b>strict lexicographic priority</b>: 
              <b> Tier-1 (Life-Safety & Medical)</b> is 100% served first, followed by <b>Tier-2 (Essential Sump/Corridor Baselines)</b> rationed proportionally across active dorms, while faulted/isolated risers are disconnected.
            </span>
          ) : (
            <span>
              Every hour, each block's net power deficit is calculated as <b>Deficit = Load &minus; Own Rooftop Solar</b>. 
              The shared second-life battery is then dispatched via Linear Programming (PuLP / Water-filling) so that 
              <b> no block's satisfied share of its own need can be increased without decreasing a worse-off block's share</b>.
            </span>
          )}
        </div>

        {/* Live Worked Example for Current Hour */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calculator size={14} color="#38bdf8" />
              <span>Live Worked Example (Hour {currentHour}:00 Telemetry)</span>
            </span>
            <span className="kpi-pill" style={{ 
              background: isTriage ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)', 
              color: isTriage ? '#f87171' : '#34d399',
              border: `1px solid ${isTriage ? '#ef4444' : 'rgba(16,185,129,0.4)'}`,
              fontWeight: 700,
            }}>
              {isTriage ? 'Disaster Triage Active' : `Fairness Index: ${minServiceRatio.toFixed(1)}%`}
            </span>
          </div>

          {/* Shared Local-Resource Equity Banner */}
          <div style={{
            background: 'rgba(56, 189, 248, 0.05)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: 'var(--radius-sm)',
            padding: '7px 12px',
            fontSize: '11px',
            color: '#cbd5e1',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            lineHeight: 1.4,
            marginBottom: 10,
          }}>
            <Info size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
            <span>
              Bars/values here show each building's <b>OWN solar + battery share only</b> (excludes grid import). They represent local-resource equity, not whether demand is actually being met — see <b>'Full Energy Mix'</b> for real-time reliability (Unserved Outage Deficit).
            </span>
          </div>

          {/* Block Table */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', color: '#94a3b8', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '8px 12px' }}>Campus Block</th>
                  <th style={{ padding: '8px 12px' }}>Demand</th>
                  <th style={{ padding: '8px 12px' }}>Own Solar</th>
                  <th style={{ padding: '8px 12px' }} title={isTriage ? 'Demand unmet by solar/battery during outage' : 'Demand beyond own solar + battery share; met via grid import in normal operation — not unserved'}>
                    {isTriage ? 'Net Deficit (kW)' : 'Grid-Covered Load (kW)'}
                  </th>
                  <th style={{ padding: '8px 12px' }}>Battery Share</th>
                  <th style={{ padding: '8px 12px' }} title={isTriage ? '% of emergency demand satisfied' : '% of demand met by on-campus solar + fair battery share, excluding grid import. Does NOT mean the building is underserved overall — grid import covers the rest.'}>
                    {isTriage ? 'Service Ratio' : 'Local Energy Coverage %'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b, idx) => {
                  const isFireIso = b.is_fire_isolated || b.status?.includes('FIRE') || b.status?.includes('DISCONNECTED');
                  const serviceRatio = (b.load_kw <= 0.001 || isFireIso)
                    ? 0.0
                    : Math.min(100.0, Math.round(((b.solar_kw + b.allocated_kw) / b.load_kw) * 1000) / 10);

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: isFireIso ? '#fca5a5' : '#f8fafc' }}>
                        {b.name}
                        {isFireIso && <span style={{ marginLeft: 6, fontSize: 10, color: '#ef4444', fontWeight: 700 }}>[FIRE ISOLATED]</span>}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{b.load_kw.toFixed(1)} kW</td>
                      <td style={{ padding: '8px 12px', color: '#f59e0b' }}>{b.solar_kw.toFixed(1)} kW</td>
                      <td style={{ padding: '8px 12px', color: isTriage ? '#f87171' : '#38bdf8' }}>{b.deficit_kw.toFixed(1)} kW</td>
                      <td style={{ padding: '8px 12px', color: isFireIso ? '#64748b' : '#10b981', fontWeight: 700 }}>+{b.allocated_kw.toFixed(1)} kW</td>
                      <td style={{ padding: '8px 12px' }}>
                        {isFireIso ? (
                          <span style={{ 
                            background: 'rgba(239,68,68,0.2)',
                            color: '#f87171',
                            border: '1px solid #ef4444',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: '10px',
                            fontWeight: 700
                          }}>
                            DISCONNECTED (0.0%)
                          </span>
                        ) : (
                          <span style={{ 
                            background: serviceRatio >= 90 ? 'rgba(16,185,129,0.15)' : (serviceRatio > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'),
                            color: serviceRatio >= 90 ? '#34d399' : (serviceRatio > 0 ? '#fbbf24' : '#f87171'),
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            {serviceRatio.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span>Shared Battery: <b style={{ color: '#38bdf8' }}>{batteryUsed.toFixed(1)} kW dispatched</b> of {batteryAvailable.toFixed(1)} kW available</span>
            <span>Unserved Deficit draws remaining balance from utility grid</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <button className="btn-primary" onClick={onClose} style={{ padding: '8px 16px', fontSize: '12px' }}>
            Understood &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
