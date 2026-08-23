import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import KPIBanner from './components/KPIBanner';
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

export default function App() {
  const [isHistoryView] = useState(() => {
    return window.location.search.includes('view=history') || 
           window.location.pathname.startsWith('/history') ||
           window.location.hash.includes('history');
  });

  if (isHistoryView) {
    return <HistoryView />;
  }

  const [simData, setSimData] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [trajectoryData, setTrajectoryData] = useState([]);
  const [currentHour, setCurrentHour] = useState(12); // Default to hour 12 (midday)
  const [currentRole, setCurrentRole] = useState('admin');
  const [isPitchOpen, setIsPitchOpen] = useState(false);
  const [isFairnessOpen, setIsFairnessOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Simulation Parameters for the Interactive Sandbox (Full Presentation Scenario)
  const DEFAULT_SIM_PARAMS = {
    is_disaster_active: true,
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

  return (
    <div className="app-container">
      {/* 1. Global Header */}
      <Header 
        currentHour={currentHour}
        hourData={hourData}
        isOutage={hourData?.is_outage}
        isDisasterActive={Boolean(simParams.is_disaster_active && simParams.disaster_type && simParams.disaster_type !== 'none')}
        disasterType={simParams.disaster_type}
        currentMode={hourData?.mode}
        batteryHealth={simData?.battery_health}
        impactMetrics={simData?.impact_metrics}
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        onOpenPitch={() => setIsPitchOpen(true)}
        onOpenAudit={() => setIsAuditOpen(true)}
        onOpenCompare={() => setIsCompareOpen(true)}
        onResetDemoDefaults={handleResetDemoDefaults}
      />

      {/* 2. Main Dashboard Content */}
      <main className="main-content">
        {loading ? (
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
        ) : (
          <>
            {/* KPI Banner */}
            <KPIBanner 
              hourData={hourData}
              impactMetrics={simData?.impact_metrics}
              batteryHealth={simData?.battery_health}
              isDisasterActive={Boolean(simParams.is_disaster_active && simParams.disaster_type && simParams.disaster_type !== 'none')}
              disasterType={simParams.disaster_type}
              isCustomScenario={isCustom}
              onOpenFairnessModal={() => setIsFairnessOpen(true)}
            />

            {/* Timeline Controller with Live Manual Power Cut Button */}
            <TimelineController 
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

            {/* Main 2-Column Responsive Dashboard Layout */}
            <div className="grid-2col">
              {/* Left Column: Campus Spatial Map (Compact 240px) -> driEV Fleet Panel -> Microgrid Energy Analytics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. Compact 16-Building Campus Map */}
                <CampusMap 
                  geoData={geoData}
                  hourData={hourData}
                  currentHour={currentHour}
                  currentRole={currentRole}
                  onSelectBlock={(bName) => console.log('Selected block:', bName)}
                />

                {/* 2. driEV Smart Scooter Fleet & Solar Soak (Directly Below Map) */}
                <EVFleetPanel 
                  drievSummary={simData?.driev_fleet_summary}
                  hourlyData={simData?.hourly}
                  currentHour={currentHour}
                  hourData={hourData}
                />

                {/* 3. Real-Time Energy Flow Visualization (Section D) */}
                <EnergyFlowDiagram 
                  hourData={hourData}
                  currentHour={currentHour}
                />

                {/* 4. Microgrid Power Flow & Energy Analytics */}
                <EnergyCharts 
                  hourlyData={simData?.hourly}
                  currentHour={currentHour}
                  hourData={hourData}
                  trajectoryData={trajectoryData}
                  demandAnalytics={simData?.demand_analytics}
                  daysInService={simParams.days_in_service}
                  currentRole={currentRole}
                />
              </div>

              {/* Right Column: Sandbox (Top) -> Explainability -> Solar Forecast -> Privacy Vault */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. Judge & Operator Simulation Sandbox (Top of Right Column) */}
                <SandboxPanel 
                  simParams={simParams}
                  onParamChange={handleParamChange}
                  onRunSimulation={() => triggerSimulationRun(simParams)}
                  onResetDemoDefaults={handleResetDemoDefaults}
                  isRunning={isRunning}
                  batteryHealth={simData?.battery_health}
                  outageComparison={simData?.outage_comparison}
                  currentHour={currentHour}
                />

                {/* 2. Decision Explainability & Priority Triage */}
                <ExplainabilityPanel 
                  hourData={hourData}
                />

                {/* 3. Next-Day Solar Forecast Panel */}
                <SolarForecastPanel 
                  solarForecast={simData?.solar_forecast}
                />

                {/* 4. Cryptographic Privacy Vault & Role Boundaries */}
                <PrivacyVault 
                  currentRole={currentRole}
                  currentHour={currentHour}
                  simData={simData}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* 3. Pitch Slide Deck Modal */}
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

      {/* 5. Official Regulatory & Fairness Audit Certificate Modal */}
      {isAuditOpen && (
        <AuditModal 
          isOpen={isAuditOpen}
          onClose={() => setIsAuditOpen(false)}
          simData={simData}
        />
      )}

      {/* 6. Algorithmic Without S24 vs With S24 Comparison Modal (Section E) */}
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
