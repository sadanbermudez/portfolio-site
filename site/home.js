/* Home page: pause SVG animations for reduced motion, and the copy-email button.
   Kept out of the page so the Content-Security-Policy can forbid inline scripts. */
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('svg').forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });
  }
  var btn = document.getElementById('copy-email');
  var email = document.getElementById('email');
  btn.addEventListener('click', function () {
    var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy email'; }, 1800); };
    var fallback = function () {
      var range = document.createRange(); range.selectNodeContents(email);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      btn.textContent = 'Selected, press Ctrl+C';
    };
    try { navigator.clipboard.writeText(email.textContent.trim()).then(done, fallback); } catch (e) { fallback(); }
  });
})();
