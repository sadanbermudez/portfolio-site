/* One photon or two: three small simulations.
   1. Focus explorer: Gaussian-beam focus seen from the side, one-photon (400 nm, excitation ∝ I)
      next to two-photon (800 nm, ∝ I²), with the excitation per plane plotted along the axis.
      w0 = λ / (π NA) (paraxial estimate), zR = π w0² n / λ, water n = 1.33.
      Side view = excitation integrated along the line of sight: ∝ w^(1-2n) · exp(-2n x²/w²) · w0^(2n).
   2. Penetration: fluence ∝ exp(-z/δ); two-photon excitation follows fluence², so it falls with δ/2.
   3. Photodynamic therapy: an illustrative dose model, standard (630 nm, wide beam) against
      two-photon (800 nm, scanned focus), counting singlet-oxygen dose in tumour and healthy tissue. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var N_WATER = 1.33;

  function fit(c) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    return { w: c.width, h: c.height, dpr: dpr };
  }
  // amber colour map, dark to white-hot
  function heat(v) {
    v = Math.max(0, Math.min(1, v));
    return [Math.round(255 * Math.min(1, v * 1.6)), Math.round(255 * Math.min(1, Math.max(0, v * 1.5 - 0.15)) * 0.72), Math.round(255 * Math.max(0, v * 2 - 1) * 0.8)];
  }

  // ---------- 1. focus explorer ----------
  var na = document.getElementById('na'), naOut = document.getElementById('na-out');
  var c1 = document.getElementById('focus-1p'), c2 = document.getElementById('focus-2p'), plot = document.getElementById('plane-plot');
  var X = 4, Z = 10;                                            // half-width and half-length, µm
  function beam(lambda, NA) { var w0 = lambda / (Math.PI * NA); return { w0: w0, zR: Math.PI * w0 * w0 * N_WATER / lambda }; }
  function side(canvas, lambda, n, NA, t) {
    var s = fit(canvas), ctx = canvas.getContext('2d'), b = beam(lambda, NA);
    var key = NA + ':' + s.w + 'x' + s.h, cache = canvas._cache;
    if (!cache || cache.key !== key) {                           // the heatmap only changes with NA or size
      cache = canvas._cache = { key: key, img: heatmap(ctx, s, b, n) };
    }
    ctx.putImageData(cache.img, 0, 0);
    return overlay(ctx, s, b, n, t);
  }
  function heatmap(ctx, s, b, n) {
    var img = ctx.createImageData(s.w, s.h), d = img.data, peak = Math.pow(b.w0, 1 - 2 * n) * Math.pow(b.w0, 2 * n);
    for (var j = 0; j < s.h; j++) {
      var z = -Z + 2 * Z * j / (s.h - 1), w = b.w0 * Math.sqrt(1 + (z / b.zR) * (z / b.zR));
      var axial = Math.pow(w, 1 - 2 * n) * Math.pow(b.w0, 2 * n) / peak;
      for (var i = 0; i < s.w; i++) {
        var x = -X + 2 * X * i / (s.w - 1);
        var v = Math.pow(axial * Math.exp(-2 * n * x * x / (w * w)), 0.6);   // camera-like gamma
        var col = heat(v), k = 4 * (j * s.w + i);
        d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
      }
    }
    return img;
  }
  function overlay(ctx, s, b, n, t) {
    // the beam envelope (1/e² radius) and a travelling pulse, drawn over the image
    ctx.save(); ctx.scale(s.dpr, s.dpr);
    var W = s.w / s.dpr, H = s.h / s.dpr, px = function (x) { return W / 2 + x / X * W / 2; }, pz = function (z) { return (z + Z) / (2 * Z) * H; };
    ctx.strokeStyle = 'rgba(232,236,241,0.22)'; ctx.setLineDash([3, 4]); ctx.beginPath();
    for (var k2 = 0; k2 <= 60; k2++) { var zz = -Z + 2 * Z * k2 / 60, ww = b.w0 * Math.sqrt(1 + zz * zz / (b.zR * b.zR)); ctx.lineTo(px(ww), pz(zz)); }
    ctx.stroke(); ctx.beginPath();
    for (k2 = 0; k2 <= 60; k2++) { zz = -Z + 2 * Z * k2 / 60; ww = b.w0 * Math.sqrt(1 + zz * zz / (b.zR * b.zR)); ctx.lineTo(px(-ww), pz(zz)); }
    ctx.stroke(); ctx.setLineDash([]);
    var zp = -Z + ((t * 6) % (2 * Z)), wp = b.w0 * Math.sqrt(1 + zp * zp / (b.zR * b.zR));
    ctx.strokeStyle = n === 1 ? 'rgba(138,108,255,0.85)' : 'rgba(255,74,61,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px(-wp), pz(zp)); ctx.lineTo(px(wp), pz(zp)); ctx.stroke();
    ctx.restore();
    return b;
  }
  function planePlot(b1, b2) {
    var s = fit(plot), ctx = plot.getContext('2d'); ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    var W = s.w / s.dpr, H = s.h / s.dpr; ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#1d242d'; ctx.beginPath(); ctx.moveTo(30, H - 22); ctx.lineTo(W - 8, H - 22); ctx.moveTo(30, 8); ctx.lineTo(30, H - 22); ctx.stroke();
    ctx.fillStyle = '#8a94a2'; ctx.font = '10px "Martian Mono", monospace';
    ctx.fillText('−10 µm', 30, H - 6); ctx.fillText('focus', W / 2 - 14, H - 6); ctx.fillText('+10 µm', W - 52, H - 6);
    function curve(f, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      for (var k = 0; k <= 200; k++) { var z = -Z + 2 * Z * k / 200, x = 30 + (W - 38) * k / 200, y = H - 22 - f(z) * (H - 34); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    curve(function () { return 1; }, '#8a6cff');                                         // ∫ I dA is the same in every plane
    curve(function (z) { return 1 / (1 + z * z / (b2.zR * b2.zR)); }, '#ff4a3d');          // ∫ I² dA ∝ 1 / w²
    ctx.fillStyle = '#8a6cff'; ctx.fillText('one-photon: every plane excited equally', 38, 20);
    ctx.fillStyle = '#ff4a3d'; ctx.fillText('two-photon: ∝ 1/w², FWHM = 2 zR = ' + (2 * b2.zR).toFixed(2) + ' µm', 38, 34);
  }
  function readouts(b1, b2, NA) {
    naOut.textContent = NA.toFixed(2);
    document.getElementById('r-1p').textContent = 'w₀ ' + b1.w0.toFixed(2) + ' µm · zR ' + b1.zR.toFixed(2) + ' µm';
    document.getElementById('r-2p').textContent = 'w₀ ' + b2.w0.toFixed(2) + ' µm · zR ' + b2.zR.toFixed(2) + ' µm · excitation radius w₀/√2 = ' + (b2.w0 / Math.SQRT2).toFixed(2) + ' µm';
  }
  var focusT = 0;
  function drawFocus(t) {
    if (!c1) return;
    var NA = +na.value, b1 = side(c1, 0.4, 1, NA, t), b2 = side(c2, 0.8, 2, NA, t);
    if (t === 0 || drawFocus.lastNA !== NA) { planePlot(b1, b2); readouts(b1, b2, NA); drawFocus.lastNA = NA; }
  }
  if (na) na.addEventListener('input', function () { drawFocus(focusT); });

  // ---------- 2. penetration ----------
  function drawDepth() {
    var cv = document.getElementById('depth'); if (!cv) return;
    var s = fit(cv), ctx = cv.getContext('2d'); ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    var W = s.w / s.dpr, H = s.h / s.dpr, L = 40, B = 26, Dmax = 15; ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#1d242d'; ctx.beginPath(); ctx.moveTo(L, 8); ctx.lineTo(L, H - B); ctx.lineTo(W - 8, H - B); ctx.stroke();
    ctx.fillStyle = '#8a94a2'; ctx.font = '10px "Martian Mono", monospace';
    for (var d = 0; d <= Dmax; d += 5) ctx.fillText(d + ' mm', L + (W - L - 8) * d / Dmax - 12, H - 8);
    ctx.fillText('1', L - 14, 14); ctx.fillText('0', L - 14, H - B);
    var lines = [
      { delta: 4.0, n: 1, color: '#ffae4a', label: '630 nm, one-photon (δ ≈ 4.0 mm)' },
      { delta: 6.6, n: 1, color: '#ff8a7a', label: '800 nm light (δ ≈ 6.6 mm)' },
      { delta: 6.6, n: 2, color: '#ff4a3d', label: '800 nm, two-photon excitation ∝ fluence² (δ/2 ≈ 3.3 mm)' }
    ];
    lines.forEach(function (l, idx) {
      ctx.strokeStyle = l.color; ctx.lineWidth = 2; ctx.setLineDash(l.n === 2 ? [6, 4] : []); ctx.beginPath();
      for (var k = 0; k <= 200; k++) { var z = Dmax * k / 200, v = Math.exp(-l.n * z / l.delta), x = L + (W - L - 8) * z / Dmax, y = H - B - v * (H - B - 10); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = l.color; ctx.fillText(l.label, L + 14, 22 + idx * 15);
    });
  }

  // ---------- 3. photodynamic therapy, illustrative ----------
  var pdt = document.getElementById('pdt'), pdtMode = 1, dose, running = false, scan = 0;
  var GW = 120, GH = 80, MMW = 12, MMH = 8;                              // grid and tissue size (mm)
  var conc = new Float32Array(GW * GH), isTumour = new Uint8Array(GW * GH), isAbove = new Uint8Array(GW * GH);
  for (var gy = 0; gy < GH; gy++) for (var gx = 0; gx < GW; gx++) {
    var xm = gx / GW * MMW - MMW / 2, zm = gy / GH * MMH;
    var inT = (xm * xm) / (2.0 * 2.0) + ((zm - 3.4) * (zm - 3.4)) / (1.0 * 1.0) <= 1;
    isTumour[gy * GW + gx] = inT ? 1 : 0;
    isAbove[gy * GW + gx] = !inT && Math.abs(xm) < 2.0 && zm < 3.4 - Math.sqrt(Math.max(0, 1 - xm * xm / 4.0));   // healthy tissue between skin and tumour
    conc[gy * GW + gx] = inT ? 1.0 : 0.35;                                // photosensitiser builds up in the tumour
  }
  function resetPdt() { dose = new Float32Array(GW * GH); scan = 0; running = true; }
  function stepPdt() {
    var i, gx, gy;
    if (pdtMode === 1) {                                                 // wide 630 nm beam from the surface, δ = 4 mm
      for (gy = 0; gy < GH; gy++) {
        var f = Math.exp(-(gy / GH * MMH) / 4.0);
        for (gx = 0; gx < GW; gx++) {
          var xm = gx / GW * MMW - MMW / 2;
          if (Math.abs(xm) < 3.2) { i = gy * GW + gx; dose[i] += 0.008 * f * conc[i]; }
        }
      }
    } else {                                                             // 800 nm focus raster-scanned over the tumour
      for (var rep = 0; rep < 3; rep++) {
        var cols = 40, rows = 14, k = scan % (cols * rows), r = Math.floor(k / cols), cIdx = r % 2 ? cols - 1 - (k % cols) : k % cols;
        var fx = -2.0 + 4.0 * cIdx / (cols - 1), fz = 2.4 + 2.0 * r / (rows - 1);
        scan++;
        if ((fx * fx) / 4.0 + ((fz - 3.4) * (fz - 3.4)) > 1) continue;    // skip points outside the tumour outline
        var amp = Math.exp(-2 * fz / 6.6);                                // fluence² at that depth
        for (gy = 0; gy < GH; gy++) for (gx = 0; gx < GW; gx++) {
          var dx = gx / GW * MMW - MMW / 2 - fx, dz = gy / GH * MMH - fz, rr = (dx * dx + dz * dz) / (0.12 * 0.12);
          if (rr < 9) { i = gy * GW + gx; dose[i] += 0.55 * amp * Math.exp(-rr) * conc[i]; }
        }
      }
    }
  }
  function pdtStats() {
    var t = 0, nt = 0, h = 0, nh = 0;
    for (var i = 0; i < dose.length; i++) { if (isTumour[i]) { t += dose[i]; nt++; } else if (isAbove[i]) { h += dose[i]; nh++; } }
    return { tumour: t / nt, healthy: h / nh };
  }
  function drawPdt() {
    if (!pdt) return;
    var s = fit(pdt), ctx = pdt.getContext('2d');
    var off = drawPdt.off || (drawPdt.off = document.createElement('canvas')); off.width = GW; off.height = GH;
    var octx = off.getContext('2d'), img = octx.createImageData(GW, GH), d = img.data;
    var st = pdtStats(), scale = Math.max(0.0001, st.tumour * 1.6);
    for (var i = 0; i < GW * GH; i++) {
      var gy = Math.floor(i / GW), base = isTumour[i] ? [74, 38, 52] : gy < 2 ? [92, 72, 66] : [40, 46, 56];
      var v = Math.min(1, dose[i] / scale), col = heat(v), k = 4 * i;
      d[k] = base[0] * (1 - v) + col[0] * v; d[k + 1] = base[1] * (1 - v) + col[1] * v; d[k + 2] = base[2] * (1 - v) + col[2] * v; d[k + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, s.w, s.h);
    ctx.save(); ctx.scale(s.dpr, s.dpr);
    var W = s.w / s.dpr, H = s.h / s.dpr;
    ctx.strokeStyle = 'rgba(232,236,241,0.5)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.ellipse(W / 2, 3.4 / MMH * H, 2.0 / MMW * W, 1.0 / MMH * H, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#e8ecf1'; ctx.font = '11px "Martian Mono", monospace';
    ctx.fillText('tumour', W / 2 - 22, 3.4 / MMH * H + 4);
    ctx.fillStyle = '#8a94a2'; ctx.fillText('skin', 8, 14); ctx.fillText('8 mm deep', 8, H - 8);
    ctx.restore();
    document.getElementById('pdt-tumour').textContent = (100 * Math.min(1, st.tumour / 0.6)).toFixed(0) + '%';
    document.getElementById('pdt-ratio').textContent = st.tumour > 0 ? (st.healthy / st.tumour < 0.01 ? '< 1%' : (100 * st.healthy / st.tumour).toFixed(0) + '%') : '–';
    if (st.tumour >= 0.6) running = false;                                // stop once the tumour has its dose
  }
  document.querySelectorAll('[data-pdt]').forEach(function (b) {
    b.addEventListener('click', function () {
      pdtMode = +b.dataset.pdt;
      document.querySelectorAll('[data-pdt]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      resetPdt();
    });
  });
  resetPdt();
  if (reduce) { for (var w = 0; w < 400 && running; w++) { stepPdt(); if (pdtStats().tumour >= 0.6) running = false; } }

  // ---------- loop ----------
  var visible = {};
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { visible[e.target.id] = e.isIntersecting; }); });
    [c1, pdt].forEach(function (el) { if (el) io.observe(el); });
  } else { visible.focus = visible.pdt = true; }
  drawFocus(0); drawDepth(); drawPdt();
  window.addEventListener('resize', function () { drawFocus.lastNA = null; drawFocus(focusT); drawDepth(); drawPdt(); });
  if (reduce) return;
  var t0 = performance.now();
  (function loop(now) {
    focusT = (now - t0) / 1000;
    if (visible['focus-1p'] !== false && !document.hidden) drawFocus(focusT);
    if (visible.pdt !== false && running && !document.hidden) { stepPdt(); drawPdt(); }
    requestAnimationFrame(loop);
  })(t0);
})();
