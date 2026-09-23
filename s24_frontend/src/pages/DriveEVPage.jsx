import React from 'react';
import EVFleetPanel from '../components/EVFleetPanel';
import EnergyCharts from '../components/EnergyCharts';

// UI-ONLY relocation: all DriveEV content lives here, reused verbatim.
// Battery 5-year life graph relocated here from homepage Section 4 (other
// Section 4 graphs removed entirely per homepage revision).
export default function DriveEVPage({ simData, currentHour, hourData, trajectoryData, demandAnalytics, daysInService, currentRole }) {
  return (
    <div className="st-page">
      <div className="st-page-head">
        <div className="st-eyebrow">Fleet Operations</div>
        <h2 className="st-page-title">DriveEV — Campus Scooter Hub</h2>
        <p className="st-page-sub">Fleet charging, solar soak, and V2G buffer.</p>
      </div>
      <EVFleetPanel
        drievSummary={simData?.driev_fleet_summary}
        hourlyData={simData?.hourly}
        currentHour={currentHour}
        hourData={hourData}
      />
      <div className="st-section-eyebrow">Battery Lifespan</div>
      <EnergyCharts
        hourlyData={simData?.hourly}
        currentHour={currentHour}
        hourData={hourData}
        trajectoryData={trajectoryData}
        demandAnalytics={demandAnalytics}
        daysInService={daysInService}
        currentRole={currentRole}
        initialTab="battery"
        visibleTabs={['battery']}
      />
    </div>
  );
}
