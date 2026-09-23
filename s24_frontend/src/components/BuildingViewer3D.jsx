import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Check, X } from 'lucide-react';

// UI-ONLY per-building 3D viewer (supervisor site). Renders this building's
// real footprint (from campus GeoJSON) as a dark-navy floor-by-floor massing
// with a glowing selected floor, floating spec tag, live telemetry rails and
// state-derived risk cards. All numbers come from existing props — the only
// geometry assumption is floor height (3.5 m, same as the map extrusion).
const FLOOR_H = 3.5;

function norm(s) {
  return (s || '').toLowerCase().trim();
}

function findFeature(geoData, buildingName) {
  const feats = geoData?.features || [];
  const t = norm(buildingName);
  return feats.find((f) => {
    const n = norm(f.properties?.name || '');
    if (!n || !t) return false;
    if (n === t || n.includes(t) || t.includes(n)) {
      if (t.includes('hostel')) {
        const td = (t.match(/\d+/) || [])[0];
        const fd = (n.match(/\d+/) || [])[0];
        if (td || fd) return td === fd;
      }
      return true;
    }
    return false;
  }) || null;
}

// Footprint ring (lon/lat) -> local meter-space Shape, centered + scaled.
function footprintShape(feature, targetSize = 12) {
  const ring = feature?.geometry?.coordinates?.[0] || [];
  if (ring.length < 3) return { shape: null, w: 8, d: 8 };
  const lats = ring.map((p) => p[1]);
  const lons = ring.map((p) => p[0]);
  const meanLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const kx = (Math.PI / 180) * 6371000 * Math.cos((meanLat * Math.PI) / 180);
  const ky = (Math.PI / 180) * 6371000;
  const meanLon = lons.reduce((a, b) => a + b, 0) / lons.length;
  const meanLa = lats.reduce((a, b) => a + b, 0) / lats.length;
  let pts = ring.map(([lon, lat]) => [(lon - meanLon) * kx, (lat - meanLa) * ky]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(1, Math.max(...xs) - Math.min(...xs));
  const d = Math.max(1, Math.max(...ys) - Math.min(...ys));
  const s = targetSize / Math.max(w, d);
  pts = pts.map(([x, y]) => [x * s, y * s]);
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return { shape, w: w * s, d: d * s };
}

export default function BuildingViewer3D({
  geoData,
  buildingName = '',
  liveBlock = null,
  hourData = null,
  currentHour = 12,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const floorsRef = useRef([]);
  const [levels, setLevels] = useState(1);
  const [footprintM2, setFootprintM2] = useState(0);
  const [verified, setVerified] = useState(true);
  const [blockType, setBlockType] = useState('');
  const [selectedFloor, setSelectedFloor] = useState(0);
  const [ready, setReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  const feature = findFeature(geoData, buildingName);
  const props = feature?.properties || {};
  const load = liveBlock?.load_kw || 0;
  const solar = liveBlock?.solar_kw || 0;
  const alloc = liveBlock?.allocated_kw || 0;
  const ratio = liveBlock?.service_ratio_pct ?? (load > 0.001 ? Math.min(100, ((solar + alloc) / load) * 100) : 100);
  const isOutage = Boolean(hourData?.is_outage);
  const isFireIso = Boolean(liveBlock?.is_fire_isolated);
  const solarShare = load > 0.001 ? Math.min(100, (solar / load) * 100) : 0;
  const gridNeed = Math.max(0, load - solar - alloc);
  const independence = load > 0.001 ? Math.max(0, (1 - gridNeed / load) * 100) : 100;

  // PlayDay drives the highlighted floor.
  useEffect(() => {
    if (levels > 0) setSelectedFloor(((currentHour % levels) + levels) % levels);
  }, [currentHour, levels]);

  // Build / rebuild the 3D massing when the building (or its geometry) changes.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !feature) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      setWebglFailed(true);
      return;
    }

    const W = mount.clientWidth || 800;
    const H = mount.clientHeight || 560;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060c);
    scene.fog = new THREE.Fog(0x04060c, 60, 140);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 500);
    camera.position.set(20, 16, 26);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
    controls.minDistance = 10;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI * 0.52;

    scene.add(new THREE.AmbientLight(0x8a9bb8, 0.55));
    const key = new THREE.DirectionalLight(0xfff1d6, 1.6);
    key.position.set(24, 34, 18);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xfb8500, 0.9);
    rim.position.set(-22, 12, -20);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x24304d, 0x05070c, 0.7));

    // Ground glow disc.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    scene.add(ground);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(29.4, 30, 64),
      new THREE.MeshBasicMaterial({ color: 0xea580c, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.55;
    scene.add(ring);

    const lv = Math.max(1, Math.min(props.levels || 1, 12));
    const fp = Number(props.footprint_m2 || 0);
    setLevels(lv);
    setFootprintM2(fp);
    setVerified(props.levels_verified !== false && props.levels_verified !== 'false');
    setBlockType(props.building_type || props.amenity || 'Institutional');
    setSelectedFloor(((currentHour % lv) + lv) % lv);

    const { shape } = footprintShape(feature);
    const massMat = new THREE.MeshStandardMaterial({
      color: 0x0d2456, roughness: 0.55, metalness: 0.45,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x3b5bdb, transparent: true, opacity: 0.5 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb703, wireframe: true, transparent: true, opacity: 0.9 });

    const group = new THREE.Group();
    const floors = [];
    const gap = 0.55;
    const slabH = Math.max(0.6, FLOOR_H - gap);
    for (let i = 0; i < lv; i++) {
      let mesh;
      if (shape) {
        const geo = new THREE.ExtrudeGeometry(shape, { depth: slabH, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        mesh = new THREE.Mesh(geo, massMat.clone());
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(9, slabH, 9), massMat.clone());
      }
      mesh.position.y = i * FLOOR_H + slabH / 2;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat);
      edges.position.y = i * FLOOR_H + slabH / 2;
      const glow = new THREE.Mesh(mesh.geometry, glowMat);
      glow.position.y = i * FLOOR_H + slabH / 2;
      glow.visible = false;
      glow.scale.set(1.02, 1.25, 1.02);
      mesh.userData.floorIndex = i;
      group.add(mesh);
      group.add(edges);
      group.add(glow);
      floors.push({ mesh, glow });
    }
    // Base plinth.
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.8, 16),
      new THREE.MeshStandardMaterial({ color: 0x101c3a, roughness: 0.7, metalness: 0.3 })
    );
    plinth.position.y = -0.7;
    group.add(plinth);
    scene.add(group);
    floorsRef.current = floors;

    const totalH = lv * FLOOR_H;
    controls.target.set(0, totalH * 0.45, 0);
    controls.update();

    // Click a floor to spotlight it (ignores orbit drags).
    let downPos = null;
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const onDown = (e) => { downPos = [e.clientX, e.clientY]; };
    const onUp = (e) => {
      if (!downPos) return;
      const dx = e.clientX - downPos[0];
      const dy = e.clientY - downPos[1];
      downPos = null;
      if (dx * dx + dy * dy > 25) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      const hits = ray.intersectObjects(floors.map((f) => f.mesh));
      if (hits.length > 0) setSelectedFloor(hits[0].object.userData.floorIndex);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    let raf = 0;
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      floorsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingName, geoData]);

  // Spotlight the selected floor.
  useEffect(() => {
    floorsRef.current.forEach((f, i) => {
      f.glow.visible = i === selectedFloor;
      f.mesh.material.emissive = new THREE.Color(i === selectedFloor ? 0x7c2d12 : 0x000000);
      f.mesh.material.emissiveIntensity = i === selectedFloor ? 0.9 : 0;
    });
  }, [selectedFloor, ready]);

  if (!feature) {
    return (
      <div className="bld-viewer">
        <p style={{ color: '#f8fafc', fontSize: 13 }}>No 3D massing found for {buildingName || 'this building'}.</p>
      </div>
    );
  }
  if (webglFailed) {
    return (
      <div className="bld-viewer">
        <p style={{ color: '#f8fafc', fontSize: 13 }}>3D unavailable in this browser.</p>
      </div>
    );
  }

  const typeLabel = blockType ? blockType.charAt(0).toUpperCase() + blockType.slice(1) : 'Building';
  const highlights = [
    { ok: solar > 0.5, label: solar > 0.5 ? 'Rooftop array generating' : 'Array idle (night / overcast)' },
    { ok: alloc > 0.1, label: alloc > 0.1 ? `Battery feeding ${alloc.toFixed(1)} kW` : 'No battery dispatch this hour' },
    { ok: !isOutage, label: isOutage ? 'Islanded on stored energy' : 'Utility grid connected' },
    { ok: !isFireIso, label: isFireIso ? 'Riser ISOLATED (fire protocol)' : 'Electrical riser normal' },
  ];
  const scores = [
    { label: 'SERVICE COVERAGE', sub: 'Solar + battery share of demand', val: ratio },
    { label: 'SOLAR SHARE', sub: 'Own rooftop vs demand', val: solarShare },
    { label: 'GRID INDEPENDENCE', sub: 'Demand met without imports', val: independence },
  ];
  const systems = [
    { label: 'Shared Battery Bank', value: `${(hourData?.battery_available_kw ?? 120).toFixed(0)} kW ready` },
    { label: 'Utility Grid', value: isOutage ? 'CUT (islanding)' : 'Connected' },
    { label: 'Active Protocol', value: hourData?.mode === 'DISASTER_TRIAGE' ? 'Disaster triage' : 'Routine fairness' },
  ];

  return (
    <div className="bld-viewer">
      <div ref={mountRef} className="bld-canvas" />

      {/* Floating spec tag */}
      <div className="bld-tag">
        <b>{levels}-Floor {typeLabel}</b>
        <span>{buildingName}</span>
        <span>{Number(footprintM2 || 0).toFixed(0)} m² roof {verified ? '' : '(est.)'} • Floor {selectedFloor + 1}/{levels}</span>
        <span>{load.toFixed(1)} kW now • {solar.toFixed(1)} kW solar</span>
      </div>

      {/* Bottom risk cards */}
      <div className="bld-risks">
        <div className="bld-risk">
          <span>Fire Risk</span>
          <b>{isFireIso ? '10' : '1'}/10</b>
          <span>{isFireIso ? 'Active isolation' : 'Minimal fire factor'}</span>
        </div>
        <div className="bld-risk">
          <span>Outage Risk</span>
          <b>{isOutage ? '9' : '2'}/10</b>
          <span>{isOutage ? 'Islanded operation' : 'Stable grid feed'}</span>
        </div>
      </div>

      {/* Right rail */}
      <div className="bld-side">
        <div className="bld-side-title">Building Highlights</div>
        {highlights.map((h) => (
          <div key={h.label} className="bld-check">
            <span className={`bld-dot ${h.ok ? 'ok' : 'bad'}`}>{h.ok ? <Check size={11} /> : <X size={11} />}</span>
            <span>{h.label}</span>
          </div>
        ))}
        {scores.map((s) => (
          <div key={s.label} className="bld-score">
            <div className="bld-score-head"><span>{s.label}</span><b>{s.val.toFixed(0)}</b></div>
            <div className="bld-score-sub">{s.sub}</div>
            <div className="bld-bar"><div className="bld-fill" style={{ width: `${Math.min(100, Math.max(0, s.val))}%` }} /></div>
          </div>
        ))}
        <div className="bld-side-title" style={{ marginTop: 6 }}>Campus Systems</div>
        {systems.map((s) => (
          <div key={s.label} className="bld-sys"><span>{s.label}</span><b>{s.value}</b></div>
        ))}
        <div className="bld-hint">Drag to orbit • Scroll to zoom • Click a floor • PlayDay steps floors</div>
      </div>
    </div>
  );
}
