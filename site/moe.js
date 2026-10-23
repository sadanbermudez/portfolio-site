/* MoE case study: one token through DeepSeek V4 Flash's 43 layers on colibri, a real-time race of the
   24 tokens every run wrote, and the bytes-per-token arithmetic. Token speeds and CPU use are the
   measured means from 21 October 2026 (on battery, like for like); "overlap" is a projection.
   Inside a layer, the order of the steps follows colibri's source; their lengths are a model, scaled
   so each token takes the measured time. Which experts the router picks is random. */
(function () {
  var LAYERS = 43, EXPERTS = 256, PICK = 6, HIT = 0.37, THREADS = 12, BARRIERS = 12;
  var CONFIGS = {
    shipped: { build: 'shipped · GCC, AVX2', tok: 0.215, range: '0.197 to 0.227, 4 runs', cpu: '9%', sleep: true,
      note: 'Idle threads sleep at every barrier and must be woken: the dark gaps.' },
    avx512: { build: 'clang · AVX-512', tok: 0.353, range: '0.349, 0.357', cpu: '46%', fast: true,
      note: 'Threads spin while they wait (purple), and AVX-512 shortens every compute step.' },
    spin: { build: 'clang · AVX2', tok: 0.324, range: '0.321 to 0.326, 4 runs', cpu: '46%',
      note: 'Same instructions as the shipped engine. Waiting threads spin (purple) instead of sleeping.' },
    passive: { build: 'clang · AVX2 · told to sleep', tok: 0.2135, range: '0.215, 0.212', cpu: '10%', sleep: true,
      note: 'The fast build, told to sleep: the gaps and the lost speed come back.' },
    overlap: { build: 'projection · prefetch + 1 barrier', tok: 0.215 * 3, range: '3 to 4× shipped, not measured', cpu: '—', prefetch: true,
      note: 'Projection: the next layer\'s experts stream in while this one computes, so the drive never stops.' }
  };
  var TEXT = ['A', ' mixture', '-', 'of', '-experts', ' (', 'Mo', 'E', ')', ' model', ' activates', ' only', ' a', ' small',
    ' subset', ' of', ' its', ' total', ' parameters', ' (', 'the', ' "', 'exp', 'erts'];
  var C = { bg: '#0b0f14', rule: '#1d242d', muted: '#8a94a2', ink: '#e8ecf1', dim: '#4f5966', red: '#ff4a3d', amber: '#ffae4a', blue: '#7fb6ff', spin: '#b48cff' };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* One layer as a list of steps in model units. Spinning with AVX2 is the reference (0.98 units);
     each build's total is scaled from it by measured speed, and the difference goes to wake-ups
     (sleeping builds) or to shorter compute (AVX-512, projection). */
  function plan(cfg) {
    var units = 0.98 * CONFIGS.spin.tok / cfg.tok, route = cfg.prefetch ? 0.06 : 0.08, load = cfg.prefetch ? 0 : 0.30;
    var work = 0.60, gap = 0, rest = units - route - load;
    if (cfg.sleep) gap = (rest - work) / BARRIERS; else work = rest;
    var steps = [{ k: 'route', d: route }];
    if (load) steps.push({ k: 'load', d: load });
    var n = cfg.prefetch ? 1 : BARRIERS;          /* the projection batches a layer's experts: one barrier */
    for (var i = 0; i < n; i++) { steps.push({ k: 'work', d: work / n }); if (gap) steps.push({ k: 'wake', d: gap }); }
    var t = 0;
    steps.forEach(function (s) { s.t = t; t += s.d; });
    return { steps: steps, units: t };
  }

  // Deterministic "router": the same token and layer always pick the same experts.
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function route(token, layer) {
    var r = rng(token * 7919 + layer * 104729 + 1), out = [], used = {};
    while (out.length < PICK) {
      var e = Math.floor(r() * EXPERTS);
      if (!used[e]) { used[e] = 1; out.push({ e: e, hit: r() < HIT }); }
    }
    return out;
  }

  /* ---------- the token journey panel ---------- */
  var canvas = document.getElementById('moe');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var state = { cfg: 'shipped', slow: 10, token: 1, layer: 0, t: 0, picks: route(1, 0) };
  var current = plan(CONFIGS.shipped), W = 0, H = 0, running = false, visible = true, last = 0;
  var maxUnits = Math.max.apply(null, Object.keys(CONFIGS).map(function (k) { return plan(CONFIGS[k]).units; }));

  // Rows top to bottom: the 43 layers, the drive / expert grid / RAM, twelve thread lanes, the legend.
  function geometry() {
    var phone = W < 520, gh = phone ? 80 : 150, lh = phone ? 4 : 7, gapY = phone ? 2 : 3;
    var gy = 40, ly = gy + gh + (phone ? 16 : 26);
    return { phone: phone, gy: gy, gh: gh, ly: ly, lh: lh, gapY: gapY, bottom: ly + THREADS * (lh + gapY) };
  }
  function size() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = geometry().bottom + 28;
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function layerSeconds() { return 1 / CONFIGS[state.cfg].tok / LAYERS; }

  function stepAt(u) {
    var s = current.steps;
    for (var i = 0; i < s.length; i++) if (u < s[i].t + s[i].d) return s[i];
    return s[s.length - 1];
  }

  function draw() {
    if (!W) return;
    var cfg = CONFIGS[state.cfg], u = state.t * current.units, g = geometry(), phone = g.phone;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.font = (phone ? 10 : 11) + 'px "Martian Mono", ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';

    // 1. the 43 layers of this token
    var pad = 14, top = 14, cw = (W - 2 * pad) / LAYERS;
    for (var l = 0; l < LAYERS; l++) {
      ctx.fillStyle = l < state.layer ? C.amber : l === state.layer ? C.ink : '#18202a';
      ctx.fillRect(pad + l * cw + 1, top, Math.max(1, cw - 2), 8);
    }

    // 2. SSD, the expert grid of this layer, RAM
    var gy = g.gy, gh = g.gh, cell = Math.floor(gh / 16), gw = cell * 16, gx = Math.round((W - gw) / 2);
    var boxW = Math.min(110, gx - pad - 18);
    ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
    ctx.strokeRect(pad + 0.5, gy + 0.5, boxW, gh); ctx.strokeRect(W - pad - boxW + 0.5, gy + 0.5, boxW, gh);
    ctx.fillStyle = C.blue; ctx.fillText('SSD', pad + 8, gy + 18);
    ctx.fillStyle = C.amber; ctx.fillText('RAM', W - pad - boxW + 8, gy + 18);
    if (!phone) {
      ctx.fillStyle = C.muted;
      ctx.fillText('4.8 GB/s max', pad + 8, gy + 36); ctx.fillText('37% of experts', W - pad - boxW + 8, gy + 36);
    }
    var step = stepAt(u), routed = u >= current.steps[0].d;
    var loadStep = current.steps[1].k === 'load' ? current.steps[1] : null;
    var loadP = cfg.prefetch ? 1 : loadStep ? Math.min(1, Math.max(0, (u - loadStep.t) / loadStep.d)) : 1;
    var chosen = {};
    state.picks.forEach(function (p) { chosen[p.e] = p; });
    for (var i = 0; i < EXPERTS; i++) {
      var x = gx + (i % 16) * cell, y = gy + Math.floor(i / 16) * cell, p = chosen[i];
      ctx.fillStyle = '#141b23';
      if (p && routed) ctx.fillStyle = p.hit ? C.amber : loadP >= 1 ? C.blue : 'rgba(127,182,255,' + (0.15 + 0.6 * loadP) + ')';
      else if (p && step.k === 'route') ctx.fillStyle = C.red;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
    // weights in flight from the drive: during the load step, or all the time when the next layer is prefetched
    var streaming = cfg.prefetch || (routed && loadStep && loadP < 1);
    if (streaming) {
      var now = performance.now() / 1000;
      state.picks.forEach(function (p, k) {
        if (p.hit && !cfg.prefetch) return;
        var tx = gx + (p.e % 16) * cell + cell / 2, ty = gy + Math.floor(p.e / 16) * cell + cell / 2;
        for (var d = 0; d < 3; d++) {
          var f = ((now * 0.9 + d / 3 + k * 0.13) % 1), sx = pad + boxW, sy = gy + gh / 2;
          if (cfg.prefetch) { tx = gx - 4; ty = gy + 10 + ((k * 37) % (gh - 20)); }
          ctx.fillStyle = C.blue;
          ctx.beginPath(); ctx.arc(sx + (tx - sx) * f, sy + (ty - sy) * f, 2, 0, 6.3); ctx.fill();
        }
      });
    }

    // 3. twelve thread lanes for this layer, drawn up to the playhead
    var ly = g.ly, lh = g.lh, gapY = g.gapY, lx = pad + (phone ? 0 : 92), lw = W - lx - pad;
    var scale = lw / maxUnits;
    ctx.fillStyle = C.muted;
    if (!phone) ctx.fillText('12 threads', pad, ly + 10);
    current.steps.forEach(function (s) {
      if (s.t > u) return;
      var x = lx + s.t * scale, w = Math.min(s.d, u - s.t) * scale;
      for (var th = 0; th < THREADS; th++) {
        var yy = ly + th * (lh + gapY), col;
        if (s.k === 'route') col = th === 0 ? C.red : cfg.sleep ? null : C.spin;
        else if (s.k === 'load') col = th < 3 ? C.ink : cfg.sleep ? null : C.spin;      /* the shared expert, while experts load */
        else if (s.k === 'work') col = C.ink;
        else col = null;                                                                  /* asleep: nothing runs */
        if (!col) continue;
        ctx.globalAlpha = col === C.spin ? 0.45 : 0.9;
        ctx.fillStyle = col; ctx.fillRect(x, yy, Math.max(0.5, w), lh);
      }
      ctx.globalAlpha = 1;
      if (s.k === 'wake') {                                                                /* wake-up cost: every lane waits */
        ctx.fillStyle = 'rgba(255,74,61,0.18)'; ctx.fillRect(x, ly - 2, Math.max(0.5, w), THREADS * (lh + gapY) + 2);
      }
    });
    var bottom = g.bottom;
    current.steps.forEach(function (s) {                                                   /* barriers between compute steps */
      if (s.k !== 'work' || s.t > u) return;
      ctx.fillStyle = C.bg; ctx.fillRect(lx + (s.t + s.d) * scale - 0.5, ly - 2, 1, bottom - ly + 2);
    });
    ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(lx + u * scale + 0.5, ly - 4); ctx.lineTo(lx + u * scale + 0.5, bottom + 2); ctx.stroke();
    ctx.strokeStyle = C.rule; ctx.beginPath(); ctx.moveTo(lx + current.units * scale + 0.5, ly - 4); ctx.lineTo(lx + current.units * scale + 0.5, bottom + 2); ctx.stroke();

    // legend
    var lg = [[C.red, 'router'], [C.ink, 'compute'], [C.spin, 'spinning'], ['rgba(255,74,61,0.45)', 'asleep, waking']], lxx = pad;
    lg.forEach(function (g) {
      ctx.fillStyle = g[0]; ctx.fillRect(lxx, bottom + 12, 8, 8);
      ctx.fillStyle = C.muted; ctx.fillText(g[1], lxx + 12, bottom + 20);
      lxx += ctx.measureText(g[1]).width + (phone ? 18 : 30);
    });
  }

  var where = document.getElementById('moe-where');
  function label() {
    if (where) where.textContent = 'token ' + state.token + ' · layer ' + (state.layer + 1) + ' of ' + LAYERS;
  }

  function tick(now) {
    if (!running) return;
    var dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    state.t += dt / (layerSeconds() * state.slow);
    while (state.t >= 1) {
      state.t -= 1; state.layer++;
      if (state.layer >= LAYERS) { state.layer = 0; state.token++; }
      state.picks = route(state.token, state.layer);
      label();
    }
    draw();
    requestAnimationFrame(tick);
  }
  function play() {
    var go = visible && !document.hidden && !reduce;
    if (go && !running) { running = true; last = 0; requestAnimationFrame(tick); }
    if (!go) running = false;
  }

  var buttons = document.querySelectorAll('.moe-switch button');
  function setConfig(key) {
    if (!CONFIGS[key]) return;
    state.cfg = key; current = plan(CONFIGS[key]);
    var cfg = CONFIGS[key];
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.config === key)); });
    document.getElementById('moe-build').textContent = cfg.build;
    document.getElementById('moe-tok').textContent = (cfg.prefetch ? '≈ ' : '') + cfg.tok.toFixed(2) + ' tok/s · ' + (1 / cfg.tok).toFixed(1) + ' s/token';
    document.getElementById('moe-cpu').textContent = cfg.cpu;
    document.getElementById('moe-note').textContent = cfg.note + ' Measured: ' + cfg.range + '.';
    canvas.parentNode.classList.toggle('projection', !!cfg.prefetch);
    if (reduce) state.t = 0.999;
    draw();
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { setConfig(b.dataset.config); }); });

  var speedBtn = document.getElementById('moe-speed');
  speedBtn.addEventListener('click', function () {
    state.slow = state.slow === 1 ? 10 : 1;
    speedBtn.textContent = state.slow === 1 ? 'real time ⇄' : 'slow ×10 ⇄';
  });
  if (reduce) { speedBtn.disabled = true; speedBtn.textContent = 'still frame · one full layer'; }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; play(); }).observe(canvas);
  }
  document.addEventListener('visibilitychange', play);
  window.addEventListener('resize', size);
  setConfig('shipped'); label(); size(); play();

  // Scrolling the story switches the build; the buttons override it until the next chapter.
  var stacked = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  if (window.scrollyChapters) {
    window.scrollyChapters(document.querySelectorAll('.stepper .st'), function (el) { setConfig(el.dataset.config); },
      stacked ? { rootMargin: '-60% 0px -36% 0px' } : null);
  }

  /* ---------- the race: the same 24 tokens at each build's measured speed ---------- */
  var lanesEl = document.getElementById('race-lanes'), raceKeys = ['shipped', 'spin', 'avx512', 'overlap'], raceStart = 0, raceOn = false, raceSeen = false;
  if (lanesEl) {
    lanesEl.innerHTML = raceKeys.map(function (k) {
      var c = CONFIGS[k];
      return '<div class="lane' + (c.prefetch ? ' projection' : '') + '"><div class="lane-head"><span>' + c.build + '</span><span class="num" data-n="' + k + '"></span></div>' +
        '<div class="lane-text" data-t="' + k + '"></div><div class="lane-bar"><i data-b="' + k + '"></i></div></div>';
    }).join('');
    var raceTick = function () {
      var s = reduce ? 1e9 : (performance.now() - raceStart) / 1000, done = true;
      raceKeys.forEach(function (k) {
        var tok = CONFIGS[k].tok, n = Math.min(TEXT.length, Math.floor(s * tok) + 1), total = (TEXT.length - 1) / tok;
        if (n < TEXT.length) done = false;
        lanesEl.querySelector('[data-t="' + k + '"]').textContent = TEXT.slice(0, n).join('');
        lanesEl.querySelector('[data-n="' + k + '"]').textContent = n + ' / 24 · ' + (n >= TEXT.length ? 'done in ' + total.toFixed(0) + ' s' : Math.min(s, total).toFixed(0) + ' s');
        lanesEl.querySelector('[data-b="' + k + '"]').style.width = (100 * n / TEXT.length) + '%';
      });
      if (!done && raceOn) setTimeout(raceTick, 200); else raceOn = false;
    };
    var startRace = function () { raceStart = performance.now(); if (!raceOn) { raceOn = true; raceTick(); } };
    document.getElementById('race-go').addEventListener('click', startRace);
    if ('IntersectionObserver' in window && !reduce) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting && !raceSeen) { raceSeen = true; startRace(); } }, { threshold: 0.4 }).observe(lanesEl);
    } else { raceOn = true; raceTick(); }
  }

  /* ---------- the arithmetic: how fast could the drive alone go? ---------- */
  var hit = document.getElementById('c-hit'), bw = document.getElementById('c-bw'), out = document.getElementById('c-out');
  if (hit && bw && out) {
    var MEASURED = 0.49, EXPERT_GB = 0.0134;
    var calc = function () {
      var h = +hit.value / 100, b = +bw.value, gb = LAYERS * PICK * EXPERT_GB * (1 - h), ceil = b / gb, top = Math.max(ceil, MEASURED) * 1.1;
      document.getElementById('c-hit-v').textContent = hit.value + '%';
      document.getElementById('c-bw-v').textContent = b.toFixed(1);
      out.innerHTML =
        '<p><span class="num result">' + gb.toFixed(2) + ' GB</span> from the drive per token → at most <span class="num result">' + ceil.toFixed(2) + ' tok/s</span>, ' +
        (ceil / MEASURED).toFixed(1) + '× the measured speed.</p>' +
        '<div class="calc-bar"><span class="label">drive-bound ceiling</span><div class="track"><i class="ceil" style="width:' + (100 * ceil / top).toFixed(1) + '%"></i></div></div>' +
        '<div class="calc-bar"><span class="label">measured, shipped engine</span><div class="track"><i class="meas" style="width:' + (100 * MEASURED / top).toFixed(1) + '%"></i></div></div>';
    };
    hit.addEventListener('input', calc); bw.addEventListener('input', calc);
    document.querySelectorAll('.calc-presets button').forEach(function (b) {
      b.addEventListener('click', function () { hit.value = b.dataset.hit; bw.value = b.dataset.bw; calc(); });
    });
    calc();
  }
})();
