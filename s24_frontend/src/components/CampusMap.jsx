import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers, X, Box } from 'lucide-react';

// Free, no-API-key satellite imagery (real aerial photography — Esri World Imagery).
// This replaces the old abstract/schematic dark basemap with actual, geographically
// accurate ground truth for the campus (roads, trees, roof colours, parking, etc).
const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION =
  'Imagery &copy; Esri, Maxar, Earthstar Geographics | Buildings &copy; OpenStreetMap contributors, ODbL';

function fireDivIcon(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.firstElementChild;
}

// Campus framing helpers: tight bbox around real footprints, a dim-mask hole
// just outside campus, and roam limits that keep the map freely movable while
// hiding irrelevant far-away area.
function expandBounds(b, delta) {
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return new maplibregl.LngLatBounds(
    [sw.lng - delta, sw.lat - delta],
    [ne.lng + delta, ne.lat + delta]
  );
}

function boundsRing(b) {
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return [
    [sw.lng, sw.lat],
    [ne.lng, sw.lat],
    [ne.lng, ne.lat],
    [sw.lng, ne.lat],
    [sw.lng, sw.lat],
  ];
}

export default function CampusMap({
  geoData,
  currentHour = 12,
  hourData,
  currentRole = 'admin',
  onSelectBuilding,
  focusName = null,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const markersRef = useRef([]);
  const popupRef = useRef(null);
  const handlersBoundRef = useRef(false);

  const [clickedBuilding, setClickedBuilding] = useState(null);
  const [is3D, setIs3D] = useState(true);

  // Campus coordinates: SOA ITER Campus, Bhubaneswar (centroid of all 16 buildings: 20.2475° N, 85.8035° E)
  const CAMPUS_CENTER = [85.8035, 20.2475]; // MapLibre uses [lon, lat]

  // UI-ONLY per-building focus matcher (fuzzy; hostel numbers guarded so
  // "Hostel 1" never matches "Hostel 2"/"Hostel 7").
  const normName = (s) => (s || '').toLowerCase().trim();
  const matchesFocus = (candidateName) => {
    if (!focusName) return false;
    const f = normName(candidateName);
    const t = normName(focusName);
    if (!f || !t) return false;
    if (f === t || f.includes(t) || t.includes(f)) {
      if (t.includes('hostel')) {
        const td = (t.match(/\d+/) || [])[0];
        const fd = (f.match(/\d+/) || [])[0];
        if (td || fd) return td === fd;
      }
      return true;
    }
    return false;
  };

  // ---- Building -> block telemetry matcher (same rules as the previous renderer) ----
  const matchBlock = (name) => {
    const blocks = hourData?.blocks || [];
    const fLow = (name || '').toLowerCase();
    return blocks.find(b => {
      const bLow = b.name.toLowerCase();
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
  };

  // Full disaster-aware fire-isolation check (same rules as the previous renderer,
  // incl. isolated-building / hotspot matching with hostel + block-letter guards).
  const isFireIsolated = (name, blockMatch) => {
    if (blockMatch?.is_fire_isolated || blockMatch?.status?.includes('FIRE') || blockMatch?.status?.includes('DISCONNECTED')) {
      return true;
    }
    if (hourData?.disaster_type !== 'electrical_fire') return false;
    const iso = (hourData?.disaster_details?.isolated_building || '').toLowerCase();
    const hot = (hourData?.disaster_details?.hotspot_building || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (!n) return false;
    const matchIso = (target) => {
      if (!target) return false;
      if (n === target || n.includes(target) || target.includes(n)) return true;
      if (n.includes('hostel') && target.includes('hostel')) {
        for (const num of ['1', '2', '7']) {
          if (target.includes(num)) return n.includes(num);
        }
        return false;
      }
      for (const letter of ['a', 'c', 'd', 'f', 'g', 's']) {
        if (target.includes(`${letter}-block`) || target.includes(`block ${letter}`)) {
          return n.includes(`${letter}-block`) || n.includes(`block ${letter}`);
        }
      }
      return false;
    };
    return matchIso(iso) || (hot ? n.includes(hot) || hot.includes(n) : false);
  };

  // Site palette (red-orange-chrome-yellow family): exporter amber, importer
  // burnt orange, academic bronze, context warm grey. Hazard red unchanged.
  const roleColor = (name, isFireIso) => {
    if (isFireIso) return { fill: '#ef4444', line: '#f87171' };
    if (name.includes('Hostel 1') || name.includes('Hostel Block A')) return { fill: '#f59e0b', line: '#ffb703' };
    if (name.includes('Hostel 7') || name.includes('Hostel Block B')) {
      const isHazard = hourData?.is_outage && hourData?.disaster_type === 'monsoon_waterlogging' && hourData?.hour === 20;
      return isHazard ? { fill: '#ef4444', line: '#f87171' } : { fill: '#ea580c', line: '#fb923c' };
    }
    if (name.includes('C-block') || name.includes('Academic Block C')) return { fill: '#b45309', line: '#d97706' };
    return { fill: '#78716c', line: '#a8a29e' };
  };

  // Build an enriched copy of the GeoJSON with per-feature paint properties baked in,
  // plus a real extrusion height (height_m from campus_geo.py: levels x 3.5m floor height —
  // verified from OSM building:levels where available, clearly-flagged estimates otherwise).
  const buildEnrichedGeoJSON = () => {
    if (!geoData?.features) return null;
    return {
      ...geoData,
      features: geoData.features.map((f) => {
        const props = f.properties || {};
        const name = (props.name && props.name.trim()) ? props.name : `Unnamed Building #${props.osm_id || ''}`;
        const blockMatch = matchBlock(name);
        const isFireIso = isFireIsolated(name, blockMatch);
        const { fill, line } = roleColor(name, isFireIso);
        const heightM = props.height_m ?? ((props.levels ?? 1) * 3.5);
        return {
          ...f,
          properties: {
            ...props,
            resolved_name: name,
            fill_color: fill,
            line_color: line,
            is_fire_iso: isFireIso,
            is_pilot: !!blockMatch,
            extrude_height: heightM,
          },
        };
      }),
    };
  };

  // ---- Initialize map (once) ----
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [SATELLITE_TILE_URL],
            tileSize: 256,
            maxzoom: 19,
            attribution: SATELLITE_ATTRIBUTION,
          },
        },
        layers: [
          { id: 'satellite', type: 'raster', source: 'satellite' },
        ],
      },
      center: CAMPUS_CENTER,
      zoom: 17.5,
      minZoom: 16,
      maxZoom: 20,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      pitch: 55,
      bearing: -17,
      antialias: true,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '260px' });

    map.on('load', () => {
      mapLoadedRef.current = true;
      mapInstanceRef.current = map;
      setIs3D((v) => v);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      mapLoadedRef.current = false;
      handlersBoundRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Toggle 2D / 3D tilt ----
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoadedRef.current) return;
    map.easeTo({ pitch: is3D ? 55 : 0, duration: 500 });
    if (map.getLayer('buildings-3d')) {
      map.setPaintProperty('buildings-3d', 'fill-extrusion-height', is3D ? ['get', 'extrude_height'] : 0.3);
    }
  }, [is3D]);

  // ---- Draw / update the 3D extruded buildings + markers whenever data changes ----
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoadedRef.current || !geoData) return;

    const enriched = buildEnrichedGeoJSON();
    if (!enriched) return;

    // Tight campus frame from real footprints: dim everything outside it so
    // only ITER campus + a small surround stays vivid. Map remains fully
    // movable/zoomable/rotatable inside the roam limits.
    const campusBounds = new maplibregl.LngLatBounds();
    enriched.features.forEach((f) => {
      (f.geometry.coordinates[0] || []).forEach((coord) => campusBounds.extend(coord));
    });
    const hole = expandBounds(campusBounds, 0.0007);
    const roam = expandBounds(campusBounds, 0.0012);
    map.setMaxBounds(roam);
    const maskData = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]],
            boundsRing(hole),
          ],
        },
      }],
    };

    const applyLayers = () => {
      const src = map.getSource('campus-buildings');
      if (src) {
        src.setData(enriched);
      } else {
        map.addSource('campus-buildings', { type: 'geojson', data: enriched, generateId: true });
        map.addSource('campus-mask', { type: 'geojson', data: maskData });
        // Dim-mask sits above satellite but below every building layer, so
        // roads/trees/cars stay vivid inside campus and fade outside it.
        map.addLayer({
          id: 'area-dim',
          type: 'fill',
          source: 'campus-mask',
          paint: { 'fill-color': '#000000', 'fill-opacity': 0.55 },
        });

        map.addLayer({
          id: 'buildings-fill',
          type: 'fill',
          source: 'campus-buildings',
          paint: {
            'fill-color': ['get', 'fill_color'],
            'fill-opacity': 0.25,
          },
        });

        // Real 3D extrusion — height comes from levels x 3.5m floor height
        // (OSM-verified where tagged, transparently-estimated otherwise — see campus_geo.py)
        map.addLayer({
          id: 'buildings-3d',
          type: 'fill-extrusion',
          source: 'campus-buildings',
          paint: {
            'fill-extrusion-color': ['get', 'fill_color'],
            'fill-extrusion-height': is3D ? ['get', 'extrude_height'] : 0.3,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.92,
            // Vertical gradient shades walls darker toward the base for depth.
            'fill-extrusion-vertical-gradient': true,
          },
        });

        map.addLayer({
          id: 'buildings-outline',
          type: 'line',
          source: 'campus-buildings',
          paint: {
            'line-color': ['get', 'line_color'],
            'line-width': 2.5,
          },
        });

        // Floating building names above the rooftops.
        map.addLayer({
          id: 'building-labels',
          type: 'symbol',
          source: 'campus-buildings',
          minzoom: 14,
          layout: {
            'text-field': ['get', 'resolved_name'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-offset': [0, -1.6],
            'text-anchor': 'top',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#04060c',
            'text-halo-width': 2,
          },
        });
      }

      // UI-ONLY per-building focus (supervisor mode): spotlight + zoom to the
      // selected building and auto-open its detail card. Campus view (no
      // focusName) keeps the global fit exactly as before.
      if (map.getLayer('buildings-focus')) map.removeLayer('buildings-focus');
      if (focusName) {
        const target = enriched.features.find((f) => matchesFocus(f.properties?.resolved_name || ''));
        if (target) {
          map.addLayer({
            id: 'buildings-focus',
            type: 'line',
            source: 'campus-buildings',
            paint: { 'line-color': '#ffffff', 'line-width': 4 },
            filter: ['==', ['get', 'resolved_name'], target.properties.resolved_name],
          });
          try {
            const fb = new maplibregl.LngLatBounds();
            (target.geometry.coordinates[0] || []).forEach((coord) => fb.extend(coord));
            map.fitBounds(fb, { padding: 80, maxZoom: 18 });
          } catch (e) {
            console.warn('[CampusMap] Could not fit focus bounds:', e);
          }
          const fp = target.properties || {};
          const fBlock = matchBlock(fp.resolved_name);
          setClickedBuilding({
            ...fp,
            osm_id: fp.osm_id,
            name: fp.resolved_name,
            levels: fp.levels,
            levels_verified: fp.levels_verified,
            footprint_m2: fp.footprint_m2,
            gross_floor_area_m2: fp.gross_floor_area_m2,
            building_type: fp.building_type || fp.amenity || 'Institutional / Academic',
            isPilot: !!fBlock,
            blockData: fBlock,
          });
        }
      } else {
        try {
          const bounds = new maplibregl.LngLatBounds();
          enriched.features.forEach((f) => {
            (f.geometry.coordinates[0] || []).forEach((coord) => bounds.extend(coord));
          });
          map.fitBounds(bounds, { padding: 24, duration: 0 });
        } catch (e) {
          console.warn('[CampusMap] Could not fit bounds:', e);
        }
      }

      // Interaction handlers bound once (this effect re-runs on every data tick).
      if (!handlersBoundRef.current) {
        handlersBoundRef.current = true;

        map.on('mousemove', 'buildings-3d', (e) => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'buildings-3d', () => {
          map.getCanvas().style.cursor = '';
        });

        map.on('click', 'buildings-3d', (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const props = feature.properties || {};
          const blockMatch = matchBlock(props.resolved_name);

          setClickedBuilding({
            ...props,
            osm_id: props.osm_id,
            name: props.resolved_name,
            levels: props.levels,
            levels_verified: props.levels_verified,
            footprint_m2: props.footprint_m2,
            gross_floor_area_m2: props.gross_floor_area_m2,
            building_type: props.building_type || props.amenity || 'Institutional / Academic',
            isPilot: props.is_pilot === 'true' || props.is_pilot === true,
            blockData: blockMatch,
          });
          if (onSelectBuilding) onSelectBuilding(props);

          popupRef.current
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family: 'Inter', sans-serif; font-size: 12px; min-width: 180px;">
                <div style="font-weight:700; color:${props.is_fire_iso === 'true' || props.is_fire_iso === true ? '#f87171' : '#0f172a'}; font-size:13px;">
                  ${props.resolved_name}
                </div>
                <div style="color:#475569; font-size:10px; margin-top:2px;">
                  ${props.levels} Floor(s)${props.levels_verified === false || props.levels_verified === 'false' ? ' (est.)' : ' (OSM-verified)'} &bull; ${props.footprint_m2} m&sup2; Roof &bull; ${props.extrude_height}m tall
                </div>
              </div>
            `)
            .addTo(map);
        });
      }
    };

    if (map.isStyleLoaded()) {
      applyLayers();
    } else {
      map.once('idle', applyLayers);
    }

    // ---- Point markers (battery, driEV hub, medical, fire fault) ----
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const addPointMarker = (lngLat, html, popupHtml) => {
      const marker = new maplibregl.Marker({ element: fireDivIcon(html) })
        .setLngLat(lngLat)
        .setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(popupHtml))
        .addTo(map);
      markersRef.current.push(marker);
    };

    // Node sizes scale with live activity (presentation only — values unchanged).
    const batUse = hourData?.battery_used_kw || 0;
    const batAvail = Math.max(1, hourData?.battery_available_kw || 120);
    const batSize = 26 + Math.round(10 * Math.min(1, batUse / batAvail));
    const drievFlow = (hourData?.driev_solar_surplus_redirected_kw || 0) + (hourData?.driev_emergency_buffer_used_kw || 0);
    const drievSize = 22 + Math.min(10, Math.round(drievFlow * 2));

    addPointMarker(
      [85.8009, 20.2497],
      `<div style="background:#f59e0b;width:${batSize}px;height:${batSize}px;border-radius:50%;border:2px solid white;box-shadow:0 0 12px #f59e0b;display:flex;align-items:center;justify-content:center;color:black;font-weight:800;font-size:11px;">⚡</div>`,
      `<div style="font-family:'Inter',sans-serif;font-size:12px;"><b style="color:#92400e;">Shared 2nd-Life Battery Bank</b><div style="color:#475569;margin-top:4px;">Rated: 120 kW / 360 kWh<br/>Active: ${hourData?.battery_used_kw?.toFixed(1) || 0} / ${hourData?.battery_available_kw?.toFixed(1) || 120} kW</div></div>`
    );

    addPointMarker(
      [85.8015, 20.2489],
      `<div style="background:#ea580c;width:${drievSize}px;height:${drievSize}px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px #ea580c;display:flex;align-items:center;justify-content:center;color:black;font-size:12px;">🛵</div>`,
      `<div style="font-family:'Inter',sans-serif;font-size:12px;"><b style="color:#92400e;">driEV Campus Scooter Hub</b><div style="color:#475569;margin-top:4px;">12 Shared Electric Scooters<br/>Solar Surplus Absorbed: ${hourData?.driev_solar_surplus_redirected_kw?.toFixed(1) || 0} kW</div></div>`
    );

    addPointMarker(
      [85.8018, 20.2505],
      `<div style="background:#ef4444;width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px #ef4444;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:800;">+</div>`,
      `<div style="font-family:'Inter',sans-serif;font-size:12px;"><b style="color:#dc2626;">Tier-1 Life-Safety: Campus Medical Centre</b><div style="color:#475569;margin-top:4px;">99.9% Critical Availability (ATS Protected)</div></div>`
    );

    if (hourData?.disaster_type === 'electrical_fire' && geoData?.features) {
      const isolatedName = (hourData?.disaster_details?.isolated_building || hourData?.disaster_details?.hotspot_building || '').toLowerCase();
      const fireFeature = geoData.features.find(f => {
        const fn = (f.properties?.name || '').toLowerCase();
        if (!fn || !isolatedName) return false;
        return fn === isolatedName || isolatedName.includes(fn) || fn.includes(isolatedName);
      });
      if (fireFeature?.geometry?.coordinates?.[0]?.length) {
        const ring = fireFeature.geometry.coordinates[0];
        const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
        const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
        addPointMarker(
          [lon, lat],
          `<div style="background:#ef4444;width:30px;height:30px;border-radius:50%;border:2px solid white;box-shadow:0 0 16px #ef4444,0 0 30px #f87171;display:flex;align-items:center;justify-content:center;color:white;font-size:15px;">🔥</div>`,
          `<div style="font-family:'Inter',sans-serif;font-size:12px;"><b style="color:#ef4444;">🔥 Electrical Fire Fault Isolation</b><div style="color:#0f172a;font-weight:700;margin-top:2px;">${fireFeature.properties?.name || isolatedName}</div><div style="color:#475569;margin-top:4px;font-size:11px;">Main Riser: <b style="color:#ef4444;">DISCONNECTED</b><br/>Battery Power: <b style="color:#059669;">+18.4 kW Redirected</b></div></div>`
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoData, hourData, focusName]);

  return (
    <div className="panel-card" style={{ height: '100%', position: 'relative' }}>
      <div className="panel-header">
        <div className="panel-title">
          <Layers size={16} color="#ea580c" />
          <span>SOA ITER Campus Digital Twin Map — 3D (All 16 Buildings, Real Satellite Imagery)</span>
          <span className="kpi-pill" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
            Bhubaneswar (20.30° N, 85.82° E)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#94a3b8', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIs3D((v) => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: is3D ? 'rgba(255, 133, 0, 0.15)' : 'rgba(255,255,255,0.06)',
              color: is3D ? '#fb8500' : '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
              padding: '3px 8px', cursor: 'pointer', fontSize: '11px',
            }}
          >
            <Box size={12} /> {is3D ? '3D' : '2D'}
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
            Hostel 1 (Exporter)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c', display: 'inline-block' }}></span>
            Hostel 7 (Importer)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#b45309', display: 'inline-block' }}></span>
            C-Block (Academic)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#78716c', display: 'inline-block' }}></span>
            13 Campus Buildings
          </span>
        </div>
      </div>

      <div className="panel-body" style={{ padding: 0, position: 'relative' }}>
        <div className="map-container" ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: 420 }}>
          {/* Map Overlay Legend */}
          <div className="map-legend">
            <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 2 }}>SOA ITER 16-Building Map</div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#f59e0b' }}></div>
              <span>Hostel 1 (Single-story net solar exporter)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#ea580c' }}></div>
              <span>Hostel 7 (6-story heavy net importer)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#b45309' }}></div>
              <span>C-Block (Academic daytime peak load)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#78716c' }}></div>
              <span>13 Other Real Buildings (heights OSM-verified where tagged, estimated otherwise)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#f59e0b' }}></div>
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
                <b style={{ fontSize: '13px', color: clickedBuilding.isPilot ? '#fb8500' : '#e2e8f0' }}>
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
                OSM ID: {clickedBuilding.osm_id} &bull; {clickedBuilding.levels} Floor(s)
                {clickedBuilding.levels_verified === false || clickedBuilding.levels_verified === 'false' ? ' (estimated)' : ' (OSM-verified)'}
                &bull; {clickedBuilding.footprint_m2} m² Roof
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
                      <span style={{ color: '#fb8500' }}>Battery Share:</span>
                      <b style={{ color: '#fb8500' }}>{liveData.allocated_kw.toFixed(1)} kW</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#ef4444' }}>Deficit / Unmet:</span>
                      <b style={{ color: '#f87171' }}>{liveData.deficit_kw.toFixed(1)} kW</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: 4, marginTop: 2 }}>
                      <span style={{ color: '#fb8500', fontWeight: 600 }}>Service Ratio:</span>
                      {(() => {
                        const isFireIso = liveData.is_fire_isolated || liveData.status?.includes('FIRE') || liveData.status?.includes('DISCONNECTED');
                        const sRatio = (isFireIso || liveData.load_kw <= 0.001)
                          ? '0.0'
                          : Math.min(100.0, ((liveData.solar_kw + liveData.allocated_kw) / liveData.load_kw) * 100.0).toFixed(1);

                        return (
                          <b style={{
                            color: isFireIso ? '#f87171' : (Number(sRatio) >= 90 ? '#fb8500' : (Number(sRatio) > 0 ? '#fbbf24' : '#f87171')),
                            fontFamily: 'monospace'
                          }}>
                            {isFireIso ? '0.0% (DISCONNECTED)' : `${sRatio}%`}
                          </b>
                        );
                      })()}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a8a29e', fontSize: '11px' }}>
                      <span>Critical Reserve:</span>
                      <span>{liveData.critical_kw} kW</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, lineHeight: 1.4 }}>
                    <div><b>Building Type:</b> {clickedBuilding.building_type || 'Academic / Institutional'}</div>
                    <div><b>Gross Floor Area:</b> {clickedBuilding.gross_floor_area_m2} m²</div>
                    <div style={{ color: '#a8a29e', marginTop: 4 }}>
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
