import React from 'react';
import { Zap, BatteryCharging, Shield, Info, Battery, Bike, Sparkles, Navigation, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

function computeDynamicFleetState(hour = 12, isOutage = false) {
  const isNight = (hour >= 20 || hour < 8);          // 8:00 PM to 8:00 AM (Strictly ALL 12 CHARGING, 0 on ride, 0 available)
  const isMorningOffpeak = (hour >= 8 && hour <= 11);// 8:00 AM to 12:00 PM (Moderate: 4 on ride, 5 available, 3 charging)
  const isMiddayPeak = (hour === 12);                // 12:00 PM to 1:00 PM (Lunch Peak: 8 on ride, 2 available, 2 charging)
  const isAfternoonOffpeak = (hour >= 13 && hour <= 14); // 1:00 PM to 3:00 PM (Moderate: 4 on ride, 5 available, 3 charging)
  const isAfternoonPeak = (hour >= 15 && hour <= 18);    // 3:00 PM to 7:00 PM (Afternoon Peak: 8 on ride, 2 available, 2 charging)
  const isEveningReturn = (hour === 19);             // 7:00 PM to 8:00 PM (Return: 2 on ride, 3 available, 7 charging)

  const isPeak = isMiddayPeak || isAfternoonPeak;
  const isOffpeak = isMorningOffpeak || isAfternoonOffpeak;

  const scooters = [];

  // 7 Speed Tier scooters (IDs: driEV-Speed-01 to driEV-Speed-07, 2.5 kWh, 0.5 kW charger)
  for (let i = 1; i <= 7; i++) {
    let status = 'CHARGING';
    let soc = 80;

    if (isNight) {
      // Rule 1: Strictly ALL 7 Speed scooters CHARGING overnight
      status = 'CHARGING';
      soc = Math.min(100, Math.round(58 + ((hour + 4) % 24) * 3.5 + i * 2.0));
    } else if (isPeak) {
      // 5 on ride, 1 charging, 1 available
      if ([1, 2, 4, 5, 6].includes(i)) {
        status = 'ON RIDE';
        soc = Math.max(35, Math.round(86 - (i * 6 + ((hour - 12) * 5) % 20)));
      } else if (i === 3) {
        status = 'CHARGING';
        soc = 65;
      } else {
        status = 'AVAILABLE';
        soc = 92;
      }
    } else if (isOffpeak) {
      // 2 on ride, 3 available, 2 charging
      if ([1, 4].includes(i)) {
        status = 'ON RIDE';
        soc = Math.max(45, Math.round(84 - (i * 5)));
      } else if ([3, 5, 7].includes(i)) {
        status = 'AVAILABLE';
        soc = 90;
      } else {
        status = 'CHARGING';
        soc = Math.min(96, Math.round(62 + (hour * 2 + i * 3)));
      }
    } else {
      // 19:00 Evening return: 1 on ride, 2 available, 4 charging
      if (i === 1) {
        status = 'ON RIDE';
        soc = 42;
      } else if ([5, 7].includes(i)) {
        status = 'AVAILABLE';
        soc = 95;
      } else {
        status = 'CHARGING';
        soc = Math.min(90, Math.round(55 + i * 5));
      }
    }

    if (isOutage && status === 'CHARGING') {
      status = 'AVAILABLE';
    }

    const rangeKm = Number(((2.5 * (soc / 100)) * 14).toFixed(1));

    scooters.push({
      id: `driEV-Speed-${String(i).padStart(2, '0')}`,
      tier: 'Speed',
      capacity_kwh: 2.5,
      soc_pct: soc,
      range_km: rangeKm,
      status: status,
      charger_kw: 0.5,
      emergency_opt_in: i <= 5,
    });
  }

  // 5 Luxe Tier scooters (IDs: driEV-Luxe-01 to driEV-Luxe-05, 3.0 kWh, 0.7 kW charger)
  for (let i = 1; i <= 5; i++) {
    let status = 'CHARGING';
    let soc = 85;

    if (isNight) {
      // Rule 1: Strictly ALL 5 Luxe scooters CHARGING overnight
      status = 'CHARGING';
      soc = Math.min(100, Math.round(62 + ((hour + 4) % 24) * 3.2 + i * 2.5));
    } else if (isPeak) {
      // 3 on ride, 1 charging, 1 available
      if ([1, 3, 4].includes(i)) {
        status = 'ON RIDE';
        soc = Math.max(38, Math.round(90 - (i * 7 + ((hour - 12) * 4) % 18)));
      } else if (i === 2) {
        status = 'CHARGING';
        soc = 70;
      } else {
        status = 'AVAILABLE';
        soc = 95;
      }
    } else if (isOffpeak) {
      // 2 on ride, 2 available, 1 charging
      if ([2, 4].includes(i)) {
        status = 'ON RIDE';
        soc = Math.max(50, Math.round(86 - (i * 6)));
      } else if ([3, 5].includes(i)) {
        status = 'AVAILABLE';
        soc = 94;
      } else {
        status = 'CHARGING';
        soc = Math.min(98, Math.round(68 + (hour * 2 + i * 3)));
      }
    } else {
      // 19:00 Evening return: 1 on ride, 1 available, 3 charging
      if (i === 3) {
        status = 'ON RIDE';
        soc = 45;
      } else if (i === 5) {
        status = 'AVAILABLE';
        soc = 96;
      } else {
        status = 'CHARGING';
        soc = Math.min(92, Math.round(60 + i * 6));
      }
    }

    if (isOutage && status === 'CHARGING') {
      status = 'AVAILABLE';
    }

    const rangeKm = Number(((3.0 * (soc / 100)) * 15).toFixed(1));

    scooters.push({
      id: `driEV-Luxe-${String(i).padStart(2, '0')}`,
      tier: 'Luxe',
      capacity_kwh: 3.0,
      soc_pct: soc,
      range_km: rangeKm,
      status: status,
      charger_kw: 0.7,
      emergency_opt_in: i <= 3,
    });
  }

  // Derive counts directly from the array of 12 scooters
  const availableCount = scooters.filter(s => s.status === 'AVAILABLE').length;
  const chargingCount = scooters.filter(s => s.status === 'CHARGING').length;
  const onRideCount = scooters.filter(s => s.status === 'ON RIDE' || s.status === 'ON_RIDE').length;
  const totalDemandKw = Number(scooters.filter(s => s.status === 'CHARGING').reduce((acc, s) => acc + s.charger_kw, 0).toFixed(1));

  return {
    charging_count: chargingCount,
    available_count: availableCount,
    on_ride_count: onRideCount,
    charging_bay_demand_kw: totalDemandKw,
    scooters: scooters,
  };
}

export default function EVFleetPanel({ 
  drievSummary, 
  hourlyData = [], 
  currentHour = 12, 
  hourData 
}) {
  const isOutage = hourData?.is_outage;
  const currentSurplusSoak = hourData?.driev_solar_surplus_redirected_kw || 0;
  const emergencyBufferUsed = hourData?.driev_emergency_buffer_used_kw || 0;

  // Derived strictly from the hour for instantaneous, synchronous reactivity
  const dynamicState = computeDynamicFleetState(currentHour, isOutage);

  // If backend provided matching hourly scooters, use them; otherwise use dynamicState
  const scooters = (hourData?.driev_fleet?.scooters && hourData.driev_fleet.scooters.length === 12)
    ? hourData.driev_fleet.scooters.map(s => ({
        ...s,
        status: s.status === 'ON_RIDE' ? 'ON RIDE' : s.status
      }))
    : dynamicState.scooters;

  // Direct derived calculations from the 12-scooter array
  const availableCount = scooters.filter(s => s.status === 'AVAILABLE').length;
  const chargingCount = scooters.filter(s => s.status === 'CHARGING').length;
  const onRideCount = scooters.filter(s => s.status === 'ON RIDE' || s.status === 'ON_RIDE').length;
  const totalDemandKw = Number(scooters.filter(s => s.status === 'CHARGING').reduce((acc, s) => acc + (s.charger_kw || (s.tier === 'Speed' ? 0.5 : 0.7)), 0).toFixed(1));
  const emergencyBufferKw = hourData?.driev_fleet?.emergency_buffer_available_kw ?? 3.5;

  // Prepare 24h driEV profile time-series data
  const drievTimeSeries = hourlyData.map(h => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    hourNum: h.hour,
    surplusSoak: Number((h.driev_solar_surplus_redirected_kw || 0).toFixed(2)),
    emergencyBuffer: Number((h.driev_emergency_buffer_used_kw || 0).toFixed(2)),
    isOutage: h.is_outage,
  }));

  // Dynamic surplus soak reason
  const totalSolarKw = hourData?.blocks?.reduce((acc, b) => acc + (b.solar_kw || 0), 0) || 0;
  
  const getSoakStatusText = () => {
    if (isOutage) {
      return `Emergency micro-buffer active (+${emergencyBufferUsed.toFixed(1)} kW injected into microgrid)`;
    }
    if (currentSurplusSoak > 0) {
      return `Absorbing +${currentSurplusSoak.toFixed(1)} kW midday rooftop solar surplus`;
    }
    if (totalSolarKw <= 0.01) {
      return '0.0 kW surplus soak — no solar generation at night (zero irradiance)';
    }
    return '0.0 kW surplus soak — solar generation is fully absorbed by campus demand this hour';
  };

  return (
    <div className="panel-card" style={{ overflow: 'visible' }}>
      <div className="panel-header">
        <div className="panel-title">
          <Bike size={16} color="#38bdf8" />
          <span>driEV &mdash; Campus Shared Electric Scooter Hub (12 Units)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="kpi-pill" style={{ 
            background: isOutage ? 'rgba(239,68,68,0.15)' : (currentSurplusSoak > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.15)'),
            color: isOutage ? '#f87171' : (currentSurplusSoak > 0 ? '#34d399' : '#38bdf8'),
            border: `1px solid ${isOutage ? 'rgba(239,68,68,0.3)' : (currentSurplusSoak > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(56,189,248,0.3)')}`,
            fontWeight: 600,
            fontSize: '11px',
          }}>
            {isOutage 
              ? `Emergency Buffer: +${emergencyBufferUsed.toFixed(1)} kW` 
              : `Solar Surplus Soak: +${currentSurplusSoak.toFixed(1)} kW`}
          </span>
        </div>
      </div>

      <div className="panel-body" style={{ padding: '16px 20px 24px 20px' }}>
        {/* Dynamic Status Strip */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 8,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Charging at Bay</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#38bdf8' }}>
              {chargingCount} <span style={{ fontSize: '11px', color: '#64748b' }}>scooters</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Available for Booking</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>
              {availableCount} <span style={{ fontSize: '11px', color: '#64748b' }}>ready</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Active on Campus</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b' }}>
              {onRideCount} <span style={{ fontSize: '11px', color: '#64748b' }}>on ride</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Charging Bay Load</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#a78bfa' }}>
              {totalDemandKw.toFixed(1)} <span style={{ fontSize: '11px', color: '#64748b' }}>kW (Tier-4)</span>
            </div>
          </div>
        </div>

        {/* Dynamic Surplus Explanation Banner */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          fontSize: '11px',
          color: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 10,
          marginBottom: 12,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: currentSurplusSoak > 0 ? '#34d399' : '#94a3b8' }}>
            <Info size={13} />
            <span>{getSoakStatusText()}</span>
          </span>
          <span style={{ color: '#64748b' }}>
            Emergency Buffer Reserve: <b style={{ color: '#38bdf8' }}>{emergencyBufferKw.toFixed(1)} kW max</b>
          </span>
        </div>

        {/* All 12 Scooters Grid */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: '11px', color: '#94a3b8' }}>
            <span>Fleet Breakdown (7 Speed Tier + 5 Luxe Tier &bull; Total: 12 Units)</span>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>Hour {String(currentHour).padStart(2, '0')}:00 Telemetry</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
            {scooters.map((scooter, idx) => {
              const isSpeed = scooter.tier === 'Speed';
              const rawStatus = scooter.status || 'CHARGING';
              const displayStatus = (rawStatus === 'ON_RIDE' || rawStatus === 'ON RIDE') ? 'ON RIDE' : rawStatus;
              const statusColor = displayStatus === 'CHARGING' ? '#38bdf8' : (displayStatus === 'AVAILABLE' ? '#10b981' : '#f59e0b');
              const statusBg = displayStatus === 'CHARGING' ? 'rgba(56,189,248,0.15)' : (displayStatus === 'AVAILABLE' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)');

              return (
                <div 
                  key={idx} 
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <b style={{ color: '#f8fafc', fontSize: '11px' }}>{scooter.id}</b>
                      <span style={{ 
                        background: isSpeed ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                        color: isSpeed ? '#60a5fa' : '#c084fc',
                        fontSize: '9px',
                        padding: '1px 4px',
                        borderRadius: 3,
                        fontWeight: 700
                      }}>
                        {scooter.tier}
                      </span>
                    </div>

                    <span style={{ 
                      color: statusColor, 
                      background: statusBg,
                      border: `1px solid ${statusColor}40`,
                      fontSize: '9px', 
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 3,
                    }}>
                      {displayStatus}
                    </span>
                  </div>

                  {/* SoC Progress Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                      <span>SoC: {scooter.soc_pct}%</span>
                      <span>{scooter.range_km} km</span>
                    </div>
                    <div style={{ width: '100%', height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
                      <div 
                        style={{ 
                          width: `${scooter.soc_pct}%`, 
                          height: '100%', 
                          background: scooter.soc_pct > 35 ? '#10b981' : '#f59e0b',
                          borderRadius: 2 
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: '9px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{scooter.capacity_kwh || (isSpeed ? 2.5 : 3.0)} kWh pack</span>
                    <span>{scooter.charger_kw || (isSpeed ? 0.5 : 0.7)} kW charger</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 24-Hour Solar Surplus Absorption & Outage Buffer Chart */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
              24-Hour driEV Solar Surplus Absorption &amp; Emergency Buffer Injection
            </span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              Midday Solar Surplus Soak &bull; Outage Emergency Buffer
            </span>
          </div>

          <div style={{ width: '100%', height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drievTimeSeries} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="scooterSoakGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="scooterBufGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.7}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} dy={4} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" kW" width={45} />
                <Tooltip 
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 11 }}
                />
                <Area type="monotone" dataKey="surplusSoak" name="driEV Solar Soak" stroke="#38bdf8" fill="url(#scooterSoakGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="emergencyBuffer" name="Emergency Micro-Buffer" stroke="#10b981" fill="url(#scooterBufGrad)" strokeWidth={2} />
                <ReferenceLine x={`${String(currentHour).padStart(2, '0')}:00`} stroke="#f59e0b" strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
