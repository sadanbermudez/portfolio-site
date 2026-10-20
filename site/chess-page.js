/* Chess page: switch between the 2D board and the 3D lines-of-force view.
   Kept out of the page so the Content-Security-Policy can forbid inline scripts. */
(function () {
  var b2 = document.getElementById('board'), b3 = document.getElementById('board3d');
  document.querySelectorAll('.view-switch button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var three = btn.dataset.view === '3d';
      document.querySelectorAll('.view-switch button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === btn)); });
      b2.hidden = three; b3.hidden = !three; window.Chess3D.enable(three);
    });
  });
})();
