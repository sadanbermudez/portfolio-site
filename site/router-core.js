/* Argus's learned router, in the browser: which brain should take a request (local model, free cloud model, Claude,
   or private: never a free cloud model). The same features and model as argus/router/route.py: word 1-2-grams and
   character 3-5-grams of the lowercased text, hashed (FNV-1a over UTF-8) into 32768 slots, L2-normalised, and a
   4-way logistic regression with 8-bit weights (data/router-model.js). tests/router.test.mjs checks it against the
   Python router's decisions. Argus also applies a personal-data screen on top; this page does not. */
window.RouterCore = (function () {
  var enc = new TextEncoder();
  function hash(s, dim) {                                  // FNV-1a, 32-bit, as route._h
    var h = 2166136261, b = enc.encode(s);
    for (var i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
    return h % dim;
  }
  function features(text, dim) {
    var t = text.toLowerCase(), words = t.match(/[a-z0-9_./-]+/g) || [], f = [], i, n;
    words.forEach(function (w) { f.push('w:' + w); });
    for (i = 0; i + 1 < words.length; i++) f.push('b:' + words[i] + ' ' + words[i + 1]);
    var cp = Array.from(t);                                // code points, as Python slices strings
    for (n = 3; n <= 5; n++) for (i = 0; i + n <= cp.length; i++) f.push('c:' + cp.slice(i, i + n).join(''));
    f.push('len:' + Math.min(Math.floor(words.length / 10), 8));
    var x = {};
    f.forEach(function (s) { var k = hash(s, dim); x[k] = (x[k] || 0) + 1; });
    var norm = Math.sqrt(Object.keys(x).reduce(function (a, k) { return a + x[k] * x[k]; }, 0)) || 1;
    Object.keys(x).forEach(function (k) { x[k] /= norm; });
    return x;
  }
  function load(m) {
    var rows = m.w.map(function (b64) {
      var s = atob(b64), a = new Int8Array(s.length);
      for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) << 24 >> 24;
      return a;
    });
    return { labels: m.labels, dim: m.dim, bias: m.bias, scales: m.scales, rows: rows };
  }
  function probs(model, text) {
    var x = features(text, model.dim), z = model.bias.map(function (b, c) {
      var s = b, row = model.rows[c], sc = model.scales[c];
      for (var k in x) s += row[k] * sc * x[k];
      return s;
    });
    var mx = Math.max.apply(null, z), e = z.map(function (v) { return Math.exp(v - mx); }), sum = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (v) { return v / sum; });
  }
  function route(model, text) {
    var p = probs(model, text), best = 0;
    p.forEach(function (v, i) { if (v > p[best]) best = i; });
    return { route: model.labels[best], confidence: p[best], probs: p };
  }
  return { load: load, probs: probs, route: route, features: features };
})();
