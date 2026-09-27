import React, { useState, useEffect, useRef } from 'react';
import {
  Zap, Home, Bike, ShieldAlert, Files, Scale, FileSearch,
  Award, CalendarDays, TrendingUp, Activity,
  Sun, Moon, User, Shield, Pin, Building2, LogOut,
} from 'lucide-react';
import { allBuildings } from '../data/buildings';

// UI-ONLY floating nav rail. No backend, calculation, or data logic lives here.
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
  { id: 'settings', label: 'Security Status', icon: Activity },
];

const childToGroup = {};
REPORT_CHILDREN.forEach((c) => { childToGroup[c.id] = 'reports'; });

export default function Sidebar({
  activePage,
  onNavigate,
  buildingMode = false,
  theme = 'dark',
  onToggleTheme,
  identityLabel = 'Admin',
  identityKind = 'admin',
  onLogout,
  onRailExpand,
}) {
  const [openGroup, setOpenGroup] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const collapseTimer = useRef(null);
  const profileRef = useRef(null);
  const expanded = pinned || hovered;

  // UI-ONLY: per-building site keeps Home, histories, Compare/Audit/
  // Certificate — no DriveEV, Disaster, Security Status, or Judge Pitch entries.
  const items = buildingMode
    ? NAV_ITEMS.filter((i) => i.id !== 'driveev' && i.id !== 'disaster' && i.id !== 'settings')
        .map((i) => (i.children
          ? { ...i, children: i.children.filter((c) => c.id !== 'pitch') }
          : i))
    : NAV_ITEMS;

  // UI-ONLY: close menus on outside click.
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
  }, []);

  // UI-ONLY (Addendum 8): report expanded state to the parent layout so the
  // content wrapper's left offset is driven by the SAME state that drives the
  // rail width — content makes room instead of being overlapped.
  useEffect(() => {
    if (onRailExpand) onRailExpand(expanded);
  }, [expanded, onRailExpand]);

  const go = (id) => {
    setOpenGroup(null);
    onNavigate(id);
  };

  // UI-ONLY: hover intent (150ms grace on leave so pass-throughs don't flicker).
  const handleEnter = () => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setHovered(true);
  };
  const handleLeave = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setHovered(false), 150);
  };

  const IdentityIcon = identityKind === 'admin' ? Shield : Building2;

  return (
    <aside
      className={`st-sidebar${expanded ? ' expanded' : ''}`}
      aria-label="SynapTwin primary"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className="st-brand">
        <div className="st-brand-badge" title="SynapTwin"><Zap size={16} /></div>
      </div>

      <button
        type="button"
          className={`st-pin-btn${pinned ? ' on' : ''}`}
        onClick={() => setPinned((v) => !v)}
        title={pinned ? 'Unpin navigation rail' : 'Pin navigation rail open'}
        aria-label={pinned ? 'Unpin navigation rail' : 'Pin navigation rail open'}
      >
        <Pin size={14} />
      </button>

      <div className="st-rail-div" />

      <nav className="st-nav" aria-label="SynapTwin sections">
        {items.map((item) => {
          if (item.children) {
            const GroupIcon = item.icon;
            const isActiveGroup = item.children.some((c) => c.id === activePage);
            return (
              <div key={item.id} className="st-nav-group">
                <button
                  type="button"
                  className={`st-nav-item${isActiveGroup ? ' active' : ''}`}
                  onClick={() => setOpenGroup((g) => (g === item.id ? null : item.id))}
                  title={item.label}
                  aria-label={item.label}
                >
                  <GroupIcon size={18} />
                  <span className="st-nav-label">{item.label}</span>
                </button>
                {openGroup === item.id && (
                  <div className="st-nav-flyout">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          className={`st-nav-flyitem${activePage === child.id ? ' active' : ''}`}
                          onClick={() => go(child.id)}
                          title={child.label}
                        >
                          <ChildIcon size={15} />
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`st-nav-item${activePage === item.id ? ' active' : ''}`}
              onClick={() => go(item.id)}
              title={item.label}
              aria-label={item.label}
            >
              <Icon size={18} />
              <span className="st-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="st-rail-bottom">
        <div className="st-rail-div" />
        <button
          type="button"
          className="st-icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <div style={{ position: 'relative' }} ref={profileRef}>
          <button
            type="button"
            className="st-avatar"
            onClick={() => setProfileOpen((v) => !v)}
            title={`Signed in as ${identityLabel} — session options`}
            aria-label="Session options"
          >
            <User size={17} />
          </button>
          {profileOpen && (
            <div className="st-profile-menu st-profile-menu-rail">
              <div className="st-profile-menu-title">Session</div>
              <div className="st-profile-identity">
                <IdentityIcon size={13} />
                <span>{identityLabel}</span>
              </div>
              <button
                type="button"
                className="st-profile-logout"
                onClick={() => { setProfileOpen(false); if (onLogout) onLogout(); }}
              >
                <LogOut size={13} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
