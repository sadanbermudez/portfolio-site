/* Chess viewer for one engine-reviewed game (data/chess-game.js, produced by jarvis-chess with
   Stockfish 19 at 0.4 s per move). Board, eval bar, eval graph, move list and key moments. */
(function () {
  var G = window.CHESS_GAME;
  if (!G) return;
  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var me = 'dr_namer';
  var flip = G.black.toLowerCase() === me;              // the player's side at the bottom
  var board = document.getElementById('board');
  var bar = document.querySelector('.evalbar .black');
  var pos = document.getElementById('pos');
  var detail = document.getElementById('detail');
  var list = document.getElementById('movelist');
  var graph = document.getElementById('graph');
  var momentsEl = document.getElementById('moments');
  var ply = -1, timer = null;
  var N = G.plies.length;

  function wc(cp) { return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1; }
  function fenBoard(fen) {
    var rows = fen.split(' ')[0].split('/'), out = [];
    rows.forEach(function (r) { var row = []; r.split('').forEach(function (c) { if (/\d/.test(c)) { for (var i = 0; i < +c; i++) row.push(null); } else row.push(c); }); out.push(row); });
    return out;                                            // out[0] is rank 8
  }
  function sqXY(sq) {                                      // 'e4' -> board grid column/row (0..7, top-left origin)
    var f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
    return flip ? { x: 7 - f, y: r } : { x: f, y: 7 - r };
  }
  function arrow(uci, color, width) {
    if (!uci) return '';
    var a = sqXY(uci.slice(0, 2)), b = sqXY(uci.slice(2, 4));
    var x1 = a.x * 100 + 50, y1 = a.y * 100 + 50, x2 = b.x * 100 + 50, y2 = b.y * 100 + 50;
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    var ex = x2 - ux * 26, ey = y2 - uy * 26;
    var hx = ex - ux * 22, hy = ey - uy * 22, px = -uy * 16, py = ux * 16;
    return '<g opacity=".85"><line x1="' + x1 + '" y1="' + y1 + '" x2="' + hx + '" y2="' + hy + '" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round"/>' +
      '<polygon points="' + ex + ',' + ey + ' ' + (hx + px) + ',' + (hy + py) + ' ' + (hx - px) + ',' + (hy - py) + '" fill="' + color + '"/></g>';
  }

  function drawBoard() {
    var fen = ply < 0 ? G.start_fen : G.plies[ply].fen;
    var b = fenBoard(fen), last = ply >= 0 ? G.plies[ply] : null, html = '';
    var hl = last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : [];
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var r = flip ? y : 7 - y, f = flip ? 7 - x : x;              // r: rank index 0..7 from rank 1
      var c = b[7 - r][f], sq = String.fromCharCode(97 + f) + (r + 1);
      var cls = 'sq ' + ((r + f) % 2 ? 'l' : 'd') + (hl.indexOf(sq) > -1 ? ' hl' : '');
      var piece = c ? '<span class="' + (c === c.toUpperCase() ? 'pc-w' : 'pc-b') + '">' + GLYPH[c.toLowerCase()] + '︎</span>' : '';
      var coord = (y === 7 ? '<span class="coord f">' + String.fromCharCode(97 + f) + '</span>' : '') + (x === 0 ? '<span class="coord r">' + (r + 1) + '</span>' : '');
      html += '<div class="' + cls + '">' + piece + coord + '</div>';
    }
    var arrows = '';
    if (last) {
      arrows += arrow(last.uci, '#ffae4a', 13);
      if (last.grade && last.best_uci && last.best_uci !== last.uci) arrows += arrow(last.best_uci, '#7fb6ff', 13);
    }
    html += '<svg class="arrows" viewBox="0 0 800 800" aria-hidden="true">' + arrows + '</svg>';
    board.innerHTML = html;
    var cp = ply < 0 ? 20 : G.plies[ply].cp;
    var whiteShare = (wc(cp) + 1) / 2;
    bar.style.height = (100 * (flip ? whiteShare : 1 - whiteShare)) + '%';
    bar.parentNode.style.background = flip ? '#14181e' : '#e9e4d8';
    bar.style.background = flip ? '#e9e4d8' : '#14181e';
  }

  function evalText(p) { return p.mate != null ? (p.mate > 0 ? '#' + p.mate : '#' + p.mate) : (p.cp / 100 >= 0 ? '+' : '') + (p.cp / 100).toFixed(2); }
  function moveLabel(i) { var p = G.plies[i]; return Math.floor(i / 2) + 1 + (i % 2 ? '...' : '. ') + p.san; }

  function drawDetail() {
    if (ply < 0) { detail.innerHTML = '<p class="mono">Start position. Use the arrows, the graph or a key moment.</p>'; return; }
    var p = G.plies[ply], km = G.key_moments.filter(function (k) { return k.ply === ply + 1; })[0];
    var html = '<p class="mono">' + moveLabel(ply) + ' · eval after ' + evalText(p) + (p.grade ? ' · <span class="pump">' + p.grade + '</span>' : '') + '</p>';
    if (p.grade && p.best && p.best !== p.san) html += '<p>Stockfish preferred <strong>' + p.best + '</strong> (blue arrow): <span class="mono">' + p.best_line + '</span></p>';
    if (km) {
      var f = km.facts_before, items = [];
      items.push('Evaluation before the move: ' + km.eval_before + ', after: ' + km.eval_after + '.');
      items.push('Winning chances given away: ' + Math.round(km.win_chance_drop * 50) + ' percentage points.');
      if (f.hanging_pieces.length) items.push('Hanging before the move: ' + f.hanging_pieces.join(', ') + '.');
      if (f.attacked_by_a_cheaper_piece.length) items.push('Attacked by a cheaper piece: ' + f.attacked_by_a_cheaper_piece.join(', ') + '.');
      if (f.pinned_pieces.length) items.push('Pinned to the king: ' + f.pinned_pieces.join(', ') + '.');
      if (f.mate_in_one_for_side_to_move.length) items.push('Mate in one available: ' + f.mate_in_one_for_side_to_move.join(', ') + '.');
      items.push('Material (White minus Black): ' + (f.material_white_minus_black > 0 ? '+' : '') + f.material_white_minus_black + '.');
      html += '<p class="label">Verified facts · rules and engine, not the language model</p><div class="facts">' +
        items.map(function (t) { return '<div class="f"><span class="ok">✓</span><span>' + t + '</span></div>'; }).join('') + '</div>';
    }
    detail.innerHTML = html;
  }

  function drawList() {
    var html = '';
    G.plies.forEach(function (p, i) {
      if (i % 2 === 0) html += '<b>' + (i / 2 + 1) + '.</b> ';
      html += '<span data-i="' + i + '" class="' + (i === ply ? 'cur ' : '') + (p.grade ? 'g-' + p.grade : '') + '">' + p.san + '</span> ';
    });
    list.innerHTML = html;
    var cur = list.querySelector('.cur');
    if (cur) list.scrollTop = cur.offsetTop - list.clientHeight / 2;
  }

  // eval graph: winning chances for White by ply, key moments marked
  var GW = 600, GH = 130;
  function gx(i) { return 10 + (GW - 20) * (i + 1) / N; }
  function gy(cp) { return GH / 2 - wc(cp) * (GH / 2 - 8); }
  function drawGraph() {
    var pts = [[gx(-1), gy(20)]].concat(G.plies.map(function (p, i) { return [gx(i), gy(p.cp)]; }));
    var line = pts.map(function (q) { return q.join(','); }).join(' ');
    var area = 'M' + gx(-1) + ',' + GH / 2 + ' L' + line.split(' ').join(' L') + ' L' + gx(N - 1) + ',' + GH / 2 + ' Z';
    var marks = G.key_moments.map(function (k) { var i = k.ply - 1; return '<circle cx="' + gx(i) + '" cy="' + gy(G.plies[i].cp) + '" r="4" fill="#ff4a3d"/>'; }).join('');
    var cur = ply >= 0 ? '<line x1="' + gx(ply) + '" y1="4" x2="' + gx(ply) + '" y2="' + (GH - 4) + '" stroke="#e8ecf1" stroke-width="1"/>' : '';
    graph.innerHTML = '<svg viewBox="0 0 ' + GW + ' ' + GH + '" role="img" aria-label="Evaluation through the game; red dots mark the graded key moments">' +
      '<rect x="0" y="0" width="' + GW + '" height="' + GH + '" fill="#0b0f14"/>' +
      '<line x1="10" y1="' + GH / 2 + '" x2="' + (GW - 10) + '" y2="' + GH / 2 + '" stroke="#2a3542"/>' +
      '<path d="' + area + '" fill="rgba(233,228,216,0.12)"/><polyline points="' + line + '" fill="none" stroke="#e9e4d8" stroke-width="1.6"/>' +
      marks + cur + '<text x="14" y="16" fill="#8a94a2" font-family="Martian Mono, monospace" font-size="10">White better</text>' +
      '<text x="14" y="' + (GH - 8) + '" fill="#8a94a2" font-family="Martian Mono, monospace" font-size="10">Black better</text></svg>';
  }

  function go(i) {
    ply = Math.max(-1, Math.min(N - 1, i));
    drawBoard(); drawDetail(); drawList(); drawGraph();
    pos.textContent = ply < 0 ? 'start' : moveLabel(ply) + '  (' + (ply + 1) + '/' + N + ')';
    momentsEl.querySelectorAll('.moment').forEach(function (m) { m.classList.toggle('on', +m.dataset.ply === ply); });
  }
  function stop() { clearInterval(timer); timer = null; document.getElementById('play').textContent = 'Play'; }

  momentsEl.innerHTML = G.key_moments.map(function (k) {
    var i = k.ply - 1;
    return '<button class="moment" type="button" data-ply="' + i + '"><span class="mv">' + moveLabel(i) + ' <span class="pump">' + k.grade + '</span></span>' +
      '<span class="why">' + k.side + ' · ' + k.eval_before + ' → ' + k.eval_after + ' · best ' + k.best + '</span></button>';
  }).join('');
  momentsEl.addEventListener('click', function (e) { var b = e.target.closest('.moment'); if (b) { stop(); go(+b.dataset.ply); } });
  list.addEventListener('click', function (e) { var s = e.target.closest('span[data-i]'); if (s) { stop(); go(+s.dataset.i); } });
  graph.addEventListener('click', function (e) {
    var r = graph.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * GW;
    stop(); go(Math.round((x - 10) / ((GW - 20) / N)) - 1);
  });
  document.getElementById('first').onclick = function () { stop(); go(-1); };
  document.getElementById('prev').onclick = function () { stop(); go(ply - 1); };
  document.getElementById('next').onclick = function () { stop(); go(ply + 1); };
  document.getElementById('last').onclick = function () { stop(); go(N - 1); };
  document.getElementById('play').onclick = function () {
    if (timer) { stop(); return; }
    if (ply >= N - 1) go(-1);
    this.textContent = 'Pause';
    timer = setInterval(function () { if (ply >= N - 1) stop(); else go(ply + 1); }, 900);
  };
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') { stop(); go(ply - 1); } else if (e.key === 'ArrowRight') { stop(); go(ply + 1); }
  });
  go(G.key_moments.length ? G.key_moments[G.key_moments.length - 1].ply - 1 : -1);   // open on the decisive moment
})();
