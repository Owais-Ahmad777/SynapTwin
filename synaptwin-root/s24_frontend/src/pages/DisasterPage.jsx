import React from 'react';
import SandboxPanel from '../components/SandboxPanel';
import ExplainabilityPanel from '../components/ExplainabilityPanel';

// UI-ONLY relocation: sandbox + lexicographic ladder are primary modules here.
export default function DisasterPage(props) {
  const { simParams, onParamChange, onRunSimulation, onResetDemoDefaults, isRunning, simData, currentHour, hourData } = props;
  return (
    <div className="st-page">
      <div className="st-page-head">
        <div className="st-eyebrow">Resilience Ops</div>
        <h2 className="st-page-title">Disaster Management</h2>
        <p className="st-page-sub">Simulation sandbox and priority dispatch ladder.</p>
      </div>
      <div className="st-stack">
        <SandboxPanel
          simParams={simParams}
          onParamChange={onParamChange}
          onRunSimulation={onRunSimulation}
          onResetDemoDefaults={onResetDemoDefaults}
          isRunning={isRunning}
          batteryHealth={simData?.battery_health}
          outageComparison={simData?.outage_comparison}
          currentHour={currentHour}
        />
        <ExplainabilityPanel hourData={hourData} />
      </div>
    </div>
  );
}
