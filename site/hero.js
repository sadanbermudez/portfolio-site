/* Home hero: the shared bench, framed to the right of the headline, cycling the agent's run. */
(function () {
  window.createBench(document.querySelector('canvas.bench'), {
    shift: 0.2, lift: 0.06,
    hud: { canvas: document.querySelector('.hud canvas'), power: document.getElementById('hud-power'), peak: document.getElementById('hud-peak') }
  });
})();
