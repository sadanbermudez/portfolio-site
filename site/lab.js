/* Agent console: replays the 28 tool calls from the two-photon run (20 Oct 2026, local
   Qwen3.6-35B) and adds each measured point to the log-log chart as its spectrum is taken.
   The page is complete without this script: the console and chart start in their final state. */
(function () {
  var CALLS = [
    ['bench_status', '{}', ''], ['arm_laser', '{}', 'armed'],
    ['set_laser_power', '{"power_mw":10}', ''], ['laser_emission', '{"on":true}', 'emitting'], ['acquire_spectrum', '{"label":"P10mW"}', 'max 1,941', 0], ['laser_emission', '{"on":false}', ''],
    ['set_laser_power', '{"power_mw":30}', ''], ['laser_emission', '{"on":true}', 'emitting'], ['acquire_spectrum', '{"label":"P30mW"}', 'max 2,029', 1], ['laser_emission', '{"on":false}', ''],
    ['set_laser_power', '{"power_mw":50}', ''], ['laser_emission', '{"on":true}', 'emitting'], ['acquire_spectrum', '{"label":"P50mW"}', 'max 2,344', 2], ['laser_emission', '{"on":false}', ''],
    ['set_laser_power', '{"power_mw":80}', ''], ['laser_emission', '{"on":true}', 'emitting'], ['acquire_spectrum', '{"label":"P80mW"}', 'max 3,081', 3], ['laser_emission', '{"on":false}', ''],
    ['set_laser_power', '{"power_mw":120}', ''], ['laser_emission', '{"on":true}', 'emitting'], ['acquire_spectrum', '{"label":"P120mW"}', 'max 4,578', 4], ['laser_emission', '{"on":false}', ''],
    ['set_laser_power', '{"power_mw":160}', ''], ['laser_emission', '{"on":true}', 'emitting'], ['acquire_spectrum', '{"label":"P160mW"}', 'max 6,636', 5],
    ['fit_power_dependence', '{"run_ids":[6 runs],"center_nm":1270}', 'n = 2.004 ± 0.03', 'fit'],
    ['laser_emission', '{"on":false}', ''], ['safe_state', '{"reason":"measurement complete"}', 'safe']
  ];
  var con = document.getElementById('console');
  var pts = Array.prototype.slice.call(document.querySelectorAll('#lab-chart .pt.two'));
  var fit = document.querySelector('#lab-chart .fit.two');
  var verdict = document.getElementById('lab-verdict');
  var btn = document.getElementById('replay');
  if (!con || !pts.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function line(i) {
    var c = CALLS[i], d = document.createElement('div');
    d.className = 'ln' + (c[0] === 'acquire_spectrum' || c[3] === 'fit' ? ' hot' : '') + (c[1].indexOf('"on":true') > -1 ? ' fire' : '');
    d.innerHTML = '<span class="t">#' + String(i + 1).padStart(2, '0') + '</span><span class="call"><b>' + c[0] + '</b>(' + esc(c[1]) + ')</span><span class="ret">' + esc(c[2]) + '</span>';
    return d;
  }
  function finalLine() {
    var d = document.createElement('div'); d.className = 'ln final';
    d.innerHTML = '<span class="t">→</span><span class="call">conclusion: two-photon, exponent 2.004 ± 0.03</span><span class="ret">correct</span>';
    return d;
  }
  function trim() { while (con.children.length > 22) con.removeChild(con.firstChild); }
  function showAll() {
    con.innerHTML = '';
    for (var i = 0; i < CALLS.length; i++) con.appendChild(line(i));
    con.appendChild(finalLine()); trim();
    pts.forEach(function (p) { p.classList.remove('off'); });
    if (fit) fit.style.strokeDashoffset = '0';
    if (verdict) verdict.style.opacity = '1';
  }

  var timer = null;
  function replay() {
    clearTimeout(timer);
    con.innerHTML = '';
    pts.forEach(function (p) { p.classList.add('off'); });
    if (fit) { fit.style.transition = 'none'; fit.style.strokeDashoffset = '600'; fit.getBoundingClientRect(); fit.style.transition = ''; }
    if (verdict) verdict.style.opacity = '0';
    var i = 0;
    (function next() {
      if (i >= CALLS.length) { con.appendChild(finalLine()); trim(); if (verdict) verdict.style.opacity = '1'; return; }
      var c = CALLS[i];
      con.appendChild(line(i)); trim();
      if (typeof c[3] === 'number') pts[c[3]].classList.remove('off');
      if (c[3] === 'fit' && fit) fit.style.strokeDashoffset = '0';
      i++;
      timer = setTimeout(next, c[0] === 'acquire_spectrum' ? 900 : c[3] === 'fit' ? 1400 : 320);
    })();
  }

  showAll();
  if (btn) btn.addEventListener('click', replay);
  if (reduce) return;
  var started = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      if (es[0].isIntersecting && !started) { started = true; replay(); }
    }, { threshold: 0.35 }).observe(con);
  }
})();
