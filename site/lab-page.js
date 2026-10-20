/* Lab-agent page: wires the 3D bench to the scroll chapters and the photon-order switch.
   Kept out of the page so the Content-Security-Policy can forbid inline scripts. */
(function () {
  var bench = window.createBench(document.querySelector('.stage canvas.bench'), {
    shift: 0.12, lift: 0.04, orbit: true, labels: true,
    hud: { canvas: document.querySelector('.stage .hud canvas'), power: document.getElementById('hud-power'), peak: document.getElementById('hud-peak') }
  });
  window.scrollyChapters(document.querySelectorAll('.chapter'), function (el) {
    bench.fly(el.dataset.shot || 'overview');
    bench.setLaser(el.dataset.laser === '1');
    if (el.dataset.cycle) bench.setCycle(true); else if (el.dataset.step) bench.setStep(+el.dataset.step);
    setOrder(el.dataset.order ? +el.dataset.order : 2);
  });
  function setOrder(n) {
    bench.setOrder(n);
    document.querySelectorAll('.order-switch button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.order === n)); });
  }
  document.querySelectorAll('.order-switch button').forEach(function (b) {
    b.addEventListener('click', function () { setOrder(+b.dataset.order); });
  });
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('svg').forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });
  }
})();
