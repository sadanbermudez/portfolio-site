/* Four ways to run a model (work/four-ways.html).
   1. The race: one real hard board (Stanford's NCM test set, board 1) written three ways, one tick per pass through a
      model. Word by word: 89 passes. Diffusion: N rounds, cells in a random order, a cell marked when it was committed
      in the same round as a blank neighbour (row, column or box) it could not see. NCM: 12 levels of 1, 2, 4 ... 89
      codes, each written at once; "if decoded now" is the real count of right cells after each level.
   2. Big model, small memory: 16 layers x 64 experts. The experts in memory are the most popular ones (simulated
      popularity); the speed and the streamed text use the measured tokens/s of moe-stream at that memory size. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. The race ---------- */
  var PUZ = '021607085760000200003002700052300000000000000806700000200084036608100400040090007';
  var SOL = '921647385764835291583912764452369178179458623836721549217584936698173452345296817';
  var LEVELS = [1, 2, 4, 6, 9, 13, 18, 26, 37, 50, 67, 89];
  var DECODED_RIGHT = [0, 0, 1, 2, 1, 2, 0, 4, 6, 5, 5, 81];        // measured: decode after each level, board 1
  var TICK = reduce ? 0 : 150;
  var play = document.getElementById('fw-play');
  if (play) {
    var lanes = {}, steps = 24, timer = null;
    ['fw-ar', 'fw-diff', 'fw-ncm'].forEach(function (id) {
      var el = document.getElementById(id), grid = el.querySelector('.fw-grid'), cells = [];
      for (var i = 0; i < 81; i++) {
        var c = document.createElement('span');
        c.className = 'fw-cell' + (i % 9 === 2 || i % 9 === 5 ? ' br' : '') + (Math.floor(i / 9) % 3 === 2 && i < 72 ? ' bb' : '');
        grid.appendChild(c); cells.push(c);
      }
      lanes[id] = { el: el, cells: cells, count: el.querySelector('.fw-count') };
    });
    var stack = document.querySelector('#fw-ncm .fw-stack'), rows = [];
    LEVELS.forEach(function (n) {
      var r = document.createElement('div'); r.className = 'fw-level';
      for (var k = 0; k < n; k++) r.appendChild(document.createElement('i'));
      stack.appendChild(r); rows.push(r);
    });
    var note = document.getElementById('fw-note'), ncmCap = document.getElementById('fw-ncm-cap'), diffCap = document.getElementById('fw-diff-cap');
    var NCM_CAP = ncmCap.innerHTML, DIFF_CAP = diffCap.innerHTML;

    var peers = [];                                                  // cells sharing a row, column or box
    for (var i = 0; i < 81; i++) {
      peers.push([]);
      for (var j = 0; j < 81; j++) {
        if (i === j) continue;
        var r1 = Math.floor(i / 9), c1 = i % 9, r2 = Math.floor(j / 9), c2 = j % 9;
        if (r1 === r2 || c1 === c2 || (Math.floor(r1 / 3) === Math.floor(r2 / 3) && Math.floor(c1 / 3) === Math.floor(c2 / 3))) peers[i].push(j);
      }
    }
    function rng(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
    function order() {                                               // a fixed shuffle, so replays match
      var a = [], r = rng(7);
      for (var i = 0; i < 81; i++) a.push(i);
      for (i = 80; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    var ORDER = order();

    function reset() {
      Object.keys(lanes).forEach(function (id) {
        lanes[id].cells.forEach(function (c, i) {
          c.textContent = PUZ[i] === '0' ? '' : PUZ[i];
          c.className = c.className.replace(/ (given|done|clash|now)/g, '') + (PUZ[i] === '0' ? '' : ' given');
        });
        lanes[id].count.textContent = '0 passes';
      });
      rows.forEach(function (r) { r.className = 'fw-level'; });
      ncmCap.innerHTML = NCM_CAP; diffCap.innerHTML = DIFF_CAP;
    }
    function mark(c, digit, cls) {
      c.textContent = digit;
      c.className = c.className.replace(/ (given|done|clash|now)/g, '') + ' ' + cls;
    }
    function diffRound(k, clashes) {                                 // commit round k of `steps`; returns new clashes
      var per = Math.ceil(81 / steps), batch = ORDER.slice(k * per, (k + 1) * per), cells = lanes['fw-diff'].cells, inBatch = {};
      batch.forEach(function (i) { inBatch[i] = true; });
      batch.forEach(function (i) {
        var blind = PUZ[i] === '0' && peers[i].some(function (j) { return inBatch[j] && PUZ[j] === '0'; });
        if (blind) clashes++;
        mark(cells[i], SOL[i], blind ? 'clash' : PUZ[i] === '0' ? 'done' : 'given');
      });
      return clashes;
    }
    function tickAt(t, state) {                                      // state carried across ticks
      var ar = lanes['fw-ar'], ncm = lanes['fw-ncm'], df = lanes['fw-diff'];
      if (t < 89) {                                                  // 81 digits and 8 line breaks
        var cell = t - Math.floor(t / 10);
        if ((t + 1) % 10 !== 0 && cell < 81) {
          ar.cells.forEach(function (c) { c.className = c.className.replace(' now', ''); });
          mark(ar.cells[cell], SOL[cell], (PUZ[cell] === '0' ? 'done' : 'given') + ' now');
        }
        ar.count.textContent = (t + 1) + ' passes';
      }
      if (t < steps) {
        state.clashes = diffRound(t, state.clashes);
        df.count.textContent = (t + 1) + ' passes';
        if (t === steps - 1) {
          diffCap.innerHTML = state.clashes ? '<strong>' + state.clashes + ' of 51 written cells</strong> were committed in the same round as a neighbour they could not see, so nothing stopped two of them choosing the same digit. In text, that is where word salad comes from. Try 89 rounds: one per position, and the advantage is gone.'
            : 'With one round per position nothing is committed blind, and diffusion is back to one pass per token: the speed advantage is gone.';
        }
      }
      if (t < 12) {
        rows[t].className = 'fw-level on';
        ncm.count.textContent = (t + 1) + ' passes';
        ncmCap.innerHTML = 'Level ' + (t + 1) + ' of 12: ' + LEVELS[t] + ' codes at once. If decoded now: <strong>' + DECODED_RIGHT[t] + ' of 81</strong> cells right.' +
          (t === 11 ? ' The whole board appears at once.' : '');
        if (t === 11) ncm.cells.forEach(function (c, i) { mark(c, SOL[i], PUZ[i] === '0' ? 'done' : 'given'); });
      }
    }
    function run() {
      clearInterval(timer); reset();
      var t = 0, state = { clashes: 0 }, last = Math.max(89, steps);
      note.textContent = 'Running: watch the pass counters. NCM finishes first, then diffusion, then word by word.';
      if (!TICK) { for (; t < last; t++) tickAt(t, state); done(); return; }
      timer = setInterval(function () { tickAt(t, state); t++; if (t >= last) { clearInterval(timer); done(); } }, TICK);
    }
    function done() {
      play.textContent = 'Replay';
      note.textContent = 'Passes: word by word 89, diffusion ' + steps + ', NCM 12. Ticks are passes, not seconds: what a pass costs depends on the model, and the measured times are in the table below.';
    }
    play.addEventListener('click', run);
    document.querySelectorAll('[data-steps]').forEach(function (b) {
      b.addEventListener('click', function () {
        steps = +b.getAttribute('data-steps');
        document.querySelectorAll('[data-steps]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        run();
      });
    });
    reset();
  }

  /* ---------- 2. Big model, small memory ---------- */
  var cv = document.getElementById('fw-canvas');
  if (!cv) return;
  var SIZES = [0, 1, 2, 4, 8, 13];                                    // GB of memory for experts (13: all of them)
  // Measured tokens/s (moe-stream runs/experiments.csv), the better of LRU and LFU at each size; 13 GB is all in RAM.
  var SPEED = { '0': [1.04, 1.36, 1.65, 2.26, 4.46, 8.64], '1': [1.64, 2.03, 2.35, 3.06, 4.93, 8.64] };
  var EXPERT_MB = 12.6, LAYERS = 16, EXPERTS = 64, TOPK = 8;
  var C = { bg: '#0b0f14', ssd: '#1d242d', ram: '#25466e', hit: '#35d0b4', miss: '#ffae4a', ink: '#e8ecf1', muted: '#8a94a2' };
  var WORDS = ('A mixture of experts model uses only a few of its parts for each word , so the rest can wait on the drive until they are needed . ').split(' ');
  var gbIn = document.getElementById('fw-gb'), gbOut = document.getElementById('fw-gb-out');
  var speedOut = document.getElementById('fw-speed'), shareOut = document.getElementById('fw-share'), heldOut = document.getElementById('fw-held'), text = document.getElementById('fw-text');
  var pf = '1', size = 4, held = {}, r = rng2(11);
  function rng2(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

  var weight = [];                                                   // per layer, a skewed popularity over 64 experts
  for (var l = 0; l < LAYERS; l++) {
    var w = [];
    for (var e = 0; e < EXPERTS; e++) w.push(Math.pow(r(), 3) + 0.02);
    weight.push(w);
  }
  function setHeld() {
    var n = Math.min(LAYERS * EXPERTS, Math.round(SIZES[size] * 1024 / EXPERT_MB)), all = [];
    for (var l = 0; l < LAYERS; l++) for (var e = 0; e < EXPERTS; e++) all.push([weight[l][e], l * EXPERTS + e]);
    all.sort(function (a, b) { return b[0] - a[0]; });
    held = {};
    all.slice(0, n).forEach(function (x) { held[x[1]] = true; });
    var v = SPEED[pf][size];
    gbOut.textContent = size === 5 ? 'all 13 GB' : SIZES[size] + ' GB';
    speedOut.textContent = v.toFixed(2) + ' tokens/s';
    shareOut.textContent = Math.round(100 * v / SPEED[pf][5]) + '%';
    heldOut.textContent = n.toLocaleString('en-GB') + ' / 1,024';
    return v;
  }
  function pick(l) {                                                 // 8 distinct experts, by popularity
    var chosen = [], w = weight[l].slice();
    while (chosen.length < TOPK) {
      var s = 0, i; for (i = 0; i < EXPERTS; i++) s += w[i];
      var x = r() * s;
      for (i = 0; i < EXPERTS; i++) { x -= w[i]; if (x <= 0) break; }
      i = Math.min(i, EXPERTS - 1); chosen.push(i); w[i] = 0;
    }
    return chosen;
  }

  var layer = -1, active = [], nextActive = [], lastStep = 0, perToken = 1000, word = 0, raf = 0, visible = true;
  function draw(now) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = Math.max(200, Math.min(300, w * 0.42));
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    var L = 58, T = 10, cw = (w - L - 10) / EXPERTS, ch = (h - T - 30) / LAYERS, gap = cw > 6 ? 1 : 0.5;
    g.font = '10px "Martian Mono", ui-monospace, monospace'; g.fillStyle = C.muted; g.textBaseline = 'middle';
    for (var l = 0; l < LAYERS; l++) {
      g.fillStyle = C.muted;
      if (l % 3 === 0 || l === LAYERS - 1) g.fillText('layer ' + (l + 1), 4, T + l * ch + ch / 2);
      for (var e = 0; e < EXPERTS; e++) {
        var id = l * EXPERTS + e, on = l === layer && active.indexOf(e) >= 0, soon = pf === '1' && l === layer + 1 && nextActive.indexOf(e) >= 0 && !held[id];
        g.fillStyle = on ? (held[id] ? C.hit : C.miss) : held[id] ? C.ram : C.ssd;
        g.fillRect(L + e * cw, T + l * ch, cw - gap, ch - gap);
        if (soon) { g.strokeStyle = C.miss; g.lineWidth = 1; g.strokeRect(L + e * cw + 0.5, T + l * ch + 0.5, cw - gap - 1, ch - gap - 1); }
      }
    }
    if (layer >= 0) {                                                // the word's position, and reads from the drive
      g.strokeStyle = C.ink; g.lineWidth = 1.5; g.strokeRect(L - 2, T + layer * ch - 1, w - L - 8, ch + 1);
      g.strokeStyle = C.miss; g.globalAlpha = 0.5;
      active.forEach(function (e) {
        if (held[layer * EXPERTS + e]) return;
        g.beginPath(); g.moveTo(L + e * cw + cw / 2, h - 16); g.lineTo(L + e * cw + cw / 2, T + layer * ch + ch); g.stroke();
      });
      g.globalAlpha = 1;
    }
    g.fillStyle = C.muted; g.fillText(w < 520 ? 'drive: all 13 GB · blue: in memory' : 'drive (SSD): every expert, 13 GB · memory holds the blue ones', L, h - 9);
  }
  function step(now) {
    raf = 0;
    if (!visible) return;
    if (now - lastStep >= perToken / LAYERS) {
      lastStep = now;
      layer = (layer + 1) % LAYERS;
      active = layer === 0 || !nextActive.length ? pick(layer) : nextActive;
      nextActive = layer < LAYERS - 1 ? pick(layer + 1) : [];
      if (layer === LAYERS - 1) {                                    // a word comes out after the last layer
        text.textContent = (text.textContent + ' ' + WORDS[word % WORDS.length]).replace(/ ([,.])/g, '$1').slice(-160);
        word++;
      }
    }
    draw(now);
    raf = requestAnimationFrame(step);
  }
  function update() {
    var v = setHeld();
    perToken = 1000 / v;                                             // real time: one word per measured token
    if (reduce) { layer = -1; draw(0); text.textContent = 'At ' + v.toFixed(2) + ' tokens a second, a 100-word answer takes about ' + Math.round(130 / v) + ' s.'; }
    else if (!raf) raf = requestAnimationFrame(step);
  }
  gbIn.addEventListener('input', function () { size = +gbIn.value; update(); });
  document.querySelectorAll('[data-pf]').forEach(function (b) {
    b.addEventListener('click', function () {
      pf = b.getAttribute('data-pf');
      document.querySelectorAll('[data-pf]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      update();
    });
  });
  if ('IntersectionObserver' in window) {                            // animate only while on screen
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible && !reduce && !raf) raf = requestAnimationFrame(step); }).observe(cv);
  }
  window.addEventListener('resize', function () { if (reduce) draw(0); });
  update();
})();
