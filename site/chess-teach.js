/* Move explanations in chess concepts, grounded in the engine and the rules. Nothing here is
   invented: every sentence comes from a pattern found on the board (chess.js for legal moves,
   ChessCore for attack maps) in the position before the move, after it, or along Stockfish's
   principal variation (PV). Tactics that need the engine's say-so (a fork that wins, a skewer,
   material won) are only claimed when the PV actually plays them out. When nothing is found the
   text falls back to what the evaluation says, in pawns.
   window.ChessTeach.explain(opts) -> { verdict, sentences, marks } (see explain() below).
   Needs window.ChessCore (chess-core.js) and the chess.js Chess class, passed in as opts.Chess. */
window.ChessTeach = (function () {
  var VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };          // material
  var RANK = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };       // "worth more than", with the king above all
  var NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  var A = 'a'.charCodeAt(0);

  function core() { return window.ChessCore; }
  function sqName(f, r) { return String.fromCharCode(A + f) + (r + 1); }
  function sqXY(s) { return [s.charCodeAt(0) - A, +s[1] - 1]; }
  function piece(b, s) { var p = sqXY(s); return b[p[1]][p[0]]; }
  function label(type, s) { return type === 'k' ? 'the king' : 'the ' + NAME[type] + ' on ' + s; }
  function isUci(m) { return typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m); }

  // "22. Ne4 Bb7 23. Bd2" or ["e2e4", ...] -> list of moves (SAN or UCI)
  function moves(line) {
    if (!line) return [];
    if (Array.isArray(line)) return line.filter(Boolean);
    return String(line).replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
  }
  function apply(g, m) {
    try { return g.move(isUci(m) ? { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] } : m); } catch (e) { return null; }
  }
  function same(Chess, fen, a, b) {
    if (!a || !b) return false;
    var x = apply(new Chess(fen), a), y = apply(new Chess(fen), b);
    return !!(x && y && x.from === y.from && x.to === y.to && (x.promotion || '') === (y.promotion || ''));
  }

  // ---------- board geometry ----------
  function attacksFrom(att, s) { var p = sqXY(s); return att.filter(function (a) { return a.from[0] === p[0] && a.from[1] === p[1]; }); }
  function attackersOf(att, s, white) { var p = sqXY(s); return att.filter(function (a) { return a.white === white && a.to[0] === p[0] && a.to[1] === p[1]; }); }
  function defended(att, s, white) { return attackersOf(att, s, white).length > 0; }

  // Lines through two enemy pieces from one slider of colour `white`: pins and skewers.
  function rays(b, white) {
    var out = [];
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = b[r][f]; if (!p || p.white !== white || 'brq'.indexOf(p.type) < 0) continue;
      var dirs = [];
      if (p.type !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
      if (p.type !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      dirs.forEach(function (d) {
        var hit = [];
        for (var k = 1; k < 8 && hit.length < 2; k++) {
          var tf = f + d[0] * k, tr = r + d[1] * k; if (tf < 0 || tf > 7 || tr < 0 || tr > 7) break;
          var q = b[tr][tf]; if (!q) continue;
          if (q.white === white) break;
          hit.push({ s: sqName(tf, tr), t: q.type });
        }
        if (hit.length === 2) out.push({ by: sqName(f, r), byType: p.type, front: hit[0], back: hit[1] });
      });
    }
    return out;
  }
  function pins(b, white) {                                // pieces of the other side pinned by `white`
    return rays(b, white).filter(function (x) {
      if (x.front.t === 'k' || x.front.t === 'p') return false;
      return x.back.t === 'k' || (RANK[x.back.t] > RANK[x.front.t] && VAL[x.back.t] >= 5);
    }).map(function (x) { x.absolute = x.back.t === 'k'; return x; });
  }
  function skewers(b, white) {
    return rays(b, white).filter(function (x) {
      return x.back.t !== 'p' && x.back.t !== 'k' && (x.front.t === 'k' || RANK[x.front.t] > RANK[x.back.t]);
    });
  }
  function key(x) { return x.by + x.front.s + x.back.s; }
  function passed(b, f, r, white) {
    var dir = white ? 1 : -1;
    for (var rr = r + dir; rr >= 0 && rr < 8; rr += dir) for (var ff = f - 1; ff <= f + 1; ff++) {
      if (ff < 0 || ff > 7) continue;
      var q = b[rr][ff]; if (q && q.type === 'p' && q.white !== white) return false;
    }
    return true;
  }
  function reach(att, b, s, white) {                       // squares a piece attacks that are not its own side's
    return attacksFrom(att, s).filter(function (a) { var q = b[a.to[1]][a.to[0]]; return !q || q.white !== white; }).length;
  }

  // ---------- material along a line ----------
  // Static exchange on one square: the best the side to move gets by capturing there, stopping when it no longer pays.
  function see(g, s, depth) {
    if (depth > 12) return { v: 0, seq: [] };
    var caps = g.moves({ verbose: true }).filter(function (m) { return m.to === s && m.captured; });
    if (!caps.length) return { v: 0, seq: [] };
    caps.sort(function (x, y) { return RANK[x.piece] - RANK[y.piece]; });
    var m = g.move({ from: caps[0].from, to: s, promotion: caps[0].promotion ? 'q' : undefined });
    var sub = see(g, s, depth + 1); g.undo();
    var v = VAL[m.captured] + (m.promotion ? VAL[m.promotion] - 1 : 0) - sub.v;
    return v > 0 ? { v: v, seq: [m].concat(sub.seq) } : { v: 0, seq: [] };
  }

  // The best capture the side to move still has anywhere on the board (a one-ply quiescence).
  function loosest(g) {
    var best = { v: 0, seq: [] }, seen = {};
    g.moves({ verbose: true }).forEach(function (m) {
      if (!m.captured || seen[m.to]) return; seen[m.to] = 1;
      var x = see(g, m.to, 0); if (x.v > best.v) best = x;
    });
    return best;
  }
  // How much of the line is forcing: captures, checks, answers to checks, and a quiet move that a
  // capture follows at once. Material is counted over that stretch only; deeper in a PV the moves
  // are less forced and a capture there says little about the move being explained.
  function forcing(seq) {
    var n = 1;
    while (n < seq.length && n < 10) {
      var m = seq[n], next = seq[n + 1];
      if (!(m.captured || /[+#]$/.test(m.san) || /[+#]$/.test(seq[n - 1].san) || (n <= 3 && next && next.captured))) break;
      n++;
    }
    return n;
  }
  // Play `first` from fen, then the line. Returns the positions, the moves, and a ledger of what each side took.
  // prevCap { s, t }: the opponent's capture just before this move, so that taking back counts as even.
  function walk(Chess, fen, first, line, prevCap) {
    var g = new Chess(fen), mv = apply(g, first);
    if (!mv) return null;
    var seq = [mv], fens = [fen, g.fen()];
    moves(line).some(function (m) { var x = apply(g, m); if (!x) return true; seq.push(x); fens.push(g.fen()); return false; });
    var mate = g.isCheckmate(), last = seq[seq.length - 1], cut = forcing(seq), ext = [];
    if (!(mate && seq.length === cut) && seq[cut - 1].captured) ext = loosest(new Chess(fens[cut])).seq;   // only to finish an exchange the line left open
    var me = mv.color, gain = [], loss = [];
    var recapture = !!(prevCap && mv.captured && mv.to === prevCap.s);
    if (recapture) loss.push({ t: prevCap.t, s: prevCap.s, earlier: true });
    seq.slice(0, cut).concat(ext).forEach(function (m, i) {
      var mine = m.color === me;
      if (m.captured) (mine ? gain : loss).push({ t: m.captured, s: m.to, i: i });
      if (m.promotion) { (mine ? gain : loss).push({ t: m.promotion, s: m.to, promo: true, i: i }); (mine ? loss : gain).push({ t: 'p', s: m.to, promo: true, i: i }); }
    });
    var sum = function (xs) { return xs.reduce(function (n, x) { return n + VAL[x.t]; }, 0); };
    return { mv: mv, seq: seq, fens: fens, gain: gain, loss: loss, net: sum(gain) - sum(loss), mate: mate, mater: mate ? last.color : null, last: last, recapture: recapture };
  }

  // What one side won, in words: "the rook on e1", "a rook for a knight", "two pawns".
  // Cancel captures that even out (same square first, then equal value, earliest first); what is left was won.
  function remainder(gain, loss) {
    var g = gain.slice(), l = loss.slice();
    [function (x, y) { return x.s === y.s && VAL[x.t] === VAL[y.t]; }, function (x, y) { return VAL[x.t] === VAL[y.t]; }].forEach(function (match) {
      for (var i = 0; i < g.length; i++) {
        var j = -1; l.some(function (x, k) { if (match(g[i], x)) { j = k; return true; } return false; });
        if (j > -1) { g.splice(i, 1); l.splice(j, 1); i--; }
      }
    });
    return { g: g, l: l };
  }
  function spoils(gain, loss) {
    var left = remainder(gain, loss), g = left.g, l = left.l;
    if (!g.length) return null;
    g.sort(function (x, y) { return VAL[y.t] - VAL[x.t]; });
    var count = function (xs) {
      var c = {}; xs.forEach(function (x) { c[x.t] = (c[x.t] || 0) + 1; });
      return Object.keys(c).sort(function (x, y) { return VAL[y] - VAL[x]; }).map(function (t) { return c[t] === 1 ? (t === 'p' ? 'a pawn' : 'a ' + NAME[t]) : (c[t] === 2 ? 'two ' : c[t] + ' ') + NAME[t] + 's'; }).join(' and ');
    };
    if (!l.length) return g.length === 1 && !g[0].promo ? label(g[0].t, g[0].s) : count(g);
    if (g.length === 1 && g[0].t === 'r' && l.length === 1 && (l[0].t === 'n' || l[0].t === 'b')) return 'the exchange (a rook for a ' + NAME[l[0].t] + ')';
    if (g.length + l.length > 3) return 'material';
    return count(g) + ' for ' + count(l);
  }

  // ---------- motifs of one move, given the line that follows it ----------
  // Each motif: { k: kind, w: weight (higher first), say: verb phrase, marks }.
  function motifs(Chess, fen, move, line, opts) {
    opts = opts || {};
    var W = walk(Chess, fen, move, line, opts.prevCap);
    if (!W) return null;
    var C = core(), mv = W.mv, white = mv.color === 'w', out = [];
    var b0 = C.parse(fen), b1 = C.parse(W.fens[1]), att0 = C.attacks(b0), att1 = C.attacks(b1);
    var mine = function (k) { return W.seq[k] && W.seq[k].color === mv.color ? W.seq[k] : null; };
    // does this side capture on one of these squares on its next two moves of the line?
    var takes = function (squares) { return [2, 4].some(function (k) { var m = mine(k); return m && m.captured && squares.indexOf(m.to) > -1; }); };
    var check = W.seq.length > 0 && /[+#]$/.test(mv.san);

    if (W.mate && W.mater === mv.color) {
      var lm = W.last, kb = C.parse(W.fens[W.fens.length - 1]), ks = null;
      for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) { var q = kb[r][f]; if (q && q.type === 'k' && q.white !== white) ks = sqName(f, r); }
      var home = white ? '8' : '1';
      var back = ks && ks[1] === home && (lm.piece === 'r' || lm.piece === 'q') && lm.to[1] === home;
      var plies = W.seq.length;
      out.push({ k: 'mate', w: 100, end: lm.san, say: plies === 1 ? (back ? 'is a back-rank mate' : 'is checkmate') : 'leads to ' + (back ? 'a back-rank mate' : 'checkmate') + ' (' + lm.san + ')', marks: { squares: ks ? [ks] : [] } });
    }

    // fork: the moved piece attacks two or more targets worth hitting
    var tgt = attacksFrom(att1, mv.to).map(function (a) { var s = sqName(a.to[0], a.to[1]), q = b1[a.to[1]][a.to[0]]; return q && q.white !== white ? { s: s, t: q.type } : null; })
      .filter(function (x) { return x && (x.t === 'k' || RANK[x.t] > RANK[mv.piece] || (x.t !== 'p' && !defended(att1, x.s, !white))); });
    if (tgt.length >= 2) {
      tgt.sort(function (x, y) { return RANK[y.t] - RANK[x.t]; });
      var two = tgt.slice(0, 2), sqs = tgt.map(function (x) { return x.s; });
      var names = two.map(function (x) { return label(x.t, x.s); }).join(' and ');
      if (takes(sqs)) out.push({ k: 'fork', w: 80, say: 'forks ' + names, marks: { squares: sqs } });
      else if (!opts.pvOnly && W.seq.length === 1) out.push({ k: 'double', w: 30, say: 'attacks ' + names + ' at once', marks: { squares: sqs } });
    }

    // pins and skewers made by this move (the moved piece, or a line it opened)
    var had = {}; pins(b0, white).forEach(function (x) { had[key(x)] = 1; });
    pins(b1, white).forEach(function (x) {
      if (had[key(x)]) return;
      var what = 'pins ' + label(x.front.t, x.front.s) + ' to ' + (x.absolute ? 'the king' : label(x.back.t, x.back.s));
      out.push({ k: 'pin', w: x.absolute ? 60 : 55, say: x.by === mv.to ? what : 'uncovers a pin: the ' + NAME[x.byType] + ' on ' + x.by + ' ' + what,
        marks: { squares: [x.by, x.front.s, x.back.s], arrows: [x.by + x.back.s] } });
    });
    var hadS = {}; skewers(b0, white).forEach(function (x) { hadS[key(x)] = 1; });
    skewers(b1, white).forEach(function (x) {
      if (hadS[key(x)] || !takes([x.back.s])) return;
      out.push({ k: 'skewer', w: 78, say: 'skewers ' + label(x.front.t, x.front.s) + ' and ' + label(x.back.t, x.back.s), marks: { squares: [x.by, x.front.s, x.back.s], arrows: [x.by + x.back.s] } });
    });

    // discovered attack or check: another piece's line opens through the square just left
    var before = {}; att0.forEach(function (a) { before[a.from + '>' + a.to] = 1; });
    att1.forEach(function (a) {
      var from = sqName(a.from[0], a.from[1]), to = sqName(a.to[0], a.to[1]);
      if (from === mv.to || a.white !== white || 'brq'.indexOf(a.type) < 0 || before[a.from + '>' + a.to]) return;
      var q = b1[a.to[1]][a.to[0]]; if (!q || q.white === white) return;
      var fx = sqXY(mv.from), between = (fx[0] - a.from[0]) * (a.to[1] - a.from[1]) === (fx[1] - a.from[1]) * (a.to[0] - a.from[0]) &&
        Math.min(a.from[0], a.to[0]) <= fx[0] && fx[0] <= Math.max(a.from[0], a.to[0]) && Math.min(a.from[1], a.to[1]) <= fx[1] && fx[1] <= Math.max(a.from[1], a.to[1]);
      if (!between) return;
      if (q.type === 'k') out.push({ k: 'discovered', w: 75, say: 'uncovers a discovered check from the ' + NAME[a.type] + ' on ' + from, marks: { squares: [from, to], arrows: [from + to] } });
      else if ((RANK[q.type] > RANK[a.type] || !defended(att1, to, !white)) && takes([to])) out.push({ k: 'discovered', w: 72, say: 'uncovers an attack by the ' + NAME[a.type] + ' on ' + from + ' against ' + label(q.type, to), marks: { squares: [from, to], arrows: [from + to] } });
    });

    // removing the defender: the capture leaves another enemy piece loose, and the line then takes it
    if (mv.captured) {
      for (var rr = 0; rr < 8; rr++) for (var ff = 0; ff < 8; ff++) {
        var e = b1[rr][ff], s = sqName(ff, rr);
        if (!e || e.white === white || e.type === 'k' || s === mv.to) continue;
        var wasDef = attackersOf(att0, s, !white).some(function (a) { return sqName(a.from[0], a.from[1]) === mv.to; });
        if (wasDef && defended(att1, s, white) && !defended(att1, s, !white) && takes([s]))
          out.push({ k: 'defender', w: 70, say: 'removes the defender of ' + label(e.type, s), marks: { squares: [s] } });
      }
    }

    // pins: escaped, or a pinned piece attacked
    pins(b0, !white).forEach(function (x) {
      if (pins(b1, !white).some(function (y) { return key(y) === key(x); }) || mv.from === x.front.s) return;
      var how = mv.to === x.by ? 'takes the pinning ' + NAME[x.byType] + ', freeing ' : (mv.from === x.back.s ? 'steps out of the pin on ' : 'breaks the pin on ');
      out.push({ k: 'unpin', w: 45, say: how + label(x.front.t, x.front.s), marks: { squares: [x.front.s] } });
    });
    pins(b1, white).forEach(function (x) {
      var hits = attacksFrom(att1, mv.to).some(function (a) { return sqName(a.to[0], a.to[1]) === x.front.s; });
      if (hits && RANK[mv.piece] < RANK[x.front.t] && !out.some(function (o) { return o.k === 'pin'; }))
        out.push({ k: 'pile', w: 50, say: 'attacks the pinned ' + NAME[x.front.t] + ' on ' + x.front.s, marks: { squares: [x.front.s, x.by] } });
    });

    // material over the whole line
    // a win is the move's own only if it is taken on this move or the side's next one
    var upTo2 = function (xs) { return xs.reduce(function (n, x) { return n + (x.i == null || x.i <= 2 ? VAL[x.t] : 0); }, 0); };
    var early = upTo2(W.gain) - upTo2(W.loss) >= 1;
    if (W.net >= 1 && !W.mate && early) { var sp = spoils(W.gain, W.loss); if (sp) out.push({ k: 'wins', w: 65, say: 'wins ' + sp, marks: { squares: W.gain.map(function (x) { return x.s; }) } }); }
    if (W.net <= -1 && !(W.mate && W.mater === mv.color)) { var sl = spoils(W.loss, W.gain); if (sl) out.push({ k: 'loses', w: 66, say: 'loses ' + sl, marks: { squares: W.loss.map(function (x) { return x.s; }) } }); }

    if (opts.pvOnly) return { W: W, list: rank(out) };

    // quieter ideas: trades, passed pawns, castling, king cover, development, activity, check
    var mat = C.facts(fen).material_white_minus_black * (white ? 1 : -1);
    var reply = W.seq[1];
    if (W.recapture && W.net === 0) out.push({ k: 'recapture', w: 12, say: 'takes back the ' + NAME[mv.captured], marks: {} });
    else if (mv.captured && reply && reply.captured && reply.to === mv.to && VAL[reply.captured] === VAL[mv.piece] && VAL[mv.captured] === VAL[mv.piece]) {
      var pair = mv.captured === mv.piece ? NAME[mv.piece] + 's' : 'a ' + NAME[mv.piece] + ' for a ' + NAME[mv.captured];
      out.push(mat >= 2 ? { k: 'trade', w: 40, say: 'trades ' + pair + ' while ahead in material, a step toward a won ending', marks: { squares: [mv.to] } }
        : { k: 'trade', w: 28, say: 'trades ' + pair, marks: { squares: [mv.to] } });
    }
    if (mv.piece === 'p') {
      var to = sqXY(mv.to), fr = sqXY(mv.from), rel = white ? to[1] + 1 : 8 - to[1];
      if (mv.promotion) out.push({ k: 'promote', w: 64, say: 'promotes to a ' + NAME[mv.promotion], marks: { squares: [mv.to] } });
      else if (passed(b1, to[0], to[1], white)) {
        if (!passed(b0, fr[0], fr[1], white)) out.push({ k: 'passer', w: 38, say: 'creates a passed pawn on ' + mv.to, marks: { squares: [mv.to] } });
        else if (rel >= 5) out.push({ k: 'passer', w: 36, say: 'pushes the passed pawn to ' + mv.to, marks: { squares: [mv.to] } });
      }
    }
    if (/[kq]/.test(mv.flags)) out.push({ k: 'castle', w: 34, say: 'castles, tucking the king away and bringing a rook toward the centre', marks: {} });
    else if (mv.piece === 'k' && (fen.split(' ')[2] || '-').replace(/[^KQkq]/g, '').split('').some(function (c) { return (c === c.toUpperCase()) === white; }))
      out.push({ k: 'nocastle', w: 33, say: 'gives up the right to castle', marks: { squares: [mv.to] } });
    var kr = white ? 0 : 7, kf = -1;
    for (var x = 0; x < 8; x++) { var kp = b0[kr][x]; if (kp && kp.type === 'k' && kp.white === white) kf = x; }
    var pf = sqXY(mv.from);
    if (mv.piece === 'p' && kf > -1 && (kf <= 2 || kf >= 5) && Math.abs(pf[0] - kf) <= 1 && pf[1] === (white ? 1 : 6))
      out.push({ k: 'cover', w: 20, say: 'loosens the pawns in front of the king', marks: { squares: [mv.from] } });
    var full = +(fen.split(' ')[5] || 1);
    if ((mv.piece === 'n' || mv.piece === 'b') && full <= 15 && pf[1] === (white ? 0 : 7))
      out.push({ k: 'develop', w: 26, say: 'develops the ' + NAME[mv.piece], marks: { squares: [mv.to] } });
    var takenAt = W.seq[1] && W.seq[1].captured && W.seq[1].to === mv.to;      // a piece taken at once is not "activated"
    if ('nbrq'.indexOf(mv.piece) > -1 && !mv.captured && !takenAt && !out.some(function (o) { return o.k === 'develop'; })) {
      var r0 = reach(att0, b0, mv.from, white), r1 = reach(att1, b1, mv.to, white);
      if (r1 - r0 >= 4) out.push({ k: 'active', w: 24, say: 'activates the ' + NAME[mv.piece] + ': it now reaches ' + r1 + ' squares instead of ' + r0, marks: { squares: [mv.to] } });
    }
    if (check && !out.some(function (o) { return o.k === 'mate' || o.k === 'discovered' || o.k === 'fork'; })) out.push({ k: 'check', w: 10, say: 'gives check', marks: {} });
    return { W: W, list: rank(out) };
  }
  function rank(list) { return list.sort(function (a, b) { return b.w - a.w; }); }

  // ---------- positional ideas along a line (chess-position.js) ----------
  var PLIES = 6;                                           // the move and up to five more plies of its line
  // Events in favour of side `white` along a walked line: { list, seq, mat }. Empty if chess-position.js
  // is absent. The stretch never ends between a capture and the recapture on the same square, and an
  // event is kept only if material is level with the start at the ply it appears: a positional point
  // made in the middle of an exchange, or after one side has won material, is not the reason for anything.
  function posEvents(W, white) {
    var CP = window.ChessPosition;
    if (!CP || !W) return { list: [], seq: [], mat: [] };
    var n = Math.min(W.seq.length, PLIES);
    while (n < W.seq.length && n < PLIES + 2 && W.seq[n].captured && W.seq[n].to === W.seq[n - 1].to) n++;
    var seq = W.seq.slice(0, n), fens = W.fens.slice(0, n + 1);
    var mat = fens.map(function (f) { return core().facts(f).material_white_minus_black; });
    // captures before ply k that are not a capture and recapture on one square: a melee, not a plan
    var melee = function (k) {
      for (var i = 0; i < k; i++) {
        if (!seq[i].captured) continue;
        if (i + 1 < k && seq[i + 1].captured && seq[i + 1].to === seq[i].to) { i++; continue; }
        return true;
      }
      return false;
    };
    return { list: CP.events(fens, seq, white).filter(function (e) { return mat[e.k] === mat[0] && !melee(e.k); }), seq: seq, mat: mat };
  }
  // Was the move at index i of a line forced: an answer to check, or a piece stepping away from a pawn's attack?
  function forced(W, i) {
    var m = W.seq[i], prev = W.seq[i - 1]; if (!m || !prev) return false;
    if (/[+#]$/.test(prev.san)) return true;
    var b = core().parse(W.fens[i]), p = sqXY(m.from), d = m.color === 'w' ? 1 : -1, row = b[p[1] + d];
    return !!row && [-1, 1].some(function (df) { var q = row[p[0] + df]; return q && q.type === 'p' && q.white !== (m.color === 'w'); });
  }
  // Drop the events that the other line reaches too: they do not tell the two moves apart.
  function only(E, other) {
    var keys = {}; (other ? other.list : []).forEach(function (e) { keys[e.key] = 1; });
    return E.list.filter(function (e) { return !keys[e.key]; });
  }
  // Up to two events for one sentence: the strongest, plus a second strong one the same stretch of line shows.
  function pickTwo(list) {
    if (!list.length) return [];
    var top = list[0], two = list.filter(function (e, i) { return i > 0 && e.w >= 36 && e.k <= top.k && e.kind !== top.kind; })[0];
    return two && (top.state + two.state).length <= 110 ? [top, two] : [top];      // two only while the sentence stays short
  }
  function sans(seq, a, b) { return seq.slice(a, b).map(function (m) { return m.san; }).join(' '); }
  function states(es) { return es.map(function (e) { return e.state; }).join(', and '); }
  // Prophylaxis: does the engine's move stop one of the opponent's moves on the way to `e`, by occupying
  // its target square, taking the piece that would make it, or standing in its path? Only for a piece
  // that has not moved since the played move (so the same move is meant), only when the move is illegal
  // right after the engine's move, never when the engine's move gives check, and never for a move the
  // engine's own line plays anyway.
  function prevents(Chess, fen, best, BW, PW, e) {
    var g = new Chess(fen), bm = apply(g, best);
    if (!bm || /[+#]$/.test(bm.san)) return null;
    var legal = g.moves({ verbose: true }), other = bm.color === 'w' ? 'Black' : 'White';
    var between = function (a, b, s) {
      var x = sqXY(a), y = sqXY(b), z = sqXY(s), df = Math.sign(y[0] - x[0]), dr = Math.sign(y[1] - x[1]);
      if (x[0] !== y[0] && x[1] !== y[1] && Math.abs(y[0] - x[0]) !== Math.abs(y[1] - x[1])) return false;   // a knight's jump has no path
      for (var f = x[0] + df, r = x[1] + dr; f !== y[0] || r !== y[1]; f += df, r += dr) if (f === z[0] && r === z[1]) return true;
      return false;
    };
    for (var i = 1; i < e.k && i < PW.seq.length; i += 2) {
      var t = PW.seq[i];
      if (PW.seq.slice(1, i).some(function (m) { return m.to === t.from || m.from === t.from; })) continue;   // that piece moved in between
      if (legal.some(function (m) { return m.from === t.from && m.to === t.to; })) continue;
      if (BW.seq.some(function (m) { return m.from === t.from && m.to === t.to; })) continue;
      if (bm.to === t.to) return 'puts ' + (bm.piece === 'p' ? 'a pawn' : 'the ' + NAME[bm.piece]) + ' on ' + t.to + ' before ' + other + '\'s ' + NAME[t.piece] + ' can get there';
      if (bm.to === t.from) return 'takes the ' + NAME[t.piece] + ' on ' + t.from + ' before it can go to ' + t.to;
      if (between(t.from, t.to, bm.to)) return 'blocks the ' + NAME[t.piece] + ' on ' + t.from + ' from reaching ' + t.to;
    }
    return null;
  }

  // ---------- the explanation ----------
  function wc(cp) { return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1; }
  function pawns(cp) { return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1); }
  function standing(cp, mate) {
    if (mate != null) return (mate > 0 ? 'White' : 'Black') + ' has a forced mate';
    var a = Math.abs(cp), side = cp > 0 ? 'White' : 'Black';
    if (a < 50) return 'the position is about equal (' + pawns(cp) + ')';
    return side + ' is ' + (a < 150 ? 'slightly better' : a < 300 ? 'clearly better' : 'winning') + ' (' + pawns(cp) + ')';
  }
  // "forks the king and the rook on a8, winning the rook on a8"
  function phrase(ms) {
    if (ms.length === 2 && TACTIC[ms[0].k] && ms[1].k === 'wins') return ms[0].say + ', winning ' + ms[1].say.slice(5);
    return join(ms.map(function (m) { return m.say; }));
  }
  function join(list) { return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
  var TACTIC = { fork: 1, pin: 1, skewer: 1, discovered: 1, defender: 1, mate: 1 };

  /* opts: { Chess, fen (before the move), played, best, pvBest (engine line from fen, best move first),
             pvAfter (engine line after the played move), cpBefore, cpAfter (White's view, centipawns),
             mateBefore, mateAfter (White's view, moves; null if none), drop (winning chances lost, 0..2), grade }
     returns { verdict: 'best'|'good'|'fine'|'inaccuracy'|'mistake'|'blunder', sentences: [...],
               marks: { squares: [...], arrows: [{ uci, kind: 'reply'|'idea' }] } } or null */
  function explain(o) {
    var Chess = o.Chess, fen = o.fen;
    var white = fen.split(' ')[1] !== 'b', sign = white ? 1 : -1, side = white ? 'White' : 'Black', other = white ? 'Black' : 'White';
    var pvAfter = moves(o.pvAfter), pvBest = moves(o.pvBest);
    var prevCap = null;
    if (o.prev && o.prev.fen && o.prev.move) { var pm = apply(new Chess(o.prev.fen), o.prev.move); if (pm && pm.captured) prevCap = { s: pm.to, t: pm.captured }; }
    var P = motifs(Chess, fen, o.played, pvAfter, { prevCap: prevCap });
    if (!P) return null;
    var san = P.W.mv.san, fen1 = P.W.fens[1];
    var isBest = o.best ? same(Chess, fen, o.played, o.best) : false;
    var drop = o.drop != null ? o.drop : (o.cpBefore != null && o.cpAfter != null ? Math.max(0, wc(sign * o.cpBefore) - wc(sign * o.cpAfter)) : null);
    var mB = o.mateBefore != null ? o.mateBefore * sign : null, mA = o.mateAfter != null ? o.mateAfter * sign : null;  // >0: mover mates
    var verdict = o.grade || (isBest ? 'best' : drop == null ? null : drop < 0.03 ? 'good' : drop < 0.1 ? 'fine' : drop < 0.2 ? 'inaccuracy' : drop < 0.3 ? 'mistake' : 'blunder');
    var bad = verdict === 'inaccuracy' || verdict === 'mistake' || verdict === 'blunder';
    var out = [], marks = { squares: [], arrows: [] };
    var mark = function (m, kind) { if (!m) return; (m.squares || []).forEach(function (s) { if (marks.squares.indexOf(s) < 0) marks.squares.push(s); }); (m.arrows || []).forEach(function (u) { marks.arrows.push({ uci: u, kind: kind || 'idea' }); }); };

    // the opponent's answer from the engine line, read as a move with its own motifs
    var R = pvAfter.length && !P.W.mate ? motifs(Chess, fen1, pvAfter[0], pvAfter.slice(1), { pvOnly: true }) : null;
    var rTac = R ? R.list.filter(function (m) { return TACTIC[m.k]; })[0] : null;
    var evAfter = o.mateAfter != null ? (o.mateAfter * sign > 0 ? 1e4 : -1e4) : o.cpAfter != null ? sign * o.cpAfter : null;
    var evBest = o.mateBefore != null ? (o.mateBefore * sign > 0 ? 1e4 : -1e4) : o.cpBefore != null ? sign * o.cpBefore : null;
    var B = o.best && !isBest ? motifs(Chess, fen, o.best, same(Chess, fen, pvBest[0], o.best) ? pvBest.slice(1) : [], { prevCap: prevCap }) : null;
    // a material win is only claimed when the evaluation agrees the side is that much better
    var agree = function (M, ev) { if (M && ev != null) M.list = M.list.filter(function (m) { return m.k !== 'wins' || ev >= (M.W.net - 1) * 100; }); };
    agree(P, evAfter); agree(B, evBest);
    var mine = P.list.filter(function (m) { return m.k !== 'loses' && m.k !== 'cover'; });
    var gap = (B ? B.W.net : 0) - P.W.net;              // material the engine's choice keeps that the move gives up
    var lossOk = !(o.cpBefore != null && o.cpAfter != null && sign * (o.cpBefore - o.cpAfter) < (-P.W.net - 1) * 100);
    var rm = R && R.W.mv, stays = !!(rm && rm.captured && persists(Chess, fen, o.best, rm));   // the engine's move would not have saved it either
    // material over the whole engine line: a piece "taken" that the line wins back was not lost
    var matOf = function (f) { return core().facts(f).material_white_minus_black * sign; };
    var fullNet = matOf(P.W.fens[P.W.fens.length - 1]) - matOf(fen) - (P.W.recapture ? VAL[prevCap.t] : 0);
    var lost = gap >= 1 && lossOk && !stays && fullNet < 0 ? P.list.filter(function (m) { return m.k === 'loses'; })[0] : null;
    // positional ideas: what the line after the move gives the opponent, and what the engine's line gives the side
    // a swing of two pawns or more is not explained by a small factor (a bishop pair, a backward pawn):
    // then only the strong ones count (an outpost, a shut-in piece, the king's cover, an open file ...)
    var minW = o.cpBefore != null && o.cpAfter != null && Math.abs(o.cpBefore - o.cpAfter) >= 200 ? 36 : 0;
    var PEopp = bad ? posEvents(P.W, !white) : null, BEopp = bad && B ? posEvents(B.W, !white) : null;

    // positional praise, only for a move the engine rates best or good, that loses nothing over its line,
    // and only for what the move itself does (the first ply) and still holds five plies later
    var praise = [];
    if ((verdict === 'best' || verdict === 'good') && P.W.net >= 0 && fullNet >= 0) {
      var own = posEvents(P.W, white);
      praise = pickTwo(own.list.filter(function (e) { return e.k === 1 && e.w >= 30; }));      // not the small ones (a central pawn, a little space)
    }

    // 1. what the played move does
    if (P.W.mate && P.W.mater === P.W.mv.color && P.W.seq.length === 1) {
      out.push(san + ' ' + P.list[0].say + '.'); mark(P.list[0].marks);
    } else if (mA != null && mA < 0 && !(mB != null && mB < 0)) {
      out.push(san + ' allows a forced mate in ' + (-mA) + (R && R.W.mv ? ', starting with ' + R.W.mv.san : '') + '.');
      if (R) { marks.arrows.push({ uci: R.W.mv.from + R.W.mv.to, kind: 'reply' }); if (rTac && rTac.k === 'mate') out[0] = out[0].slice(0, -1) + '; the line ends in ' + rTac.say.replace(/^leads to /, '') + '.'; }
    } else if (mB != null && mB > 0 && !(mA != null && mA > 0)) {
      out.push(san + ' misses a forced mate in ' + mB + '.');
    } else if (mA != null && mA > 0 && bad === false) {
      var mt = P.list.filter(function (m) { return m.k === 'mate'; })[0];
      out.push(san + (mt ? ' starts a forced mate in ' + mA + ': the engine\'s line ends with ' + mt.end : ' keeps a forced mate in ' + mA) + '.'); if (mt) mark(mt.marks);
    } else if (bad && (lost || (R && rTac))) {
      var r = R && R.W.mv, rs = r ? r.san : '';
      if (r) marks.arrows.push({ uci: r.from + r.to, kind: 'reply' });
      var ignored = r && r.captured ? threatBefore(Chess, fen, r) : false;
      var loose = r && r.captured && !defended(core().attacks(core().parse(fen1)), r.to, white);
      var big = r && r.captured && gap >= VAL[r.captured] && !persists(Chess, fen, o.best, r);
      if (rTac) { out.push(san + ' allows ' + rs + ', which ' + rTac.say + '.'); mark(rTac.marks); }
      else if (ignored && big && fullNet < 0) { out.push(san + ' ignores the threat to ' + label(r.captured, r.to) + ': ' + rs + ' takes it.'); mark({ squares: [r.to] }); }
      else if (loose && big && fullNet < 0 && r.to === P.W.mv.to) { out.push(san + ' puts the ' + NAME[P.W.mv.piece] + ' on an undefended square, and ' + rs + ' takes it.'); mark({ squares: [r.to] }); }
      else if (loose && big && fullNet < 0) { out.push(san + ' leaves ' + label(r.captured, r.to) + ' undefended, and ' + rs + ' takes it.'); mark({ squares: [r.to] }); }
      var sp = lost && spoils(P.W.loss, P.W.gain), named = r && out.length && sp === label(r.captured, r.to);
      if (lost && sp && !named) { out.push((out.length ? 'In the engine\'s line ' + other + ' wins ' : san + ' loses material: in the engine\'s line ' + other + ' wins ') + sp + '.'); mark(lost.marks); }
    } else if (!bad && (mine.length || praise.length)) {
      var top = mine.slice(0, 2);
      if (top.length === 2 && top[1].w < 30 && top[0].w >= 50) top = top.slice(0, 1);
      if (praise.length && (!top.length || praise[0].w > top[0].w)) { out.push('With ' + san + ', ' + states(praise) + '.'); praise.forEach(function (e) { mark({ squares: e.squares }); }); }
      else { out.push(san + ' ' + phrase(top) + '.'); top.forEach(function (m) { mark(m.marks); }); }
    }
    // a bad move with no tactic to name: what the engine's line gives the opponent that the engine's choice does not
    var allowed = [];
    if (bad && !out.length && PEopp && mA == null && mB == null) {
      // only what the move itself does (ply 1), what an answer of the opponent's brings (even plies) or
      // what a forced reply leads to, and not if the side is ahead in material at the end of the stretch
      var endMat = (PEopp.mat[PEopp.mat.length - 1] - PEopp.mat[0]) * sign;
      allowed = endMat > 0 ? [] : pickTwo(only(PEopp, BEopp).filter(function (e) { return e.w >= minW && (e.k === 1 || e.k % 2 === 0 || forced(P.W, e.k - 1)); }));
      if (allowed.length) {
        var kk = Math.max.apply(null, allowed.map(function (e) { return e.k; }));
        out.push(kk === 1 ? 'After ' + san + ', ' + states(allowed) + '.' : san + ' allows ' + sans(P.W.seq, 1, kk) + ': ' + states(allowed) + '.');
        allowed.forEach(function (e) { mark({ squares: e.squares }); });
        if (kk > 1) marks.arrows.push({ uci: P.W.seq[1].from + P.W.seq[1].to, kind: 'reply' });
      }
    }

    // 2. the engine's choice, when it differs and the move cost something
    if (B && (bad || verdict === 'fine')) {
      var bm = B.list.filter(function (m) { return m.k !== 'loses' && m.k !== 'cover' && m.k !== 'check' && m.k !== 'nocastle'; }).slice(0, 2);
      if (bm.length === 2 && bm[1].w < 30 && bm[0].w >= 50) bm = bm.slice(0, 1);
      var missed = (mB != null && mB > 0) || (B.W.net >= 2 && P.W.net <= B.W.net - 2 && bm.some(function (m) { return m.k === 'wins'; }));
      var stop = allowed.length && !missed && mB == null ? prevents(Chess, fen, o.best, B.W, P.W, allowed[0]) : null;
      // the plan: what the engine's line gives the side that the played line does not, on the side's own
      // moves (odd plies) or on a forced reply of the opponent's, never on a free choice of the opponent's
      var plan = !missed && mB == null ? pickTwo(only(posEvents(B.W, white), posEvents(P.W, white)).filter(function (e) { return e.w >= minW && (e.k % 2 === 1 || forced(B.W, e.k - 1)); })) : [];
      var tactical = bm.length && bm[0].w >= 45;
      if (!tactical && stop) out.push('Stockfish prefers ' + B.W.mv.san + ', which ' + stop + '.');
      else if (!tactical && plan.length && (!bm.length || plan[0].w > bm[0].w)) {
        var kp = Math.max.apply(null, plan.map(function (e) { return e.k; }));
        out.push('Stockfish prefers ' + B.W.mv.san + ': ' + (kp > 1 ? 'after ' + sans(B.W.seq, 0, kp) + ' ' : '') + states(plan) + '.');
        plan.forEach(function (e) { mark({ squares: e.squares }); });
      } else if (bm.length) { out.push((missed ? 'Missed: ' + B.W.mv.san : 'Stockfish prefers ' + B.W.mv.san + ', which') + ' ' + phrase(bm) + '.'); bm.forEach(function (m) { mark(m.marks); }); }
      else out.push('Stockfish prefers ' + B.W.mv.san + (o.cpBefore != null && mB == null ? ', where ' + standing(o.cpBefore, null) : '') + '.');
    }

    // 3. the evaluation, in pawns
    if (!out.length) {
      if (isBest) out.push(san + ' is Stockfish\'s first choice' + (o.cpAfter != null ? '; ' + standing(o.cpAfter, o.mateAfter) : '') + '.');
      else if (!bad) out.push(san + ' is a sound move' + (o.cpAfter != null ? '; ' + standing(o.cpAfter, o.mateAfter) : '') + '.');
    }
    if (bad && o.cpBefore != null && o.cpAfter != null && o.mateAfter == null && o.mateBefore == null && out.length < 3) {
      var loss = sign * (o.cpBefore - o.cpAfter) / 100;
      out.push('The evaluation goes from ' + pawns(o.cpBefore) + ' to ' + pawns(o.cpAfter) + (loss >= 0.5 ? ': about ' + (Math.round(loss * 2) / 2) + (Math.round(loss * 2) === 2 ? ' pawn' : ' pawns') + ' lost' : '') + '.');
    }
    if (bad && out.length < 3 && !(R && rTac) && !lost) {
      var cov = P.list.filter(function (m) { return m.k === 'cover' || m.k === 'nocastle'; })[0];
      if (cov) { out.push('It also ' + cov.say + '.'); mark(cov.marks); }
    }
    return { verdict: verdict, sentences: out.slice(0, 3), marks: marks };
  }

  // After the engine's own choice, would the same capture still win something? Then it is no reason.
  function persists(Chess, fen, best, r) {
    if (!best) return false;
    var g = new Chess(fen); if (!apply(g, best)) return false;
    var can = g.moves({ verbose: true }).some(function (m) { return m.from === r.from && m.to === r.to && m.captured; });
    return can && see(g, r.to, 0).v > 0;
  }
  // Was the reply's capture already possible before the move? Then the move ignored a threat.
  function threatBefore(Chess, fen, r) {
    var parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
    try {
      var g0 = new Chess(fen); if (g0.inCheck()) return false;
      var g = new Chess(parts.join(' '));
      return g.moves({ verbose: true }).some(function (m) { return m.from === r.from && m.to === r.to && m.captured === r.captured; });
    } catch (e) { return false; }
  }

  return { explain: explain, motifs: motifs, pins: pins, skewers: skewers, moves: moves, spoils: spoils };
})();
