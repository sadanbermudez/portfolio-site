/* The hero bench: a 3D optical table (three.js r128) with an 800 nm pulsed beam, a turning mirror,
   an objective, a sample cuvette and a collection path to an InGaAs spectrometer. The power steps
   through the six settings the agent chose, and the HUD spectrum uses the peak counts the agent
   measured at each one, so the scene replays the real run. */
(function () {
  var canvas = document.querySelector('canvas.bench');
  var hud = document.querySelector('.hud canvas');
  var hudPower = document.getElementById('hud-power');
  var hudPeak = document.getElementById('hud-peak');
  var RUN = [ // power mW, max counts measured by the agent (two-photon run, 20 Oct 2026)
    [10, 1940.9], [30, 2028.5], [50, 2343.7], [80, 3080.5], [120, 4578.1], [160, 6635.9]
  ];
  var BASE = 1860, STEP_S = 2.6;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- HUD spectrum (2D canvas) ----------
  var hctx = hud ? hud.getContext('2d') : null;
  var noise = [];
  for (var i = 0; i < 160; i++) noise.push(Math.random() - 0.5);
  function drawHud(level, t) {
    if (!hctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = hud.clientWidth, h = hud.clientHeight;
    if (hud.width !== Math.round(w * dpr)) { hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr); }
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
      var c = BASE + jitter + (level - BASE) * Math.exp(-0.5 * Math.pow((nm - 1270) / 7.6, 2));
      var x = w * k / (n - 1), y = h - 6 - (c - 1500) / (top - 1500) * (h - 12);
      if (k === 0) hctx.moveTo(x, y); else hctx.lineTo(x, y);
    }
    hctx.strokeStyle = '#ffae4a'; hctx.lineWidth = 1.4; hctx.shadowColor = 'rgba(255,174,74,0.6)'; hctx.shadowBlur = 6;
    hctx.stroke(); hctx.shadowBlur = 0;
  }

  // ---------- 3D bench ----------
  if (!canvas || typeof THREE === 'undefined') { drawHud(RUN[4][1], 0); return; }
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
  catch (e) { drawHud(RUN[4][1], 0); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07090c, 150, 330);
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);

  function texFromCanvas(w, h, paint) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  // optical table: dark steel with a 25 mm grid of tapped holes
  var tableTex = texFromCanvas(512, 512, function (g, w, h) {
    g.fillStyle = '#1a1f26'; g.fillRect(0, 0, w, h);
    for (var n = 0; n < 2500; n++) { g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.025) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (var x = 16; x < w; x += 32) for (var y = 16; y < h; y += 32) {
      g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.fillStyle = '#07090c'; g.fill();
      g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.strokeStyle = 'rgba(255,255,255,0.06)'; g.stroke();
    }
  });
  tableTex.wrapS = tableTex.wrapT = THREE.RepeatWrapping; tableTex.repeat.set(10, 6);
  var table = new THREE.Mesh(new THREE.BoxGeometry(200, 3, 120),
    new THREE.MeshStandardMaterial({ map: tableTex, metalness: 0.55, roughness: 0.55 }));
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

  // laser head (beam leaves at x = 0 travelling +x, at z = -18)
  var head = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 12), anod); head.position.set(-17, 4.5 + 0.2, -18); scene.add(head);
  var plate = new THREE.Mesh(new THREE.BoxGeometry(34.2, 1.2, 12.2), new THREE.MeshStandardMaterial({ color: 0x252c35, metalness: 0.6, roughness: 0.35 }));
  plate.position.set(-17, 9.3, -18); scene.add(plate);
  var aperture = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xff4a3d }));
  aperture.rotation.z = Math.PI / 2; aperture.position.set(0.1, BEAM_Y, -18); scene.add(aperture);

  // turning mirror at (24, -18): beam turns to +z
  post(24, -18, BEAM_Y);
  var mirror = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.7, 32), new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 1, roughness: 0.08 }));
  mirror.position.set(24, BEAM_Y, -18); mirror.rotation.z = Math.PI / 2; mirror.rotation.y = Math.PI / 4; scene.add(mirror);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.35, 10, 32), anod); ring.position.copy(mirror.position); ring.rotation.y = Math.PI / 4 + Math.PI / 2; scene.add(ring);

  // objective at (24, -4), sample cuvette at (24, 6)
  post(24, -4, BEAM_Y - 2.5);
  var obj = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.4, 6, 32), steel); obj.rotation.x = Math.PI / 2; obj.position.set(24, BEAM_Y, -4); scene.add(obj);
  var objBand = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.8, 32), new THREE.MeshStandardMaterial({ color: 0xc2271d, metalness: 0.4, roughness: 0.5 }));
  objBand.rotation.x = Math.PI / 2; objBand.position.set(24, BEAM_Y, -5.6); scene.add(objBand);
  label('objective', 27, 13.5, -4);
  var cuv = new THREE.Mesh(new THREE.BoxGeometry(4, 9, 4), new THREE.MeshStandardMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.18, metalness: 0.1, roughness: 0.05 }));
  cuv.position.set(24, 4.8, 6); scene.add(cuv);
  var liquidMat = new THREE.MeshStandardMaterial({ color: 0x5a1f12, emissive: 0xff7a2a, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 });
  var liquid = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6, 3.4), liquidMat); liquid.position.set(24, 3.4, 6); scene.add(liquid);
  var holder = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 6), anod); holder.position.set(24, 0.4, 6); scene.add(holder);
  label('sample', 27, 12, 8);

  // collection lens at (36, 6) and spectrometer at (52, 6)
  post(36, 6, BEAM_Y - 2.6);
  var lens = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 16), new THREE.MeshStandardMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.28, metalness: 0.2, roughness: 0.02 }));
  lens.scale.set(0.35, 1, 1); lens.position.set(36, BEAM_Y, 6); scene.add(lens);
  var spec = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 14), anod); spec.position.set(54, 4.2, 6); scene.add(spec);
  var slit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.5), new THREE.MeshBasicMaterial({ color: 0xffae4a })); slit.position.set(44.9, BEAM_Y, 6); scene.add(slit);
  label('InGaAs spectrometer', 46, 12.4, 10, '#c9d1db');

  // beams: pump (red) and emission (amber)
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
  var sampleGlow = glow(0xffae4a, 16, 0.4); sampleGlow.position.set(24, 4.5, 6);

  // pulses travelling the pump path, photons travelling the emission path
  var pathLen = [P[0].distanceTo(P[1]), P[1].distanceTo(P[2]), P[2].distanceTo(P[3])];
  var total = pathLen[0] + pathLen[1] + pathLen[2];
  function along(pts, lens, s) {
    for (var i = 0; i < lens.length; i++) { if (s <= lens[i]) return pts[i].clone().lerp(pts[i + 1], s / lens[i]); s -= lens[i]; }
    return pts[pts.length - 1].clone();
  }
  var pulses = [];
  for (var q = 0; q < 9; q++) { var g = glow(0xffd0c8, 2.4, 0.95); pulses.push({ s: q * total / 9, g: g }); }
  var eLen = [E[0].distanceTo(E[1]), E[1].distanceTo(E[2])], eTot = eLen[0] + eLen[1];
  var photons = [];
  for (var r = 0; r < 26; r++) {
    var pg = glow(0xffc278, 1.6, 0.0);
    photons.push({ s: Math.random() * eTot, g: pg, spread: (Math.random() - 0.5) * 2, lane: (Math.random() - 0.5) * 2 });
  }

  var amb = new THREE.AmbientLight(0x6a7a90, 0.9); scene.add(amb);
  var key = new THREE.DirectionalLight(0xdfe8ff, 0.6); key.position.set(-40, 80, 60); scene.add(key);
  var rim = new THREE.DirectionalLight(0x7fb6ff, 0.18); rim.position.set(80, 30, -80); scene.add(rim);
  var redLight = new THREE.PointLight(0xff4a3d, 1.2, 40, 2); redLight.position.set(24, BEAM_Y + 2, -10); scene.add(redLight);
  var ambLight = new THREE.PointLight(0xffae4a, 1.0, 45, 2); ambLight.position.set(26, BEAM_Y + 3, 8); scene.add(ambLight);

  var target = new THREE.Vector3(27, 0, -4), mx = 0, my = 0;
  window.addEventListener('pointermove', function (e) { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; }, { passive: true });

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // on wide screens push the bench to the right so the headline has the left side
    var shift = w > 760 ? -w * 0.2 : 0;
    camera.setViewOffset(w, h, shift, w > 760 ? h * 0.06 : -h * 0.16, w, h);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  var visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(canvas);

  function frame(t) {
    var step = Math.floor(t / STEP_S) % RUN.length;
    var phase = (t % STEP_S) / STEP_S;
    var pmw = RUN[step][0], counts = RUN[step][1];
    var shutter = phase < 0.08 ? phase / 0.08 : 1; // the agent turns emission off between powers
    var level = BASE + (counts - BASE) * shutter;
    var rel = (counts - BASE) / (RUN[5][1] - BASE) * shutter; // emission, from measured counts
    var pump = (0.25 + 0.75 * pmw / 160) * shutter;

    pumpCore.forEach(function (m) { m.material.opacity = 0.25 + 0.7 * pump; });
    pumpHalo.forEach(function (m) { m.material.opacity = 0.03 + 0.12 * pump; });
    emitCore[0].material.opacity = 0.02 + 0.1 * rel; emitCore[1].material.opacity = 0.04 + 0.22 * rel;
    focus.material.opacity = 0.35 + 0.65 * pump; focus.scale.setScalar(4 + 5 * pump + Math.sin(t * 30) * 0.3);
    sampleGlow.material.opacity = 0.08 + 0.6 * rel; sampleGlow.scale.setScalar(9 + 12 * rel);
    liquidMat.emissiveIntensity = 0.15 + 1.6 * rel;
    redLight.intensity = 0.4 + 1.4 * pump; ambLight.intensity = 0.2 + 2.2 * rel;
    mirrorGlint.material.opacity = 0.2 + 0.6 * pump;

    var speed = 70;
    pulses.forEach(function (p) {
      p.s = (p.s + speed / 60) % total;
      p.g.position.copy(along(P, pathLen, p.s)); p.g.material.opacity = 0.9 * pump;
    });
    photons.forEach(function (p, i) {
      var live = i < Math.round(4 + 22 * rel);
      p.s += 0.45;
      if (p.s > eTot) { p.s = 0; p.spread = (Math.random() - 0.5) * 2; p.lane = (Math.random() - 0.5) * 2; }
      var pos = along(E, eLen, p.s);
      var cone = p.s < eLen[0] ? (p.s / eLen[0]) : 1 - (p.s - eLen[0]) / eLen[1];
      pos.y += p.spread * 2.2 * cone; pos.z += p.lane * 2.2 * cone;
      p.g.position.copy(pos); p.g.material.opacity = live ? 0.85 : 0;
    });

    var a = -0.42 + mx * 0.18 + (reduce ? 0 : Math.sin(t * 0.08) * 0.07);
    var dist = 122;
    camera.position.set(target.x + Math.sin(a) * dist, 58 - my * 12, target.z + Math.cos(a) * dist);
    camera.lookAt(target);
    renderer.render(scene, camera);

    if (hudPower) hudPower.textContent = shutter < 1 ? 'shutter' : pmw + ' mW';
    if (hudPeak) hudPeak.textContent = Math.round(level).toLocaleString('en-GB') + ' counts';
    drawHud(level, t);
  }

  if (reduce) { frame(STEP_S * 4 + 1.5); return; }
  var t0 = performance.now() - (STEP_S * 4 + 1.2) * 1000; // open on the 120 mW step, laser on
  (function loop(now) {
    if (visible && !document.hidden) frame((now - t0) / 1000);
    requestAnimationFrame(loop);
  })(t0);
})();
