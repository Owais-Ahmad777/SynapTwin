/*
 * SynapTwin - Community Energy Flexibility & Shared-Battery Digital Twin
 * Copyright (c) 2026 Owais Ahmad
 * Author: Owais Ahmad (https://github.com/Owais-Ahmad777)
 * Licensed under the MIT License.
 */

import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import CampusMap from './components/CampusMap';
import TimelineController from './components/TimelineController';
import EnergyCharts from './components/EnergyCharts';
import EVFleetPanel from './components/EVFleetPanel';
import SolarForecastPanel from './components/SolarForecastPanel';
import SandboxPanel from './components/SandboxPanel';
import ExplainabilityPanel from './components/ExplainabilityPanel';
import PrivacyVault from './components/PrivacyVault';
import PitchModal from './components/PitchModal';
import FairnessModal from './components/FairnessModal';
import AuditModal from './components/AuditModal';
import EnergyFlowDiagram from './components/EnergyFlowDiagram';
import ComparisonModal from './components/ComparisonModal';
import HistoryView from './components/HistoryView';
import MultiYearTrends from './components/MultiYearTrends';
import Sidebar from './components/Sidebar';
import { allBuildings } from './data/buildings';
import LoginPage from './components/LoginPage';
import InsightDrawer from './components/InsightDrawer';
import HomePage from './pages/HomePage';
import DriveEVPage from './pages/DriveEVPage';
import DisasterPage from './pages/DisasterPage';
import ComparePage from './pages/ComparePage';
import ContentAuditPage from './pages/ContentAuditPage';
import CertificatePage from './pages/CertificatePage';
import PitchPage from './pages/PitchPage';
import SettingsPage from './pages/SettingsPage';
import PlayDayFab from './components/PlayDayFab';
import BuildingHistoryPage from './pages/BuildingHistoryPage';
import BuildingMonthlyTrend from './components/BuildingMonthlyTrend';
import BuildingProjectionPanel from './components/BuildingProjectionPanel';
import BuildingCertificate from './components/BuildingCertificate';
import BuildingCompare from './components/BuildingCompare';
import { BuildingSolarChart, BuildingDemandChart, BuildingFairnessTable } from './components/BuildingInsightGraphs';

const VALID_PAGES = ['home', 'driveev', 'disaster', 'compare', 'audit', 'certificate', 'pitch', 'history30', 'future5y', 'settings'];

// UI-ONLY: supervisor building-persona id -> canonical simulation block name
// (same strings the backend already emits in hourData.blocks[].name).
const ROLE_BUILDING_MAP = {
  hostel_a: 'ITER Boys Hostel 1',
  hostel_b: 'ITER Boys Hostel 7',
  academic: 'C-Block (Academic)',
  cafeteria: 'ITER Cafeteria & Dining',
  central_library: 'Central Library',
  admin_block: 'ITER Administrative Block',
  auditorium: 'Bansuri Guru Auditorium',
  d_block: 'D-Block',
  a_block: 'A-Block',
  hostel_2: 'ITER Boys Hostel 2',
  sports: 'S-Block (Sports Complex)',
  f_block: 'F-Block',
  g_block: 'G-Block',
  data_science: 'Centre for Data Science',
  research: 'Research & Innovation Wing',
};

// UI-ONLY lookup over already-fetched simulation blocks (no backend change).
function findBlock(blocks, name) {
  if (!blocks || !name) return null;
  const exact = blocks.find((b) => b.name === name);
  if (exact) return exact;
  const t = name.toLowerCase();
  return blocks.find((b) => {
    const n = (b.name || '').toLowerCase();
    return n.includes(t) || t.includes(n);
  }) || null;
}

function getInitialPage() {
  try {
    const p = new URLSearchParams(window.location.search).get('page');
    if (p && VALID_PAGES.includes(p)) return p;
    if (window.location.hash) {
      const h = window.location.hash.replace('#', '');
      if (VALID_PAGES.includes(h)) return h;
    }
  } catch (e) { /* ignore */ }
  return 'home';
}

