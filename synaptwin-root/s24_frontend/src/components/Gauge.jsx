import React from 'react';

// UI-ONLY radial score gauge (SVG ring). Pure presentational readout of an
// already-computed percentage — no data logic inside.
export default function Gauge({ value = 0, size = 120, label = '' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 44;
  const c = 2 * Math.PI * r;
  const color = pct >= 80 ? 'var(--energy-green)' : pct >= 50 ? 'var(--solar-gold)' : 'var(--triage-red)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${label} ${pct.toFixed(1)} percent`}>
        <circle cx="60" cy="60" r={r} fill="none" style={{ stroke: 'var(--border-medium)' }} strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          style={{ stroke: color, transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease' }}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="58" textAnchor="middle" dominantBaseline="middle" style={{ fill: 'var(--text-primary)', fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
          {pct.toFixed(0)}
        </text>
        <text x="60" y="76" textAnchor="middle" dominantBaseline="middle" style={{ fill: 'var(--text-muted)', fontSize: 10 }}>
          {label || '%'}
        </text>
      </svg>
    </div>
  );
}
