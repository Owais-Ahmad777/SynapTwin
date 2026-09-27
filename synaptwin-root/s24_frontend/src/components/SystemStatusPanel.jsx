import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle2, AlertTriangle, Cloud, Bot, Lock } from 'lucide-react';

// System Status panel: displays live backend status from /api/status.
// Shows service health, AI config, privacy vault, weather, and feature list.
// Fetches on mount; read-only, no side effects.
export default function SystemStatusPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/status')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <Activity size={16} color="#34d399" />
            <span>System Status</span>
          </div>
        </div>
        <div className="panel-body">
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Checking backend status…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <AlertTriangle size={16} color="#f59e0b" />
            <span>System Status</span>
          </div>
        </div>
        <div className="panel-body">
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Status unavailable: {error || 'No data'}
          </p>
        </div>
      </div>
    );
  }

  const ai = data.ai_explainability || {};
  const privacy = data.privacy_vault || {};
  const weather = data.weather_fetch || {};
  const features = data.features || [];

  const statusRows = [
    {
      icon: CheckCircle2,
      color: '#34d399',
      label: 'Backend Service',
      value: `${data.status || 'online'} • ${data.campus || ''}`,
    },
    {
      icon: Bot,
      color: ai.configured ? '#34d399' : '#f59e0b',
      label: 'AI Explainability',
      value: ai.configured ? `Live (${ai.mode || 'gemini'})` : `Offline (${ai.mode || 'rule-based'})`,
    },
    {
      icon: Lock,
      color: privacy.configured ? '#34d399' : '#f59e0b',
      label: 'Privacy Vault',
      value: privacy.configured ? 'Configured (Fernet AES)' : `Ephemeral (${privacy.mode || 'process key'})`,
    },
    {
      icon: Cloud,
      color: weather.last_error ? '#f59e0b' : '#34d399',
      label: 'Weather Source',
      value: `${data.weather_source || 'Open-Meteo'}${weather.last_error ? ' (cached)' : ' (live)'}`,
    },
  ];

  return (
    <div className="panel-card" style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}>
      <div className="panel-header">
        <div className="panel-title">
          <Activity size={16} color="#34d399" />
          <span>System Status</span>
        </div>
        <span className="kpi-pill" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', fontSize: '11px', fontWeight: 600 }}>
          {data.location?.city || 'Bhubaneswar'}
        </span>
      </div>
      <div className="panel-body">
        {statusRows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="st-kv">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={13} color={row.color} />
                {row.label}
              </span>
              <b className="mono" style={{ fontSize: '11px' }}>{row.value}</b>
            </div>
          );
        })}

        {features.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Active Features ({features.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {features.map((f, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '10px',
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 10 }}>
          Fleet: {data.fleet_system || 'driEV'} • Location: {data.location?.lat}, {data.location?.lon}
        </div>
      </div>
    </div>
  );
}
