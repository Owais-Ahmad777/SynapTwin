import React from 'react';
import { Shield } from 'lucide-react';
import PrivacyVault from '../components/PrivacyVault';

// UI-ONLY settings shell. Profile management lives in the header Profile
// dropdown; this page keeps Security & Access Control. No backend impact.
export default function SettingsPage({ currentRole, currentHour, simData }) {
  return (
    <div className="st-page">
      <div className="st-page-head">
        <div className="st-eyebrow">Access Control</div>
        <h2 className="st-page-title">Security Status</h2>
        <p className="st-page-sub">Security and access control.</p>
      </div>

      <div className="st-stack">
        <div className="panel-card" style={{ borderColor: 'rgba(56,189,248,0.35)' }}>
          <div className="panel-header"><div className="panel-title"><Shield size={16} color="#38bdf8" /><span>Security &amp; Access Control (Advanced)</span></div></div>
          <div className="panel-body">
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cryptographic Privacy Vault &amp; Role Boundaries — fully preserved.</p>
            <PrivacyVault currentRole={currentRole} currentHour={currentHour} simData={simData} />
          </div>
        </div>
      </div>
    </div>
  );
}
