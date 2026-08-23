import React, { useEffect, useState } from 'react';
import { 
  Play, Pause, RotateCcw, ChevronLeft, ChevronRight, 
  Clock, Sun, Moon, AlertTriangle, Zap, Power, ShieldAlert, CheckCircle2 
} from 'lucide-react';

export default function TimelineController({ 
  currentHour, 
  onHourChange, 
  outageHours = [19, 20, 21], 
  hazardHour = null,
  onToggleHourOutage,
  isDisasterActive = false,
  disasterType = 'none',
  disasterStart = 12,
  disasterEnd = 22,
  cycloneStart = 12,
  cycloneEnd = 22,
  onEndDisaster,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 4x

  // Auto-play timer
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      const ms = 1200 / playbackSpeed;
      interval = setInterval(() => {
        onHourChange((prev) => (prev + 1) % 24);
      }, ms);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, onHourChange]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const resetToStart = () => {
    setIsPlaying(false);
    onHourChange(0);
  };
  const stepPrev = () => onHourChange((currentHour - 1 + 24) % 24);
  const stepNext = () => onHourChange((currentHour + 1) % 24);

  const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;
  const isDaylight = currentHour >= 6 && currentHour <= 18;

  const dStart = disasterStart ?? cycloneStart ?? 12;
  const dEnd = disasterEnd ?? cycloneEnd ?? 22;
  const causesOutage = disasterType !== 'heatwave_stress' && disasterType !== 'none';
  const isDisasterCut = isDisasterActive && causesOutage && (currentHour >= dStart && currentHour <= dEnd);
  const isCurrentOutage = outageHours.includes(currentHour) || isDisasterCut;

  const handleToggleCurrentOutage = () => {
    if (isDisasterCut) {
      if (onEndDisaster) {
        onEndDisaster();
        return;
      }
    }
    if (onToggleHourOutage) {
      onToggleHourOutage(currentHour);
    }
  };

  let btnLabel = '⚡ GRID ON (CLICK TO CUT POWER)';
  let btnTitle = `11kV Grid connected. Click to simulate an unexpected manual power cut at ${formatHour(currentHour)}.`;
  let btnBg = 'rgba(16, 185, 129, 0.15)';
  let btnColor = '#34d399';
  let btnBorder = '1px solid rgba(16, 185, 129, 0.4)';

  if (isDisasterCut) {
    const disasterName = disasterType === 'cyclone_severe_storm' ? 'CYCLONE' : (disasterType === 'grid_transformer_fault' ? 'FAULT' : 'DISASTER');
    btnLabel = `🚨 ${disasterName} ISLANDED (CLICK TO RESTORE)`;
    btnTitle = `Hour ${formatHour(currentHour)} is islanded under active disaster protocol (Hours ${dStart}–${dEnd}). Click to end protocol early and restore 11kV grid power.`;
    btnBg = disasterType === 'grid_transformer_fault' ? '#ef4444' : 'rgba(245, 158, 11, 0.2)';
    btnColor = disasterType === 'grid_transformer_fault' ? '#ffffff' : '#fbbf24';
    btnBorder = disasterType === 'grid_transformer_fault' ? '1px solid #ef4444' : '1px solid #f59e0b';
  } else if (isCurrentOutage) {
    btnLabel = '🚨 POWER CUT (CLICK TO RESTORE)';
    btnTitle = `Power is manually cut at ${formatHour(currentHour)}. Click to restore 11kV utility grid connection.`;
    btnBg = '#ef4444';
    btnColor = '#ffffff';
    btnBorder = '1px solid #ef4444';
  }

  return (
    <div className="timeline-panel">
      {/* Header Row */}
      <div className="timeline-header">
        <div className="timeline-clock">
          <Clock size={18} color="#10b981" />
          <span>{formatHour(currentHour)}</span>
          <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500, marginLeft: 6 }}>
            {isDaylight ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                <Sun size={14} /> Solar Window
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                <Moon size={14} /> Night Baseline
              </span>
            )}
          </span>

          {/* MANUAL LIVE POWER CUT TOGGLE BUTTON IN TIMELINE */}
          <button
            type="button"
            onClick={handleToggleCurrentOutage}
            style={{
              background: btnBg,
              color: btnColor,
              border: btnBorder,
              borderRadius: 'var(--radius-sm)',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginLeft: 8,
              boxShadow: isCurrentOutage ? (isDisasterCut ? '0 0 12px rgba(245, 158, 11, 0.4)' : '0 0 12px rgba(239, 68, 68, 0.4)') : 'none',
              transition: 'all 0.2s ease',
            }}
            title={btnTitle}
          >
            <Power size={13} />
            <span>{btnLabel}</span>
          </button>
        </div>

        {/* Playback Controls */}
        <div className="timeline-controls">
          <button className="btn-ctrl" onClick={stepPrev} title="Previous hour">
            <ChevronLeft size={16} />
          </button>
          
          <button 
            className={`btn-ctrl ${isPlaying ? 'active' : ''}`} 
            onClick={togglePlay}
            style={{ minWidth: 90 }}
          >
            {isPlaying ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Play Day</>}
          </button>

          <button className="btn-ctrl" onClick={stepNext} title="Next hour">
            <ChevronRight size={16} />
          </button>

          <button className="btn-ctrl" onClick={resetToStart} title="Reset to 00:00">
            <RotateCcw size={14} />
          </button>

          {/* Speed Buttons */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            {[1, 2, 4].map(spd => (
              <button 
                key={spd}
                className={`btn-ctrl ${playbackSpeed === spd ? 'active' : ''}`}
                style={{ padding: '4px 8px', fontSize: '11px' }}
                onClick={() => setPlaybackSpeed(spd)}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrubber & Markers */}
      <div className="timeline-slider-wrapper">
        <input 
          type="range" 
          min="0" 
          max="23" 
          value={currentHour} 
          onChange={(e) => onHourChange(Number(e.target.value))}
          className="timeline-slider"
          aria-label="Simulation Hour Timeline"
        />

        {/* 24-Hour Marks Grid */}
        <div className="timeline-hours-track">
          {Array.from({ length: 24 }).map((_, h) => {
            const isOutage = outageHours.includes(h);
            const isHazard = h === hazardHour;
            const isActive = h === currentHour;

            return (
              <div 
                key={h} 
                className={`timeline-hour-mark ${isActive ? 'active' : ''} ${isOutage ? 'outage' : ''}`}
                onClick={() => onHourChange(h)}
                title={`Hour ${h}:00 ${isOutage ? '(🚨 Power Cut Active - Click to view)' : '(⚡ Grid Connected)'} ${isHazard ? '(Hazard Active)' : ''}`}
                style={{
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <div>{h}</div>
                {isOutage && (
                  <div style={{ 
                    width: 5, 
                    height: 5, 
                    borderRadius: '50%', 
                    background: '#ef4444', 
                    boxShadow: '0 0 6px #ef4444',
                    margin: '2px auto 0' 
                  }}></div>
                )}
                {isHazard && !isOutage && (
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#f59e0b', margin: '2px auto 0' }}></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section C: Grid Recovery Status Banner */}
      {!isCurrentOutage && outageHours.includes((currentHour - 1 + 24) % 24) && (
        <div style={{
          marginTop: 10,
          padding: '6px 12px',
          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '11px',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 600,
        }}>
          <CheckCircle2 size={14} color="#34d399" />
          <span>⚡ Grid restored &mdash; critical loads stable, restoring remaining tiers (Tier 3 dormitories &amp; Tier 4 flexible loads).</span>
        </div>
      )}
    </div>
  );
}
