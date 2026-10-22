/* Lab-agent page, live run: POST /api/lab streams the agent's tool calls (server/lab-agent.js); this draws them in
   a console, plots each spectrum and the log-log points with the agent's fit, reveals the hidden sample at the
   end, and shows the public score. Without JavaScript or a reachable API, the recorded run above still stands. */
(function () {
  var go = document.getElementById('live-go'), con = document.getElementById('live-console');
  var spec = document.getElementById('live-spectra'), loglog = document.getElementById('live-loglog');
  if (!go || !con || !spec || !loglog) return;
  var WL = []; for (var i = 0; i < 128; i++) WL.push(Math.round(900 + 800 * (4 * i) / 511));
  var C = { bg: '#0b0f14', rule: '#1d242d', muted: '#8a94a2', amber: '#ffae4a', blue: '#7fb6ff', red: '#ff4a3d', ink: '#e8ecf1' };
  var run = null;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function line(t, call, ret, cls) {
    var d = document.createElement('div');
    d.className = 'ln' + (cls ? ' ' + cls : '');
    d.innerHTML = '<span class="t">' + esc(t) + '</span><span class="call">' + call + '</span><span class="ret">' + esc(ret || '') + '</span>';
    con.appendChild(d);
    while (con.children.length > 22) con.removeChild(con.firstChild);
  }

  function setup(c, h) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth;
    c.style.height = h + 'px'; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    var ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    ctx.font = '10px "Martian Mono", ui-monospace, monospace';
    return { ctx: ctx, w: w, h: h };
  }
  // Spectra: counts against wavelength, brighter for higher power; the 1270 nm band marked.
  function drawSpectra() {
    var g = setup(spec, 170), ctx = g.ctx, L = 36, R = g.w - 10, T = 10, B = g.h - 22, list = run ? run.spectra : [];
    var max = 1000; list.forEach(function (s) { s.counts.forEach(function (v) { if (v > max) max = v; }); });
    var X = function (wl) { return L + (wl - 900) / 800 * (R - L); }, Y = function (v) { return B - (v - 900) / (max - 900) * (B - T); };
    ctx.fillStyle = 'rgba(255,174,74,0.08)'; ctx.fillRect(X(1255), T, X(1285) - X(1255), B - T);
    ctx.fillStyle = C.muted; ctx.fillText('900', L - 6, g.h - 6); ctx.fillText('1270 nm', X(1270) - 22, g.h - 6); ctx.fillText('1700', R - 26, g.h - 6);
    var pmax = 1; list.forEach(function (s) { pmax = Math.max(pmax, s.power_mw); });
    list.forEach(function (s, k) {
      ctx.strokeStyle = s.power_mw ? 'rgba(255,174,74,' + (0.25 + 0.75 * s.power_mw / pmax) + ')' : C.muted;
      ctx.lineWidth = k === list.length - 1 ? 1.6 : 1;
      ctx.beginPath();
      s.counts.forEach(function (v, i) { var x = X(WL[i]), y = Y(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    });
    if (!list.length) { ctx.fillStyle = C.muted; ctx.fillText('no spectra yet', L + 8, T + 20); }
  }
  // Log-log: peak area from the agent's fit table against power, with the fitted slope.
  function drawLogLog() {
    var g = setup(loglog, 170), ctx = g.ctx, L = 36, R = g.w - 10, T = 10, B = g.h - 22, fit = run && run.fit;
    var X = function (p) { return L + (Math.log10(p) - Math.log10(3)) / (Math.log10(250) - Math.log10(3)) * (R - L); };
    [5, 10, 20, 50, 100, 200].forEach(function (p) { ctx.fillStyle = C.muted; ctx.fillText(String(p), X(p) - 6, g.h - 6); });
    if (!fit || !fit.table.length) { ctx.fillStyle = C.muted; ctx.fillText('the fit appears when the agent calls it', L + 8, T + 20); return; }
    var lo = Infinity, hi = -Infinity;
    fit.table.forEach(function (r) { var a = Math.log10(Math.max(r.area_counts_nm, 1)); lo = Math.min(lo, a); hi = Math.max(hi, a); });
    lo -= 0.3; hi += 0.3;
    var Y = function (a) { return B - (Math.log10(Math.max(a, 1)) - lo) / (hi - lo) * (B - T); };
    // the line through the weighted mean point with the fitted slope
    var mx = 0, my = 0; fit.table.forEach(function (r) { mx += Math.log10(r.power_mw); my += Math.log10(Math.max(r.area_counts_nm, 1)); });
    mx /= fit.table.length; my /= fit.table.length;
    var p0 = 3, p1 = 250, a0 = my + fit.exponent * (Math.log10(p0) - mx), a1 = my + fit.exponent * (Math.log10(p1) - mx);
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, R - L, B - T); ctx.clip();
    ctx.strokeStyle = C.amber; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X(p0), Y(Math.pow(10, a0))); ctx.lineTo(X(p1), Y(Math.pow(10, a1))); ctx.stroke();
    ctx.restore();
    fit.table.forEach(function (r) { ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(X(r.power_mw), Y(r.area_counts_nm), 3.5, 0, 6.3); ctx.fill(); });
  }

  function pct(a) { return Math.round(100 * a) + '%'; }
  function score(s) {
    if (!s || typeof s.runs !== 'number') return;
    document.getElementById('s-runs').textContent = s.runs;
    document.getElementById('s-correct').textContent = s.runs ? s.correct + ' · ' + pct(s.correct / s.runs) : '–';
    document.getElementById('s-ci').textContent = s.runs ? '95% interval ' + pct(s.wilson[0]) + ' to ' + pct(s.wilson[1]) : 'no graded runs yet';
    document.getElementById('s-safe').textContent = s.runs ? s.safe + ' of ' + s.runs : '–';
    document.getElementById('s-today').textContent = Math.max(0, s.daily - s.today) + ' of ' + s.daily;
    document.getElementById('s-cost').textContent = s.neurons ? 'about ' + s.neurons + ' neurons a run' : '';
  }
  function post(body) {
    return fetch('/api/lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function handle(event, d) {
    if (event === 'start') line('→', 'new sample prepared, order hidden · ' + esc(d.model), '', 'final');
    else if (event === 'note') line('·', '<i>' + esc(d.text) + '</i>', '', 'note');
    else if (event === 'call') {
      line('#' + String(d.i).padStart(2, '0'), '<b>' + esc(d.tool) + '</b>(' + esc(d.args) + ')', d.summary,
        (d.tool === 'acquire_spectrum' || d.fit ? 'hot' : '') + (/"on":true/.test(d.args) ? ' fire' : ''));
      if (d.spectrum) { run.spectra.push(d.spectrum); drawSpectra(); }
      if (d.fit) { run.fit = d.fit; drawLogLog(); document.getElementById('live-fit').textContent = 'n = ' + d.fit.exponent + ' ± ' + d.fit.exponent_err; }
    }
    else if (event === 'answer') line('→', 'answer: ' + (d.photon_order ? (d.photon_order === 2 ? 'two-photon' : 'one-photon') : 'none') + (d.exponent != null ? ', n = ' + d.exponent : ''), '', 'final');
    else if (event === 'verdict') {
      var truth = d.truth === 2 ? 'two-photon' : 'one-photon';
      document.getElementById('live-truth').textContent = 'hidden sample: ' + truth;
      line('✓', 'sample was ' + truth + ' · ' + d.calls + ' calls · ' + d.turns + ' replies' + (d.safe ? '' : ' · laser left on, switched off by the bench'), d.correct ? 'correct' : d.ended === 'budget' ? 'no answer' : 'wrong', d.correct ? 'final' : 'fire');
      score(d.score);
    }
    else if (event === 'error') line('!', esc(d.error), '', 'fire');
  }

  function start() {
    if (run && run.busy) return;
    run = { busy: true, spectra: [], fit: null };
    con.innerHTML = ''; drawSpectra(); drawLogLog();
    document.getElementById('live-truth').textContent = 'hidden sample: ?'; document.getElementById('live-fit').textContent = '';
    go.disabled = true; go.textContent = 'running…';
    var done = function () { run.busy = false; go.disabled = false; go.textContent = 'Run again'; };
    post({ action: 'run' }).then(function (res) {
      var type = res.headers.get('Content-Type') || '';
      if (type.indexOf('text/event-stream') < 0) return res.json().then(function (j) { line('!', esc(j.error || 'Live runs are unavailable just now.'), '', 'fire'); score(j.score); done(); });
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) { done(); return; }
          buf += dec.decode(r.value, { stream: true });
          var cut;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            var evt = buf.slice(0, cut), name = '', data = '';
            buf = buf.slice(cut + 2);
            evt.split('\n').forEach(function (l) { if (l.indexOf('event:') === 0) name = l.slice(6).trim(); else if (l.indexOf('data:') === 0) data += l.slice(5).trim(); });
            try { handle(name, JSON.parse(data)); } catch (e) { /* a malformed event is skipped */ }
          }
          return pump();
        });
      })();
    }).catch(function () { line('!', 'The connection dropped. The run still finishes on the server and is counted.', '', 'fire'); done(); });
  }

  go.addEventListener('click', start);
  drawSpectra(); drawLogLog();
  window.addEventListener('resize', function () { drawSpectra(); drawLogLog(); });
  var asked = false;
  var askScore = function () { if (asked) return; asked = true; post({ action: 'score' }).then(function (r) { return r.ok ? r.json() : null; }).then(score).catch(function () {}); };
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) askScore(); }).observe(go);
  else askScore();
})();
