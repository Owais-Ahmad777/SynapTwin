import React from 'react';
import { X } from 'lucide-react';

// UI-ONLY drawer/modal shell. Content is always an existing component
// (SolarForecastPanel, EnergyCharts, FairnessModal body, AuditModal body, ...)
// so no calculation, graph-data, or simulation logic changes here.
export default function InsightDrawer({ open, title, subtitle, onClose, children, width = 860 }) {
  if (!open) return null;
  return (
    <div className="st-drawer-backdrop" onClick={onClose}>
      <div
        className="st-drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="st-drawer-header">
          <div>
            <div className="st-drawer-title">{title}</div>
            {subtitle && <div className="st-drawer-sub">{subtitle}</div>}
          </div>
          <button type="button" className="st-drawer-close" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </div>
        <div className="st-drawer-body">{children}</div>
      </div>
    </div>
  );
}
