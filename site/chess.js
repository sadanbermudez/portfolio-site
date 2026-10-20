/* Chess viewer: board, eval bar, eval graph, move list and key moments for one reviewed game.
   ChessViewer.load(game) accepts the reviewed game (data/chess-game.js, Stockfish 19 at 0.4 s per
   move via jarvis-chess) or a game analysed in the browser (analyse.js). Facts come from the server
   review when present, otherwise from ChessCore's attack map. Listeners (onPly) get every move.
   Explore mode: click or drag a piece to see its legal moves (chess.js) and play your own line from
   any point of the game; a separate Stockfish worker evaluates each position you reach. */
window.ChessViewer = (function () {
  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var me = 'dr_namer';
  var G = null, N = 0, ply = -1, timer = null, flip = false, listeners = [];
  var X = null;                       // explore state: { base, line: [{fen, san, uci}], sel, targets, promo, ev, token }
  var rules = null, engine = null, EXPLORE_MS = 800;
  var board = document.getElementById('board');
  var bar = document.querySelector('.evalbar .black');
  var pos = document.getElementById('pos');
  var detail = document.getElementById('detail');
  var list = document.getElementById('movelist');
  var graph = document.getElementById('graph');
  var momentsEl = document.getElementById('moments');
  var meta = document.getElementById('game-meta');
  if (!board) return { load: function () {}, onPly: function () {} };

  function wc(cp) { return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1; }
  function fenAt(i) { return i < 0 ? G.start_fen : G.plies[i].fen; }
  function curFen() { return X && X.line.length ? X.line[X.line.length - 1].fen : fenAt(ply); }
  function fenBoard(fen) {
    var rows = fen.split(' ')[0].split('/'), out = [];
    rows.forEach(function (r) { var row = []; r.split('').forEach(function (c) { if (/\d/.test(c)) { for (var i = 0; i < +c; i++) row.push(null); } else row.push(c); }); out.push(row); });
    return out;                                            // out[0] is rank 8
  }
  function sqXY(sq) {
    var f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
    return flip ? { x: 7 - f, y: r } : { x: f, y: 7 - r };
  }
  function arrow(uci, color, width) {
    if (!uci) return '';
    var a = sqXY(uci.slice(0, 2)), b = sqXY(uci.slice(2, 4));
    var x1 = a.x * 100 + 50, y1 = a.y * 100 + 50, x2 = b.x * 100 + 50, y2 = b.y * 100 + 50;
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    var ex = x2 - ux * 26, ey = y2 - uy * 26, hx = ex - ux * 22, hy = ey - uy * 22, px = -uy * 16, py = ux * 16;
    return '<g opacity=".85"><line x1="' + x1 + '" y1="' + y1 + '" x2="' + hx + '" y2="' + hy + '" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round"/>' +
      '<polygon points="' + ex + ',' + ey + ' ' + (hx + px) + ',' + (hy + py) + ' ' + (hx - px) + ',' + (hy - py) + '" fill="' + color + '"/></g>';
  }

  function drawBoard() {
    var b = fenBoard(curFen()), html = '';
    var lastUci = X ? (X.line.length ? X.line[X.line.length - 1].uci : (ply >= 0 ? G.plies[ply].uci : null)) : (ply >= 0 ? G.plies[ply].uci : null);
    var hl = lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : [];
    var tg = {};
    if (X && X.targets) X.targets.forEach(function (m) { tg[m.to] = m.captured ? 'ring' : 'dot'; });
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var r = flip ? y : 7 - y, f = flip ? 7 - x : x;
      var c = b[7 - r][f], sq = String.fromCharCode(97 + f) + (r + 1);
      var cls = 'sq ' + ((r + f) % 2 ? 'l' : 'd') + (hl.indexOf(sq) > -1 ? ' hl' : '') + (X && X.sel === sq ? ' sel' : '') + (X && X.lift === sq ? ' lifted' : '');
      var piece = c ? '<span class="' + (c === c.toUpperCase() ? 'pc-w' : 'pc-b') + '">' + GLYPH[c.toLowerCase()] + '︎</span>' : '';
      var mark = tg[sq] ? '<span class="' + tg[sq] + '" aria-hidden="true"></span>' : '';
      var coord = (y === 7 ? '<span class="coord f">' + String.fromCharCode(97 + f) + '</span>' : '') + (x === 0 ? '<span class="coord r">' + (r + 1) + '</span>' : '');
      html += '<div class="' + cls + '" data-sq="' + sq + '">' + piece + mark + coord + '</div>';
    }
    var arrows = '', cp;
    if (X) {
      if (X.line.length) arrows += arrow(lastUci, '#ffae4a', 13);
      if (X.ev && X.ev.best_uci && !X.sel) arrows += arrow(X.ev.best_uci, '#7fb6ff', 13);
      cp = X.ev ? X.ev.cp : (ply >= 0 && G.plies[ply].cp != null ? G.plies[ply].cp : 20);
    } else {
      var last = ply >= 0 ? G.plies[ply] : null;
      if (last) {
        arrows += arrow(last.uci, '#ffae4a', 13);
        if (last.grade && last.best_uci && last.best_uci !== last.uci) arrows += arrow(last.best_uci, '#7fb6ff', 13);
      }
      cp = ply < 0 || G.plies[ply].cp == null ? 20 : G.plies[ply].cp;
    }
    var promo = X && X.promo ? promoPicker(X.promo) : '';
    board.innerHTML = html + '<svg class="arrows" viewBox="0 0 800 800" aria-hidden="true">' + arrows + '</svg>' + promo;
    var whiteShare = (wc(cp) + 1) / 2;
    bar.style.height = (100 * (flip ? whiteShare : 1 - whiteShare)) + '%';
    bar.parentNode.style.background = flip ? '#14181e' : '#e9e4d8';
    bar.style.background = flip ? '#e9e4d8' : '#14181e';
  }
  function promoPicker(p) {
    var white = curFen().split(' ')[1] === 'w';
    return '<div class="promo" role="group" aria-label="Promote to">' + ['q', 'r', 'b', 'n'].map(function (t) {
      return '<button type="button" data-promo="' + t + '" class="' + (white ? 'pc-w' : 'pc-b') + '" aria-label="' + { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[t] + '">' + GLYPH[t] + '︎</button>';
    }).join('') + '</div>';
  }

  function evalText(p) { if (p.cp == null) return 'analysing…'; return p.mate != null ? (p.mate > 0 ? 'White mates in ' + p.mate : 'Black mates in ' + (-p.mate)) : (p.cp >= 0 ? '+' : '') + (p.cp / 100).toFixed(2); }
  function moveLabel(i) { return Math.floor(i / 2) + 1 + (i % 2 ? '...' : '. ') + G.plies[i].san; }
  function factItems(f) {
    var items = [];
    if (f.hanging_pieces.length) items.push('Hanging: ' + f.hanging_pieces.join(', ') + '.');
    if (f.attacked_by_a_cheaper_piece.length) items.push('Attacked by a cheaper piece: ' + f.attacked_by_a_cheaper_piece.join(', ') + '.');
    if (f.pinned_pieces && f.pinned_pieces.length) items.push('Pinned to the king: ' + f.pinned_pieces.join(', ') + '.');
    if (f.mate_in_one_for_side_to_move && f.mate_in_one_for_side_to_move.length) items.push('Mate in one available: ' + f.mate_in_one_for_side_to_move.join(', ') + '.');
    items.push('Material (White minus Black): ' + (f.material_white_minus_black > 0 ? '+' : '') + f.material_white_minus_black + '.');
    return '<div class="facts">' + items.map(function (t) { return '<div class="f"><span class="ok">✓</span><span>' + t + '</span></div>'; }).join('') + '</div>';
  }

  function drawDetail() {
    if (X) { drawExploreDetail(); return; }
    if (ply < 0) { detail.innerHTML = '<p class="mono">Start position. Use the arrows, the graph or a key moment, or click a piece to play your own moves.</p>'; return; }
    var p = G.plies[ply], km = (G.key_moments || []).filter(function (k) { return k.ply === ply + 1; })[0];
    var html = '<p class="mono">' + moveLabel(ply) + ' · eval after ' + evalText(p) + (p.grade ? ' · <span class="pump">' + p.grade + '</span>' : '') + '</p>';
    if (p.grade && p.best && p.best !== p.san) html += '<p>Stockfish preferred <strong>' + p.best + '</strong> (blue arrow)' + (p.best_line ? ': <span class="mono">' + p.best_line + '</span>' : '') + '</p>';
    if (p.grade) {
      var f = km && km.facts_before ? km.facts_before : window.ChessCore.facts(fenAt(ply - 1)), extra = [];
      if (km) extra.push('Evaluation before the move: ' + km.eval_before + ', after: ' + km.eval_after + '.');
      if (p.drop != null) extra.push('Winning chances given away: ' + Math.round(p.drop * 50) + ' percentage points.');
      html += '<p class="label">Verified facts before the move · rules and engine, not the language model</p>' +
        extra.map(function (t) { return '<div class="facts"><div class="f"><span class="ok">✓</span><span>' + t + '</span></div></div>'; }).join('') + factItems(f);
    }
    detail.innerHTML = html;
  }

  function lineText() {
    var start = X.base + 1, out = '';
    X.line.forEach(function (m, k) {
      var i = start + k;                                  // ply index the move would have in the game
      if (i % 2 === 0) out += (i / 2 + 1) + '. '; else if (k === 0) out += Math.floor(i / 2) + 1 + '... ';
      out += m.san + ' ';
    });
    return out.trim();
  }
  function drawExploreDetail() {
    var from = X.base < 0 ? 'the start position' : 'after ' + moveLabel(X.base);
    var html = '<p class="label">Your line · from ' + from + '</p>';
    html += '<p class="mono">' + (X.line.length ? lineText() : 'Click a piece, then one of the marked squares.') + '</p>';
    var over = X.over;
    if (over) html += '<p><strong>' + over + '</strong></p>';
    else if (X.line.length) {
      if (!X.ev) html += '<p class="mono">Stockfish 19 is thinking…</p>';
      else html += '<p class="mono">Eval ' + evalText(X.ev) + ' · depth ' + X.ev.depth + '</p>' +
        (X.ev.best ? '<p>Best reply: <strong>' + X.ev.best + '</strong> (blue arrow)' + (X.ev.line ? ': <span class="mono">' + X.ev.line + '</span>' : '') + '</p>' : '');
    }
    if (X.line.length) html += '<p class="label">Verified facts in this position · rules, not the language model</p>' + factItems(window.ChessCore.facts(curFen()));
    html += '<div class="explore-actions"><button type="button" data-x="undo"' + (X.line.length ? '' : ' disabled') + '>Undo</button><button type="button" data-x="back">Back to the game</button></div>';
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

  var GW = 600, GH = 130;
  function gx(i) { return 10 + (GW - 20) * (i + 1) / N; }
  function gy(cp) { return GH / 2 - wc(cp) * (GH / 2 - 8); }
  function drawGraph() {
    var done = G.plies.filter(function (p) { return p.cp != null; }).length;
    var pts = [[gx(-1), gy(20)]].concat(G.plies.slice(0, done).map(function (p, i) { return [gx(i), gy(p.cp)]; }));
    var line = pts.map(function (q) { return q.join(','); }).join(' ');
    var area = 'M' + gx(-1) + ',' + GH / 2 + ' L' + line.split(' ').join(' L') + ' L' + pts[pts.length - 1][0] + ',' + GH / 2 + ' Z';
    var marks = (G.key_moments || []).map(function (k) { var i = k.ply - 1; return G.plies[i].cp == null ? '' : '<circle cx="' + gx(i) + '" cy="' + gy(G.plies[i].cp) + '" r="4" fill="#ff4a3d"/>'; }).join('');
    var cur = ply >= 0 ? '<line x1="' + gx(ply) + '" y1="4" x2="' + gx(ply) + '" y2="' + (GH - 4) + '" stroke="#e8ecf1" stroke-width="1"/>' : '';
    graph.innerHTML = '<svg viewBox="0 0 ' + GW + ' ' + GH + '" role="img" aria-label="Evaluation through the game; red dots mark the graded key moments">' +
      '<rect x="0" y="0" width="' + GW + '" height="' + GH + '" fill="#0b0f14"/>' +
      '<line x1="10" y1="' + GH / 2 + '" x2="' + (GW - 10) + '" y2="' + GH / 2 + '" stroke="#2a3542"/>' +
      '<path d="' + area + '" fill="rgba(233,228,216,0.12)"/><polyline points="' + line + '" fill="none" stroke="#e9e4d8" stroke-width="1.6"/>' +
      marks + cur + '<text x="14" y="16" fill="#8a94a2" font-family="Martian Mono, monospace" font-size="10">White better</text>' +
      '<text x="14" y="' + (GH - 8) + '" fill="#8a94a2" font-family="Martian Mono, monospace" font-size="10">Black better</text></svg>';
  }

  function drawMoments() {
    momentsEl.innerHTML = (G.key_moments || []).map(function (k) {
      var i = k.ply - 1;
      return '<button class="moment" type="button" data-ply="' + i + '"><span class="mv">' + moveLabel(i) + ' <span class="pump">' + k.grade + '</span></span>' +
        '<span class="why">' + k.side + ' · ' + k.eval_before + ' → ' + k.eval_after + ' · best ' + k.best + '</span></button>';
    }).join('') || '<p class="mono">No graded mistakes yet.</p>';
  }

  function notify() {
    var p = ply >= 0 ? G.plies[ply] : null, state;
    if (X) {
      var n = X.line.length, prev = n > 1 ? X.line[n - 2].fen : fenAt(X.base);
      state = { fen: curFen(), before: n ? prev : fenAt(X.base - 1), uci: n ? X.line[n - 1].uci : (p && p.uci), best_uci: null, grade: null, flip: flip };
    } else state = { fen: fenAt(ply), before: fenAt(ply - 1), uci: p && p.uci, best_uci: p && p.grade ? p.best_uci : null, grade: p && p.grade, flip: flip };
    listeners.forEach(function (fn) { fn(state); });
  }
  function drawPos() {
    if (X) pos.textContent = 'your line · ' + X.line.length + (X.line.length === 1 ? ' move' : ' moves') + ' from ' + (X.base < 0 ? 'the start' : moveLabel(X.base));
    else pos.textContent = ply < 0 ? 'start' : moveLabel(ply) + '  (' + (ply + 1) + '/' + N + ')';
  }

  function go(i) {
    if (!G) return;
    leaveExplore();
    ply = Math.max(-1, Math.min(N - 1, i));
    drawBoard(); drawDetail(); drawList(); drawGraph(); drawPos();
    momentsEl.querySelectorAll('.moment').forEach(function (m) { m.classList.toggle('on', +m.dataset.ply === ply); });
    notify();
  }
  function stop() { clearInterval(timer); timer = null; document.getElementById('play').textContent = 'Play'; }

  // ---------- explore: click to move ----------
  function loadRules() {
    if (!rules) rules = import('../vendor/chess.js').then(function (mod) { return mod; });
    return rules;
  }
  function leaveExplore() { if (X) { X = null; if (engine) engine.stop(); } }
  function redrawExplore() { drawBoard(); drawDetail(); drawPos(); }

  function evaluate() {
    if (!X || !X.line.length || !window.ChessEngine) return;
    var token = X.token = (X.token || 0) + 1, fen = curFen();
    if (!engine) engine = window.ChessEngine.create();
    engine.stop();                                        // cut short any search for an older position
    engine.search(fen, EXPLORE_MS).then(function (res) {
      if (!X || X.token !== token) return;
      return loadRules().then(function (mod) {
        var g = new mod.Chess(fen), line = [], best = null;
        res.pv.slice(0, 6).forEach(function (u, k) {
          try { var mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (k === 0) best = mv.san; line.push(mv.san); } catch (err) { /* stop at an illegal tail */ }
        });
        if (!X || X.token !== token) return;
        X.ev = { cp: Math.max(-1500, Math.min(1500, res.cp)), mate: res.mate, depth: res.depth, best_uci: res.pv[0] || null, best: best, line: line.join(' ') };
        redrawExplore();
      });
    }).catch(function () { if (X && X.token === token) { X.ev = null; X.over = 'The engine could not start in this browser.'; redrawExplore(); } });
  }

  function play(mod, from, to, promotion) {
    var g = new mod.Chess(curFen()), mv;
    try { mv = g.move({ from: from, to: to, promotion: promotion }); } catch (err) { return; }
    X.line.push({ fen: g.fen(), san: mv.san, uci: mv.from + mv.to + (mv.promotion || '') });
    X.sel = null; X.targets = null; X.promo = null; X.ev = null;
    X.over = g.isCheckmate() ? 'Checkmate.' : g.isStalemate() ? 'Stalemate.' : g.isDraw() ? 'Draw.' : null;
    redrawExplore(); notify(); evaluate();
  }

  board.addEventListener('click', function (e) {
    if (!G) return;
    if (dropped) { dropped = false; return; }               // the click that ends a drag is not a second click
    var pb = e.target.closest('[data-promo]');
    var cell = e.target.closest('.sq');
    if (!pb && !cell) return;
    stop();
    loadRules().then(function (mod) {
      if (pb && X && X.promo) { play(mod, X.promo.from, X.promo.to, pb.dataset.promo); return; }
      if (!cell) return;
      var sq = cell.dataset.sq, g = new mod.Chess(curFen());
      if (X && X.sel && X.targets) {
        var hit = X.targets.filter(function (m) { return m.to === sq; });
        if (hit.length) {
          if (hit[0].promotion) { X.promo = { from: X.sel, to: sq }; drawBoard(); return; }
          play(mod, X.sel, sq); return;
        }
      }
      var piece = g.get(sq);
      if (!X) X = { base: ply, line: [], sel: null, targets: null, promo: null, ev: null, over: null, token: 0 };
      if (piece && piece.color === g.turn() && !X.over) {
        X.sel = X.sel === sq ? null : sq;
        X.targets = X.sel ? g.moves({ square: sq, verbose: true }) : null;
      } else { X.sel = null; X.targets = null; }
      X.promo = null;
      if (!X.line.length && !X.sel) { X = null; go(ply); return; }   // nothing played and nothing selected: back to the game view
      redrawExplore(); notify();
    }).catch(function () { detail.innerHTML = '<p class="mono">The move rules could not load in this browser.</p>'; });
  });
  // ---------- drag and drop: press a piece, move past a few pixels, drop on a marked square ----------
  var drag = null, dropped = false, ghost = null;
  function endDrag() {
    if (ghost) { ghost.remove(); ghost = null; }
    if (X) { X.lift = null; }
    drag = null;
  }
  board.addEventListener('pointerdown', function (e) {
    if (!G || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var cell = e.target.closest('.sq'), pc = cell && cell.querySelector('.pc-w, .pc-b');
    if (!pc || (X && X.promo)) return;
    drag = { from: cell.dataset.sq, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, ready: false, glyph: pc.textContent, cls: pc.className, size: cell.getBoundingClientRect().width };
    loadRules();
  });
  board.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.moved = true;
      try { board.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      var d = drag;
      loadRules().then(function (mod) {
        if (drag !== d) return;
        var g = new mod.Chess(curFen()), piece = g.get(d.from);
        if (!piece || piece.color !== g.turn() || (X && X.over)) { endDrag(); return; }   // only the side to move can be dragged
        stop();
        if (!X) X = { base: ply, line: [], sel: null, targets: null, promo: null, ev: null, over: null, token: 0 };
        X.sel = d.from; X.targets = g.moves({ square: d.from, verbose: true }); X.lift = d.from; X.promo = null;
        d.ready = true; d.mod = mod;
        ghost = document.createElement('span');
        ghost.className = 'drag-ghost ' + d.cls; ghost.textContent = d.glyph;
        ghost.style.width = ghost.style.height = d.size + 'px';
        ghost.style.fontSize = getComputedStyle(board.querySelector('.sq')).fontSize;
        document.body.appendChild(ghost);
        placeGhost(d.lastX || e.clientX, d.lastY || e.clientY);
        redrawExplore();
      });
    }
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    if (ghost) placeGhost(e.clientX, e.clientY);
  });
  function placeGhost(x, y) { ghost.style.left = (x - drag.size / 2) + 'px'; ghost.style.top = (y - drag.size / 2) + 'px'; }
  board.addEventListener('pointerup', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag;
    if (!d.moved) { drag = null; return; }                  // a plain click: the click handler takes it from here
    dropped = true;
    var under = document.elementFromPoint(e.clientX, e.clientY), cell = under && under.closest && under.closest('#board .sq');
    var to = cell && cell.dataset.sq, hit = d.ready && X && X.targets ? X.targets.filter(function (m) { return m.to === to; }) : [];
    endDrag();
    if (hit.length) {
      if (hit[0].promotion) { X.promo = { from: d.from, to: to }; drawBoard(); return; }
      play(d.mod, d.from, to); return;
    }
    if (X && !X.line.length && !X.sel) { X = null; go(ply); return; }
    if (X) { redrawExplore(); }                            // dropped off a legal square: the piece goes back, still selected
  });
  board.addEventListener('pointercancel', function () { if (drag) { endDrag(); if (X) redrawExplore(); } });

  detail.addEventListener('click', function (e) {
    var b = e.target.closest('[data-x]'); if (!b || !X) return;
    if (b.dataset.x === 'back') { go(X.base); return; }
    X.line.pop(); X.sel = null; X.targets = null; X.promo = null; X.ev = null; X.over = null;
    if (!X.line.length) { go(X.base); return; }
    redrawExplore(); notify(); evaluate();
  });

  momentsEl.addEventListener('click', function (e) { var b = e.target.closest('.moment'); if (b) { stop(); go(+b.dataset.ply); } });
  list.addEventListener('click', function (e) { var s = e.target.closest('span[data-i]'); if (s) { stop(); go(+s.dataset.i); } });
  graph.addEventListener('click', function (e) {
    var r = graph.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * GW;
    stop(); go(Math.round((x - 10) / ((GW - 20) / N)) - 1);
  });
  function back() { if (X) { var b = detail.querySelector('[data-x="undo"]'); if (b && !b.disabled) b.click(); else go(X.base); } else go(ply - 1); }
  document.getElementById('first').onclick = function () { stop(); go(-1); };
  document.getElementById('prev').onclick = function () { stop(); back(); };
  document.getElementById('next').onclick = function () { stop(); go(X ? X.base + 1 : ply + 1); };
  document.getElementById('last').onclick = function () { stop(); go(N - 1); };
  document.getElementById('play').onclick = function () {
    if (timer) { stop(); return; }
    if (X) go(X.base);
    if (ply >= N - 1) go(-1);
    this.textContent = 'Pause';
    timer = setInterval(function () { if (ply >= N - 1) stop(); else go(ply + 1); }, 900);
  };
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') { stop(); back(); } else if (e.key === 'ArrowRight') { stop(); go(X ? X.base + 1 : ply + 1); }
    else if (e.key === 'Escape' && X) { go(X.base); }
  });

  function load(game, startPly) {
    stop(); leaveExplore();
    G = game; N = G.plies.length;
    flip = (G.black || '').toLowerCase() === me.toLowerCase();
    if (meta) meta.textContent = G.white + (G.white_elo ? ' (' + G.white_elo + ')' : '') + ' vs ' + G.black + (G.black_elo ? ' (' + G.black_elo + ')' : '') + ', ' + G.result + (G.opening ? ' · ' + G.opening : '');
    drawMoments();
    go(startPly != null ? startPly : (G.key_moments && G.key_moments.length ? G.key_moments[G.key_moments.length - 1].ply - 1 : -1));
  }
  function refresh() { if (G) { drawMoments(); drawGraph(); drawList(); } }

  return { load: load, refresh: refresh, go: go, ply: function () { return ply; }, onPly: function (fn) { listeners.push(fn); }, current: function () { return G; },
    setMe: function (name) { if (name) me = name; } };
})();
if (window.CHESS_GAME) window.ChessViewer.load(window.CHESS_GAME);
