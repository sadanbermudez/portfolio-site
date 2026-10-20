/* Scrollytelling helper: marks the chapter nearest the middle of the screen as "on" and calls
   back when it changes. Without IntersectionObserver every chapter simply stays visible.
   The optional third argument moves the trigger band (default: the middle tenth of the screen): a
   rootMargin string, or { rootMargin }. The return value stops the observer, so a page can set it
   up again with another band. */
window.scrollyChapters = function (nodes, onEnter, band) {
  var rootMargin = typeof band === 'string' ? band : (band && band.rootMargin);
  var list = Array.prototype.slice.call(nodes), current = null;
  if (!list.length) return function () {};
  function activate(el) {
    if (el === current) return;
    current = el;
    list.forEach(function (n) { n.classList.toggle('on', n === el); });
    if (onEnter) onEnter(el, list.indexOf(el));
  }
  if (!('IntersectionObserver' in window)) { list.forEach(function (n) { n.classList.add('on'); }); return function () {}; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) activate(e.target); });
  }, { rootMargin: rootMargin || '-45% 0px -45% 0px' });
  list.forEach(function (n) { io.observe(n); });
  activate(list[0]);
  return function () { io.disconnect(); };
};
