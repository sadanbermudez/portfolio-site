/* Story page: a map of the cities I have lived in, drawn on a canvas behind the chapters.
   Cities sit at their real longitude and latitude (equirectangular, scaled by cos 48°); the route
   draws itself city by city as each chapter scrolls into the middle of the screen. */
(function () {
  var canvas = document.querySelector('.stage canvas.journey');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var C = { bg: '#07090c', grid: 'rgba(138,148,162,0.08)', ghost: 'rgba(138,148,162,0.28)', route: '#ffae4a', city: '#e8ecf1', dim: '#4f5966', accent: '#ff4a3d', label: '#c3cad4' };
  var CITIES = [
    { name: 'Madrid', note: 'until 22', lon: -3.70, lat: 40.42, dx: -14, dy: -4, align: 'right' },
    { name: 'Copenhagen', note: '2 years', lon: 12.57, lat: 55.68, dx: 14, dy: 5, align: 'left' },
    { name: 'Glasgow', note: '2 years', lon: -4.25, lat: 55.86, dx: -14, dy: -2, align: 'right' },
    { name: 'Edinburgh', note: '4 years', lon: -3.19, lat: 55.95, dx: -4, dy: 30, align: 'right' },
    { name: 'Wiesbaden', note: '2 months', lon: 8.24, lat: 50.08, dx: -14, dy: 5, align: 'right' },
    { name: 'Barcelona', note: '4 years', lon: 2.17, lat: 41.39, dx: 14, dy: 5, align: 'left' }
  ];
  var K = Math.cos(48 * Math.PI / 180), LON = [-9, 17], LAT = [37.5, 58.5];
  var target = 0, shown = reduce ? CITIES.length - 1 : 0, all = false, W = 0, H = 0, dpr = 1, box = null, visible = true;
  var stars = []; for (var i = 0; i < 140; i++) stars.push([((i * 7919) % 997) / 997, ((i * 104729) % 991) / 991, 0.3 + ((i * 31) % 7) / 10]);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    // the chapter cards cover the left on wide screens and the bottom on phones, so the map uses the rest
    var area = W > 760 ? { x: W * 0.52, y: H * 0.12, w: W * 0.42, h: H * 0.76 } : { x: W * 0.08, y: H * 0.13, w: W * 0.84, h: H * 0.3 };
    var spanX = (LON[1] - LON[0]) * K, spanY = LAT[1] - LAT[0], s = Math.min(area.w / spanX, area.h / spanY);
    box = { s: s, x0: area.x + (area.w - spanX * s) / 2, y0: area.y + (area.h - spanY * s) / 2 };
  }
  function xy(lon, lat) { return [box.x0 + (lon - LON[0]) * K * box.s, box.y0 + (LAT[1] - lat) * box.s]; }
  function ctrl(a, b) {                                   // control point bowing each leg slightly sideways
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    return [mx - dy / len * len * 0.18, my + dx / len * len * 0.18];
  }
  function leg(i, upto) {                                 // draw leg i from city i to i+1, up to fraction upto
    var a = xy(CITIES[i].lon, CITIES[i].lat), b = xy(CITIES[i + 1].lon, CITIES[i + 1].lat), c = ctrl(a, b);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]);
    var n = Math.max(2, Math.round(40 * upto));
    for (var k = 1; k <= n; k++) {
      var t = upto * k / n, u = 1 - t;
      ctx.lineTo(u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]);
    }
    ctx.stroke();
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    stars.forEach(function (s) { ctx.fillStyle = 'rgba(138,148,162,' + (0.12 * s[2]) + ')'; ctx.fillRect(s[0] * W, s[1] * H, 1.2, 1.2); });
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (var lon = -5; lon <= 15; lon += 5) { var p = xy(lon, LAT[0]), q = xy(lon, LAT[1]); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
    for (var lat = 40; lat <= 55; lat += 5) { var r = xy(LON[0], lat), s2 = xy(LON[1], lat); ctx.beginPath(); ctx.moveTo(r[0], r[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke(); }
    ctx.fillStyle = C.dim; ctx.font = '10px Martian Mono, monospace'; ctx.textAlign = 'left';
    ctx.textAlign = 'right'; for (var l2 = 40; l2 <= 50; l2 += 5) { var g = xy(LON[1], l2); ctx.fillText(l2 + '°N', g[0] - 4, g[1] - 4); }

    ctx.setLineDash([3, 6]); ctx.strokeStyle = C.ghost; ctx.lineWidth = 1.2;
    for (var i = 0; i < CITIES.length - 1; i++) leg(i, 1);
    ctx.setLineDash([]); ctx.strokeStyle = C.route; ctx.lineWidth = 2.4; ctx.shadowColor = C.route; ctx.shadowBlur = 10;
    for (var j = 0; j < CITIES.length - 1; j++) { var f = Math.max(0, Math.min(1, shown - j)); if (f > 0) leg(j, f); }
    ctx.shadowBlur = 0;

    CITIES.forEach(function (c, k) {
      var p = xy(c.lon, c.lat), reached = shown >= k - 0.02, here = Math.round(target) === k && !all;
      if (here) {
        var pulse = reduce ? 0.5 : (Math.sin(time / 380) + 1) / 2;
        ctx.beginPath(); ctx.arc(p[0], p[1], 10 + pulse * 10, 0, 7); ctx.fillStyle = 'rgba(255,174,74,' + (0.18 - pulse * 0.12) + ')'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(p[0], p[1], here ? 5.5 : 4, 0, 7);
      ctx.fillStyle = reached ? (here ? C.route : C.city) : C.dim; ctx.fill();
      ctx.font = (here ? '600 ' : '500 ') + (W > 760 ? 15 : 13) + 'px Schibsted Grotesk, sans-serif';
      var align = c.align, dx = c.dx, wd = ctx.measureText(c.name).width;
      if (align === 'left' && p[0] + dx + wd > W - 8) { align = 'right'; dx = -Math.abs(dx); }   // flip a label that would leave the screen
      if (align === 'right' && p[0] + dx - wd < 8) { align = 'left'; dx = Math.abs(dx); }
      ctx.textAlign = align; ctx.fillStyle = reached ? C.city : C.dim; ctx.fillText(c.name, p[0] + dx, p[1] + c.dy);
      ctx.font = '10px Martian Mono, monospace'; ctx.fillStyle = reached ? (here ? C.route : C.label) : C.dim;
      ctx.fillText(c.note, p[0] + dx, p[1] + c.dy + 14);
    });
  }

  function loop(time) {
    if (visible && !document.hidden) {
      shown += (target - shown) * 0.06;
      if (Math.abs(target - shown) < 0.002) shown = target;
      draw(time);
    }
    requestAnimationFrame(loop);
  }

  resize();
  window.addEventListener('resize', function () { resize(); draw(0); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(canvas);
  window.scrollyChapters(document.querySelectorAll('.chapter'), function (el) {
    var stop = el.dataset.stop;
    all = stop === 'all';
    target = all ? CITIES.length - 1 : Math.max(0, +stop || 0);
    if (reduce) { shown = Math.max(shown, target); draw(0); }
  });
  if (reduce) { shown = CITIES.length - 1; draw(0); } else requestAnimationFrame(loop);
})();
