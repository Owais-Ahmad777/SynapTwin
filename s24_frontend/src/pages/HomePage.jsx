import React from 'react';
import { Sun, Zap, Scale, IndianRupee } from 'lucide-react';
import CampusMap from '../components/CampusMap';
import EnergyCharts from '../components/EnergyCharts';
import EnergyFlowDiagram from '../components/EnergyFlowDiagram';
import ExplainabilityPanel from '../components/ExplainabilityPanel';
import BuildingHistoryPage from './BuildingHistoryPage';
import BuildingViewer3D from '../components/BuildingViewer3D';
import PrivacyVault from '../components/PrivacyVault';

// UI-ONLY homepage composition. All data/calculation/graph components are reused
// verbatim — only ordering, hierarchy, and visual layout change per redesign spec.
export default function HomePage(props) {
  const {
    geoData, hourData, simData, simParams, trajectoryData,
    currentHour, currentRole,
    onOpenInsight,
    buildingMode = false,
    buildingName = null,
    buildingBlock = null,
    buildingDaily = null,
    buildingHourly24 = [],
  } = props;

  const totalSolarKw = hourData?.blocks?.reduce((a, b) => a + (b.solar_kw || 0), 0) || 0;
  const totalLoadKw = hourData?.blocks?.reduce((a, b) => a + (b.load_kw || 0), 0) || 0;
  const activeBlocks = hourData?.blocks?.filter((b) => b.load_kw > 0.001 && !(b.is_fire_isolated || b.status?.includes('FIRE') || b.status?.includes('DISCONNECTED'))) || [];
  const minServiceRatio = activeBlocks.length > 0
    ? Math.min(...activeBlocks.map((b) => Math.min(100.0, Math.round(((b.solar_kw + (b.allocated_kw || 0)) / b.load_kw) * 1000) / 10)))
    : 100.0;
  const dailyInrSaved = simData?.impact_metrics?.daily_inr_saved || simData?.financial_metrics?.daily_inr_saved || 21262;
  const monthlyInrSaved = simData?.impact_metrics?.monthly_inr_saved || simData?.financial_metrics?.monthly_inr_saved || 637860;

  const cards = [
    {
      id: 'solar',
      icon: Sun, color: '#f59e0b',
      label: 'Rooftop Solar PV',
      value: `${totalSolarKw.toFixed(1)} kW`,
      sub: totalSolarKw > 5 ? 'Active rooftop generation' : 'Night window (18:00–06:00)',
    },
    {
      id: 'demand',
      icon: Zap, color: '#ea580c',
      label: 'Campus Demand',
      value: `${totalLoadKw.toFixed(1)} kW`,
      sub: '16-building aggregate load',
    },
    {
      id: 'fairness',
      icon: Scale, color: '#dc2626',
      label: 'Max-Min Fairness',
      value: `${minServiceRatio.toFixed(1)}%`,
      sub: 'Min local-resource coverage',
    },
    {
      id: 'roi',
      icon: IndianRupee, color: '#b45309',
      label: 'Financial ROI (ToU)',
      value: `+₹${Number(dailyInrSaved).toLocaleString()}`,
      sub: `₹${(Number(monthlyInrSaved) / 100000).toFixed(1)}L/mo saved`,
    },
  ];

  // UI-ONLY per-building site: focused map + building insights + decision
  // panel only (no energy mix, no disaster tooling). Campus return below untouched.
  if (buildingMode && buildingBlock) {
    const bSolar = buildingBlock.solar_kw || 0;
    const bLoad = buildingBlock.load_kw || 0;
    const bAlloc = buildingBlock.allocated_kw || 0;
    const bRatio = buildingBlock.service_ratio_pct ?? (bLoad > 0.001
      ? Math.min(100, ((bSolar + bAlloc) / bLoad) * 100)
      : 100);
    const bDaily = buildingDaily || { solar: 0, load: 0, battery: 0 };
    const bClean = Number(bDaily.solar || 0) + Number(bDaily.battery || 0);
    const bCards = [
      {
        id: 'solar',
        icon: Sun, color: '#f59e0b',
        label: 'Rooftop Solar PV',
        value: `${bSolar.toFixed(1)} kW`,
        sub: `${Number(bDaily.solar || 0).toFixed(0)} kWh today`,
      },
      {
        id: 'demand',
        icon: Zap, color: '#ea580c',
        label: 'Building Demand',
        value: `${bLoad.toFixed(1)} kW`,
        sub: `${Number(bDaily.load || 0).toFixed(0)} kWh today`,
      },
      {
        id: 'fairness',
        icon: Scale, color: '#dc2626',
        label: 'Max-Min Fairness',
        value: `${Number(bRatio).toFixed(1)}%`,
        sub: 'solar + battery coverage',
      },
      {
        id: 'roi',
        icon: IndianRupee, color: '#b45309',
        label: 'Financial ROI (ToU)',
        value: `${bClean.toFixed(0)} kWh`,
        sub: 'clean energy today',
      },
    ];

    return (
      <div className="st-home">
        <section className="st-hero" aria-label={`${buildingName} digital twin`}>
          <div className="st-hero-head">
            <div className="st-eyebrow">{buildingName}</div>
            <h2 className="st-hero-title">{buildingName} energy twin</h2>
          </div>
          <div className="st-map-wrap map-hero">
            <BuildingViewer3D
              geoData={geoData}
              buildingName={buildingName}
              liveBlock={buildingBlock}
              hourData={hourData}
              currentHour={currentHour}
            />
            <div className="st-float-grid">
              {bCards.map((c) => {
                const Icon = c.icon;
                return (
                  <button key={c.id} type="button" className="st-float-card" onClick={() => onOpenInsight(c.id)}>
                    <span className="st-float-icon" style={{ color: c.color, borderColor: `${c.color}55`, background: `${c.color}14` }}>
                      <Icon size={15} />
                    </span>
                    <span className="st-float-text">
                      <span className="st-float-label">{c.label}</span>
                      <span className="st-float-value">{c.value}</span>
                      <span className="st-float-sub">{c.sub}</span>
                    </span>
                    <span className="st-float-cta">Open →</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <BuildingHistoryPage
          buildingName={buildingName}
          liveBlock={buildingBlock}
          daily={buildingDaily}
          hourly24={buildingHourly24}
          currentHour={currentHour}
        />

        <section className="st-section" aria-label="Building decision panel">
          <div className="st-section-eyebrow">Building Decision Brief</div>
          <ExplainabilityPanel hourData={hourData} hideTiers />
        </section>
      </div>
    );
  }

  return (
    <div className="st-home">
      {/* PlayDay lives in the floating button (App shell) on home/driveev/disaster */}
      {/* HERO: map is the centerpiece */}
      <section className="st-hero" aria-label="Campus digital twin map">
        <div className="st-map-wrap map-hero">
          <CampusMap
            geoData={geoData}
            hourData={hourData}
            currentHour={currentHour}
            currentRole={currentRole}
            onSelectBlock={(b) => console.log('Selected block:', b)}
          />
          {/* Floating quick-insight cards integrated around map edges */}
          <div className="st-float-grid">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.id} type="button" className="st-float-card" onClick={() => onOpenInsight(c.id)}>
                  <span className="st-float-icon" style={{ color: c.color, borderColor: `${c.color}55`, background: `${c.color}14` }}>
                    <Icon size={15} />
                  </span>
                  <span className="st-float-text">
                    <span className="st-float-label">{c.label}</span>
                    <span className="st-float-value">{c.value}</span>
                    <span className="st-float-sub">{c.sub}</span>
                  </span>
                  <span className="st-float-cta">Open →</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 1 — unchanged position and design */}
      <section className="st-section st-section-flow" aria-label="Instantaneous energy flow">
        <div className="st-section-eyebrow">Live Energy Flow</div>
        <EnergyFlowDiagram hourData={hourData} currentHour={currentHour} />
      </section>

      {/* SECTION 2 — Full Energy Mix only; all other graph options removed */}
      <section className="st-section" aria-label="Full energy mix">
        <div className="st-section-eyebrow">Generation Mix</div>
        <EnergyCharts
          hourlyData={simData?.hourly}
          currentHour={currentHour}
          hourData={hourData}
          trajectoryData={trajectoryData}
          demandAnalytics={simData?.demand_analytics}
          daysInService={simParams.days_in_service}
          currentRole={currentRole}
          initialTab="mix"
          visibleTabs={['mix']}
        />
      </section>

      {/* SECTION 3 — split sideways: blocks graph left, 16-building telemetry right */}
      <section className="st-section" aria-label="15 buildings balance and telemetry">
        <div className="st-section-eyebrow">Building Balance</div>
        <div className="st-split">
          <EnergyCharts
            hourlyData={simData?.hourly}
            currentHour={currentHour}
            hourData={hourData}
            trajectoryData={trajectoryData}
            demandAnalytics={simData?.demand_analytics}
            daysInService={simParams.days_in_service}
            currentRole={currentRole}
            initialTab="blocks"
            visibleTabs={['blocks']}
          />
          <PrivacyVault currentRole={currentRole} currentHour={currentHour} simData={simData} telemetryOnly />
        </div>
      </section>
    </div>
  );
}
