/* moe-stream page: tokens per second against expert-cache size for each policy, measured (runs/experiments.csv in
   github.com/sadanbermudez/moe-stream), with prefetch on or off and the all-in-RAM ceiling as a dashed line. */
(function () {
  var cv = document.getElementById('ms-chart'), note = document.getElementById('ms-note');
  if (!cv) return;
  // tok/s by policy at cache sizes 0, 1, 2, 4, 8 GB; index 0 is "no cache", the same for every policy.
  var GB = [0, 1, 2, 4, 8];
  var DATA = {
    ceiling: 8.64,
    '0': { lru: [1.04, 1.07, 1.62, 2.10, 4.46], lfu: [1.04, 1.36, 1.65, 2.26, 4.26], static: [1.04, 1.17, 1.29, 1.60, 2.38] },
    '1': { lru: [1.64, 1.67, 2.33, 2.93, 4.93], lfu: [1.64, 2.03, 2.35, 3.06, 4.82], static: [1.64, 1.79, 1.95, 2.36, 3.41] }
  };
  var C = { bg: '#0b0f14', rule: '#1d242d', muted: '#8a94a2', ink: '#e8ecf1', lru: '#7fb6ff', lfu: '#ffae4a', static: '#c792ea' };
  var NAMES = { lfu: 'LFU (least frequently used)', lru: 'LRU (least recently used)', static: 'static hot set' };
  var pf = '1';

  function draw() {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = Math.max(220, Math.min(340, w * 0.55));
    cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    g.font = '11px "Martian Mono", ui-monospace, monospace';
    var L = 40, R = w - 12, T = 14, B = h - 30, top = Math.ceil((DATA.ceiling || 8) + 0.5);
    var X = function (gb) { return L + gb / 8 * (R - L); }, Y = function (v) { return B - v / top * (B - T); };
    g.strokeStyle = C.rule; g.lineWidth = 1; g.fillStyle = C.muted;
    for (var v = 0; v <= top; v += 2) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(R, Y(v)); g.stroke(); g.fillText(String(v), 8, Y(v) + 4); }
    GB.forEach(function (gb) { g.fillText(gb ? gb + ' GB' : 'none', X(gb) - (gb ? 14 : 12), h - 10); });
    if (DATA.ceiling) {
      g.setLineDash([5, 5]); g.strokeStyle = C.ink; g.beginPath(); g.moveTo(L, Y(DATA.ceiling)); g.lineTo(R, Y(DATA.ceiling)); g.stroke(); g.setLineDash([]);
      g.fillStyle = C.ink; g.fillText('all 13 GB in memory · ' + DATA.ceiling.toFixed(2) + ' tok/s', L + 6, Y(DATA.ceiling) - 6);
    }
    var row = 0;
    ['lfu', 'lru', 'static'].forEach(function (k) {
      var ys = DATA[pf][k];
      if (!ys.length) return;
      g.strokeStyle = C[k]; g.fillStyle = C[k]; g.lineWidth = 2; g.beginPath();
      ys.forEach(function (v, i) { if (i) g.lineTo(X(GB[i]), Y(v)); else g.moveTo(X(GB[i]), Y(v)); });
      g.stroke();
      ys.forEach(function (v, i) { g.beginPath(); g.arc(X(GB[i]), Y(v), 3, 0, 6.3); g.fill(); });
      g.fillText('— ' + NAMES[k], L + 8, Y(DATA.ceiling || top) + 24 + 15 * row++);   // legend in the empty band under the ceiling
    });
    var best = DATA[pf].lfu;
    if (best.length && note) note.textContent = 'Prefetch ' + (pf === '1' ? 'on' : 'off') + ': ' + best[0].toFixed(2) + ' tok/s with no cache, ' +
      best[4].toFixed(2) + ' with 8 GB under LFU, against ' + DATA.ceiling.toFixed(2) + ' with every expert in memory.';
  }

  Array.prototype.forEach.call(document.querySelectorAll('.ms-switch [data-pf]'), function (b) {
    b.addEventListener('click', function () {
      pf = b.getAttribute('data-pf');
      Array.prototype.forEach.call(document.querySelectorAll('.ms-switch [data-pf]'), function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      draw();
    });
  });
  window.addEventListener('resize', draw);
  draw();
})();
