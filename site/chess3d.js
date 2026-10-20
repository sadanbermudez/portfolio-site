/* 3D board, "lines of force": every square each side attacks is drawn as a beam of light (White
   amber, Black blue), hanging pieces get a pulsing red ring, the played move glides, and on graded
   moves the engine's choice is drawn as a blue arc. Driven by ChessViewer.onPly; facts from
   ChessCore, the same rules the reviewed facts use. three.js r128. */
window.Chess3D = (function () {
  var canvas = document.getElementById('board3d');
  var api = { enable: function () {} };
  if (!canvas || typeof THREE === 'undefined') return api;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); } catch (e) { return api; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0x8090a8, 0.45));
  var key = new THREE.DirectionalLight(0xffffff, 0.7); key.position.set(-4, 10, 6); scene.add(key);
  var rim = new THREE.DirectionalLight(0x7fb6ff, 0.35); rim.position.set(6, 4, -8); scene.add(rim);

  // board
  var lightMat = new THREE.MeshStandardMaterial({ color: 0x4a5462, roughness: 0.7 }), darkMat = new THREE.MeshStandardMaterial({ color: 0x222932, roughness: 0.7 });
  var sqGeo = new THREE.BoxGeometry(1, 0.12, 1);
  for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
    var s = new THREE.Mesh(sqGeo, (r + f) % 2 ? lightMat : darkMat); s.position.set(f - 3.5, -0.06, 3.5 - r); scene.add(s);
  }
  var frame = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.1, 8.6), new THREE.MeshStandardMaterial({ color: 0x10151b, roughness: 0.8 }));
  frame.position.y = -0.12; scene.add(frame);
  function pos(sq) { return new THREE.Vector3(sq.charCodeAt(0) - 97 - 3.5, 0, 3.5 - (+sq[1] - 1)); }

  // pieces: lathe profiles, a few extras, an extruded knight
  function lathe(pts) { return new THREE.LatheGeometry(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 32); }
  var base = [[0, 0], [0.34, 0], [0.34, 0.07], [0.27, 0.12], [0.2, 0.16]];
  var GEO = {
    p: [lathe(base.concat([[0.11, 0.42], [0.17, 0.46], [0.08, 0.5], [0, 0.5]])), [new THREE.SphereGeometry(0.13, 24, 16), 0.6]],
    r: [lathe(base.concat([[0.2, 0.62], [0.26, 0.66], [0.26, 0.8], [0, 0.8]]))],
    b: [lathe(base.concat([[0.1, 0.55], [0.17, 0.6], [0.08, 0.64], [0, 0.64]])), [new THREE.SphereGeometry(0.15, 24, 16).scale(1, 1.35, 1), 0.8], [new THREE.SphereGeometry(0.05, 12, 8), 1.02]],
    q: [lathe(base.concat([[0.12, 0.72], [0.24, 0.84], [0.2, 0.9], [0, 0.9]])), [new THREE.SphereGeometry(0.08, 16, 12), 0.98]],
    k: [lathe(base.concat([[0.13, 0.76], [0.23, 0.86], [0.2, 0.92], [0, 0.92]])), [new THREE.BoxGeometry(0.06, 0.28, 0.06), 1.06], [new THREE.BoxGeometry(0.2, 0.06, 0.06), 1.09]]
  };
  var ks = new THREE.Shape();
  [[-0.2, 0], [0.24, 0], [0.22, 0.32], [0.3, 0.5], [0.24, 0.7], [0.06, 0.78], [-0.1, 0.7], [-0.3, 0.52], [-0.28, 0.42], [-0.08, 0.46], [-0.18, 0.2]].forEach(function (p, i) { if (i) ks.lineTo(p[0], p[1]); else ks.moveTo(p[0], p[1]); });
  var knightHead = new THREE.ExtrudeGeometry(ks, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }); knightHead.translate(0, 0.14, -0.09);
  GEO.n = [lathe(base.concat([[0.18, 0.2], [0, 0.2]])), [knightHead, 0]];
  var MAT = { w: new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.35, metalness: 0.05 }), b: new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.3, metalness: 0.35 }) };
  function makePiece(type, white) {
    var g = new THREE.Group();
    GEO[type].forEach(function (part, i) {
      var geo = i === 0 ? part : part[0], m = new THREE.Mesh(geo, white ? MAT.w : MAT.b);
      if (i > 0) m.position.y = part[1];
      g.add(m);
    });
    if (type === 'n') g.rotation.y = white ? 0 : Math.PI;      // show the knight's profile to the camera
    g.userData.key = type + (white ? 'w' : 'b');
    return g;
  }

  var pieces = {};                                       // square -> group
  function sync(fen) {
    var board = window.ChessCore.parse(fen), seen = {};
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = board[r][f], sq = window.ChessCore.sq(f, r);
      if (!p) continue;
      var k = p.type + (p.white ? 'w' : 'b'); seen[sq] = true;
      if (pieces[sq] && pieces[sq].userData.key === k) { pieces[sq].position.copy(pos(sq)); continue; }
      if (pieces[sq]) scene.remove(pieces[sq]);
      pieces[sq] = makePiece(p.type, p.white); pieces[sq].position.copy(pos(sq)); scene.add(pieces[sq]);
    }
    Object.keys(pieces).forEach(function (sq) { if (!seen[sq]) { scene.remove(pieces[sq]); delete pieces[sq]; } });
  }

  // lines of force, hanging rings, engine arc
  // beams are flat glowing strips (WebGL ignores line width, so real lines would be 1 px)
  var beamW = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffae4a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  var beamB = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x7fb6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(beamW); scene.add(beamB);
  var rings = [], ringGeo = new THREE.TorusGeometry(0.42, 0.04, 10, 40), ringMat = new THREE.MeshBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: 0.9 });
  var arc = null;
  function setBeams(fen) {
    var att = window.ChessCore.attacks(window.ChessCore.parse(fen)), w = [], b = [];
    att.forEach(function (a) {
      var from = new THREE.Vector3(a.from[0] - 3.5, 0.05, 3.5 - a.from[1]), to = new THREE.Vector3(a.to[0] - 3.5, 0.05, 3.5 - a.to[1]);
      var off = a.white ? -0.06 : 0.06;                    // keep the two colours side by side on shared lines
      from.x += off; to.x += off;
      var dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1, nx = -dz / len * 0.03, nz = dx / len * 0.03;
      (a.white ? w : b).push(from.x + nx, 0.05, from.z + nz, to.x + nx, 0.05, to.z + nz, to.x - nx, 0.05, to.z - nz,
                             from.x + nx, 0.05, from.z + nz, to.x - nx, 0.05, to.z - nz, from.x - nx, 0.05, from.z - nz);
    });
    beamW.geometry.dispose(); beamW.geometry = new THREE.BufferGeometry(); beamW.geometry.setAttribute('position', new THREE.Float32BufferAttribute(w, 3));
    beamB.geometry.dispose(); beamB.geometry = new THREE.BufferGeometry(); beamB.geometry.setAttribute('position', new THREE.Float32BufferAttribute(b, 3));
    rings.forEach(function (m) { scene.remove(m); }); rings = [];
    window.ChessCore.hangingSquares(fen).forEach(function (sq) {
      var m = new THREE.Mesh(ringGeo, ringMat); m.rotation.x = Math.PI / 2; m.position.copy(pos(sq)); m.position.y = 0.04; scene.add(m); rings.push(m);
    });
  }
  function setArc(uci) {
    if (arc) { scene.remove(arc); arc = null; }
    if (!uci) return;
    var a = pos(uci.slice(0, 2)), b = pos(uci.slice(2, 4)), mid = a.clone().lerp(b, 0.5); mid.y = 1.2 + a.distanceTo(b) * 0.15;
    var curve = new THREE.QuadraticBezierCurve3(a.clone().setY(0.3), mid, b.clone().setY(0.3));
    arc = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.05, 8, false), new THREE.MeshBasicMaterial({ color: 0x7fb6ff, transparent: true, opacity: 0.9 }));
    scene.add(arc);
  }

  // camera
  var azBase = 0, az = 0, dragA = 0, dragging = false, lastX = 0, enabled = false, current = null, anim = null;
  canvas.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('pointerup', function () { dragging = false; canvas.style.cursor = 'grab'; });
  window.addEventListener('pointermove', function (e) { if (dragging) { dragA += (e.clientX - lastX) * 0.008; lastX = e.clientX; } }, { passive: true });
  canvas.style.cursor = 'grab'; canvas.style.touchAction = 'pan-y';
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function show(state) {
    azBase = state.flip ? Math.PI : 0;
    var from = state.uci && state.uci.slice(0, 2), to = state.uci && state.uci.slice(2, 4);
    var mover = from && pieces[from] && current === state.before ? pieces[from] : null;
    current = state.fen;
    if (mover && !reduce) {
      if (pieces[to] && pieces[to] !== mover) { scene.remove(pieces[to]); }
      delete pieces[from]; pieces[to] = mover;
      anim = { m: mover, a: pos(from), b: pos(to), t: 0, done: function () { sync(state.fen); } };
    } else sync(state.fen);
    setBeams(state.fen);
    setArc(state.grade ? state.best_uci : null);
  }
  window.ChessViewer.onPly(function (state) { api.last = state; if (enabled) show(state); });

  var t0 = performance.now(), last = t0;
  function loop(now) {
    if (!enabled) return;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / 0.45);
      var e = anim.t < 0.5 ? 2 * anim.t * anim.t : 1 - Math.pow(-2 * anim.t + 2, 2) / 2;
      anim.m.position.lerpVectors(anim.a, anim.b, e); anim.m.position.y = Math.sin(Math.PI * anim.t) * 0.6;
      if (anim.t >= 1) { var d = anim.done; anim = null; d(); }
    }
    var pulse = 0.6 + 0.4 * Math.sin((now - t0) / 180);
    ringMat.opacity = pulse; rings.forEach(function (m) { m.scale.setScalar(0.9 + 0.12 * pulse); });
    az += (azBase + dragA + (reduce ? 0 : Math.sin((now - t0) / 9000) * 0.12) - az) * Math.min(1, dt * 3);
    camera.position.set(Math.sin(az) * 10.5, 11.5, Math.cos(az) * 10.5); camera.lookAt(0, -0.8, 0.3 * Math.cos(az));
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  api.enable = function (on) {
    enabled = on;
    if (on) { resize(); current = null; if (api.last) show(api.last); else window.ChessViewer.go(window.ChessViewer.ply()); last = performance.now(); requestAnimationFrame(loop); }
  };
  return api;
})();
