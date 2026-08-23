import React from 'react';
import { 
  Bot, AlertTriangle, CheckCircle2, XCircle, ArrowDownCircle, 
  HelpCircle, ShieldAlert, Sparkles, Flame, Wind, Droplets, Sun, AlertOctagon, Clock, Zap, ShieldCheck, Activity, Gauge 
} from 'lucide-react';

export default function ExplainabilityPanel({ hourData }) {
  if (!hourData) return null;

  const isOutage = Boolean(hourData.is_outage);
  const isDisasterActive = Boolean(hourData.is_disaster_active);
  const disasterType = hourData.disaster_type || 'monsoon_waterlogging';
  const explanation = hourData.explanation;
  const backupRuntimeHours = hourData.backup_runtime_hours ?? 1.6;
  const isolatedRedirectKw = hourData.isolated_power_redirect_kw ?? 0.0;
  const disasterDetails = hourData.disaster_details;

  const disasterMetaMap = {
    none: { label: 'Normal Operations (Standby)', icon: ShieldCheck, color: '#10b981' },
    monsoon_waterlogging: { label: 'Monsoon Waterlogging Protocol', icon: Droplets, color: '#38bdf8' },
    cyclone_severe_storm: { label: 'Cyclone & Severe Storm Protocol', icon: Wind, color: '#f59e0b' },
    electrical_fire: { label: 'Electrical Fire Isolation Protocol', icon: Flame, color: '#ef4444' },
    grid_transformer_fault: { label: 'Substation Transformer Failure', icon: AlertOctagon, color: '#ef4444' },
    extended_outage: { label: '33kV Grid Feeder Outage Protocol', icon: AlertOctagon, color: '#ef4444' },
    heatwave_stress: { label: 'Extreme Heatwave Stress Protocol', icon: Sun, color: '#fbbf24' },
  };

  const disasterMeta = disasterMetaMap[disasterType] || disasterMetaMap['monsoon_waterlogging'];
  const DisasterIcon = disasterMeta.icon || ShieldAlert;
  const isTriageActive = isOutage || (isDisasterActive && disasterType !== 'none');

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <Bot size={16} color={isTriageActive ? '#f87171' : '#10b981'} />
          <span>Decision Explainability &amp; Priority Triage</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isOutage && (
            <span className="kpi-pill" style={{
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              border: '1px solid #ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '11px',
              fontWeight: 700,
            }}>
              <Clock size={12} />
              <span>~{backupRuntimeHours}h Runtime</span>
            </span>
          )}

          <span className="kpi-pill" style={{ 
            background: isTriageActive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: isTriageActive ? '#f87171' : '#34d399',
            border: `1px solid ${isTriageActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '11px',
            fontWeight: 600,
          }}>
            <DisasterIcon size={12} color={disasterMeta.color} />
            <span>{isTriageActive ? disasterMeta.label : 'Routine Fairness Mode'}</span>
          </span>
        </div>
      </div>

      <div className="panel-body">
        {/* Dynamic Disaster Tactical Impact & Fluctuation Card */}
        {isDisasterActive && disasterType !== 'none' && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '12px', color: '#fca5a5' }}>
                <DisasterIcon size={14} color={disasterMeta.color} />
                <span>{disasterMeta.label} &mdash; Live Telemetry Fluctuations</span>
              </div>
              <span className="kpi-pill" style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#fca5a5', fontSize: '10px', fontWeight: 700 }}>
                {disasterDetails?.grid_state_text || (isOutage ? '🚨 ISLANDED GRID' : '⚡ GRID CONNECTED')}
              </span>
            </div>

            <div style={{ fontSize: '11px', color: '#f1f5f9', lineHeight: 1.45 }}>
              {disasterDetails?.trigger_description || 'Active disaster protocol adjusting generation curves, load priorities, and storage dispatch.'}
            </div>

            {/* 4 Key Physical Fluctuation Pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6, marginTop: 2 }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Solar Fluctuation</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24' }}>
                  {disasterDetails?.solar_impact_text || (disasterType === 'cyclone_severe_storm' ? '-90% (Squall Clouds)' : '-70% (Overcast)')}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Load Fluctuation</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8' }}>
                  {disasterDetails?.load_impact_text || (disasterType === 'heatwave_stress' ? '+35% AC Surge' : 'Critical Loads Only')}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Priority Hotspot</div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#f43f5e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {disasterDetails?.hotspot_building || (disasterType === 'cyclone_severe_storm' ? 'Hostel blocks (1, 2, 7)' : 'Medical & Servers')}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Emergency Buffer</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#34d399' }}>
                  50 kW Bat + 3.2 kW driEV
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Natural Language Rationale Box */}
        <div className={`explanation-box ${isTriageActive ? 'triage' : ''}`} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, color: isTriageActive ? '#fca5a5' : '#34d399' }}>
            <Sparkles size={14} />
            <span>Optimization Narrative (Hour {hourData.hour}:00)</span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.6 }}>
            {explanation || (isTriageActive 
              ? 'Lexicographic priority queue allocating life-safety loads first, then essential building pumps, before flexible loads.' 
              : 'Max-min fairness LP solved successfully. No building can receive additional battery power without reducing a more needy peer.')}
          </p>

          {isolatedRedirectKw > 0 && (
            <div style={{ marginTop: 6, color: '#38bdf8', fontSize: '11px', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <Zap size={13} color="#38bdf8" />
              <span>Power Redirection: +{isolatedRedirectKw} kW reallocated from isolated building to other campus deficits.</span>
            </div>
          )}
        </div>

        {/* Priority Dispatch Queue / Tier Waterfall (ALWAYS VISIBLE) */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Lexicographic Priority Dispatch Ladder</span>
            <span style={{ color: isTriageActive ? '#f87171' : '#34d399' }}>
              {isTriageActive ? 'Active Triage (Tier 1 → Tier 4)' : 'Armed Standby (Tier 1 → Tier 4)'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Tier 1: Life-Safety & Comms */}
            <div className="tier-item tier1">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Tier 1: Life Safety &amp; Critical Comms</span>
                  {disasterType === 'cyclone_severe_storm' && (
                    <span style={{ background: '#38bdf8', color: '#090e17', fontSize: '9px', padding: '1px 5px', borderRadius: 3, fontWeight: 800 }}>
                      Hostels 1, 2, 7 Shelter-in-Place
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {disasterType === 'cyclone_severe_storm'
                    ? 'Hostels 1, 2, 7 (student in-place shelter) • Medical Point (6 kW) • Server/Comms (5 kW)'
                    : 'Campus Server/Comms Room (5 kW) • Campus Medical Point (3 kW)'}
                </div>
              </div>
              <span className="badge-status served">
                {isTriageActive ? (hourData.tier_fully_served?.['1'] ? '100% Served' : 'Partial') : 'Protected (100%)'}
              </span>
            </div>

            {/* Tier 2: Essential Building Services */}
            <div className="tier-item tier2">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Tier 2: Essential Building Loads</span>
                  {disasterType === 'cyclone_severe_storm' && (
                    <span style={{ background: '#f59e0b', color: '#090e17', fontSize: '9px', padding: '1px 5px', borderRadius: 3, fontWeight: 800 }}>
                      Auditorium Overflow &amp; Campus Egress
                    </span>
                  )}
                  {disasterType === 'monsoon_waterlogging' && (
                    <span style={{ background: '#ef4444', color: 'white', fontSize: '9px', padding: '1px 5px', borderRadius: 3, fontWeight: 800 }}>
                      Hostel 7 Drainage Sump (Need: 0.95)
                    </span>
                  )}
                  {disasterType === 'electrical_fire' && (
                    <span style={{ background: '#f97316', color: 'white', fontSize: '9px', padding: '1px 5px', borderRadius: 3, fontWeight: 800 }}>
                      C-Block Fire Isolated (0 kW)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {disasterType === 'cyclone_severe_storm'
                    ? 'Auditorium (staff/visitor overflow) • Substation control • Cafeteria refrigeration'
                    : 'Emergency lighting, water pumps, ground drainage, security risers'}
                </div>
              </div>
              <span className="badge-status served">
                {isTriageActive ? (hourData.tier_fully_served?.['2'] ? '100% Served' : 'Partial') : 'Armed (100%)'}
              </span>
            </div>

            {/* Tier 3: Academic Operations */}
            <div className="tier-item tier3">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', color: '#f8fafc' }}>
                  Tier 3: Academic &amp; General Campus Operations
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Lecture halls, computing labs, central library, administrative offices
                </div>
              </div>
              <span className="badge-status sheddable">
                {isTriageActive 
                  ? (hourData.tier_fully_served?.['3'] ? 'Served' : (disasterType === 'cyclone_severe_storm' ? 'Curtailed for Shelter' : 'Rationed / Sheddable'))
                  : 'Fair Share Active'}
              </span>
            </div>

            {/* Tier 4: driEV Fleet Charging */}
            <div className="tier-item tier4">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', color: '#f8fafc' }}>
                  Tier 4: driEV Fleet &amp; Non-Essential Convenience
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Campus EV scooter chargers, decorative floodlighting
                </div>
              </div>
              <span className="badge-status sheddable">
                {isTriageActive ? 'First to Shed (Buffer Active)' : 'V2G Ready'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
