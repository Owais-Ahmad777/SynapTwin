import React, { useState } from 'react';
import {
  Zap, Home, Bike, ShieldAlert, Files, Scale, FileSearch,
  Award, CalendarDays, TrendingUp, Activity,
  ChevronLeft, ChevronRight, ChevronDown,
} from 'lucide-react';

// UI-ONLY navigation shell. No backend, calculation, or data logic lives here.
const REPORT_CHILDREN = [
  { id: 'compare', label: 'Compare SynapTwin', icon: Scale },
  { id: 'audit', label: 'Content Audit', icon: FileSearch },
  { id: 'certificate', label: 'Certificate', icon: Award },
];

export const NAV_ITEMS = [
  { id: 'home', label: 'Homepage', icon: Home },
  { id: 'disaster', label: 'Disaster Management', icon: ShieldAlert },
  { id: 'driveev', label: 'DriveEV', icon: Bike },
  { id: 'history30', label: '30-Day History', icon: CalendarDays },
  { id: 'future5y', label: '5-Year History', icon: TrendingUp },
  { id: 'reports', label: 'Reports', icon: Files, children: REPORT_CHILDREN },
  { id: 'settings', label: 'Telemetry', icon: Activity },
];

const childToGroup = {};
REPORT_CHILDREN.forEach((c) => { childToGroup[c.id] = 'reports'; });

function LeafItem({ item, active, collapsed, onNavigate, sub = false }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`st-nav-item${active ? ' active' : ''}${sub ? ' sub' : ''}`}
      onClick={() => onNavigate(item.id)}
      title={item.label}
    >
      <Icon size={sub ? 15 : 17} />
      {!collapsed && <span>{item.label}</span>}
    </button>
  );
}

export default function Sidebar({ activePage, onNavigate, collapsed, onToggleCollapse, modeLabel = 'ROUTINE FAIRNESS', buildingMode = false }) {
  const activeGroup = childToGroup[activePage] || null;
  const [openGroup, setOpenGroup] = useState(null);
  // UI-ONLY: per-building site keeps Home, histories, Compare/Audit/
  // Certificate — no DriveEV, Disaster, Telemetry, or Judge Pitch entries.
  const items = buildingMode
    ? NAV_ITEMS.filter((i) => i.id !== 'driveev' && i.id !== 'disaster' && i.id !== 'settings')
        .map((i) => (i.children
          ? { ...i, children: i.children.filter((c) => c.id !== 'pitch') }
          : i))
    : NAV_ITEMS;

  return (
    <aside className={`st-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="st-brand">
        {collapsed ? (
          <div className="st-brand-badge"><Zap size={16} /></div>
        ) : (
          <div className="st-brand-text">
            <div className="st-brand-logo"><Zap size={14} /><span>SYNAPTWIN</span></div>
            <div className="st-brand-sub">Energy Command Center</div>
          </div>
        )}
        <button
          type="button"
          className="st-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="st-mode-pill" title="Live operating mode mirror (read-only, driven by simulation state)">
          <span className="live-dot green" style={{ width: 7, height: 7 }} />
          <span>{modeLabel}</span>
        </div>
      )}

      <nav className="st-nav" aria-label="SynapTwin primary">
        {items.map((item) => {
          if (item.children) {
            const GroupIcon = item.icon;
            const isActiveGroup = item.children.some((c) => c.id === activePage);
            const showSub = !collapsed && (openGroup === item.id || isActiveGroup);
            return (
              <div key={item.id} className="st-nav-group">
                <button
                  type="button"
                  className={`st-nav-item${isActiveGroup ? ' active' : ''}`}
                  onClick={() => {
                    if (collapsed) {
                      onToggleCollapse();
                      setOpenGroup(item.id);
                    } else {
                      setOpenGroup((g) => (g === item.id ? null : item.id));
                    }
                  }}
                  title={item.label}
                >
                  <GroupIcon size={17} />
                  {!collapsed && (
                    <>
                      <span>{item.label}</span>
                      <ChevronDown size={14} className={`st-nav-chev${showSub ? ' open' : ''}`} />
                    </>
                  )}
                </button>
                {showSub && (
                  <div className="st-nav-sub">
                    {item.children.map((child) => (
                      <LeafItem
                        key={child.id}
                        item={child}
                        active={activePage === child.id}
                        collapsed={false}
                        onNavigate={onNavigate}
                        sub
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <LeafItem
              key={item.id}
              item={item}
              active={activePage === item.id}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>

      {!collapsed && (
        <div className="st-foot">
          <div className="st-foot-title">SOA ITER Campus</div>
          <div className="st-foot-sub">16 Buildings • 120 kW BESS</div>
        </div>
      )}
    </aside>
  );
}
