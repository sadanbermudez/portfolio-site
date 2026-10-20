/* Scrollytelling helper: marks the chapter nearest the middle of the screen as "on" and calls
   back when it changes. Without IntersectionObserver every chapter simply stays visible. */
window.scrollyChapters = function (nodes, onEnter) {
  var list = Array.prototype.slice.call(nodes), current = null;
  if (!list.length) return;
  function activate(el) {
    if (el === current) return;
    current = el;
    list.forEach(function (n) { n.classList.toggle('on', n === el); });
    if (onEnter) onEnter(el, list.indexOf(el));
  }
  if (!('IntersectionObserver' in window)) { list.forEach(function (n) { n.classList.add('on'); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) activate(e.target); });
  }, { rootMargin: '-45% 0px -45% 0px' });
  list.forEach(function (n) { io.observe(n); });
  activate(list[0]);
};
