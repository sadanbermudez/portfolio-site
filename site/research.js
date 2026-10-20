/* Research page: four canvases.
   1. Powers-of-ten zoom (scroll driven): mouse, tissue, tumour cells, one cell, molecules, damage.
      Illustration of photodynamic therapy in general; one- vs two-photon switch at every scale.
   2. 1270 nm photon counting: singlet-oxygen phosphorescence photons arrive one at a time and
      build a time-resolved histogram. Emission time = triplet lifetime + 1O2 lifetime, both
      exponential, which gives the rise-and-decay curve; the decay is fitted live.
   3. Hollow-core fibre cross-section with its guided mode (J0² profile).
   4. Anti-resonance: membrane resonances λm = 2t·√(n_glass² − n_core²)/m; filling with water
      scales them by √(1.45² − 1.33²)/√(1.45² − 1) ≈ 0.55, the shift the thesis reports (0.556). */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var C = { bg: '#07090c', ink: '#e8ecf1', muted: '#8a94a2', rule: '#1d242d', pump: '#ff4a3d', violet: '#8a6cff', amber: '#ffae4a', cool: '#7fb6ff', tumour: '#6b2f4a' };
  var mode = 2;                                     // 2 = two-photon 800 nm, 1 = one-photon
  function fit(c) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function glow(ctx, x, y, r, color, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  function beamColor() { return mode === 2 ? C.pump : C.violet; }

  // ---------------- 1. powers-of-ten zoom ----------------
  // each scene is drawn in a 1000 x 600 box centred on the origin; T is where the camera dives next
  var SCENES = [
    { scale: '3 cm', label: 'mouse with a tumour on its flank', T: [60, -60], draw: sceneMouse },
    { scale: '3 mm', label: 'skin, tissue and tumour', T: [0, 140], draw: sceneTissue },
    { scale: '100 µm', label: 'tumour cells holding photosensitiser', T: [0, 0], draw: sceneCells },
    { scale: '10 µm', label: 'one cell; singlet oxygen acts within about 1 µm', T: [120, 70], draw: sceneCell },
    { scale: '1 nm', label: 'photosensitiser, oxygen and a lipid', T: [0, 0], draw: sceneMolecules },
    { scale: '10 µm', label: 'oxidative damage in the irradiated cell only', T: [0, 0], draw: sceneDamage }
  ];
  var R = rng(7), CELLS = [], PS = [], MITO = [];
  for (var i = 0; i < 26; i++) { var a = i * 2.39996, rr = 70 * Math.sqrt(i); CELLS.push([Math.cos(a) * rr * 1.6, Math.sin(a) * rr, 52 + R() * 12, i === 0]); }
  for (i = 0; i < 160; i++) PS.push([R(), R(), R()]);
  for (i = 0; i < 7; i++) { var ang = i / 7 * 6.283 + 0.4; MITO.push([Math.cos(ang) * 170, Math.sin(ang) * 150, ang + 1.2]); }
  MITO[0] = [120, 70, 0.4];

  function sceneMouse(ctx, t) {
    ctx.fillStyle = '#2a2f37';
    ctx.beginPath(); ctx.ellipse(-20, 60, 270, 125, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(250, 10, 95, 75, -0.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(225, -60, 32, 40, -0.3, 0, 7); ctx.fillStyle = '#3a404a'; ctx.fill();
    ctx.fillStyle = '#e8ecf1'; ctx.beginPath(); ctx.arc(290, -5, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2a2f37'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-285, 70); ctx.bezierCurveTo(-400, 60, -420, 200, -480, 150); ctx.stroke();
    [[-180, 175], [-60, 180], [120, 175], [200, 160]].forEach(function (p) { ctx.beginPath(); ctx.moveTo(p[0], p[1] - 10); ctx.lineTo(p[0] + 8, p[1] + 25); ctx.stroke(); });
    ctx.fillStyle = C.tumour; ctx.beginPath(); ctx.ellipse(60, -58, 48, 30, 0, 0, 7); ctx.fill();
    lightFromAbove(ctx, 60, -300, -58, 150, t, true);
  }
  function lightFromAbove(ctx, x, yTop, yFocus, wide, t, mouse) {
    var col = beamColor();
    if (mode === 1) {
      var g = ctx.createLinearGradient(0, yTop, 0, yFocus + 120);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.28; ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - wide / 2, yTop); ctx.lineTo(x + wide / 2, yTop); ctx.lineTo(x + wide / 2 + 20, yFocus + 120); ctx.lineTo(x - wide / 2 - 20, yFocus + 120); ctx.fill();
      ctx.globalAlpha = 1;
      if (mouse) glow(ctx, x, yFocus - 20, 80, C.amber, 0.35 + 0.1 * Math.sin(t * 3));
    } else {
      ctx.globalAlpha = 0.35; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x - 30, yTop); ctx.lineTo(x + 30, yTop); ctx.lineTo(x, yFocus); ctx.fill();
      ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.moveTo(x, yFocus); ctx.lineTo(x + 30, yFocus + 160); ctx.lineTo(x - 30, yFocus + 160); ctx.fill();
      ctx.globalAlpha = 1;
      glow(ctx, x, yFocus, 26 + 3 * Math.sin(t * 20), '#ffffff', 0.9);
      glow(ctx, x, yFocus, 60, C.amber, 0.45);
    }
  }
  function sceneTissue(ctx, t) {
    var bands = [[-300, -262, '#6d4b44', 'epidermis'], [-262, -140, '#4a3640', 'dermis'], [-140, -20, '#3d3a2c', 'fat'], [-20, 300, '#3a2a30', 'muscle and tumour']];
    bands.forEach(function (b) { ctx.fillStyle = b[2]; ctx.fillRect(-500, b[0], 1000, b[1] - b[0]); ctx.fillStyle = C.muted; ctx.font = '13px Martian Mono, monospace'; ctx.fillText(b[3], -490, b[0] + 18); });
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    for (var k = 0; k < 14; k++) { ctx.beginPath(); ctx.moveTo(-500, -250 + k * 8); for (var x = -500; x < 500; x += 40) ctx.quadraticCurveTo(x + 20, -250 + k * 8 + (k % 2 ? 6 : -6), x + 40, -250 + k * 8); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,240,200,0.07)'; for (k = 0; k < 40; k++) { ctx.beginPath(); ctx.arc(-480 + (k * 97) % 960, -120 + (k * 37) % 90, 18, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#7a1f2a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-500, -60); ctx.bezierCurveTo(-200, -90, 100, 10, 500, -50); ctx.stroke();
    ctx.fillStyle = C.tumour; ctx.beginPath();
    for (var a = 0; a < 6.3; a += 0.3) { var r = 120 + 14 * Math.sin(a * 5); ctx.lineTo(Math.cos(a) * r * 1.4, 140 + Math.sin(a) * r * 0.8); }
    ctx.fill();
    if (mode === 1) {
      var g = ctx.createLinearGradient(0, -300, 0, 300); g.addColorStop(0, 'rgba(138,108,255,0.55)'); g.addColorStop(0.35, 'rgba(138,108,255,0.12)'); g.addColorStop(1, 'rgba(138,108,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-220, -300, 440, 600);
      for (k = 0; k < 60; k++) { var px = -210 + (k * 53) % 420, py = -280 + (k * 71) % 560, d = Math.exp(-(py + 300) / 260); glow(ctx, px, py, 10, C.amber, 0.5 * d * (0.6 + 0.4 * Math.sin(t * 4 + k))); }
    } else lightFromAbove(ctx, 0, -300, 140, 0, t, false);
  }
  function sceneCells(ctx, t) {
    CELLS.forEach(function (c, i) {
      var tumour = Math.hypot(c[0], c[1]) < 260;
      ctx.fillStyle = tumour ? '#4b2a3c' : '#2d3440'; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(c[0] - 8, c[1] - 4, c[2] * 0.38, 0, 7); ctx.fill();
      for (var k = 0; k < (tumour ? 9 : 3); k++) { var p = PS[(i * 9 + k) % PS.length]; ctx.fillStyle = C.amber; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(c[0] + (p[0] - 0.5) * c[2] * 1.4, c[1] + (p[1] - 0.5) * c[2] * 1.4, 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      var lit = mode === 1 ? (Math.abs(c[0]) < 200 ? 0.45 : 0) : (c[3] ? 1 : 0);
      if (lit) glow(ctx, c[0], c[1], c[2] * 1.4, mode === 1 ? C.amber : '#ffd9a8', lit * (0.5 + 0.2 * Math.sin(t * 5 + i)));
    });
    ctx.fillStyle = C.muted; ctx.font = '13px Martian Mono, monospace'; ctx.fillText('amber dots: photosensitiser, concentrated in tumour cells', -490, -270);
  }
  function sceneCell(ctx, t, damage) {
    damage = damage || 0;
    var s = 1 - 0.18 * damage;
    ctx.save(); ctx.scale(s, s);
    ctx.fillStyle = '#3b2534'; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (var a = 0; a < 6.3; a += 0.15) { var r = 260 + 8 * Math.sin(a * 3 + t) + damage * 30 * Math.max(0, Math.sin(a * 7)); ctx.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(127,182,255,0.18)'; ctx.beginPath(); ctx.arc(-60, -30, 95, 0, 7); ctx.fill();
    ctx.fillStyle = C.muted; ctx.font = '13px Martian Mono, monospace'; ctx.fillText('nucleus', -90, -25);
    MITO.forEach(function (m, i) {
      ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(m[2]);
      ctx.fillStyle = damage ? 'rgba(160,70,60,' + (0.9 - damage * 0.6) + ')' : '#6a3b2c'; ctx.beginPath(); ctx.ellipse(0, 0, 50 - damage * 15, 22, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,160,0.3)'; ctx.lineWidth = 1.5;
      for (var k = -30; k <= 30; k += 12) { ctx.beginPath(); ctx.moveTo(k, -14); ctx.lineTo(k + 4, 14); ctx.stroke(); }
      ctx.restore();
      var lit = mode === 1 ? 1 : (i === 0 ? 1 : 0);
      if (lit && !damage) { glow(ctx, m[0], m[1], 26 * 2.2, C.pump, 0.25 + 0.15 * Math.sin(t * 6 + i)); ctx.strokeStyle = 'rgba(255,74,61,0.6)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(m[0], m[1], 26 * 2.2, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    });
    ctx.restore();
    ctx.fillStyle = C.muted; ctx.font = '13px Martian Mono, monospace';
    ctx.fillText(damage ? 'membrane blebbing, mitochondria failing' : 'dashed red: reach of singlet oxygen, about 1 µm', -490, -270);
  }
  function sceneDamage(ctx, t) { sceneCell(ctx, t, 1); }
  function sceneMolecules(ctx, t) {
    var cyc = (t % 6) / 6;                                     // a six-second story
    // photosensitiser: porphyrin-like ring
    var ex = cyc > 0.1 && cyc < 0.45, trip = cyc >= 0.25 && cyc < 0.45;
    ctx.save(); ctx.translate(-260, 0);
    for (var k = 0; k < 4; k++) { ctx.save(); ctx.rotate(k * Math.PI / 2); ctx.fillStyle = trip ? '#7a5cff' : ex ? '#ffd28a' : '#4a5565'; ctx.beginPath(); for (var j = 0; j < 5; j++) { var a = j / 5 * 6.283 - 1.57; ctx.lineTo(70 + Math.cos(a) * 32, Math.sin(a) * 32); } ctx.fill(); ctx.restore(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.stroke();
    if (ex) glow(ctx, 0, 0, 140, trip ? C.violet : C.amber, 0.45);
    ctx.fillStyle = C.ink; ctx.font = '14px Martian Mono, monospace'; ctx.fillText(trip ? 'triplet state' : ex ? 'excited' : 'photosensitiser', -60, 130);
    ctx.restore();
    // incoming photon(s)
    if (cyc < 0.12) {
      var py = -300 + cyc / 0.12 * 300;
      var photons = mode === 2 ? [-30, 30] : [0];
      photons.forEach(function (dx) { ctx.strokeStyle = beamColor(); ctx.lineWidth = 3; ctx.beginPath(); for (var y = py - 90; y < py; y += 3) ctx.lineTo(-260 + dx + Math.sin(y / 7) * 9, y); ctx.stroke(); });
    }
    // oxygen molecule drifts in, takes the energy, leaves as singlet oxygen
    var ox, oy, singlet = cyc >= 0.45;
    if (cyc < 0.45) { var f = Math.min(1, cyc / 0.4); ox = 200 - 330 * f; oy = 160 - 160 * f; }
    else { var g2 = (cyc - 0.45) / 0.4; ox = -130 + 450 * Math.min(1, g2); oy = -40 * Math.sin(g2 * 3); }
    [-16, 16].forEach(function (d) { ctx.fillStyle = singlet ? '#ff6a5a' : '#c9d1db'; ctx.beginPath(); ctx.arc(ox + d, oy, 18, 0, 7); ctx.fill(); });
    if (singlet) glow(ctx, ox, oy, 80, C.pump, 0.5);
    ctx.fillStyle = C.ink; ctx.font = '14px Martian Mono, monospace'; ctx.fillText(singlet ? '¹O₂ singlet oxygen' : '³O₂ ground-state oxygen', ox - 70, oy - 34);
    // the lipid it oxidises
    var hit = cyc > 0.82;
    ctx.strokeStyle = hit ? '#ff8a5c' : '#b7bfcb'; ctx.lineWidth = 5; ctx.beginPath();
    for (k = 0; k < 9; k++) { var lx = 340 + k * 18, ly = -120 + k * 30 + (k % 2 ? 10 : -10); if (hit && k === 4) ly += 30; ctx.lineTo(lx, ly); }
    ctx.stroke();
    ctx.fillStyle = C.muted; ctx.fillText(hit ? 'lipid oxidised' : 'membrane lipid', 360, 200);
    if (hit) glow(ctx, 412, 30, 60, '#ffffff', (1 - (cyc - 0.82) / 0.18) * 0.9);
    // the rare 1270 nm photon: drawn once every few loops
    if (singlet && Math.floor(t / 6) % 4 === 0 && cyc > 0.55 && cyc < 0.8) {
      var q = (cyc - 0.55) / 0.25; ctx.strokeStyle = C.amber; ctx.lineWidth = 2.5; ctx.beginPath();
      for (var xx = 0; xx < 120; xx += 3) ctx.lineTo(ox + 30 + q * 300 + xx, oy - 60 - q * 120 + Math.sin(xx / 6) * 7); ctx.stroke();
      ctx.fillStyle = C.amber; ctx.fillText('1270 nm photon (about 1 in a million in water)', ox + 40 + q * 300, oy - 90 - q * 120);
    }
  }

  var zoomCanvas = document.getElementById('zoom-canvas'), zoomSection = document.getElementById('zoom');
  var scaleEl = document.getElementById('zoom-scale'), labelEl = document.getElementById('zoom-label');
  function zoomProgress() {
    if (!zoomSection) return 0;
    var r = zoomSection.getBoundingClientRect(), span = r.height - window.innerHeight;
    return Math.max(0, Math.min(1, -r.top / Math.max(1, span))) * (SCENES.length - 1);
  }
  function drawZoom(t) {
    var s = fit(zoomCanvas), ctx = s.ctx, p = zoomProgress(), i = Math.min(SCENES.length - 1, Math.floor(p)), f = p - i;
    // hold each scene for most of its stretch, dive in the last 40%
    var dive = Math.max(0, (f - 0.6) / 0.4); dive = dive * dive * (3 - 2 * dive);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, s.w, s.h);
    var base = Math.min(s.w / 1000, s.h / 600);
    function paint(scene, k, alpha, T) {
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(s.w / 2, s.h / 2); ctx.scale(base, base);
      ctx.translate(T[0] * (1 - k), T[1] * (1 - k)); ctx.scale(k, k);
      scene.draw(ctx, t); ctx.restore(); ctx.globalAlpha = 1;
    }
    paint(SCENES[i], 1 + 9 * dive, 1 - dive, SCENES[i].T);
    if (i + 1 < SCENES.length && dive > 0) paint(SCENES[i + 1], 0.25 + 0.75 * dive, dive, [0, 0]);
    var cur = SCENES[dive > 0.5 && i + 1 < SCENES.length ? i + 1 : i];
    if (scaleEl) scaleEl.textContent = cur.scale;
    if (labelEl) labelEl.textContent = cur.label;
  }

  // ---------------- 2. 1270 nm photon counting ----------------
  var det = document.getElementById('det-canvas'), solvent = 'H2O', hist = [], events = [], made = 0, emitted = 0, detected = 0;
  var TAU = { H2O: 3.5, D2O: 68 }, TAU_T = 2.0, QE = 0.03;   // µs; detector QE about 3% at 1270 nm (thesis)
  function resetDet() { hist = new Array(80).fill(0); events = []; made = emitted = detected = 0; }
  function sampleExp(tau) { return -tau * Math.log(1 - Math.random()); }
  function stepDet() {
    var span = TAU[solvent] * 6;
    for (var k = 0; k < (reduce ? 4000 : 30); k++) {
      var tt = sampleExp(TAU_T) + sampleExp(TAU[solvent]);
      detected++;
      if (Math.random() < 0.03) tt = Math.random() * span;          // dark counts
      var b = Math.floor(tt / span * hist.length); if (b >= 0 && b < hist.length) hist[b]++;
      events.push(tt);
    }
    emitted = Math.round(detected / QE); made = emitted * 1e6;
  }
  function fitTau() {
    var t0 = 3 * TAU_T, s = 0, n = 0;                 // exponential tail: maximum-likelihood mean beyond t0
    for (var i = 0; i < events.length; i++) if (events[i] > t0 && events[i] < TAU[solvent] * 6) { s += events[i] - t0; n++; }
    return n > 50 ? s / n : null;
  }
  function drawDet() {
    if (!det) return;
    var s = fit(det), ctx = s.ctx, W = s.w, H = s.h, L = 46, B = 30, span = TAU[solvent] * 6;
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, W, H);
    var mx = Math.max.apply(null, hist.concat([1]));
    ctx.fillStyle = C.amber;
    hist.forEach(function (v, i) { var bw = (W - L - 10) / hist.length, bh = v / mx * (H - B - 20); ctx.fillRect(L + i * bw, H - B - bh, bw - 1, bh); });
    var tau = fitTau();
    if (tau) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath();
      for (var k = 0; k <= 120; k++) {
        var tt = span * k / 120, model = (Math.exp(-tt / tau) - Math.exp(-tt / TAU_T)) / (1 - TAU_T / tau);
        var peak = 0; for (var q = 0; q <= 200; q++) { var x = span * q / 200; peak = Math.max(peak, (Math.exp(-x / tau) - Math.exp(-x / TAU_T)) / (1 - TAU_T / tau)); }
        var y = H - B - model / peak * (mx * 0.97) / mx * (H - B - 20);
        if (k) ctx.lineTo(L + (W - L - 10) * k / 120, y); else ctx.moveTo(L, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = C.muted; ctx.font = '11px Martian Mono, monospace';
    ctx.fillText('0', L, H - 10); ctx.fillText(Math.round(span / 2) + ' µs', L + (W - L) / 2 - 16, H - 10); ctx.fillText(Math.round(span) + ' µs', W - 50, H - 10);
    ctx.save(); ctx.translate(14, H / 2 + 30); ctx.rotate(-Math.PI / 2); ctx.fillText('photon counts', 0, 0); ctx.restore();
    document.getElementById('det-detected').textContent = detected.toLocaleString('en-GB');
    document.getElementById('det-emitted').textContent = emitted.toLocaleString('en-GB');
    document.getElementById('det-made').textContent = made > 0 ? '~' + made.toExponential(1).replace('e+', ' × 10^') : '0';
    document.getElementById('det-tau').textContent = tau ? tau.toFixed(1) + ' µs' : 'collecting…';
  }
  document.querySelectorAll('[data-solvent]').forEach(function (b) {
    b.addEventListener('click', function () {
      solvent = b.dataset.solvent; resetDet();
      document.querySelectorAll('[data-solvent]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });
  resetDet();

  // ---------------- 3. fibre cross-section ----------------
  var fibre = document.getElementById('fibre-canvas');
  function J0(x) {                                            // Abramowitz and Stegun 9.4.1, |x| <= 3
    var y = (x / 3) * (x / 3);
    return 1 - 2.2499997 * y + 1.2656208 * y * y - 0.3163866 * y * y * y + 0.0444479 * y * y * y * y - 0.0039444 * Math.pow(y, 5) + 0.00021 * Math.pow(y, 6);
  }
  function drawFibre(t) {
    if (!fibre) return;
    var s = fit(fibre), ctx = s.ctx, W = s.w, H = s.h, cx = W / 2, cy = H / 2, k = Math.min(W, H) / 600;
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5f6b7c'; ctx.beginPath(); ctx.arc(cx, cy, 270 * k, 0, 7); ctx.fill();
    ctx.fillStyle = '#16314a'; ctx.beginPath(); ctx.arc(cx, cy, 235 * k, 0, 7); ctx.fill();      // water-filled cladding region
    var a = 95 * k, n = 7;
    for (var i = 0; i < n; i++) {
      var ang = i / n * 6.283, rc = 62 * k, d = a + rc;
      ctx.fillStyle = '#16314a'; ctx.strokeStyle = '#c9d1db'; ctx.lineWidth = Math.max(1.5, 3 * k);
      ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, rc, 0, 7); ctx.fill(); ctx.stroke();
    }
    // guided fundamental mode: intensity ∝ J0(2.405 r/a)²
    var img = ctx.createImageData(Math.ceil(2 * a), Math.ceil(2 * a)), dd = img.data, pulse = 0.85 + 0.15 * Math.sin(t * 2);
    var col = Math.floor(t / 3) % 2 ? [255, 90, 70] : [110, 160, 255];
    for (var y = 0; y < img.height; y++) for (var x = 0; x < img.width; x++) {
      var r = Math.hypot(x - a, y - a) / a, v = r < 1 ? Math.pow(J0(2.405 * r), 2) * pulse : 0, p4 = 4 * (y * img.width + x);
      dd[p4] = col[0] * v + 22 * (1 - v); dd[p4 + 1] = col[1] * v + 49 * (1 - v); dd[p4 + 2] = col[2] * v + 74 * (1 - v); dd[p4 + 3] = r < 1 ? 255 : 0;
    }
    var off = drawFibre.off || (drawFibre.off = document.createElement('canvas')); off.width = img.width; off.height = img.height;
    off.getContext('2d').putImageData(img, 0, 0); ctx.drawImage(off, cx - a, cy - a);
    ctx.fillStyle = C.muted; ctx.font = '11px Martian Mono, monospace';
    ctx.fillText(Math.floor(t / 3) % 2 ? 'mode at 800 nm (two-photon pump)' : 'mode at 470 nm (probe)', 12, 20);
    ctx.fillText('hollow core, water-filled', 12, H - 12);
  }

  // ---------------- 4. anti-resonance windows ----------------
  var arCanvas = document.getElementById('ar-canvas'), tSlider = document.getElementById('ar-t'), tOut = document.getElementById('ar-t-out'), filled = true;
  function drawAR() {
    if (!arCanvas) return;
    var s = fit(arCanvas), ctx = s.ctx, W = s.w, H = s.h, L = 40, B = 28, lo = 350, hi = 1000;
    var t = +tSlider.value, nCore = filled ? 1.33 : 1.0, fac = Math.sqrt(1.45 * 1.45 - nCore * nCore);
    tOut.textContent = (t * 1000).toFixed(0) + ' nm';
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, W, H);
    function X(l) { return L + (W - L - 10) * (l - lo) / (hi - lo); }
    var res = []; for (var m = 1; m < 12; m++) { var lm = 2 * t * 1000 * fac / m; if (lm > lo - 50 && lm < hi + 50) res.push([m, lm]); }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.beginPath();
    for (var l = lo; l <= hi; l += 1) {
      var T = 1; res.forEach(function (r) { var w = r[1] * 0.035; T *= 1 - 0.95 / (1 + Math.pow((l - r[1]) / w, 2)); });
      var y = 12 + (1 - T) * (H - B - 24); if (l === lo) ctx.moveTo(X(l), y); else ctx.lineTo(X(l), y);
    }
    ctx.stroke();
    res.forEach(function (r) { ctx.fillStyle = 'rgba(255,74,61,0.85)'; ctx.font = '10px Martian Mono, monospace'; ctx.fillText('m=' + r[0], X(r[1]) - 14, H - B - 4); });
    [[470, C.cool, 'probe'], [800, C.pump, 'pump']].forEach(function (q) {
      var bad = res.some(function (r) { return Math.abs(q[0] - r[1]) < r[1] * 0.06; });
      ctx.strokeStyle = q[1]; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(q[0]), 6); ctx.lineTo(X(q[0]), H - B); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = q[1]; ctx.font = '11px Martian Mono, monospace'; var txt = q[0] + ' nm ' + q[2] + (bad ? ' ✗ leaks' : ' ✓ guided'), tw = ctx.measureText(txt).width;
      ctx.fillText(txt, X(q[0]) + 6 + tw > W - 6 ? X(q[0]) - 6 - tw : X(q[0]) + 6, 34 + (q[0] === 800 ? 16 : 0));
    });
    ctx.fillStyle = C.muted; ctx.font = '11px Martian Mono, monospace';
    for (var g = 400; g <= 1000; g += 200) ctx.fillText(g + ' nm', X(g) - 18, H - 8);
    ctx.fillText('transmission', L, 12);
  }
  if (tSlider) tSlider.addEventListener('input', drawAR);
  document.querySelectorAll('[data-fill]').forEach(function (b) {
    b.addEventListener('click', function () {
      filled = b.dataset.fill === 'water';
      document.querySelectorAll('[data-fill]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      drawAR();
    });
  });

  // ---------------- mode switch shared by the zoom ----------------
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = +b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.mode === mode)); });
    });
  });

  // ---------------- loop ----------------
  var vis = {};
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { vis[e.target.id] = e.isIntersecting; }); });
    [zoomCanvas, det, fibre].forEach(function (el) { if (el) io.observe(el); });
  }
  function on(id) { return vis[id] !== false; }
  window.addEventListener('resize', drawAR);
  drawAR();
  if (reduce) { drawZoom(2); stepDet(); drawDet(); drawFibre(0); window.addEventListener('scroll', function () { drawZoom(2); }, { passive: true }); return; }
  var t0 = performance.now();
  (function loop(now) {
    var t = (now - t0) / 1000;
    if (!document.hidden) {
      if (zoomCanvas && on('zoom-canvas')) drawZoom(t);
      if (det && on('det-canvas')) { if (events.length < 60000) stepDet(); drawDet(); }
      if (fibre && on('fibre-canvas')) drawFibre(t);
    }
    requestAnimationFrame(loop);
  })(t0);
})();