export default function App() {
  const [isHistoryView] = useState(() => {
    return window.location.search.includes('view=history') ||
           window.location.pathname.startsWith('/history') ||
           window.location.hash.includes('history');
  });

  const [simData, setSimData] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [trajectoryData, setTrajectoryData] = useState([]);
  const [currentHour, setCurrentHour] = useState(12); // Default to hour 12 (midday)
  // UI-ONLY session (Addendum 4): role is fixed at login, no in-app switching.
  // Persisted so a refresh doesn't force re-login mid-demo. Demo auth only.
  const [session, setSession] = useState(() => {
    try {
      const raw = window.localStorage.getItem('synaptwin-session-v1');
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s && (s.role === 'admin' || ROLE_BUILDING_MAP[s.role])) return s;
    } catch (e) { /* ignore */ }
    return null;
  });
  const currentRole = session?.role || 'admin';
  const uiProfile = currentRole === 'admin' ? 'admin' : 'supervisor';
  const [isPitchOpen, setIsPitchOpen] = useState(false);
  const [isFairnessOpen, setIsFairnessOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  // UI-ONLY shell state (navigation / drawers / profiles). No backend impact.
  const [activePage, setActivePage] = useState(getInitialPage);
  const [navOpen, setNavOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [insight, setInsight] = useState(null); // 'solar' | 'demand' | 'fairness' | 'roi' | null
  const [theme, setTheme] = useState('dark'); // 'dark' | 'light' — UI chrome only

  // UI-ONLY theme switch (CSS variables). No data or backend impact.
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) { /* ignore */ }
  }, [theme]);

  const handleNavigate = (page) => {
    if (!VALID_PAGES.includes(page)) return;
    setActivePage(page);
    setInsight(null);
    setNavOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('page', page);
      window.history.replaceState({}, '', url.toString());
    } catch (e) { /* ignore */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Simulation Parameters for the Interactive Sandbox (calm default: no
  // disaster on load — disaster scenarios are opt-in via the Sandbox panel).
  const DEFAULT_SIM_PARAMS = {
    is_disaster_active: false,
    disaster_type: 'monsoon_waterlogging',
    outage_hours: [19, 20, 21],
    hazard_hour: 20,
    days_in_service: 200,
    driev_emergency_opt_in_count: 8,
    solar_multiplier: 1.0,
    load_multiplier: 1.0,
    disaster_start_hour: 17,
    disaster_end_hour: 22,
    cyclone_start_hour: 12,
    cyclone_end_hour: 22,
  };

  const [simParams, setSimParams] = useState(DEFAULT_SIM_PARAMS);
  const debounceTimerRef = useRef(null);

  // Initial Data Load
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        // 1. Load default simulation
        const simRes = await fetch('/api/simulation/default');
        if (simRes.ok) {
          const s = await simRes.json();
          setSimData(s);
        }

        // 2. Load campus GeoJSON (all 16 buildings)
        const geoRes = await fetch('/api/campus/geojson');
        if (geoRes.ok) {
          const g = await geoRes.json();
          setGeoData(g);
        }

        // 3. Load battery trajectory
        const trajRes = await fetch('/api/battery/trajectory');
        if (trajRes.ok) {
          const t = await trajRes.json();
          setTrajectoryData(t.trajectory || []);
        }

        // 4. URL query parameter parsing for automated scenario presets
        const searchParams = new URLSearchParams(window.location.search);
        const scenario = searchParams.get('scenario');
        const target = searchParams.get('target') || searchParams.get('isolated_building');
        const modal = searchParams.get('modal');
        const hourParam = searchParams.get('hour');

        if (hourParam) {
          const hVal = parseInt(hourParam, 10);
          if (!isNaN(hVal) && hVal >= 0 && hVal <= 23) {
            setCurrentHour(hVal);
          }
        }

        if (scenario) {
          let customDisaster = 'monsoon_waterlogging';
          let defaultStart = 17;
          let defaultEnd = 22;
          let isActive = true;

          if (scenario === 'fire' || scenario === 'electrical_fire') {
            customDisaster = 'electrical_fire';
            defaultStart = 11;
            defaultEnd = 13;
          } else if (scenario === 'cyclone' || scenario === 'cyclone_severe_storm') {
            customDisaster = 'cyclone_severe_storm';
            defaultStart = 12;
            defaultEnd = 22;
          } else if (scenario === 'transformer' || scenario === 'grid_transformer_fault' || scenario === 'explosion') {
            customDisaster = 'grid_transformer_fault';
            defaultStart = 12;
            defaultEnd = 15;
          } else if (scenario === 'heatwave' || scenario === 'heatwave_stress') {
            customDisaster = 'heatwave_stress';
            defaultStart = 11;
            defaultEnd = 16;
          } else if (scenario === 'routine' || scenario === 'fairness' || scenario === 'none' || scenario === 'normal') {
            customDisaster = 'none';
            isActive = false;
          }

          const dStartParam = searchParams.get('disaster_start') || searchParams.get('disaster_start_hour') || searchParams.get('cyclone_start') || searchParams.get('cyclone_start_hour');
          const dEndParam = searchParams.get('disaster_end') || searchParams.get('disaster_end_hour') || searchParams.get('cyclone_end') || searchParams.get('cyclone_end_hour');

          const customParams = {
            ...DEFAULT_SIM_PARAMS,
            is_disaster_active: isActive,
            disaster_type: customDisaster,
            isolated_building: target || 'G-Block',
            disaster_start_hour: dStartParam ? parseInt(dStartParam, 10) : defaultStart,
            disaster_end_hour: dEndParam ? parseInt(dEndParam, 10) : defaultEnd,
            cyclone_start_hour: dStartParam ? parseInt(dStartParam, 10) : defaultStart,
            cyclone_end_hour: dEndParam ? parseInt(dEndParam, 10) : defaultEnd,
          };
          setSimParams(customParams);
          await triggerSimulationRun(customParams);
        }

        if (modal === 'audit') {
          setIsAuditOpen(true);
        } else if (modal === 'fairness' || modal === 'triage') {
          setIsFairnessOpen(true);
        } else if (modal === 'compare') {
          setIsCompareOpen(true);
        } else if (modal === 'pitch') {
          setIsPitchOpen(true);
        }
      } catch (err) {
        console.error('Error loading initial digital twin data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  // Run Custom Dynamic Simulation
  const triggerSimulationRun = async (params) => {
    try {
      setIsRunning(true);
      const res = await fetch('/api/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        const newSim = await res.json();
        setSimData(newSim);
      }
    } catch (err) {
      console.error('Failed to run dynamic simulation:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // Handler for Sandbox Parameter Changes with Instant Run for Discrete Toggles & Debounce for Continuous Sliders
  const handleParamChange = (partialParams, autoRun = false) => {
    setSimParams(prev => {
      const updated = { ...prev, ...partialParams };
      if (autoRun) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        const isDiscreteToggle = 'is_disaster_active' in partialParams ||
                                 'disaster_type' in partialParams ||
                                 'isolated_building' in partialParams ||
                                 'outage_hours' in partialParams ||
                                 'disaster_start_hour' in partialParams ||
                                 'disaster_end_hour' in partialParams ||
                                 'cyclone_start_hour' in partialParams ||
                                 'cyclone_end_hour' in partialParams;
        if (isDiscreteToggle) {
          triggerSimulationRun(updated);
        } else {
          debounceTimerRef.current = setTimeout(() => {
            triggerSimulationRun(updated);
          }, 80);
        }
      }
      return updated;
    });
  };

  // Toggle single hour outage dynamically across the 24-hour day
  const handleToggleHourOutage = (hourToToggle) => {
    const currentList = simParams.outage_hours || [];
    let updated;
    if (currentList.includes(hourToToggle)) {
      updated = currentList.filter(h => h !== hourToToggle);
    } else {
      updated = [...currentList, hourToToggle].sort((a, b) => a - b);
    }
    handleParamChange({ outage_hours: updated }, true);
  };

  // Reset to Demo Defaults Handler
  const handleResetDemoDefaults = () => {
    setSimParams(DEFAULT_SIM_PARAMS);
    setCurrentHour(12);
    triggerSimulationRun(DEFAULT_SIM_PARAMS);
  };

  const isDisasterActive = Boolean(simParams.is_disaster_active && simParams.disaster_type && simParams.disaster_type !== 'none');
  const rawHourData = simData?.hourly?.find(h => h.hour === currentHour) || simData?.hourly?.[0];
  const hourData = rawHourData ? {
    ...rawHourData,
    raw_disaster_type: rawHourData.disaster_type,
    is_disaster_active: isDisasterActive,
    disaster_type: isDisasterActive ? simParams.disaster_type : 'none',
    mode: isDisasterActive ? 'DISASTER_TRIAGE' : (rawHourData.is_outage ? 'DISASTER_TRIAGE' : 'FAIRNESS'),
  } : null;

  const isCustom = (
    simParams.solar_multiplier !== 1.0 ||
    simParams.load_multiplier !== 1.0 ||
    (simParams.outage_hours && simParams.outage_hours.length > 0 && !simParams.outage_hours.includes(19)) ||
    simParams.disaster_type !== 'monsoon_waterlogging'
  );

  // UI-ONLY per-building mode: supervisor + a selected building persona shows
  // that building's site; admin keeps the unchanged campus site.
  const isBuildingMode = uiProfile === 'supervisor' && currentRole !== 'admin' && Boolean(ROLE_BUILDING_MAP[currentRole]);
  const buildingName = isBuildingMode ? ROLE_BUILDING_MAP[currentRole] : null;
  const buildingBlock = isBuildingMode ? findBlock(hourData?.blocks, buildingName) : null;

  // UI-ONLY identity chip label (Addendum 4 §3): read-only, fixed by session.
  const identityLabel = currentRole === 'admin' ? 'Admin' : `${ROLE_BUILDING_MAP[currentRole] || currentRole} · Supervisor`;
  const identityKind = currentRole === 'admin' ? 'admin' : 'supervisor';

  // UI-ONLY session handoff (Addendum 4 §2/§4). Demo auth only, no backend.
  const handleLogin = (next) => {
    try { window.localStorage.setItem('synaptwin-session-v1', JSON.stringify(next)); } catch (e) { /* ignore */ }
    setSession(next);
    setActivePage('home');
    setInsight(null);
    setNavOpen(false);
  };
  const handleLogout = () => {
    try { window.localStorage.removeItem('synaptwin-session-v1'); } catch (e) { /* ignore */ }
    setSession(null);
    setActivePage('home');
    setInsight(null);
    setNavOpen(false);
  };

  // UI-ONLY daily sums + 24h series aggregated from already-fetched hourly
  // simulation blocks (same summation the KPI banner already does for campus).
  let buildingDaily = { solar: 0, load: 0, battery: 0, grid: 0 };
  const buildingHourly24 = [];
  if (isBuildingMode && simData?.hourly) {
    simData.hourly.forEach((h) => {
      const b = findBlock(h.blocks, buildingName);
      const load = b?.load_kw || 0;
      const solar = b?.solar_kw || 0;
      const alloc = b?.allocated_kw || 0;
      buildingDaily.load += load;
      buildingDaily.solar += solar;
      buildingDaily.battery += alloc;
      buildingDaily.grid += Math.max(0, load - solar - alloc);
      buildingHourly24.push({
        hour: h.hour,
        load: Number(load.toFixed(1)),
        solar: Number(solar.toFixed(1)),
        battery: Number(alloc.toFixed(1)),
      });
    });
    buildingDaily = {
      solar: Number(buildingDaily.solar.toFixed(1)),
      load: Number(buildingDaily.load.toFixed(1)),
      battery: Number(buildingDaily.battery.toFixed(1)),
      grid: Number(buildingDaily.grid.toFixed(1)),
    };
  }

  // UI-ONLY: per-building site has no DriveEV/Disaster pages (decision panel
  // lives on its homepage instead); fall back to home if addressed directly.
  const effectivePage = (isBuildingMode && ['driveev', 'disaster', 'settings', 'pitch'].includes(activePage))
    ? 'home'
    : activePage;

  if (isHistoryView) {
    return <HistoryView />;
  }

  const finDaily = simData?.impact_metrics?.daily_inr_saved || simData?.financial_metrics?.daily_inr_saved || 21262;
  const finMonthly = simData?.impact_metrics?.monthly_inr_saved || simData?.financial_metrics?.monthly_inr_saved || 637860;
  const finAnnual = simData?.impact_metrics?.annual_inr_saved || simData?.financial_metrics?.annual_inr_saved || 7760630;

  const insightMeta = {
    solar: { title: "Today's Solar Forecast vs Actual", sub: 'Rooftop Solar PV • live Open-Meteo telemetry (unchanged graph)' },
    demand: { title: 'Demand and Forecast', sub: 'Campus demand vs 1h-lookahead prediction ±3.8% MAPE (unchanged graph)' },
    fairness: { title: 'Max-Min Fairness — Full Table', sub: 'Building allocation & satisfaction matrix (unchanged data)' },
    roi: { title: 'Financial ROI (ToU) — Detail', sub: 'TPCODL commercial ToU arbitrage (unchanged numbers)' },
  };

  const renderPage = () => {
    if (loading) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '40px 0' }}>
          <div className="kpi-row">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="kpi-card skeleton-card" style={{ height: 100 }}></div>
            ))}
          </div>
          <div style={{ height: 120 }} className="panel-card skeleton-card"></div>
          <div className="grid-2col">
            <div style={{ height: 480 }} className="panel-card skeleton-card"></div>
            <div style={{ height: 480 }} className="panel-card skeleton-card"></div>
          </div>
        </div>
      );
    }

    switch (effectivePage) {
      case 'driveev':
        return (
          <DriveEVPage
            simData={simData}
            currentHour={currentHour}
            hourData={hourData}
            trajectoryData={trajectoryData}
            demandAnalytics={simData?.demand_analytics}
            daysInService={simParams.days_in_service}
            currentRole={currentRole}
          />
        );
      case 'disaster':
        return (
          <DisasterPage
            simParams={simParams}
            onParamChange={handleParamChange}
            onRunSimulation={() => triggerSimulationRun(simParams)}
            onResetDemoDefaults={handleResetDemoDefaults}
            isRunning={isRunning}
            simData={simData}
            currentHour={currentHour}
            hourData={hourData}
          />
        );
      case 'compare':
        return isBuildingMode ? (
          <div className="st-page">
            <div className="st-page-head">
              <div className="st-eyebrow">PER-BUILDING • IMPACT SHARE</div>
              <h2 className="st-page-title">Compare — {buildingName}</h2>
              <p className="st-page-sub">This building against campus totals.</p>
            </div>
            <BuildingCompare buildingName={buildingName} />
          </div>
        ) : (
          <ComparePage simData={simData} />
        );
      case 'audit':
        return <ContentAuditPage simData={simData} />;
      case 'certificate':
        return isBuildingMode ? (
          <div className="st-page">
            <div className="st-page-head">
              <div className="st-eyebrow">PER-BUILDING • COMPLIANCE RECORD</div>
              <h2 className="st-page-title">Certificate — {buildingName}</h2>
              <p className="st-page-sub">Per-building financial and sustainability figures.</p>
            </div>
            <BuildingCertificate buildingName={buildingName} />
          </div>
        ) : (
          <CertificatePage simData={simData} />
        );
      case 'pitch':
        return <PitchPage simData={simData} />;
      case 'history30':
        return isBuildingMode ? (
          <div className="st-page">
            <div className="st-page-head">
              <div className="st-eyebrow">PER-BUILDING • LIVE TELEMETRY</div>
              <h2 className="st-page-title">30-Day History — {buildingName}</h2>
              <p className="st-page-sub">Per-building information only.</p>
            </div>
            <BuildingMonthlyTrend buildingName={buildingName} />
          </div>
        ) : (
          <div className="st-page">
            <div className="st-page-head">
              <div className="st-eyebrow">Live Trends</div>
              <h2 className="st-page-title">30-Day History</h2>
            </div>
            <HistoryView hideMultiyearToggle minimal />
          </div>
        );
      case 'future5y':
        return isBuildingMode ? (
          <div className="st-page">
            <div className="st-page-head">
              <div className="st-eyebrow">PER-BUILDING • LIVE TELEMETRY</div>
              <h2 className="st-page-title">5-Year History — {buildingName}</h2>
              <p className="st-page-sub">Per-building information only.</p>
            </div>
            <BuildingProjectionPanel buildingName={buildingName} />
          </div>
        ) : (
          <div className="st-page">
            <div className="st-page-head">
              <div className="st-eyebrow">Strategic Outlook</div>
              <h2 className="st-page-title">5-Year History</h2>
              <p className="st-page-sub">Long-horizon financial and energy outlook.</p>
            </div>
            <MultiYearTrends />
          </div>
        );
      case 'settings':
        return (
          <SettingsPage
            currentRole={currentRole}
            currentHour={currentHour}
            simData={simData}
          />
        );
      case 'home':
      default:
        return (
          <HomePage
            geoData={geoData}
            hourData={hourData}
            simData={simData}
            simParams={simParams}
            trajectoryData={trajectoryData}
            currentHour={currentHour}
            currentRole={currentRole}
            isDisasterActive={isDisasterActive}
            onHourChange={setCurrentHour}
            onToggleHourOutage={handleToggleHourOutage}
            onEndDisaster={() => handleParamChange({ is_disaster_active: false }, true)}
            onOpenFairness={() => setIsFairnessOpen(true)}
            onOpenInsight={(id) => setInsight(id)}
            buildingMode={isBuildingMode}
            buildingName={buildingName}
            buildingBlock={buildingBlock}
            buildingDaily={buildingDaily}
            buildingHourly24={buildingHourly24}
          />
        );
    }
  };

  // UI-ONLY auth gate (Addendum 4 §2): unauthenticated sessions render ONLY
  // the login screen — dashboard, header, and rail never mount until login.
  if (!session) {
    return (
      <LoginPage
        buildings={allBuildings.filter((b) => b.id !== 'admin')}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="app-container">
      <div className={`st-shell${navOpen ? ' nav-open' : ''}${railExpanded ? ' rail-expanded' : ''}`}>
        <button
          type="button"
          className="st-hamburger"
          onClick={() => setNavOpen((v) => !v)}
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        >
          <span />
          <span />
          <span />
        </button>
        {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}
        <Sidebar
          activePage={effectivePage}
          onNavigate={handleNavigate}
          buildingMode={isBuildingMode}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          identityLabel={identityLabel}
          identityKind={identityKind}
          onLogout={handleLogout}
          onRailExpand={setRailExpanded}
        />
        <div className={`st-main ${activePage === 'home' ? 'page-home' : ''}`}>
          {/* 1. Global Header with Anchored Alert Center */}
          <Header
            currentHour={currentHour}
            hourData={hourData}
            simParams={simParams}
            isOutage={hourData?.is_outage}
            isDisasterActive={Boolean(simParams.is_disaster_active && simParams.disaster_type && simParams.disaster_type !== 'none')}
            disasterType={simParams.disaster_type}
            currentMode={hourData?.mode}
            batteryHealth={simData?.battery_health}
            impactMetrics={simData?.impact_metrics}
            theme={theme}
            identityLabel={identityLabel}
            identityKind={identityKind}
          />

          {/* 2. Main Dashboard Content */}
          <main className="main-content st-content">
            {renderPage()}
          </main>
        </div>
      </div>

      {/* Floating PlayDay button on home / DriveEV / Disaster (shared hour state) */}
      {(['home', 'driveev', 'disaster'].includes(activePage) ||
        (isBuildingMode && (activePage === 'history30' || activePage === 'future5y'))) && !loading && (
        <PlayDayFab
          currentHour={currentHour}
          onHourChange={setCurrentHour}
          outageHours={simParams.outage_hours || []}
          hazardHour={simParams.is_disaster_active ? simParams.hazard_hour : null}
          onToggleHourOutage={handleToggleHourOutage}
          isDisasterActive={isDisasterActive}
          disasterType={simParams.disaster_type}
          disasterStart={simParams.disaster_start_hour ?? simParams.cyclone_start_hour ?? 12}
          disasterEnd={simParams.disaster_end_hour ?? simParams.cyclone_end_hour ?? 22}
          cycloneStart={simParams.cyclone_start_hour ?? 12}
          cycloneEnd={simParams.cyclone_end_hour ?? 22}
          onEndDisaster={() => handleParamChange({ is_disaster_active: false }, true)}
        />
      )}

      {/* Floating quick-insight drawers: per-building site renders building-
          scoped graphs, admin site keeps the campus graphs (single-graph mode:
          no tab/mode options, heading + graph only). */}
      <InsightDrawer
        open={insight === 'solar'}
        title={insightMeta.solar.title}
        subtitle={isBuildingMode ? `Rooftop Solar PV • ${buildingName} live telemetry` : insightMeta.solar.sub}
        onClose={() => setInsight(null)}
      >
        {isBuildingMode ? (
          <BuildingSolarChart
            buildingName={buildingName}
            hourly={simData?.hourly || []}
            solarForecast={simData?.solar_forecast}
            currentHour={currentHour}
          />
        ) : (
          <SolarForecastPanel solarForecast={simData?.solar_forecast} />
        )}
      </InsightDrawer>

      <InsightDrawer
        open={insight === 'demand'}
        title={insightMeta.demand.title}
        subtitle={isBuildingMode ? `${buildingName} demand vs 1h-lookahead prediction ±3.8% MAPE` : insightMeta.demand.sub}
        onClose={() => setInsight(null)}
        width={980}
      >
        {isBuildingMode ? (
          <BuildingDemandChart
            buildingName={buildingName}
            hourly={simData?.hourly || []}
            currentHour={currentHour}
          />
        ) : (
          <EnergyCharts
            hourlyData={simData?.hourly}
            currentHour={currentHour}
            hourData={hourData}
            trajectoryData={trajectoryData}
            demandAnalytics={simData?.demand_analytics}
            daysInService={simParams.days_in_service}
            currentRole={currentRole}
            initialTab="demand_pred"
            visibleTabs={['demand_pred']}
          />
        )}
      </InsightDrawer>

      <InsightDrawer
        open={insight === 'fairness'}
        title={insightMeta.fairness.title}
        subtitle={isBuildingMode ? `${buildingName} allocation & satisfaction ledger` : insightMeta.fairness.sub}
        onClose={() => setInsight(null)}
        width={980}
      >
        {isBuildingMode ? (
          <BuildingFairnessTable
            buildingName={buildingName}
            hourly={simData?.hourly || []}
            currentHour={currentHour}
          />
        ) : (
          <EnergyCharts
            hourlyData={simData?.hourly}
            currentHour={currentHour}
            hourData={hourData}
            trajectoryData={trajectoryData}
            demandAnalytics={simData?.demand_analytics}
            daysInService={simParams.days_in_service}
            currentRole={currentRole}
            initialTab="fairness_table"
            visibleTabs={['fairness_table']}
          />
        )}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => { setInsight(null); setIsFairnessOpen(true); }}>
            Open worked math modal →
          </button>
        </div>
      </InsightDrawer>

      <InsightDrawer
        open={insight === 'roi'}
        title={insightMeta.roi.title}
        subtitle={insightMeta.roi.sub}
        onClose={() => setInsight(null)}
      >
        <div className="st-roi-grid">
          <div><span>Daily savings</span><b>+₹{Number(finDaily).toLocaleString()}</b></div>
          <div><span>Monthly savings</span><b>₹{(Number(finMonthly) / 100000).toFixed(2)} Lakhs</b></div>
          <div><span>Annual savings</span><b>₹{(Number(finAnnual) / 100000).toFixed(2)} Lakhs</b></div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Odisha ToU: Peak (18:00–22:00) ₹8.50/kWh • Normal (06:00–18:00) ₹6.80/kWh • Off-peak (22:00–06:00) ₹4.50/kWh.
          Shared battery discharges during peak windows. Full audited breakdown is preserved on the Certificate page.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => { setInsight(null); handleNavigate('certificate'); }}>
            Open detailed Financial ROI view →
          </button>
        </div>
      </InsightDrawer>

      {/* 3. Pitch Slide Deck Modal (preserved for ?modal=pitch deep links) */}
      {isPitchOpen && (
        <PitchModal
          isOpen={isPitchOpen}
          onClose={() => setIsPitchOpen(false)}
          simData={simData}
          impactMetrics={simData?.impact_metrics}
          batteryHealth={simData?.battery_health}
          drievSummary={simData?.driev_fleet_summary}
        />
      )}

      {/* 4. Max-Min Fairness Formula & Worked Example Modal */}
      {isFairnessOpen && (
        <FairnessModal
          isOpen={isFairnessOpen}
          onClose={() => setIsFairnessOpen(false)}
          hourData={hourData}
        />
      )}

      {/* 5. Official Regulatory & Fairness Audit Certificate Modal (preserved for ?modal=audit deep links) */}
      {isAuditOpen && (
        <AuditModal
          isOpen={isAuditOpen}
          onClose={() => setIsAuditOpen(false)}
          simData={simData}
        />
      )}

      {/* 6. Algorithmic Without S24 vs With S24 Comparison Modal (preserved for ?modal=compare deep links) */}
      {isCompareOpen && (
        <ComparisonModal
          isOpen={isCompareOpen}
          onClose={() => setIsCompareOpen(false)}
          simData={simData}
        />
      )}
    </div>
  );
}
