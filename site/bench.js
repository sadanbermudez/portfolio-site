/* A 3D optical bench (three.js r128): 800 nm pulsed laser, turning mirror, objective, sample
   cuvette, collection lens and InGaAs spectrometer. Shared by the home hero and the lab-agent page.

   createBench(canvas, opts) -> { fly(name), setStep(i), setCycle(bool), setLaser(bool), setOrder(1|2) }
   setOrder(1) shows one-photon excitation of the same transition: 400 nm light, and the whole
   beam cone glows in the sample. setOrder(2), the default, is the 800 nm two-photon case, where
   excitation (proportional to intensity squared) is confined to the focus.
   opts.hud = { canvas, power, peak } elements; opts.shift = push the scene right on wide screens;
   opts.orbit = allow dragging to look around.
   The power steps are the six settings the agent chose, with the peak counts it measured at each. */
window.BENCH_RUN = [[10, 1940.9], [30, 2028.5], [50, 2343.7], [80, 3080.5], [120, 4578.1], [160, 6635.9]];

window.createBench = function (canvas, opts) {
  opts = opts || {};
  var RUN = window.BENCH_RUN, BASE = 1860, STEP_S = 2.6;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hudEl = opts.hud || {};
  var hctx = hudEl.canvas ? hudEl.canvas.getContext('2d') : null;
  var noise = [];
  for (var i = 0; i < 160; i++) noise.push(Math.random() - 0.5);

  function drawHud(level, t) {
    if (!hctx) return;
    var c = hudEl.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hctx.clearRect(0, 0, w, h);
    hctx.strokeStyle = '#1d242d'; hctx.lineWidth = 1;
    for (var g = 1; g < 4; g++) { hctx.beginPath(); hctx.moveTo(0, h * g / 4 + 0.5); hctx.lineTo(w, h * g / 4 + 0.5); hctx.stroke(); }
    var x1270 = w * (1270 - 1100) / 340;
    hctx.strokeStyle = 'rgba(255,174,74,0.25)'; hctx.setLineDash([2, 4]);
    hctx.beginPath(); hctx.moveTo(x1270 + 0.5, 0); hctx.lineTo(x1270 + 0.5, h); hctx.stroke(); hctx.setLineDash([]);
    var top = 7000, n = noise.length;
    hctx.beginPath();
    for (var k = 0; k < n; k++) {
      var nm = 1100 + 340 * k / (n - 1);
      var jitter = noise[(k + Math.floor(t * 9)) % n] * 90;
      var cts = BASE + jitter + (level - BASE) * Math.exp(-0.5 * Math.pow((nm - 1270) / 7.6, 2));
      var x = w * k / (n - 1), y = h - 6 - (cts - 1500) / (top - 1500) * (h - 12);
      if (k === 0) hctx.moveTo(x, y); else hctx.lineTo(x, y);
    }
    hctx.strokeStyle = '#ffae4a'; hctx.lineWidth = 1.4; hctx.shadowColor = 'rgba(255,174,74,0.6)'; hctx.shadowBlur = 6;
    hctx.stroke(); hctx.shadowBlur = 0;
  }

  var api = { fly: function () {}, setStep: function () {}, setCycle: function () {}, setLaser: function () {}, setOrder: function () {} };
  if (!canvas || typeof THREE === 'undefined') { drawHud(RUN[4][1], 0); return api; }
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
  catch (e) { drawHud(RUN[4][1], 0); return api; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07090c, 150, 330);
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);

  function texFromCanvas(w, h, paint) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  var tableTex = texFromCanvas(512, 512, function (g, w, h) {
    g.fillStyle = '#1a1f26'; g.fillRect(0, 0, w, h);
    for (var n = 0; n < 2500; n++) { g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.025) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (var x = 16; x < w; x += 32) for (var y = 16; y < h; y += 32) {
      g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.fillStyle = '#07090c'; g.fill();
      g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.strokeStyle = 'rgba(255,255,255,0.06)'; g.stroke();
    }
  });
  tableTex.wrapS = tableTex.wrapT = THREE.RepeatWrapping; tableTex.repeat.set(10, 6);
  var table = new THREE.Mesh(new THREE.BoxGeometry(200, 3, 120), new THREE.MeshStandardMaterial({ map: tableTex, metalness: 0.55, roughness: 0.55 }));
  table.position.set(20, -1.5, 0); scene.add(table);

  var steel = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.9, roughness: 0.3 });
  var anod = new THREE.MeshStandardMaterial({ color: 0x14181e, metalness: 0.25, roughness: 0.7 });
  var BEAM_Y = 8;
  function post(x, z, h) {
    var p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, h, 20), steel); p.position.set(x, h / 2, z); scene.add(p);
    var b = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 2.6), anod); b.position.set(x, 0.4, z); scene.add(b);
  }
  function label(text, x, y, z, color) {
    var t = texFromCanvas(512, 96, function (g, w, h) {
      g.font = '500 34px "Martian Mono", Consolas, monospace'; g.fillStyle = color || '#8a94a2';
      g.textBaseline = 'middle'; g.fillText(text, 8, h / 2);
    });
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.set(16, 3, 1); s.position.set(x, y, z); s.center.set(0, 0.5); scene.add(s); return s;
  }
  var glowTex = texFromCanvas(128, 128, function (g, w, h) {
    var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  function glow(color, size, opacity) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1); scene.add(s); return s;
  }

  var head = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 12), anod); head.position.set(-17, 4.7, -18); scene.add(head);
  var plate = new THREE.Mesh(new THREE.BoxGeometry(34.2, 1.2, 12.2), new THREE.MeshStandardMaterial({ color: 0x252c35, metalness: 0.6, roughness: 0.35 }));
  plate.position.set(-17, 9.3, -18); scene.add(plate);
  var aperture = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xff4a3d }));
  aperture.rotation.z = Math.PI / 2; aperture.position.set(0.1, BEAM_Y, -18); scene.add(aperture);
  if (opts.labels) label('800 nm pulsed laser', -30, 13.5, -18, '#c9d1db');

  post(24, -18, BEAM_Y);
  var mirror = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.7, 32), new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 1, roughness: 0.08 }));
  mirror.position.set(24, BEAM_Y, -18); mirror.rotation.z = Math.PI / 2; mirror.rotation.y = Math.PI / 4; scene.add(mirror);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.35, 10, 32), anod); ring.position.copy(mirror.position); ring.rotation.y = Math.PI / 4 + Math.PI / 2; scene.add(ring);

  post(24, -4, BEAM_Y - 2.5);
  var obj = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.4, 6, 32), steel); obj.rotation.x = Math.PI / 2; obj.position.set(24, BEAM_Y, -4); scene.add(obj);
  var objBand = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.8, 32), new THREE.MeshStandardMaterial({ color: 0xc2271d, metalness: 0.4, roughness: 0.5 }));
  objBand.rotation.x = Math.PI / 2; objBand.position.set(24, BEAM_Y, -5.6); scene.add(objBand);
  label('objective', 27, 13.5, -4);
  var cuv = new THREE.Mesh(new THREE.BoxGeometry(4, 9, 4), new THREE.MeshStandardMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.18, metalness: 0.1, roughness: 0.05 }));
  cuv.position.set(24, 4.8, 6); scene.add(cuv);
  var liquidMat = new THREE.MeshStandardMaterial({ color: 0x5a1f12, emissive: 0xff7a2a, emissiveIntensity: 0.2, transparent: true, opacity: 0.55, depthWrite: false });
  var liquid = new THREE.Mesh(new THREE.BoxGeometry(3.4, 8.4, 3.4), liquidMat); liquid.position.set(24, 4.9, 6); scene.add(liquid);
  // one-photon excitation: the converging and diverging beam cones glow through the liquid
  var coneMat = new THREE.MeshBasicMaterial({ color: 0xffae4a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  var coneIn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 1.5, 2, 32, 1, true), coneMat); coneIn.rotation.x = Math.PI / 2; coneIn.position.set(24, 8, 5); scene.add(coneIn);
  var coneOut = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.06, 2, 32, 1, true), coneMat); coneOut.rotation.x = Math.PI / 2; coneOut.position.set(24, 8, 7); scene.add(coneOut);
  var holder = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 6), anod); holder.position.set(24, 0.4, 6); scene.add(holder);
  label('sample', 27, 12, 8);

  post(36, 6, BEAM_Y - 2.6);
  var lens = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 16), new THREE.MeshStandardMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.28, metalness: 0.2, roughness: 0.02 }));
  lens.scale.set(0.35, 1, 1); lens.position.set(36, BEAM_Y, 6); scene.add(lens);
  var spec = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 14), anod); spec.position.set(54, 4.2, 6); scene.add(spec);
  var slit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.5), new THREE.MeshBasicMaterial({ color: 0xffae4a })); slit.position.set(44.9, BEAM_Y, 6); scene.add(slit);
  label('InGaAs spectrometer', 46, 12.4, 10, '#c9d1db');

  function beam(a, b, color, radius, opacity) {
    var d = new THREE.Vector3().subVectors(b, a), len = d.length();
    var m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(a).add(d.clone().multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    scene.add(m); return m;
  }
  var P = [new THREE.Vector3(0, BEAM_Y, -18), new THREE.Vector3(24, BEAM_Y, -18), new THREE.Vector3(24, BEAM_Y, -1), new THREE.Vector3(24, BEAM_Y, 6)];
  var pumpCore = [beam(P[0], P[1], 0xff4a3d, 0.16, 0.95), beam(P[1], P[2], 0xff4a3d, 0.16, 0.95), beam(P[2], P[3], 0xff4a3d, 0.1, 0.9)];
  var pumpHalo = [beam(P[0], P[1], 0xff2a1d, 0.7, 0.12), beam(P[1], P[2], 0xff2a1d, 0.7, 0.12), beam(P[2], P[3], 0xff2a1d, 0.45, 0.12)];
  var E = [new THREE.Vector3(24, BEAM_Y, 6), new THREE.Vector3(36, BEAM_Y, 6), new THREE.Vector3(44.9, BEAM_Y, 6)];
  var emitCore = [beam(E[0], E[1], 0xffae4a, 0.9, 0.08), beam(E[1], E[2], 0xffae4a, 0.35, 0.18)];
  var focus = glow(0xff6a4d, 7, 0.9); focus.position.copy(P[3]);
  var mirrorGlint = glow(0xff4a3d, 5, 0.6); mirrorGlint.position.copy(P[1]);
  var sampleGlow = glow(0xffae4a, 16, 0.4); sampleGlow.position.set(24, 6.5, 6);
  var focalSpot = glow(0xffd28a, 3, 0); focalSpot.position.set(24, 8, 6); focalSpot.material.depthTest = false;   // drawn through the cuvette walls

  var pathLen = [P[0].distanceTo(P[1]), P[1].distanceTo(P[2]), P[2].distanceTo(P[3])];
  var total = pathLen[0] + pathLen[1] + pathLen[2];
  function along(pts, lens, s) {
    for (var i = 0; i < lens.length; i++) { if (s <= lens[i]) return pts[i].clone().lerp(pts[i + 1], s / lens[i]); s -= lens[i]; }
    return pts[pts.length - 1].clone();
  }
  var pulses = [];
  for (var q = 0; q < 9; q++) pulses.push({ s: q * total / 9, g: glow(0xffd0c8, 2.4, 0.95) });
  var eLen = [E[0].distanceTo(E[1]), E[1].distanceTo(E[2])], eTot = eLen[0] + eLen[1];
  var photons = [];
  for (var r = 0; r < 26; r++) photons.push({ s: Math.random() * eTot, g: glow(0xffc278, 1.6, 0.0), spread: (Math.random() - 0.5) * 2, lane: (Math.random() - 0.5) * 2 });

  scene.add(new THREE.AmbientLight(0x6a7a90, 0.9));
  var key = new THREE.DirectionalLight(0xdfe8ff, 0.6); key.position.set(-40, 80, 60); scene.add(key);
  var rim = new THREE.DirectionalLight(0x7fb6ff, 0.18); rim.position.set(80, 30, -80); scene.add(rim);
  var redLight = new THREE.PointLight(0xff4a3d, 1.2, 40, 2); redLight.position.set(24, BEAM_Y + 2, -10); scene.add(redLight);
  var ambLight = new THREE.PointLight(0xffae4a, 1.0, 45, 2); ambLight.position.set(26, BEAM_Y + 3, 8); scene.add(ambLight);

  // camera stations: target point, azimuth, distance, height
  var SHOTS = {
    overview: { t: [27, 0, -4], a: -0.42, d: 122, h: 58 },
    laser: { t: [6, 6, -18], a: -0.95, d: 62, h: 24 },
    sample: { t: [25, 6, 2], a: -0.25, d: 46, h: 20 },
    spectrometer: { t: [44, 6, 6], a: 0.55, d: 58, h: 26 },
    top: { t: [24, 0, -4], a: 0.001, d: 26, h: 125 }
  };
  var cur = { t: new THREE.Vector3(27, 0, -4), a: -0.42, d: 122, h: 58 }, goal = SHOTS.overview;
  var mx = 0, my = 0, dragA = 0, dragging = false, lastX = 0;
  window.addEventListener('pointermove', function (e) {
    mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5;
    if (dragging) { dragA += (e.clientX - lastX) * 0.006; lastX = e.clientX; }
  }, { passive: true });
  if (opts.orbit) {
    canvas.style.cursor = 'grab'; canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; canvas.style.cursor = 'grabbing'; });
    window.addEventListener('pointerup', function () { dragging = false; canvas.style.cursor = 'grab'; });
  }

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    var sx = opts.shift && w > 760 ? -w * opts.shift : 0, sy = w > 760 ? h * (opts.lift || 0) : -h * 0.16;
    camera.setViewOffset(w, h, sx, sy, w, h);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  var visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(canvas);

  var cycle = true, fixedStep = 4, laserOn = true, laserLevel = 1, order = 2;
  var PUMP_2P = new THREE.Color(0xff4a3d), PUMP_1P = new THREE.Color(0x8a6cff), pumpColor = PUMP_2P.clone();
  api.fly = function (name) { if (SHOTS[name]) { goal = SHOTS[name]; dragA = 0; } };
  api.setCycle = function (on) { cycle = on; };
  api.setStep = function (i) { fixedStep = i; cycle = false; };
  api.setLaser = function (on) { laserOn = on; };
  api.setOrder = function (n) { order = n === 1 ? 1 : 2; };

  function frame(t, dt) {
    var step = cycle ? Math.floor(t / STEP_S) % RUN.length : fixedStep;
    var phase = cycle ? (t % STEP_S) / STEP_S : 1;
    laserLevel += ((laserOn ? 1 : 0) - laserLevel) * Math.min(1, dt * 4);
    var pmw = RUN[step][0], counts = RUN[step][1];
    var shutter = (phase < 0.08 ? phase / 0.08 : 1) * laserLevel;
    var level = BASE + (counts - BASE) * shutter;
    var rel = (counts - BASE) / (RUN[5][1] - BASE) * shutter;
    var pump = (0.25 + 0.75 * pmw / 160) * shutter;

    pumpColor.lerp(order === 1 ? PUMP_1P : PUMP_2P, Math.min(1, dt * 4));
    pumpCore.forEach(function (m) { m.material.opacity = 0.02 + 0.93 * pump; m.material.color.copy(pumpColor); });
    pumpHalo.forEach(function (m) { m.material.color.copy(pumpColor); });
    focus.material.color.copy(pumpColor); mirrorGlint.material.color.copy(pumpColor); redLight.color.copy(pumpColor);
    var one = order === 1;
    coneMat.opacity += ((one ? 0.2 + 0.55 * rel : 0) - coneMat.opacity) * Math.min(1, dt * 5);
    focalSpot.material.opacity += ((one ? 0 : 0.95 * rel) - focalSpot.material.opacity) * Math.min(1, dt * 5);
    focalSpot.scale.setScalar(1.6 + 2.4 * rel + Math.sin(t * 40) * 0.15);
    pumpHalo.forEach(function (m) { m.material.opacity = 0.12 * pump; });
    emitCore[0].material.opacity = 0.1 * rel; emitCore[1].material.opacity = 0.22 * rel;
    focus.material.opacity = 0.95 * pump; focus.scale.setScalar(4 + 5 * pump + Math.sin(t * 30) * 0.3);
    sampleGlow.material.opacity = 0.6 * rel; sampleGlow.scale.setScalar(9 + 12 * rel);
    liquidMat.emissiveIntensity = 0.12 + 1.6 * rel;
    redLight.intensity = 1.8 * pump; ambLight.intensity = 2.4 * rel;
    mirrorGlint.material.opacity = 0.8 * pump;

    pulses.forEach(function (p) { p.s = (p.s + 70 * dt) % total; p.g.position.copy(along(P, pathLen, p.s)); p.g.material.opacity = 0.9 * pump; });
    photons.forEach(function (p, i) {
      var live = i < Math.round(4 + 22 * rel) && rel > 0.02;
      p.s += 27 * dt;
      if (p.s > eTot) { p.s = 0; p.spread = (Math.random() - 0.5) * 2; p.lane = (Math.random() - 0.5) * 2; }
      var pos = along(E, eLen, p.s);
      var cone = p.s < eLen[0] ? (p.s / eLen[0]) : 1 - (p.s - eLen[0]) / eLen[1];
      pos.y += p.spread * 2.2 * cone; pos.z += p.lane * 2.2 * cone;
      p.g.position.copy(pos); p.g.material.opacity = live ? 0.85 : 0;
    });

    var k = reduce ? 1 : Math.min(1, dt * 2.2);
    cur.t.lerp(new THREE.Vector3(goal.t[0], goal.t[1], goal.t[2]), k);
    cur.a += (goal.a - cur.a) * k; cur.d += (goal.d - cur.d) * k; cur.h += (goal.h - cur.h) * k;
    var a = cur.a + dragA + mx * 0.12 + (reduce ? 0 : Math.sin(t * 0.08) * 0.05);
    camera.position.set(cur.t.x + Math.sin(a) * cur.d, cur.h - my * 8, cur.t.z + Math.cos(a) * cur.d);
    camera.lookAt(cur.t);
    renderer.render(scene, camera);

    if (hudEl.power) hudEl.power.textContent = laserLevel < 0.5 ? 'laser off' : shutter < 0.95 ? 'shutter' : pmw + ' mW';
    if (hudEl.peak) hudEl.peak.textContent = order === 1 ? 'one-photon view' : Math.round(level).toLocaleString('en-GB') + ' counts';
    drawHud(level, t);
  }

  if (reduce) { frame(STEP_S * 4 + 1.5, 1); api.fly = function (n) { if (SHOTS[n]) { goal = SHOTS[n]; frame(STEP_S * 4 + 1.5, 1); } }; return api; }
  var t0 = performance.now() - (STEP_S * 4 + 1.2) * 1000, last = performance.now();
  (function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (visible && !document.hidden) frame((now - t0) / 1000, dt);
    requestAnimationFrame(loop);
  })(last);
  return api;
};
