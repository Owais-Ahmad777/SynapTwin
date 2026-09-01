/**
 * AlertCenter.jsx
 * ---------------
 * Simulated emergency alert notification layer & interactive drawer for SynapTwin.
 *
 * Single Source of Truth Architecture:
 * - The header button badge count, the dropdown total count, and the ALL/CRITICAL/WARNING/INFO
 *   filter tab counts ALL derive synchronously from the same `alerts` state array.
 * - When scenario changes (preset dropdown, toggle, demo reset), `alerts` and `activeToast` are
 *   instantly flushed, preventing old scenario alerts from persisting into new scenarios.
 * - Every alert is tagged with `disaster_type` and `hour`, displayed as a visible badge tag.
 *
 * Manual Regression Test Procedure:
 * 1. Open SandboxPanel in the browser (http://localhost:5000).
 * 2. Select "Electrical Fire & Feeder Isolation" in the Odisha Disaster Protocol dropdown.
 *    -> Confirm toast pops up with tag [FIRE ISOLATION] and title "ELECTRICAL RISER SAFETY ISOLATION".
 *    -> Confirm Header Alert badge shows 2.
 * 3. Switch dropdown directly to "Cyclone & Severe Squall".
 *    -> Confirm the Fire Isolation toast disappears immediately.
 *    -> Confirm new toast appears with tag [CYCLONE] and title "CYCLONE SHELTER PROTOCOL ACTIVE".
 *    -> Confirm ZERO text from Electrical Fire is present in the toast or the dropdown list.
 *    -> Confirm Header Alert badge count matches the dropdown drawer total (3).
 * 4. Toggle "Enable Odisha Disaster Protocol" switch OFF.
 *    -> Confirm all disaster alerts are cleared, toast closes, and badge count becomes 0.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, AlertTriangle, ShieldAlert, CheckCircle2, X, Info, 
  Building2, Radio, Trash2 
} from 'lucide-react';

const SIMULATED_DISCLAIMER_TEXT = "Simulated alert center — demonstrates the notification layer. Production integrates real SMS/push delivery via Firebase Cloud Messaging or Twilio.";

function getDisasterTag(dtype) {
  switch (dtype) {
    case 'cyclone_severe_storm': return 'CYCLONE';
    case 'monsoon_waterlogging': return 'MONSOON FLOOD';
    case 'electrical_fire': return 'FIRE ISOLATION';
    case 'grid_transformer_fault': return 'TRANSFORMER FAULT';
    case 'extended_outage': return 'EXTENDED OUTAGE';
    case 'heatwave_stress': return 'HEATWAVE';
    case 'outage': return 'GRID OUTAGE';
    case 'routine': return 'ROUTINE';
    default: return dtype ? dtype.toUpperCase().replace(/_/g, ' ') : 'EMERGENCY';
  }
}

export default function AlertCenter({
  hourData,
  simParams,
  currentHour = 12,
  isEmergency = false,
}) {
  const [alerts, setAlerts] = useState([]);
  const [activeToast, setActiveToast] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState('all'); // 'all' | 'critical' | 'warning' | 'info'

  const prevScenarioRef = useRef('');
  const toastTimeoutRef = useRef(null);
  const dropdownRef = useRef(null);

  const isDisasterMode = Boolean(simParams?.is_disaster_active && simParams?.disaster_type && simParams?.disaster_type !== 'none');
  const currentDisasterType = isDisasterMode ? simParams.disaster_type : 'none';
  const selectedBuilding = simParams?.isolated_building || 'C-Block (Academic)';
  const isOutage = Boolean(hourData?.is_outage);
  const currentScenarioKey = `${isDisasterMode}_${currentDisasterType}_${isOutage}_${selectedBuilding}_${simParams?.outage_hours?.join(',') || ''}`;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // BUG 2 FIX: When scenario changes, flush old alerts & toast immediately so old scenario alerts NEVER persist
  useEffect(() => {
    if (prevScenarioRef.current && prevScenarioRef.current !== currentScenarioKey) {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setActiveToast(null);
      setAlerts([]);
    }
    prevScenarioRef.current = currentScenarioKey;
  }, [currentScenarioKey]);

  // BUG 1 & BUG 2 FIX: Generate and synchronize alerts for the CURRENT active state only
  useEffect(() => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);

    if (!isDisasterMode && !isOutage) {
      setAlerts([]);
      setActiveToast(null);
      return;
    }

    // Check if hourData from backend is fresh and belongs strictly to THIS active disaster type
    const backendMatches = (
      hourData &&
      hourData.alerts &&
      hourData.alerts.length > 0 &&
      ((isDisasterMode && (hourData.raw_disaster_type === currentDisasterType || hourData.disaster_type === currentDisasterType)) || 
       (!isDisasterMode && hourData.is_outage))
    );

    const rawAlerts = backendMatches 
      ? hourData.alerts 
      : getFreshPresetAlerts({
          hour: currentHour,
          isOutage,
          disasterActive: isDisasterMode,
          disasterType: currentDisasterType,
          isolatedBuilding: selectedBuilding,
          batteryUsedKw: hourData?.battery_used_kw || 85.0,
          batteryAvailableKw: hourData?.battery_available_kw || 88.2,
          rejectedKw: hourData?.rejected_kw || 0.0,
          backupRuntimeHours: hourData?.backup_runtime_hours || 1.7,
        });

    const timeStr = `${currentHour < 10 ? '0' : ''}${currentHour}:00`;
    const formattedAlerts = (rawAlerts || []).map((a, idx) => ({
      ...a,
      disaster_type: currentDisasterType,
      hour: currentHour,
      timestamp: timeStr,
      sessionKey: `${a.id || 'alert'}-${currentScenarioKey}-${currentHour}-${idx}`,
    }));

    // Single source of truth: set alerts array
    setAlerts(formattedAlerts);

    // Set active push toast
    const topAlert = formattedAlerts.find(a => a.severity === 'critical') || formattedAlerts[0];
    if (topAlert) {
      setActiveToast(topAlert);
      toastTimeoutRef.current = setTimeout(() => {
        setActiveToast(null);
      }, 8500);
    }
  }, [currentScenarioKey, currentHour, isDisasterMode, currentDisasterType, isOutage, selectedBuilding, hourData]);

  const handleDismissToast = () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setActiveToast(null);
  };

  const handleClearHistory = () => {
    setAlerts([]);
    setActiveToast(null);
  };

  // Single source derived counts (BUG 1 FIX: all numbers derive from alerts array)
  const totalCount = alerts.length;
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  const filteredAlerts = alerts.filter(a => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

  const getSeverityMeta = (severity) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: '#ef4444',
          color: '#f87171',
          badgeBg: 'rgba(239, 68, 68, 0.25)',
          icon: AlertTriangle,
          label: 'CRITICAL',
        };
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          border: '#f59e0b',
          color: '#fbbf24',
          badgeBg: 'rgba(245, 158, 11, 0.25)',
          icon: ShieldAlert,
          label: 'WARNING',
        };
      default:
        return {
          bg: 'rgba(56, 189, 248, 0.12)',
          border: '#38bdf8',
          color: '#38bdf8',
          badgeBg: 'rgba(56, 189, 248, 0.2)',
          icon: Info,
          label: 'TELEMETRY',
        };
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* 1. HEADER ALERTS TRIGGER BUTTON (Badge count derives directly from alerts.length) */}
      <button 
        type="button"
        className={`btn-secondary btn-header ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          borderColor: isEmergency ? '#ef4444' : (isOpen ? '#f59e0b' : 'rgba(255, 255, 255, 0.15)'),
          background: isOpen ? 'rgba(245, 158, 11, 0.15)' : (isEmergency ? 'rgba(239, 68, 68, 0.15)' : 'transparent'),
          color: isEmergency ? '#fca5a5' : (isOpen ? '#fbbf24' : '#f8fafc'),
          position: 'relative',
          boxShadow: isEmergency ? '0 0 10px rgba(239, 68, 68, 0.35)' : 'none',
        }}
        title="Open Simulated Emergency Alert Center & Session Notification Stream"
      >
        <Bell size={13} color={isEmergency ? '#ef4444' : (isOpen ? '#f59e0b' : '#94a3b8')} />
        <span>Alerts</span>
        {totalCount > 0 && (
          <span 
            style={{
              background: isEmergency ? '#ef4444' : '#f59e0b',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: 800,
              borderRadius: '10px',
              padding: '1px 5px',
              marginLeft: '2px',
              lineHeight: '1',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {totalCount}
          </span>
        )}
      </button>

      {/* 2. FLOATING PUSH-NOTIFICATION STYLE TOAST CARD */}
      {activeToast && (
        <div 
          className="push-notification-toast"
          style={{
            position: 'fixed',
            top: 74,
            right: 24,
            zIndex: 99999,
            width: '390px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'rgba(9, 14, 23, 0.97)',
            backdropFilter: 'blur(16px)',
            border: `1.5px solid ${getSeverityMeta(activeToast.severity).border}`,
            borderRadius: '14px',
            boxShadow: `0 16px 40px rgba(0, 0, 0, 0.8), 0 0 24px ${getSeverityMeta(activeToast.severity).border}40`,
            color: '#f8fafc',
            overflow: 'hidden',
            animation: 'toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Push Card Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                background: getSeverityMeta(activeToast.severity).badgeBg,
                color: getSeverityMeta(activeToast.severity).color,
                padding: '3px 7px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <Radio size={11} className="pulse-live-icon" />
                <span>{getSeverityMeta(activeToast.severity).label}</span>
              </div>

              {/* Explicit Scenario Tag (BUG 2 Verification) */}
              <div style={{
                background: 'rgba(56, 189, 248, 0.18)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9.5px',
                fontWeight: 700,
                letterSpacing: '0.4px',
              }}>
                🏷️ {getDisasterTag(activeToast.disaster_type)}
              </div>

              <span style={{ fontSize: '10px', color: '#94a3b8' }}>• Now</span>
            </div>

            <button
              type="button"
              onClick={handleDismissToast}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px',
                transition: 'color 0.2s',
              }}
              title="Dismiss simulated alert"
            >
              <X size={15} />
            </button>
          </div>

          {/* Push Card Body */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                background: getSeverityMeta(activeToast.severity).bg,
                border: `1px solid ${getSeverityMeta(activeToast.severity).border}60`,
                padding: '8px',
                borderRadius: '8px',
                color: getSeverityMeta(activeToast.severity).color,
                flexShrink: 0,
                marginTop: '1px',
              }}>
                {React.createElement(getSeverityMeta(activeToast.severity).icon, { size: 18 })}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontSize: '12.5px', 
                  fontWeight: 700, 
                  color: getSeverityMeta(activeToast.severity).color, 
                  lineHeight: 1.3,
                  marginBottom: 3,
                }}>
                  {activeToast.title}
                </div>
                <div style={{ fontSize: '11.5px', color: '#e2e8f0', lineHeight: 1.45 }}>
                  {activeToast.message}
                </div>
              </div>
            </div>

            {/* Target Location & Timestamp Pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 4,
              paddingTop: 6,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '10.5px',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8', fontWeight: 600 }}>
                <Building2 size={12} />
                <span>{activeToast.affected_building || 'Campus Microgrid'}</span>
              </span>

              <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                Simulated Hour {activeToast.timestamp || `${currentHour}:00`}
              </span>
            </div>
          </div>

          {/* VISIBLE HONESTY DISCLAIMER LABEL */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            borderTop: '1px solid rgba(245, 158, 11, 0.25)',
            padding: '7px 12px',
            fontSize: '9.5px',
            color: '#fbbf24',
            lineHeight: 1.35,
            fontWeight: 500,
          }}>
            ℹ️ {SIMULATED_DISCLAIMER_TEXT}
          </div>

          {/* Progress Bar (Auto-Dismiss Countdown) */}
          <div style={{
            width: '100%',
            height: '3px',
            background: 'rgba(255, 255, 255, 0.1)',
          }}>
            <div 
              style={{
                height: '100%',
                background: getSeverityMeta(activeToast.severity).border,
                animation: 'toastCountdown 8.5s linear forwards',
              }}
            />
          </div>
        </div>
      )}

      {/* 3. PERSISTENT BELL-ICON DROPDOWN DRAWER (Anchored Under Button) */}
      {isOpen && (
        <div 
          className="alert-center-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '410px',
            maxWidth: 'calc(100vw - 32px)',
            background: '#090e17',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.85), 0 0 25px rgba(0,0,0,0.5)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'dropdownFadeIn 0.2s ease',
          }}
        >
          {/* Header (BUG 1 FIX: totalCount derives directly from alerts.length) */}
          <div style={{
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '5px', borderRadius: '6px', color: '#f87171' }}>
                <Bell size={16} />
              </div>
              <div>
                <b style={{ fontSize: '13px', color: '#f8fafc' }}>Simulated Alert Center</b>
                <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                  Live simulation notification stream ({totalCount} total)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {totalCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Clear alert session history"
                >
                  <Trash2 size={11} />
                  <span>Clear</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* VISIBLE HONESTY DISCLAIMER BANNER (IN DROPDOWN) */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
            padding: '8px 14px',
            fontSize: '10.5px',
            color: '#fbbf24',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
          }}>
            <Info size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{SIMULATED_DISCLAIMER_TEXT}</span>
          </div>

          {/* Severity Filter Tabs (BUG 1 FIX: all numbers derive strictly from alerts.filter()) */}
          <div style={{
            display: 'flex',
            gap: 6,
            padding: '8px 14px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}>
            <button
              type="button"
              onClick={() => setFilterSeverity('all')}
              style={{
                background: filterSeverity === 'all' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                border: filterSeverity === 'all' ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid transparent',
                color: filterSeverity === 'all' ? '#f8fafc' : '#94a3b8',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10.5px',
                fontWeight: filterSeverity === 'all' ? 700 : 500,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              ALL ({totalCount})
            </button>

            <button
              type="button"
              onClick={() => setFilterSeverity('critical')}
              style={{
                background: filterSeverity === 'critical' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                border: filterSeverity === 'critical' ? '1px solid #ef4444' : '1px solid transparent',
                color: filterSeverity === 'critical' ? '#f87171' : '#94a3b8',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10.5px',
                fontWeight: filterSeverity === 'critical' ? 700 : 500,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              CRITICAL ({criticalCount})
            </button>

            <button
              type="button"
              onClick={() => setFilterSeverity('warning')}
              style={{
                background: filterSeverity === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                border: filterSeverity === 'warning' ? '1px solid #f59e0b' : '1px solid transparent',
                color: filterSeverity === 'warning' ? '#fbbf24' : '#94a3b8',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10.5px',
                fontWeight: filterSeverity === 'warning' ? 700 : 500,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              WARNING ({warningCount})
            </button>

            <button
              type="button"
              onClick={() => setFilterSeverity('info')}
              style={{
                background: filterSeverity === 'info' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                border: filterSeverity === 'info' ? '1px solid #38bdf8' : '1px solid transparent',
                color: filterSeverity === 'info' ? '#38bdf8' : '#94a3b8',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10.5px',
                fontWeight: filterSeverity === 'info' ? 700 : 500,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              INFO ({infoCount})
            </button>
          </div>

          {/* Alert History Scroll List */}
          <div style={{
            maxHeight: '340px',
            overflowY: 'auto',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {filteredAlerts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '30px 10px',
                color: '#64748b',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}>
                <CheckCircle2 size={24} color="#10b981" />
                <span>No alerts recorded for this active scenario.</span>
                <span style={{ fontSize: '10.5px', color: '#475569' }}>
                  Trigger a disaster scenario or manual power cut in the sandbox to generate simulated alerts.
                </span>
              </div>
            ) : (
              filteredAlerts.map((alert, idx) => {
                const meta = getSeverityMeta(alert.severity);
                const IconComponent = meta.icon;
                return (
                  <div
                    key={alert.sessionKey || idx}
                    style={{
                      background: meta.bg,
                      border: `1px solid ${meta.border}50`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 700, 
                          color: meta.color,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}>
                          <IconComponent size={13} color={meta.color} />
                          <span>{alert.title}</span>
                        </span>

                        {/* Scenario Tag inside card */}
                        <span style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#38bdf8',
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '3px',
                        }}>
                          {getDisasterTag(alert.disaster_type)}
                        </span>
                      </div>

                      <span style={{ fontSize: '9.5px', color: '#94a3b8', fontFamily: 'monospace' }}>
                        Hour {alert.timestamp || `${alert.hour}:00`}
                      </span>
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#e2e8f0', lineHeight: 1.45 }}>
                      {alert.message}
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 2,
                      fontSize: '10px',
                      color: '#94a3b8',
                    }}>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                        📍 {alert.affected_building}
                      </span>
                      <span>Tier {alert.tier || 'N/A'} Priority</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '8px 14px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '10px',
            color: '#64748b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>SynapTwin v2.4 Microgrid Notification Layer</span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>● Online</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Deterministic instant preset generator
function getFreshPresetAlerts({
  hour,
  isOutage,
  disasterActive,
  disasterType,
  isolatedBuilding,
  batteryUsedKw,
  batteryAvailableKw,
  rejectedKw: _rejectedKw,
  backupRuntimeHours: _backupRuntimeHours,
}) {
  const timeStr = `${hour < 10 ? '0' : ''}${hour}:00`;
  const alerts = [];

  if (disasterActive) {
    if (disasterType === 'cyclone_severe_storm') {
      alerts.push({
        id: `alert-cyclone-t1-${hour}`,
        severity: 'critical',
        tier: 1,
        title: 'CYCLONE SHELTER PROTOCOL ACTIVE',
        message: '11kV utility grid pre-emptively disconnected for 120 km/h squall safety. Tier-1 in-place shelter guaranteed across Hostels 1, 2 & 7. Campus Medical Point and SCADA Comms Hub fully powered.',
        affected_building: 'ITER Hostels 1, 2 & 7',
        timestamp: timeStr,
        hour: hour,
        category: 'DISASTER_ACTIVE',
        disaster_type: 'cyclone_severe_storm',
        is_simulated: true,
      });
      alerts.push({
        id: `alert-cyclone-shed-${hour}`,
        severity: 'warning',
        tier: 3,
        title: 'NON-ESSENTIAL POWER SHED',
        message: 'Grid failure detected. Non-essential power shed in Academic Blocks (flexible demand curtailed) to preserve microgrid battery for residential shelters.',
        affected_building: 'Academic Blocks',
        timestamp: timeStr,
        hour: hour,
        category: 'POWER_SHED',
        disaster_type: 'cyclone_severe_storm',
        is_simulated: true,
      });
      alerts.push({
        id: `alert-cyclone-runtime-${hour}`,
        severity: 'info',
        tier: 2,
        title: 'MICROGRID STORAGE RUNTIME',
        message: `Shared second-life battery supplying ${(batteryUsedKw || 85.0).toFixed(1)} kW of ${(batteryAvailableKw || 88.2).toFixed(1)} kW available. Estimated critical runtime: ~1.7 hours.`,
        affected_building: 'Campus Utility Substation',
        timestamp: timeStr,
        hour: hour,
        category: 'STORAGE_TELEMETRY',
        disaster_type: 'cyclone_severe_storm',
        is_simulated: true,
      });
    } else if (disasterType === 'monsoon_waterlogging') {
      alerts.push({
        id: `alert-monsoon-t1-${hour}`,
        severity: 'critical',
        tier: 1,
        title: 'TORRENTIAL FLOOD DRAINAGE PRIORITY',
        message: `Water table surge detected at ${timeStr}. Tier-1 Basement Sump Pumps prioritized in ITER Boys Hostel 7 (6.0 kW drainage load) and Hostels 1 & 2. Grid islanded.`,
        affected_building: 'ITER Boys Hostel 7',
        timestamp: timeStr,
        hour: hour,
        category: 'DISASTER_ACTIVE',
        disaster_type: 'monsoon_waterlogging',
        is_simulated: true,
      });
      alerts.push({
        id: `alert-monsoon-shed-${hour}`,
        severity: 'warning',
        tier: 3,
        title: 'NON-ESSENTIAL LOAD SHED',
        message: 'Grid failure detected. Non-essential power shed in deficit buildings. Tier-2 corridor lighting and essential pumps maintained.',
        affected_building: 'C-Block (Academic)',
        timestamp: timeStr,
        hour: hour,
        category: 'POWER_SHED',
        disaster_type: 'monsoon_waterlogging',
        is_simulated: true,
      });
    } else if (disasterType === 'electrical_fire') {
      const target = isolatedBuilding || 'C-Block (Academic)';
      alerts.push({
        id: `alert-fire-iso-${hour}`,
        severity: 'critical',
        tier: 1,
        title: 'ELECTRICAL RISER SAFETY ISOLATION',
        message: `Electrical riser fault detected in ${target}. Main electrical breaker isolated (0 kW load). +18.4 kW clean battery power safely redirected to active deficit nodes.`,
        affected_building: target,
        timestamp: timeStr,
        hour: hour,
        category: 'ISOLATION',
        disaster_type: 'electrical_fire',
        is_simulated: true,
      });
      alerts.push({
        id: `alert-fire-perimeter-${hour}`,
        severity: 'info',
        tier: 2,
        title: 'MICROGRID PERIMETER SECURED',
        message: `Microgrid safety isolation active for ${target}. Surrounding student dorms, central library, and clinic operating normally.`,
        affected_building: 'Campus Microgrid',
        timestamp: timeStr,
        hour: hour,
        category: 'SAFETY_PERIMETER',
        disaster_type: 'electrical_fire',
        is_simulated: true,
      });
    } else if (disasterType === 'grid_transformer_fault' || disasterType === 'extended_outage') {
      alerts.push({
        id: `alert-transformer-t1-${hour}`,
        severity: 'critical',
        tier: 1,
        title: '11kV SUBSTATION TRANSFORMER FAILURE',
        message: `11kV/415V transformer failure detected. Islanded microgrid engaged supplying ${(batteryUsedKw || 85.0).toFixed(1)} kW of emergency storage. Campus SCADA and Medical Clinic 100% powered.`,
        affected_building: 'Campus Utility Substation',
        timestamp: timeStr,
        hour: hour,
        category: 'DISASTER_ACTIVE',
        disaster_type: disasterType,
        is_simulated: true,
      });
      alerts.push({
        id: `alert-transformer-shed-${hour}`,
        severity: 'warning',
        tier: 3,
        title: 'TIER-3 POWER SHEDDING',
        message: 'Grid failure detected. Non-essential power shed in Academic Blocks. Tier-1 Life-Safety locked at 100% priority.',
        affected_building: 'Academic Blocks',
        timestamp: timeStr,
        hour: hour,
        category: 'POWER_SHED',
        disaster_type: disasterType,
        is_simulated: true,
      });
    } else if (disasterType === 'heatwave_stress') {
      alerts.push({
        id: `alert-heatwave-surge-${hour}`,
        severity: 'warning',
        tier: 2,
        title: 'EXTREME HEATWAVE THERMAL STRESS',
        message: 'Ambient 44°C triggering +35% AC chiller load surge. Shared battery executing 84.0 kW peak-shaving dispatch to protect 11kV campus distribution feeders from thermal tripping.',
        affected_building: 'All Campus Blocks',
        timestamp: timeStr,
        hour: hour,
        category: 'THERMAL_STRESS',
        disaster_type: 'heatwave_stress',
        is_simulated: true,
      });
    }
  } else if (isOutage) {
    alerts.push({
      id: `alert-manual-outage-${hour}`,
      severity: 'critical',
      tier: 1,
      title: 'GRID FAILURE: ISLANDED TRIAGE',
      message: `11kV utility grid disconnect detected at ${timeStr}. Microgrid switched to islanded triage. Tier-1 Life-Safety guaranteed (Medical Point & Server Hub active).`,
      affected_building: 'Campus Utility Substation',
      timestamp: timeStr,
      hour: hour,
      category: 'GRID_OUTAGE',
      disaster_type: 'outage',
      is_simulated: true,
    });
  }

  return alerts;
}
