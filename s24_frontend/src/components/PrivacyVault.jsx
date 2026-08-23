import React, { useEffect, useState } from 'react';
import { Shield, Lock, Unlock, Eye, EyeOff, KeyRound, CheckCircle, Info, Search, Terminal, Activity } from 'lucide-react';

export default function PrivacyVault({ currentRole = 'admin', currentHour = 12, simData }) {
  const [privacyData, setPrivacyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [auditLogs, setAuditLogs] = useState([
    { id: 1, hour: 10, time: '10:00:12', token: 'gAAAAABqg1zjciJ9pslP4XRIBZkY7IMfjjo2TpGBORKBVlC9kwZIq2Wm...', status: 'ENCRYPTED_AT_REST' },
    { id: 2, hour: 11, time: '11:00:04', token: 'gAAAAABqg28fjk4829faLMnZ82jKdsm83jdksLmnsd7823jsdklm83js...', status: 'ENCRYPTED_AT_REST' },
    { id: 3, hour: 12, time: '12:00:00', token: 'gAAAAABqg392kldsm2938jsdklm2893jsdklm2893jsdklm2893jsdkl...', status: 'ENCRYPTED_AT_REST' },
  ]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetch(`/api/privacy/view?role=${currentRole}&hour=${currentHour}`)
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setPrivacyData(data);
          setLoading(false);

          if (data?.ciphertext_sample) {
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            setAuditLogs(prev => {
              const newEntry = {
                id: Date.now(),
                hour: currentHour,
                time: timeStr,
                token: data.ciphertext_sample,
                status: 'ENCRYPTED_AT_REST',
              };
              if (prev.length > 0 && prev[0].hour === currentHour && prev[0].token === data.ciphertext_sample) {
                return prev;
              }
              return [newEntry, ...prev.slice(0, 7)];
            });
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch privacy view:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [currentRole, currentHour, simData]);

  const isRedacted = currentRole !== 'admin';

  const roleTitleMap = {
    admin: 'Campus Facilities Super-Admin (Full Unredacted Campus Grid)',
    hostel_a: 'ITER Boys Hostel 1 Warden View (Opaque Peer Data Boundary)',
    hostel_b: 'ITER Boys Hostel 7 Warden View (Opaque Peer Data Boundary)',
    academic: 'C-Block Academic Manager View (Opaque Peer Data Boundary)',
    cafeteria: 'Cafeteria & Dining View (Opaque Peer Data Boundary)',
    central_library: 'Central Library Building View (Opaque Peer Data Boundary)',
    admin_block: 'Administrative Block View (Opaque Peer Data Boundary)',
    auditorium: 'Auditorium View (Opaque Peer Data Boundary)',
    d_block: 'D-Block Academic View (Opaque Peer Data Boundary)',
    a_block: 'A-Block View (Opaque Peer Data Boundary)',
    hostel_2: 'ITER Boys Hostel 2 Warden View (Opaque Peer Data Boundary)',
    sports: 'Sports Complex View (Opaque Peer Data Boundary)',
    f_block: 'F-Block View (Opaque Peer Data Boundary)',
    g_block: 'G-Block View (Opaque Peer Data Boundary)',
    data_science: 'Centre for Data Science View (Opaque Peer Data Boundary)',
    research: 'Research & Innovation Wing View (Opaque Peer Data Boundary)',
  };

  const roleTitle = roleTitleMap[currentRole] || `${currentRole} Persona (Opaque Boundary)`;

  // Current hour's full record from simData
  const hourRecord = simData?.hourly?.find(h => h.hour === currentHour) || simData?.hourly?.[0];
  const allBlocks = privacyData?.view_data?.blocks || hourRecord?.blocks || [];

  const ownBlock = privacyData?.view_data?.your_block;
  const peerAggregate = privacyData?.view_data?.other_blocks_aggregate_only || {
    count: Math.max(0, allBlocks.length - 1),
    total_load_kw: 0,
    total_allocated_kw: 0,
  };

  // Filtered blocks for Admin view
  const displayedBlocks = allBlocks.filter(b => 
    b.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <Shield size={16} color="#38bdf8" />
          <span>Cryptographic Privacy Vault &amp; Role Boundaries</span>
        </div>

        <span className="kpi-pill" style={{ 
          background: isRedacted ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          color: isRedacted ? '#38bdf8' : '#34d399',
          border: `1px solid ${isRedacted ? 'rgba(56, 189, 248, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
        }}>
          {isRedacted 
            ? <><Lock size={12} style={{ marginRight: 4 }} /> Redacted Peer Boundary</> 
            : <><Unlock size={12} style={{ marginRight: 4 }} /> Full Super-Admin (16 Buildings)</>}
        </span>
      </div>

      <div className="panel-body">
        {/* Active Persona Banner */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
              Authenticated Persona (Hour {currentHour}:00)
            </div>
            <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '12px' }}>
              {roleTitle}
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
            <KeyRound size={13} />
            <span>Fernet AES-128-CBC + HMAC-SHA256</span>
          </div>
        </div>

        {/* Live Cryptographic Audit Trail of Encrypted Hourly Records (Group 3) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Terminal size={12} color="#38bdf8" />
              <span>Live Encrypted Record Stream (Authenticated Encryption at Rest):</span>
            </span>
            <span style={{ fontSize: '10px', color: '#34d399', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Activity size={10} /> Live Ingestion Active
            </span>
          </div>

          <div style={{
            background: '#070c14',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '10px',
            maxHeight: 110,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            {auditLogs.map((log, index) => (
              <div 
                key={log.id} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '2px 0',
                  borderBottom: index < auditLogs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>[{log.time}]</span>
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>h{String(log.hour).padStart(2, '0')}:00</span>
                  <span style={{ color: '#94a3b8', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.token}
                  </span>
                </div>
                <span style={{ 
                  color: '#34d399', 
                  background: 'rgba(16,185,129,0.1)', 
                  padding: '1px 5px', 
                  borderRadius: 3, 
                  fontSize: '9px',
                  fontWeight: 700 
                }}>
                  🔒 AES-CBC
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Rendered View Payload */}
        {isRedacted ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Own Block Data */}
            <div style={{
              background: 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399', fontWeight: 700, marginBottom: 8, fontSize: '12px' }}>
                <Eye size={14} />
                <span>YOUR BUILDING TELEMETRY (DECRYPTED)</span>
              </div>
              {ownBlock ? (
                <div style={{ fontSize: '12px', lineHeight: 1.7 }}>
                  <div><b>Building Name:</b> <span style={{ color: '#f8fafc' }}>{ownBlock.name}</span></div>
                  <div><b>Actual Demand:</b> <span style={{ color: '#38bdf8' }}>{ownBlock.load_kw.toFixed(1)} kW</span></div>
                  <div><b>Rooftop Solar Gen:</b> <span style={{ color: '#fbbf24' }}>{ownBlock.solar_kw.toFixed(1)} kW</span></div>
                  <div><b>Battery Allocation:</b> <span style={{ color: '#34d399' }}>+{ownBlock.allocated_kw.toFixed(1)} kW</span></div>
                  <div><b>Net Deficit:</b> <span style={{ color: '#f87171' }}>{ownBlock.deficit_kw.toFixed(1)} kW</span></div>
                </div>
              ) : (
                <div style={{ color: '#94a3b8', fontSize: '12px' }}>Loading building telemetry...</div>
              )}
            </div>

            {/* Other Blocks Aggregate (Redacted) */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.04)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontWeight: 700, marginBottom: 8, fontSize: '12px' }}>
                <EyeOff size={14} />
                <span>PEER BUILDINGS (REDACTED AGGREGATE)</span>
              </div>
              <div style={{ fontSize: '12px', lineHeight: 1.7 }}>
                <div><b>Protected Peer Count:</b> <span style={{ color: '#f8fafc' }}>{peerAggregate.count} campus buildings</span></div>
                <div><b>Total Peer Demand:</b> <span style={{ color: '#38bdf8' }}>{peerAggregate.total_load_kw} kW</span></div>
                <div><b>Total Peer Solar:</b> <span style={{ color: '#fbbf24' }}>{peerAggregate.total_solar_kw || 0} kW</span></div>
                <div><b>Total Peer Battery Alloc:</b> <span style={{ color: '#34d399' }}>{peerAggregate.total_allocated_kw} kW</span></div>
                <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: 4, lineHeight: 1.4 }}>
                  🔒 Raw room/lab readings from other 15 buildings masked to guarantee zero inter-block surveillance.
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Admin View (All 16 Buildings) */
          <div style={{
            background: 'rgba(59, 130, 246, 0.05)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60a5fa', fontWeight: 700, fontSize: '12px' }}>
                <Eye size={14} />
                <span>ALL 16 CAMPUS BUILDINGS TELEMETRY (SUPER-ADMIN UNREDACTED)</span>
              </div>

              <div style={{ position: 'relative', width: 200 }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: 8, color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Filter building..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#090e17',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    padding: '4px 8px 4px 26px',
                    fontSize: '11px',
                    color: '#f8fafc',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: 8, 
              maxHeight: 280, 
              overflowY: 'auto',
              paddingRight: 4,
            }}>
              {displayedBlocks.map((b, idx) => (
                <div key={idx} style={{ 
                  background: 'rgba(0,0,0,0.3)', 
                  padding: '8px 10px', 
                  borderRadius: 6, 
                  border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '11px',
                }}>
                  <b style={{ color: '#f8fafc', display: 'block', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.name}
                  </b>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>Demand:</span> <span style={{ color: '#38bdf8' }}>{b.load_kw.toFixed(1)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>Solar:</span> <span style={{ color: '#fbbf24' }}>{b.solar_kw.toFixed(1)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>Battery Alloc:</span> <span style={{ color: '#10b981' }}>+{b.allocated_kw.toFixed(1)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', borderTop: '1px dashed rgba(255,255,255,0.06)', paddingTop: 2, marginTop: 2 }}>
                    <span>Service Ratio:</span> 
                    <b style={{ color: ((b.solar_kw + b.allocated_kw) / Math.max(0.001, b.load_kw)) < 0.999 ? '#f87171' : '#34d399', fontFamily: 'monospace' }}>
                      {(b.service_ratio_pct !== undefined 
                        ? Number(b.service_ratio_pct).toFixed(1) 
                        : (b.load_kw > 0.001 ? Math.min(100.0, ((b.solar_kw + b.allocated_kw) / b.load_kw) * 100.0).toFixed(1) : '100.0'))}%
                    </b>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
