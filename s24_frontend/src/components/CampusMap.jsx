import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, X, Info, Building2, CheckCircle2 } from 'lucide-react';

export default function CampusMap({ 
  geoData, 
  currentHour = 12, 
  hourData, 
  currentRole = 'admin', 
  onSelectBuilding 
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const geojsonLayerRef = useRef(null);
  const markersLayerRef = useRef(null);

  const [clickedBuilding, setClickedBuilding] = useState(null);

  // Campus coordinates: SOA ITER Campus, Bhubaneswar (centroid of all 16 buildings: 20.2475° N, 85.8035° E)
  const CAMPUS_CENTER = [20.2475, 85.8035];

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: CAMPUS_CENTER,
      zoom: 16,
      minZoom: 14,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false,
    });

    // CartoDB Dark Matter tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // OpenStreetMap attribution (Directive 12 license requirement)
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, ODbL')
      .addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update GeoJSON Polygons (All 16 Buildings) and Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !geoData) return;

    if (geojsonLayerRef.current) {
      map.removeLayer(geojsonLayerRef.current);
    }
    if (markersLayerRef.current) {
      map.removeLayer(markersLayerRef.current);
    }

    const markersGroup = L.layerGroup().addTo(map);

    // Style resolver for all 16 buildings
    const getBuildingStyle = (feature) => {
      const name = feature?.properties?.name || '';
      const isOutage = hourData?.is_outage;

      // Find matching block in telemetry
      const blockMatch = hourData?.blocks?.find(b => 
        b.name.toLowerCase() === name.toLowerCase() ||
        (name.includes('Hostel 1') && (b.name.includes('Hostel 1') || b.name.includes('Hostel Block A'))) ||
        (name.includes('Hostel 7') && (b.name.includes('Hostel 7') || b.name.includes('Hostel Block B'))) ||
        (name.includes('C-block') && (b.name.includes('C-block') || b.name.includes('Academic')))
      );

      // Check for Fire Isolation on ANY selected building
      const isFireIso = blockMatch?.is_fire_isolated || 
                        blockMatch?.status?.includes('FIRE') || 
                        (hourData?.disaster_type === 'electrical_fire' && (
                          (hourData?.disaster_details?.isolated_building && (
                            name.toLowerCase().includes(hourData.disaster_details.isolated_building.toLowerCase()) ||
                            hourData.disaster_details.isolated_building.toLowerCase().includes(name.toLowerCase())
                          )) ||
                          (hourData?.disaster_details?.hotspot_building && hourData.disaster_details.hotspot_building.toLowerCase().includes(name.toLowerCase()))
                        ));

      if (isFireIso) {
        return {
          fillColor: '#ef4444',
          fillOpacity: 0.9,
          color: '#f87171',
          weight: 3.5,
          cursor: 'pointer',
          dashArray: '4, 4',
        };
      }

      // Pilot 1: Hostel 1 (Solar Exporter)
      if (name.includes('Hostel 1') || name.includes('Hostel Block A')) {
        return {
          fillColor: '#10b981',
          fillOpacity: 0.85,
          color: '#34d399',
          weight: 2.5,
          cursor: 'pointer',
        };
      }
      // Pilot 2: Hostel 7 (Net Importer / Hazard candidate)
      if (name.includes('Hostel 7') || name.includes('Hostel Block B')) {
        const isHazard = isOutage && (hourData?.disaster_type === 'monsoon_waterlogging' && hourData?.hour === 20);
        return {
          fillColor: isHazard ? '#ef4444' : '#3b82f6',
          fillOpacity: 0.85,
          color: isHazard ? '#f87171' : '#60a5fa',
          weight: 2.5,
          cursor: 'pointer',
        };
      }
      // Pilot 3: C-Block Academic
      if (name.includes('C-block') || name.includes('Academic Block C')) {
        return {
          fillColor: '#8b5cf6',
          fillOpacity: 0.85,
          color: '#a78bfa',
          weight: 2.5,
          cursor: 'pointer',
        };
      }

      // All Other Campus Buildings (Context)
      return {
        fillColor: '#334155',
        fillOpacity: 0.7,
        color: '#64748b',
        weight: 1.8,
        cursor: 'pointer',
      };
    };

    const geoLayer = L.geoJSON(geoData, {
      style: getBuildingStyle,
      onEachFeature: (feature, layer) => {
        try {
          const props = feature?.properties || {};
          const osmId = props.osm_id || 'Unknown';
          const rawName = props.name;
          const name = (rawName && rawName.trim()) ? rawName : `Unnamed Building #${osmId}`;
          const levels = props.levels ?? 1;
          const footprint = props.footprint_m2 ?? 0;
          const gfa = props.gross_floor_area_m2 ?? (footprint * levels);
          const bType = props.building_type || props.amenity || 'Institutional / Academic';

          // Match block telemetry
          const blockMatch = hourData?.blocks?.find(b => {
            const bLow = b.name.toLowerCase();
            const fLow = name.toLowerCase();
            if (bLow === fLow) return true;
            if (fLow.includes(bLow) || bLow.includes(fLow)) {
              if (bLow.includes('hostel') && fLow.includes('hostel')) {
                for (const num of ['1', '2', '7']) {
                  if (fLow.includes(num)) return bLow.includes(num);
                }
                return false;
              }
              for (const letter of ['a', 'c', 'd', 'f', 'g', 's']) {
                if (fLow.includes(`${letter}-block`) || fLow.includes(`block ${letter}`)) {
                  return bLow.includes(`${letter}-block`) || bLow.includes(`block ${letter}`);
                }
              }
              return true;
            }
            return false;
          });

          const isPilot = !!blockMatch;
          const isFireIso = Boolean(blockMatch?.is_fire_isolated || blockMatch?.status?.includes('FIRE') || blockMatch?.status?.includes('DISCONNECTED'));

          // 1. Tooltip for quick hover label on EVERY building
          layer.bindTooltip(`
            <div style="font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; color: #f8fafc;">
              ${name} ${isFireIso ? '<b style="color: #f87171;">[FIRE ISOLATED]</b>' : ''}
            </div>
          `, {
            sticky: true,
            direction: 'top',
            className: 'custom-leaflet-tooltip',
          });

          // 2. Rich popup for persistent click on EVERY building
          let popupContent = `
            <div style="font-family: 'Inter', sans-serif; font-size: 12px; min-width: 200px;">
              <div style="font-weight: 700; color: ${isFireIso ? '#f87171' : '#f8fafc'}; font-size: 13px; margin-bottom: 2px;">
                ${name}
              </div>
              <div style="color: #94a3b8; font-size: 10px; margin-bottom: 6px;">
                OSM ID: ${osmId} &bull; ${levels} Floor(s) &bull; ${footprint} m² Roof
              </div>
          `;

          if (blockMatch) {
            const servRatio = (isFireIso || blockMatch.load_kw <= 0.001)
              ? '0.0'
              : Math.min(100.0, ((blockMatch.solar_kw + blockMatch.allocated_kw) / blockMatch.load_kw) * 100.0).toFixed(1);

            popupContent += `
              <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                <div><span style="color: #94a3b8;">Demand:</span> <b style="color: ${isFireIso ? '#ef4444' : '#f8fafc'};">${blockMatch.load_kw.toFixed(1)} kW</b></div>
                <div><span style="color: #f59e0b;">Solar PV:</span> <b style="color: #fbbf24;">${blockMatch.solar_kw.toFixed(1)} kW</b></div>
                <div><span style="color: #10b981;">Battery:</span> <b style="color: ${isFireIso ? '#64748b' : '#34d399'};">${blockMatch.allocated_kw.toFixed(1)} kW</b></div>
                <div><span style="color: #ef4444;">Deficit:</span> <b style="color: #f87171;">${blockMatch.deficit_kw.toFixed(1)} kW</b></div>
              </div>
              <div style="margin-top: 4px; font-size: 11px; display: flex; justify-content: space-between; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 4px;">
                <span style="color: #94a3b8;">Service Ratio:</span>
                <b style="color: ${isFireIso ? '#f87171' : (Number(servRatio) < 99.9 ? '#f87171' : '#34d399')}; font-family: monospace;">${isFireIso ? '0.0% (DISCONNECTED)' : servRatio + '%'}</b>
              </div>
              ${isFireIso ? `
                <div style="color: #ef4444; font-size: 10px; margin-top: 4px; font-weight: 700;">
                  &#9888; MAIN RISER ISOLATED (FIRE PROTOCOL)
                </div>
              ` : `
                <div style="color: #38bdf8; font-size: 10px; margin-top: 4px; font-weight: 600;">
                  &#10003; Live Microgrid Telemetry Node
                </div>
              `}
            `;
          } else {
            popupContent += `
              <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; font-size: 11px; color: #94a3b8;">
                <div><b>Type:</b> ${bType}</div>
                <div><b>Gross Area:</b> ${gfa} m²</div>
                <div style="color: #64748b; margin-top: 2px; font-size: 10px;">
                  Connected to campus 11kV distribution grid.
                </div>
              </div>
            `;
          }

          popupContent += `</div>`;

          layer.bindPopup(popupContent, {
            className: 'custom-leaflet-popup',
            closeButton: true,
          });

          // 3. Event handlers
          layer.on({
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({ weight: 3.5, color: '#ffffff', fillOpacity: 0.95 });
            },
            mouseout: (e) => {
              geoLayer.resetStyle(e.target);
            },
            click: (e) => {
              console.log(`[CampusMap] Clicked building: OSM #${osmId} - "${name}"`);
              setClickedBuilding({
                ...props,
                osm_id: osmId,
                name,
                levels,
                footprint_m2: footprint,
                gross_floor_area_m2: gfa,
                building_type: bType,
                isPilot,
                blockData: blockMatch,
              });
              if (onSelectBuilding) onSelectBuilding(props);
            }
          });
        } catch (err) {
          console.error(`[CampusMap] Error binding building layer:`, feature, err);
        }
      }
    }).addTo(map);

    geojsonLayerRef.current = geoLayer;

    // Fit map bounds to encompass all 16 buildings on load
    try {
      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    } catch (e) {
      console.warn('[CampusMap] Could not fit bounds:', e);
    }

    // Shared Second-Life Battery Marker
    const batteryIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `<div style="background: #06b6d4; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 12px #06b6d4; display: flex; align-items: center; justify-content: center; color: black; font-weight: 800; font-size: 11px;">⚡</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker([20.2497, 85.8009], { icon: batteryIcon })
      .bindPopup(`
        <div style="font-family: 'Inter', sans-serif; font-size: 12px; padding: 4px;">
          <b style="color: #38bdf8; font-size: 13px;">Shared 2nd-Life Battery Bank</b>
          <div style="color: #94a3b8; margin-top: 4px;">
            Rated: 120 kW / 360 kWh<br/>
            Active Power: ${hourData?.battery_used_kw?.toFixed(1) || 0} / ${hourData?.battery_available_kw?.toFixed(1) || 120} kW
          </div>
        </div>
      `)
      .addTo(markersGroup);

    // driEV Scooter Hub Marker
    const drievIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `<div style="background: #38bdf8; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #38bdf8; display: flex; align-items: center; justify-content: center; color: black; font-size: 12px;">🛵</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    L.marker([20.2489, 85.8015], { icon: drievIcon })
      .bindPopup(`
        <div style="font-family: 'Inter', sans-serif; font-size: 12px;">
          <b style="color: #38bdf8;">driEV Campus Scooter Hub</b>
          <div style="color: #94a3b8; margin-top: 4px;">
            12 Shared Electric Scooters (Speed &amp; Luxe Tiers)<br/>
            Solar Surplus Absorption: ${hourData?.driev_solar_surplus_redirected_kw?.toFixed(1) || 0} kW
          </div>
        </div>
      `)
      .addTo(markersGroup);

    // Campus Medical Point Marker
    const medicalIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `<div style="background: #ef4444; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #ef4444; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: 800;">+</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    L.marker([20.2505, 85.8018], { icon: medicalIcon })
      .bindPopup(`
        <div style="font-family: 'Inter', sans-serif; font-size: 12px;">
          <b style="color: #f87171;">Tier-1 Life-Safety: Campus Medical Centre</b>
          <div style="color: #94a3b8; margin-top: 4px;">
            99.9% Critical Availability (ATS Protected)
          </div>
        </div>
      `)
      .addTo(markersGroup);

    // Dynamic Pulsing Fire Fault Marker positioned over the targeted building
    if (hourData?.disaster_type === 'electrical_fire' && geoData?.features) {
      const isolatedName = hourData?.disaster_details?.isolated_building || hourData?.disaster_details?.hotspot_building || '';
      const fireFeature = geoData.features.find(f => {
        const fn = (f.properties?.name || '').toLowerCase();
        const iso = isolatedName.toLowerCase();
        if (!fn || !iso) return false;
        if (fn === iso || iso.includes(fn) || fn.includes(iso)) return true;
        if (fn.includes('hostel') && iso.includes('hostel')) {
          for (const num of ['1', '2', '7']) {
            if (iso.includes(num)) return fn.includes(num);
          }
          return false;
        }
        for (const letter of ['a', 'c', 'd', 'f', 'g', 's']) {
          if (iso.includes(`${letter}-block`) || iso.includes(`block ${letter}`)) {
            return fn.includes(`${letter}-block`) || fn.includes(`block ${letter}`);
          }
        }
        return false;
      });

      if (fireFeature && fireFeature.geometry) {
        const polyCoords = fireFeature.geometry.coordinates?.[0];
        if (polyCoords && polyCoords.length > 0) {
          let latSum = 0, lonSum = 0;
          polyCoords.forEach(pt => {
            lonSum += pt[0];
            latSum += pt[1];
          });
          const centroidLat = latSum / polyCoords.length;
          const centroidLon = lonSum / polyCoords.length;

          const fireIcon = L.divIcon({
            className: 'custom-map-icon',
            html: `<div style="background: #ef4444; width: 30px; height: 30px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 16px #ef4444, 0 0 30px #f87171; display: flex; align-items: center; justify-content: center; color: white; font-size: 15px; animation: pulse 1.5s infinite;">🔥</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });

          L.marker([centroidLat, centroidLon], { icon: fireIcon })
            .bindPopup(`
              <div style="font-family: 'Inter', sans-serif; font-size: 12px; padding: 2px;">
                <b style="color: #ef4444; font-size: 13px;">🔥 Electrical Fire Fault Isolation</b>
                <div style="color: #f8fafc; font-weight: 700; margin-top: 2px;">${fireFeature.properties?.name || isolatedName}</div>
                <div style="color: #94a3b8; margin-top: 4px; font-size: 11px;">
                  Main Electrical Riser: <b style="color: #ef4444;">DISCONNECTED (0 kW)</b><br/>
                  Battery Power: <b style="color: #34d399;">+18.4 kW Redirected</b>
                </div>
              </div>
            `)
            .addTo(markersGroup);
        }
      }
    }

    markersLayerRef.current = markersGroup;

  }, [geoData, hourData]);

  return (
    <div className="panel-card" style={{ height: '100%', position: 'relative' }}>
      <div className="panel-header">
        <div className="panel-title">
          <Layers size={16} color="#10b981" />
          <span>SOA ITER Campus Digital Twin Map (All 16 Buildings Interactive)</span>
          <span className="kpi-pill" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
            Bhubaneswar (20.30° N, 85.82° E)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#94a3b8', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            Hostel 1 (Exporter)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
            Hostel 7 (Importer)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }}></span>
            C-Block (Academic)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b', display: 'inline-block' }}></span>
            13 Campus Buildings
          </span>
        </div>
      </div>

      <div className="panel-body" style={{ padding: 0, position: 'relative' }}>
        <div className="map-container" ref={mapContainerRef}>
          {/* Map Overlay Legend */}
          <div className="map-legend">
            <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 2 }}>SOA ITER 16-Building Map</div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#10b981' }}></div>
              <span>Hostel 1 (Single-story net solar exporter)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#3b82f6' }}></div>
              <span>Hostel 7 (6-story heavy net importer)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#8b5cf6' }}></div>
              <span>C-Block (Academic daytime peak load)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#475569' }}></div>
              <span>13 Other Real Buildings (Auditorium, Library, Admin, etc.)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#06b6d4' }}></div>
              <span>Shared 2nd-Life Battery (120 kW / 360 kWh)</span>
            </div>
          </div>

          {/* Click-to-Detail Floating Side Card */}
          {clickedBuilding && (
            <div 
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 290,
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 'var(--radius-md)',
                padding: '14px',
                zIndex: 600,
                boxShadow: 'var(--shadow-lg)',
                color: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <b style={{ fontSize: '13px', color: clickedBuilding.isPilot ? '#38bdf8' : '#e2e8f0' }}>
                  {clickedBuilding.name}
                </b>
                <button 
                  onClick={() => setClickedBuilding(null)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: 8 }}>
                OSM ID: {clickedBuilding.osm_id} &bull; {clickedBuilding.levels} Floor(s) &bull; {clickedBuilding.footprint_m2} m² Roof
              </div>

              {(() => {
                const liveData = hourData?.blocks?.find(b => b.name === clickedBuilding.name) || clickedBuilding.blockData;
                return liveData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Hour {currentHour}:00 Load:</span>
                      <b>{liveData.load_kw.toFixed(1)} kW</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#f59e0b' }}>Solar Generation:</span>
                      <b style={{ color: '#fbbf24' }}>{liveData.solar_kw.toFixed(1)} kW</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#10b981' }}>Battery Share:</span>
                      <b style={{ color: '#34d399' }}>{liveData.allocated_kw.toFixed(1)} kW</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#ef4444' }}>Deficit / Unmet:</span>
                      <b style={{ color: '#f87171' }}>{liveData.deficit_kw.toFixed(1)} kW</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: 4, marginTop: 2 }}>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>Service Ratio:</span>
                      {(() => {
                        const isFireIso = liveData.is_fire_isolated || liveData.status?.includes('FIRE') || liveData.status?.includes('DISCONNECTED');
                        const sRatio = (isFireIso || liveData.load_kw <= 0.001)
                          ? '0.0'
                          : Math.min(100.0, ((liveData.solar_kw + liveData.allocated_kw) / liveData.load_kw) * 100.0).toFixed(1);

                        return (
                          <b style={{ 
                            color: isFireIso ? '#f87171' : (Number(sRatio) >= 90 ? '#34d399' : (Number(sRatio) > 0 ? '#fbbf24' : '#f87171')),
                            fontFamily: 'monospace'
                          }}>
                            {isFireIso ? '0.0% (DISCONNECTED)' : `${sRatio}%`}
                          </b>
                        );
                      })()}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '11px' }}>
                      <span>Critical Reserve:</span>
                      <span>{liveData.critical_kw} kW</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, lineHeight: 1.4 }}>
                    <div><b>Building Type:</b> {clickedBuilding.building_type || 'Academic / Institutional'}</div>
                    <div><b>Gross Floor Area:</b> {clickedBuilding.gross_floor_area_m2} m²</div>
                    <div style={{ color: '#64748b', marginTop: 4 }}>
                      Campus building mapped in OpenStreetMap; connected to secondary distribution network.
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
