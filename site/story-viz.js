/* Story page visuals: the life strip, the four-field explainer (four small animated diagrams),
   live chess ratings from the Chess.com and Lichess public APIs, a sensor-size comparison and the
   half-marathon distance. Everything is drawn from stated facts; diagrams are labelled schematic. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var C = { bg: '#0b0f14', ink: '#e8ecf1', muted: '#8a94a2', dim: '#3a4452', amber: '#ffae4a', red: '#ff4a3d', blue: '#7fb6ff', rule: '#1d242d' };
  function onView(el, fn, once) {                       // run fn(true/false) as el enters or leaves the screen
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(true); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { fn(e.isIntersecting); if (once && e.isIntersecting) io.disconnect(); }); }, { threshold: 0.25 });
    io.observe(el);
  }
  function fit(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  // ---------- 1. life strip: grows into place when it scrolls into view ----------
  var strip = document.querySelector('.lifeline');
  onView(strip, function (v) { if (v) strip.classList.add('in'); }, true);

  // ---------- 2. four fields, four diagrams ----------
  var canvas = document.getElementById('field-canvas'), caption = document.getElementById('field-caption');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-field]'));
  var CAPTIONS = {
    bio: 'Protein modules hold a fluorescent nanocluster stable. My first paper: <em>Biomacromolecules</em>, 2015.',
    photo: 'Two photons excite the photosensitiser, which passes the energy to oxygen: singlet oxygen, glowing at 1270 nm. Not to scale.',
    eng: 'Fibres, lasers, photon counting. Capillaries keep light and sample together in the hollow core, over centimetres. Schematic.',
    ai: 'Local models and tools with safety limits; every answer is checked against a measurement before it is trusted.'
  };
  var field = 'bio', chosen = false, fieldVisible = false, t0 = performance.now();

  function drawBio(ctx, w, h, t) {
    var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.32, n = 12, spin = reduce ? 0 : t * 0.12;
    for (var p = 0; p < 14; p++) {                       // fluorescence photons leaving the cluster, with trails
      var ph = reduce ? (p / 14) : ((t * 0.45 + p / 14) % 1), ang = p * 0.449 + 0.3, d0 = R * 0.25 + ph * Math.max(w, h) * 0.5, d1 = d0 - 26;
      var grd = ctx.createLinearGradient(cx + Math.cos(ang) * d1, cy + Math.sin(ang) * d1, cx + Math.cos(ang) * d0, cy + Math.sin(ang) * d0);
      grd.addColorStop(0, 'rgba(255,74,61,0)'); grd.addColorStop(1, 'rgba(255,74,61,' + (0.9 * (1 - ph)) + ')');
      ctx.strokeStyle = grd; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * Math.max(R * 0.25, d1), cy + Math.sin(ang) * Math.max(R * 0.25, d1)); ctx.lineTo(cx + Math.cos(ang) * d0, cy + Math.sin(ang) * d0); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(91,122,166,0.55)'; ctx.lineWidth = 2; ctx.beginPath();     // backbone joining the modules
    for (var i = 0; i <= 240; i++) { var u = i / 240, aa = u * 6.283 + spin, rr = R + Math.sin(u * n * 6.283) * 10; var x = cx + Math.cos(aa) * rr, y = cy + Math.sin(aa) * rr * 0.82; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    for (var k = 0; k < n; k++) {                        // repeat modules: a pair of helices each
      var a1 = k / n * 6.283 + spin, mx = cx + Math.cos(a1) * R, my = cy + Math.sin(a1) * R * 0.82;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(a1 + Math.PI / 2);
      ctx.fillStyle = k % 2 ? '#4a6a96' : '#6a8bb8'; ctx.beginPath(); ctx.roundRect(-17, -6, 34, 12, 6); ctx.fill();
      ctx.fillStyle = '#34507a'; ctx.beginPath(); ctx.roundRect(-14, 8, 28, 10, 5); ctx.fill();
      ctx.restore();
    }
    var glow = reduce ? 0.8 : 0.65 + 0.35 * Math.sin(t * 2.2);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.75); g.addColorStop(0, 'rgba(255,174,74,' + 0.85 * glow + ')'); g.addColorStop(0.35, 'rgba(255,120,60,' + 0.35 * glow + ')'); g.addColorStop(1, 'rgba(255,74,61,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.75, 0, 7); ctx.fill();
    for (var j = 0; j < 9; j++) { var bb = j / 9 * 6.283 + spin * 2, rj = j % 3 ? 9 : 4; ctx.fillStyle = '#ffd38a'; ctx.beginPath(); ctx.arc(cx + Math.cos(bb) * rj, cy + Math.sin(bb) * rj, 4, 0, 7); ctx.fill(); }
    var tight = w < 480;                                 // narrow: labels go to the corners, clear of the ring
    label(ctx, 'protein modules', tight ? w - 10 : cx + R * 1.12, tight ? 20 : cy - R * 0.7, tight ? 'right' : 'left', C.ink);
    label(ctx, 'nanocluster', cx, cy + 34, 'center', C.ink);
    label(ctx, 'fluorescence', tight ? 10 : cx - R * 1.15, tight ? h - 12 : cy + R * 0.95, tight ? 'left' : 'right', C.red);
  }

  function arrow(ctx, x1, y1, x2, y2, col, wavy) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    if (wavy) { var n = 40; for (var i = 0; i <= n; i++) { var u = i / n, x = x1 + (x2 - x1) * u, y = y1 + (y2 - y1) * u, dx = -(y2 - y1), dy = x2 - x1, l = Math.hypot(dx, dy) || 1, s = Math.sin(u * 20) * 4; if (i) ctx.lineTo(x + dx / l * s, y + dy / l * s); else ctx.moveTo(x, y); } }
    else { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
    var a = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4)); ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4)); ctx.fill();
  }
  function label(ctx, text, x, y, align, col) { ctx.fillStyle = col || C.muted; ctx.font = '11px Martian Mono, monospace'; ctx.textAlign = align || 'left'; ctx.fillText(text, x, y); }
  function level(ctx, x1, x2, y, name) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); label(ctx, name, x1 - 8, y + 4, 'right', C.ink); }

  function drawPhoto(ctx, w, h, t) {
    var base = h * 0.84, top = h * 0.14, L = w * 0.16, M = w * 0.42, R1 = w * 0.6, R2 = w * 0.86;
    var S1 = top + (base - top) * 0.05, T1 = top + (base - top) * 0.32, D = base - (base - top) * 0.32;
    level(ctx, L, M, base, 'S0'); level(ctx, L, M, S1, 'S1'); level(ctx, L + (M - L) * 0.45, M + 20, T1, 'T1');
    level(ctx, R1, R2, base, '³O₂'); level(ctx, R1, R2, D, '¹O₂');
    label(ctx, 'photosensitiser', (L + M) / 2, base + 22, 'center'); label(ctx, 'oxygen', (R1 + R2) / 2, base + 22, 'center');
    var ph = reduce ? 9 : (t % 6), mid = (base + S1) / 2, x0 = L + (M - L) * 0.22;
    if (ph > 0) arrow(ctx, x0, base, x0, ph < 0.6 ? base - (base - mid) * ph / 0.6 : mid, C.red);                      // photon 1
    if (ph > 0.6) arrow(ctx, x0 + 12, mid, x0 + 12, ph < 1.2 ? mid - (mid - S1) * (ph - 0.6) / 0.6 : S1, C.red);        // photon 2
    if (ph > 0.3) { ctx.font = '11px Martian Mono, monospace'; var tw = ctx.measureText('2 × 800 nm').width; if (x0 - 10 - tw > 4) label(ctx, '2 × 800 nm', x0 - 10, mid + 4, 'right', C.red); else label(ctx, '2 × 800 nm', L - 30, S1 - 14, 'left', C.red); }
    if (ph > 1.4) arrow(ctx, x0 + 30, S1, L + (M - L) * 0.6, T1, C.muted, true);                                       // intersystem crossing
    if (ph > 2.2) { ctx.setLineDash([5, 5]); arrow(ctx, M + 20, T1, R1 + 10, D - 6, C.amber); ctx.setLineDash([]); label(ctx, 'energy transfer', (M + R1) / 2 + 22, (T1 + D) / 2 - 16, 'left', C.amber); }
    if (ph > 2.6) arrow(ctx, R1 + 22, base, R1 + 22, D, C.amber);
    if (ph > 3.4) {
      arrow(ctx, R2 - 24, D, R2 - 24, base, C.blue);
      var q = Math.min(1, (ph - 3.4) / 1.6), wx = R2 - 14, wy = (D + base) / 2;
      ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.beginPath();
      for (var i = 0; i <= 40; i++) { var x = wx + i / 40 * (w - wx - 10) * q, y = wy + Math.sin(i / 2.5) * 5; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); if (q > 0.5) label(ctx, '1270 nm', R2 - 10, wy - 12, 'left', C.blue);
    }
  }

  function drawEng(ctx, w, h, t) {
    var cx = Math.min(w * 0.28, h * 0.55), cy = h / 2, R = Math.min(h * 0.38, w * 0.22);
    var x1 = cx + R + 30, x2 = w - 20, sy = cy, stackedView = x2 - x1 < 300;
    if (stackedView) {                                   // narrow: cross-section on top, side view below it
      cx = w / 2; cy = h * 0.27; R = Math.min(h * 0.22, w * 0.2); x1 = 20; x2 = w - 20; sy = h * 0.74;
    }
    ctx.fillStyle = '#121820'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.strokeStyle = '#6b7684'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    var n = 8, r = R * 0.2;
    for (var k = 0; k < n; k++) { var a = k / n * 6.283; ctx.strokeStyle = '#9aa5b3'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R - r - 3), cy + Math.sin(a) * (R - r - 3), r, 0, 7); ctx.stroke(); }
    var pulse = reduce ? 0.8 : 0.7 + 0.3 * Math.sin(t * 2), core = R - 2 * r - 6;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core); g.addColorStop(0, 'rgba(255,74,61,' + 0.9 * pulse + ')'); g.addColorStop(0.6, 'rgba(255,74,61,0.25)'); g.addColorStop(1, 'rgba(255,74,61,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, core, 0, 7); ctx.fill();
    label(ctx, 'cross-section', cx, cy + R + (stackedView ? 18 : 22), 'center');
    var half = Math.max(8, core * 0.5);                                                             // side view: the core as a channel
    if (x2 - x1 > 80) {
      ctx.fillStyle = '#121820'; ctx.fillRect(x1, sy - half * 2.4, x2 - x1, half * 4.8);
      ctx.strokeStyle = '#6b7684'; ctx.lineWidth = 1.5; ctx.strokeRect(x1, sy - half * 2.4, x2 - x1, half * 4.8);
      ctx.fillStyle = 'rgba(127,182,255,0.12)'; ctx.fillRect(x1, sy - half, x2 - x1, half * 2);
      for (var p = 0; p < 5; p++) { var u = reduce ? p / 5 : ((t * 0.35 + p / 5) % 1), x = x1 + u * (x2 - x1);
        var gg = ctx.createRadialGradient(x, sy, 0, x, sy, half * 1.6); gg.addColorStop(0, 'rgba(255,74,61,0.9)'); gg.addColorStop(1, 'rgba(255,74,61,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, sy, half * 1.6, 0, 7); ctx.fill(); }
      label(ctx, stackedView && w < 330 ? 'light and sample, centimetres long' : 'light and sample together, centimetres long', (x1 + x2) / 2, sy + half * 2.4 + 20, 'center');
    }
  }


  function drawAI(ctx, w, h, t) {
    var nodes = ['question', 'model plans', 'tool acts', 'measurement', 'checked answer'];
    var notes = ['one photon or two?', 'local Qwen or Claude', 'laser, Stockfish, docs search', 'spectra, evaluations, citations', 'fits, claim checks, held-out set'];
    if (w < 560) { drawAIColumn(ctx, w, h, t, nodes, notes); return; }
    var cx = w / 2, cy = h / 2, R = Math.min(w * 0.36, h * 0.36);
    ctx.strokeStyle = C.rule; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.25, R, 0, 0, 7); ctx.stroke();
    var u = reduce ? 0.1 : (t * 0.18) % 1, ang = -Math.PI / 2 + u * 6.283;
    var dx = cx + Math.cos(ang) * R * 1.25, dy = cy + Math.sin(ang) * R;
    var g = ctx.createRadialGradient(dx, dy, 0, dx, dy, 16); g.addColorStop(0, 'rgba(255,174,74,0.95)'); g.addColorStop(1, 'rgba(255,174,74,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dx, dy, 16, 0, 7); ctx.fill();
    nodes.forEach(function (name, k) {
      var a = -Math.PI / 2 + k / nodes.length * 6.283, x = cx + Math.cos(a) * R * 1.25, y = cy + Math.sin(a) * R, near = Math.abs(((u * nodes.length - k) % nodes.length + nodes.length) % nodes.length) < 0.5;
      ctx.fillStyle = near ? C.amber : '#1a222c'; ctx.strokeStyle = near ? C.amber : '#3a4452'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.stroke();
      var lx = x + (Math.cos(a) > 0.2 ? 14 : Math.cos(a) < -0.2 ? -14 : 0), ly = y + (Math.sin(a) < -0.5 ? -28 : Math.sin(a) > 0.5 ? 22 : 4), al = Math.cos(a) > 0.2 ? 'left' : Math.cos(a) < -0.2 ? 'right' : 'center';
      label(ctx, name, lx, ly, al, near ? C.ink : C.muted);
      ctx.font = '10px Martian Mono, monospace'; ctx.fillStyle = near ? C.amber : '#6b7684'; ctx.textAlign = al; ctx.fillText(notes[k], lx, ly + 14);
    });
    ctx.fillStyle = C.ink; ctx.font = '600 15px Schibsted Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('agent', cx, cy + 5);
  }

  function drawAIColumn(ctx, w, h, t, nodes, notes) {   // narrow screens: the same loop as a column, labels to the right
    var n = nodes.length, x = 46, top = 30, step = (h - 60) / (n - 1), back = 26;
    ctx.strokeStyle = C.rule; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x, top); ctx.lineTo(x, top + step * (n - 1)); ctx.lineTo(back, top + step * (n - 1)); ctx.lineTo(back, top); ctx.lineTo(x, top); ctx.stroke();
    var u = reduce ? 0.1 : (t * 0.18) % 1, pos = u * n, k0 = Math.floor(pos), f = pos - k0;
    var py = k0 < n - 1 ? top + step * (k0 + f) : top + step * (n - 1) * (1 - f), px = k0 < n - 1 ? x : back;
    var g = ctx.createRadialGradient(px, py, 0, px, py, 14); g.addColorStop(0, 'rgba(255,174,74,0.95)'); g.addColorStop(1, 'rgba(255,174,74,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 14, 0, 7); ctx.fill();
    nodes.forEach(function (name, k) {
      var y = top + step * k, near = k0 < n - 1 ? Math.round(k0 + f) === k : k === 0 && f > 0.5;
      ctx.fillStyle = near ? C.amber : '#1a222c'; ctx.strokeStyle = near ? C.amber : '#3a4452'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.stroke();
      label(ctx, name, x + 18, y - 2, 'left', near ? C.ink : C.muted);
      ctx.font = '10px Martian Mono, monospace'; ctx.fillStyle = near ? C.amber : '#6b7684'; ctx.textAlign = 'left'; ctx.fillText(notes[k], x + 18, y + 13);
    });
    ctx.save(); ctx.translate(back - 10, top + step * (n - 1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = C.ink; ctx.font = '600 13px Schibsted Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('agent', 0, 0); ctx.restore();
  }

  var DRAW = { bio: drawBio, photo: drawPhoto, eng: drawEng, ai: drawAI };
  function setField(f, user) {
    field = f; if (user) chosen = true; t0 = performance.now();
    tabs.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.field === f)); });
    if (caption) caption.innerHTML = CAPTIONS[f];
    if (reduce) drawField(performance.now());
  }
  function drawField(now) {
    if (!canvas) return;
    var s = fit(canvas); s.ctx.fillStyle = C.bg; s.ctx.fillRect(0, 0, s.w, s.h);
    DRAW[field](s.ctx, s.w, s.h, (now - t0) / 1000);
  }
  if (canvas) {
    tabs.forEach(function (b) { b.addEventListener('click', function () { setField(b.dataset.field, true); }); });
    setField('bio');
    onView(canvas, function (v) { fieldVisible = v; });
    var order = ['bio', 'photo', 'eng', 'ai'], last = performance.now();
    if (reduce) drawField(performance.now());
    else (function loop(now) {
      if (fieldVisible && !document.hidden) {
        drawField(now);
        if (!chosen && now - last > 7000) { last = now; setField(order[(order.indexOf(field) + 1) % 4]); }
      } else last = now;
      requestAnimationFrame(loop);
    })(performance.now());
    window.addEventListener('resize', function () { drawField(performance.now()); });
  }

  // ---------- 3. live ratings ----------
  var box = document.getElementById('ratings');
  function bars(rows) {
    var lo = 1400, hi = 3000, pct = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); };
    box.innerHTML = rows.map(function (r) {
      return '<div class="rrow"><span class="rname">' + r.name + '</span><span class="rtrack"><span class="rfill" data-w="' + pct(r.now) + '"></span>' +
        (r.best ? '<span class="rbest" data-l="' + pct(r.best) + '" title="best ' + r.best + (r.when ? ', ' + r.when : '') + '"></span>' : '') +
        '</span><span class="rnum">' + r.now + (r.best && r.best !== r.now ? ' <em>best ' + r.best + '</em>' : '') + '</span></div>';
    }).join('') + '<p class="mono rnote">Red marker: best Chess.com rating. Scale 1400 to 3000.</p>';
    box.querySelectorAll('.rfill').forEach(function (e) { e.style.width = '0%'; });
    box.querySelectorAll('.rbest').forEach(function (e) { e.style.left = e.dataset.l + '%'; });
    onView(box, function (v) { if (v) box.querySelectorAll('.rfill').forEach(function (e) { e.style.width = e.dataset.w + '%'; }); }, true);
  }
  if (box) {
    var NAMES = { chess_blitz: 'Chess.com blitz', chess_bullet: 'Chess.com bullet', chess_rapid: 'Chess.com rapid' };
    Promise.all([
      fetch('https://api.chess.com/pub/player/dr_namer/stats').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch('https://lichess.org/api/user/dr_namer').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (res) {
      var cc = res[0], li = res[1], rows = [];
      Object.keys(NAMES).forEach(function (k) {
        var s = cc[k]; if (!s || !s.last) return;
        rows.push({ name: NAMES[k], now: s.last.rating, best: s.best && s.best.rating, when: s.best && s.best.date ? new Date(s.best.date * 1000).toISOString().slice(0, 7) : '' });
      });
      ['blitz', 'bullet'].forEach(function (k) { var p = li.perfs && li.perfs[k]; if (p && p.games) rows.push({ name: 'Lichess ' + k, now: p.rating }); });
      if (rows.length) bars(rows); else box.innerHTML = '<p class="mono">The live ratings could not be loaded right now. Chess.com blitz peak: 2830.</p>';
    });
  }

  // ---------- 4. sensor sizes, drawn to scale ----------
  var sensor = document.getElementById('sensor-svg'), sensorText = document.getElementById('sensor-text');
  var SENSORS = { phone: { name: '1-inch type (large phone sensors)', w: 13.2, h: 8.8 }, apsc: { name: 'APS-C', w: 23.5, h: 15.6 }, ff: { name: 'Full frame', w: 36, h: 24 }, x2d: { name: 'Hasselblad X2D, 100 MP', w: 43.8, h: 32.9 } };
  var sensorSel = 'x2d';
  function drawSensors(sel) {
    sensorSel = sel;
    var k = 9, ox = 20, oy = 20, html = '';
    var scale = (sensor.clientWidth || 434) / 434, fs = Math.max(11, Math.round(10.5 / scale));   // keep labels near 10 px on phones
    Object.keys(SENSORS).reverse().forEach(function (key) {
      var s = SENSORS[key], on = key === sel, x2d = key === 'x2d';
      html += '<rect x="' + ox + '" y="' + (oy + (32.9 - s.h) * k) + '" width="' + s.w * k + '" height="' + s.h * k + '" fill="' + (on ? (x2d ? 'rgba(255,174,74,0.22)' : 'rgba(127,182,255,0.18)') : 'none') +
        '" stroke="' + (on ? (x2d ? '#ffae4a' : '#7fb6ff') : '#3a4452') + '" stroke-width="' + (on ? 2 : 1.2) + '"/>';
      var short = { phone: '1"', apsc: 'APS-C', ff: 'FF', x2d: 'X2D' }[key];
      html += '<text x="' + (ox + s.w * k - 6) + '" y="' + (oy + (32.9 - s.h) * k + fs + 4) + '" text-anchor="end" fill="' + (on ? '#e8ecf1' : '#6b7684') + '" font-family="Martian Mono, monospace" font-size="' + fs + '">' + short + '</text>';
    });
    sensor.innerHTML = html + '<text x="' + ox + '" y="' + (oy + 32.9 * k + fs + 6) + '" fill="#8a94a2" font-family="Martian Mono, monospace" font-size="' + fs + '">drawn to scale</text>';
    var s = SENSORS[sel], area = s.w * s.h, x = SENSORS.x2d.w * SENSORS.x2d.h;
    sensorText.textContent = s.name + ' · ' + s.w + ' × ' + s.h + ' mm · ' + (sel === 'x2d' ? (x / (36 * 24)).toFixed(2) + ' × the area of full frame' : 'the X2D has ' + (x / area).toFixed(1) + ' × this area');
    document.querySelectorAll('[data-sensor]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.sensor === sel)); });
  }
  if (sensor) {
    document.querySelectorAll('[data-sensor]').forEach(function (b) { b.addEventListener('click', function () { drawSensors(b.dataset.sensor); }); });
    drawSensors('x2d');
    window.addEventListener('resize', function () { drawSensors(sensorSel); });
  }

  // ---------- 5. seven half marathons ----------
  var road = document.querySelector('.road');
  onView(road, function (v) { if (v) road.classList.add('in'); }, true);
})();
