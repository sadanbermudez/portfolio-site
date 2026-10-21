/* Positional features of a chess position, computed from the board alone, and the changes between
   two positions of an engine line. Each detector is a pure function of a board from
   ChessCore.parse() (board[rank][file], rank 0 = rank 1) and a side (white = true). The definitions
   are the standard teaching ones; each is written out above its function so a note can be checked
   against the board by hand.
   window.ChessPosition.events(fens, moves, white) lists what changed in favour of one side along a
   line; chess-teach.js decides which of those a note may mention. Needs window.ChessCore. */
window.ChessPosition = (function () {
  var NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  var A = 97;
  function core() { return window.ChessCore; }
  function sq(f, r) { return String.fromCharCode(A + f) + (r + 1); }
  function xy(s) { return [s.charCodeAt(0) - A, +s[1] - 1]; }
  function at(b, f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8 ? b[r][f] : null; }
  function rel(r, white) { return white ? r + 1 : 8 - r; }          // rank 1..8 seen from that side
  function fileName(f) { return String.fromCharCode(A + f) + '-file'; }
  function colour(white) { return white ? 'white' : 'black'; }

  function find(b, white, type) {
    var out = [];
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) { var p = b[r][f]; if (p && p.white === white && p.type === type) out.push([f, r]); }
    return out;
  }
  function pawnOn(b, f, r, white) { var p = at(b, f, r); return !!(p && p.type === 'p' && p.white === white); }
  function pawnAttacks(b, f, r, byWhite) {                          // is (f, r) attacked by a pawn of byWhite now?
    var d = byWhite ? -1 : 1;
    return pawnOn(b, f - 1, r + d, byWhite) || pawnOn(b, f + 1, r + d, byWhite);
  }
  // Can a pawn of byWhite ever attack (f, r)? Only if it has a pawn on a neighbouring file that has not
  // yet passed the rank below that square (pawns only move forward). Blocked paths are not considered,
  // which errs toward "can still be attacked", so fewer outposts and holes are claimed.
  function pawnCanReach(b, f, r, byWhite) {
    for (var ff = f - 1; ff <= f + 1; ff += 2) for (var rr = 0; rr < 8; rr++) {
      if (!pawnOn(b, ff, rr, byWhite)) continue;
      if (byWhite ? rr < r : rr > r) return true;
    }
    return false;
  }

  // ---------- pawn structure ----------
  // Doubled: two or more pawns of one side on a file. Isolated: no pawn of its side on either
  // neighbouring file. Backward: it has pawns on neighbouring files, but all of them are further
  // advanced, so no pawn can come to guard it, and the square in front of it is attacked by an enemy pawn.
  function pawnStructure(b, white) {
    var mine = find(b, white, 'p'), byFile = [0, 0, 0, 0, 0, 0, 0, 0], doubled = [], isolated = [], backward = [];
    mine.forEach(function (p) { byFile[p[0]]++; });
    byFile.forEach(function (n, f) { if (n > 1) doubled.push(String.fromCharCode(A + f)); });
    mine.forEach(function (p) {
      var f = p[0], r = p[1], side = mine.filter(function (q) { return Math.abs(q[0] - f) === 1; });
      if (!side.length) { isolated.push(sq(f, r)); return; }
      var support = side.some(function (q) { return rel(q[1], white) <= rel(r, white); });
      var stop = r + (white ? 1 : -1);
      if (!support && stop >= 0 && stop < 8 && pawnAttacks(b, f, stop, !white)) backward.push(sq(f, r));
    });
    return { doubled: doubled, isolated: isolated, backward: backward };
  }
  // Passed: no enemy pawn in front of it on its own or a neighbouring file.
  function passedPawns(b, white) {
    return find(b, white, 'p').filter(function (p) {
      for (var ff = p[0] - 1; ff <= p[0] + 1; ff++) for (var rr = 0; rr < 8; rr++) {
        if (pawnOn(b, ff, rr, !white) && (white ? rr > p[1] : rr < p[1])) return false;
      }
      return true;
    }).map(function (p) { return sq(p[0], p[1]); });
  }

  // ---------- files and rooks ----------
  // Open file: no pawns at all. Half-open for a side: none of its own pawns, at least one enemy pawn.
  function fileState(b, f, white) {
    var own = 0, enemy = 0;
    for (var r = 0; r < 8; r++) { var p = b[r][f]; if (p && p.type === 'p') { if (p.white === white) own++; else enemy++; } }
    return own ? 'closed' : enemy ? 'half' : 'open';
  }
  function rooksOnFiles(b, white) {
    return find(b, white, 'r').map(function (p) { return { sq: sq(p[0], p[1]), file: p[0], state: fileState(b, p[0], white) }; })
      .filter(function (x) { return x.state !== 'closed'; });
  }
  // Rook on the seventh: a rook on the enemy's second rank, where the enemy king sits behind it on
  // the back rank or enemy pawns stand on that rank.
  function rookSeventh(b, white) {
    var r7 = white ? 6 : 1, r8 = white ? 7 : 0;
    var target = find(b, !white, 'k').some(function (k) { return k[1] === r8; }) || find(b, !white, 'p').some(function (p) { return p[1] === r7; });
    return target ? find(b, white, 'r').filter(function (p) { return p[1] === r7; }).map(function (p) { return sq(p[0], p[1]); }) : [];
  }
  // Connected rooks: both rooks on one rank or file with nothing between them.
  function connectedRooks(b, white) {
    var rs = find(b, white, 'r'); if (rs.length < 2) return false;
    var x = rs[0], y = rs[1];
    if (x[0] !== y[0] && x[1] !== y[1]) return false;
    var df = Math.sign(y[0] - x[0]), dr = Math.sign(y[1] - x[1]);
    for (var f = x[0] + df, r = x[1] + dr; f !== y[0] || r !== y[1]; f += df, r += dr) if (b[r][f]) return false;
    return true;
  }

  // ---------- squares ----------
  // Outpost: a square in the opponent's half (ranks 5 to 7 from the side's view), guarded by one of
  // the side's pawns, that no enemy pawn can ever attack. Returned with the knight or bishop on it, if any.
  function outposts(b, white) {
    var out = [];
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var rr = rel(r, white); if (rr < 5 || rr > 7) continue;
      if (!pawnAttacks(b, f, r, white) || pawnCanReach(b, f, r, !white)) continue;
      var p = b[r][f];
      out.push({ sq: sq(f, r), piece: p && p.white === white && (p.type === 'n' || p.type === 'b') ? p.type : null });
    }
    return out;
  }
  // Holes near the king: squares on the side's third rank, on the king's file or a neighbouring one,
  // that its pawns can no longer guard (the king on its first two ranks). Second-rank squares are left
  // out: no pawn can ever guard those, so calling them holes would say nothing.
  function kingHoles(b, white) {
    var k = find(b, white, 'k')[0]; if (!k || rel(k[1], white) > 2) return [];
    var out = [], r = white ? 2 : 5;
    for (var f = k[0] - 1; f <= k[0] + 1; f++) {
      if (f < 0 || f > 7) continue;
      if (!pawnCanReach(b, f, r, white) && !pawnOn(b, f, r, white)) out.push(sq(f, r));
    }
    return out;
  }

  // ---------- bishops ----------
  function bishopPair(b, white) {
    var bs = find(b, white, 'b');
    return bs.some(function (p) { return (p[0] + p[1]) % 2 === 0; }) && bs.some(function (p) { return (p[0] + p[1]) % 2 === 1; });
  }
  // Bad bishop: at least three of its own pawns stand on its square colour, at least two of them are
  // fixed (an enemy pawn stands right in front of it), and they are at least half of the side's pawns.
  function badBishops(b, white) {
    var pawns = find(b, white, 'p'), d = white ? 1 : -1;
    return find(b, white, 'b').filter(function (bp) {
      var c = (bp[0] + bp[1]) % 2, same = pawns.filter(function (p) { return (p[0] + p[1]) % 2 === c; });
      var fixed = same.filter(function (p) { return pawnOn(b, p[0], p[1] + d, !white); });
      return same.length >= 3 && fixed.length >= 2 && same.length * 2 >= pawns.length;
    }).map(function (p) { return sq(p[0], p[1]); });
  }
  function squareColour(s) { var p = xy(s); return (p[0] + p[1]) % 2 === 0 ? 'dark' : 'light'; }

  // ---------- pieces ----------
  // Safe squares of a piece: squares it attacks that hold no piece of its own side and that no enemy
  // pawn attacks. Few safe squares means a passive or shut-in piece.
  function safeSquares(b, att, s) {
    var p = xy(s), pc = b[p[1]][p[0]]; if (!pc) return [];
    return att.filter(function (a) { return a.from[0] === p[0] && a.from[1] === p[1]; }).filter(function (a) {
      var q = b[a.to[1]][a.to[0]];
      return !(q && q.white === pc.white) && !pawnAttacks(b, a.to[0], a.to[1], !pc.white);
    }).map(function (a) { return sq(a.to[0], a.to[1]); });
  }

  // ---------- the king ----------
  // Shield: own pawns on the king's file and the neighbouring files, one or two ranks in front of it
  // (counted only while the king is on its first two ranks); shieldFiles are the files those pawns
  // stand on. Bare files: of the three files, the ones with no pawn of the king's side at all. Attackers: enemy pieces other than pawns and the king that attack the
  // king's square or a square next to it. Flight: squares next to the king that are empty or hold an
  // enemy piece and that no enemy piece attacks.
  function king(b, att, white) {
    var k = find(b, white, 'k')[0]; if (!k) return null;
    var res = { sq: sq(k[0], k[1]), home: rel(k[1], white) <= 2, shield: 0, shieldFiles: [], bare: [], attackers: 0, flight: [], covered: 0 };
    var d = white ? 1 : -1;
    for (var f = k[0] - 1; f <= k[0] + 1; f++) {
      if (f < 0 || f > 7) continue;
      if (pawnOn(b, f, k[1] + d, white) || pawnOn(b, f, k[1] + 2 * d, white)) { res.shield++; res.shieldFiles.push(f); }
      if (fileState(b, f, white) !== 'closed') res.bare.push(f);
    }
    var zone = {}, who = {};
    for (var df = -1; df <= 1; df++) for (var dr = -1; dr <= 1; dr++) {
      var f2 = k[0] + df, r2 = k[1] + dr; if (f2 < 0 || f2 > 7 || r2 < 0 || r2 > 7) continue;
      zone[f2 + ',' + r2] = 1;
      if (!df && !dr) continue;
      var q = b[r2][f2], hit = att.some(function (a) { return a.white !== white && a.to[0] === f2 && a.to[1] === r2; });
      if (hit) res.covered++;
      if (!(q && q.white === white) && !hit) res.flight.push(sq(f2, r2));
    }
    att.forEach(function (a) { if (a.white !== white && a.type !== 'p' && a.type !== 'k' && zone[a.to[0] + ',' + a.to[1]]) who[a.from.join(',')] = 1; });
    res.attackers = Object.keys(who).length;
    return res;
  }
  // Distance of a square to the centre (d4, e4, d5, e5) in king steps.
  function centreDistance(s) { var p = xy(s); return Math.max(Math.max(3 - p[0], p[0] - 4, 0), Math.max(3 - p[1], p[1] - 4, 0)); }

  // ---------- space, centre, development ----------
  // Space: the side's pawns on its fifth rank or beyond, and the squares in the opponent's half its pawns attack.
  function space(b, white) {
    var adv = [], ctl = {};
    find(b, white, 'p').forEach(function (p) {
      if (rel(p[1], white) >= 5) adv.push(sq(p[0], p[1]));
      [-1, 1].forEach(function (df) { var f = p[0] + df, r = p[1] + (white ? 1 : -1); if (f >= 0 && f < 8 && r >= 0 && r < 8 && rel(r, white) >= 5) ctl[sq(f, r)] = 1; });
    });
    return { advanced: adv, control: Object.keys(ctl).length };
  }
  // Centre: the side's pawns on d4, e4, d5, e5, and how many attacks it has on those four squares.
  function centre(b, att, white) {
    var C4 = [[3, 3], [4, 3], [3, 4], [4, 4]];
    return {
      pawns: C4.filter(function (c) { return pawnOn(b, c[0], c[1], white); }).map(function (c) { return sq(c[0], c[1]); }),
      attacks: att.filter(function (a) { return a.white === white && C4.some(function (c) { return c[0] === a.to[0] && c[1] === a.to[1]; }); }).length
    };
  }
  // Development: knights and bishops that have left their starting squares.
  function developed(b, white) {
    var home = white ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'], kind = { b: 'n', g: 'n', c: 'b', f: 'b' }, out = 0, left = 0;
    find(b, white, 'n').concat(find(b, white, 'b')).forEach(function () { left++; });
    home.forEach(function (s) { var p = xy(s), q = b[p[1]][p[0]]; if (q && q.white === white && q.type === kind[s[0]]) out++; });
    return left - out;                                                    // minor pieces on the board, minus those still at home
  }

  // ---------- one position, both sides ----------
  function snapshot(fen) {
    var C = core(), b = C.parse(fen), att = C.attacks(b), s = { fen: fen, bd: b, att: att };
    [true, false].forEach(function (w) {
      s[w ? 'w' : 'b'] = {
        pawns: pawnStructure(b, w), passed: passedPawns(b, w), rooks: rooksOnFiles(b, w), seventh: rookSeventh(b, w),
        connected: connectedRooks(b, w), outposts: outposts(b, w), holes: kingHoles(b, w), pair: bishopPair(b, w),
        bad: badBishops(b, w), king: king(b, att, w), space: space(b, w), centre: centre(b, att, w), developed: developed(b, w)
      };
    });
    s.queens = find(b, true, 'q').length + find(b, false, 'q').length;
    return s;
  }

  // Follow a piece through a list of moves (chess.js verbose moves): where it stands after `k` of them,
  // or null if it was captured.
  function track(seq, k, s) {
    for (var i = 0; i < k && s; i++) {
      var m = seq[i];
      if (m.from === s) s = m.to;
      else if (m.to === s) return null;
      else if (/[kq]/.test(m.flags) && m.piece === 'k') {           // castling moves the rook too
        var r = m.to[1], rook = m.flags.indexOf('k') > -1 ? ['h' + r, 'f' + r] : ['a' + r, 'd' + r];
        if (s === rook[0]) s = rook[1];
      }
    }
    return s;
  }
  function pieceAt(b, s) { var p = xy(s); return b[p[1]][p[0]]; }

  /* What changed in favour of side `white` along a line. fens[0] is the start, fens[k] the position
     after k moves of seq. Each event: { kind, key, w (weight), k (first ply it holds), state (a clause
     a note can use), squares, side ('gain' for the side's own asset, 'harm' for an enemy weakness) }.
     An event counts only if it holds at its first ply and still holds at the end of the line. Outposts
     are the one exception, since a knight on an outpost often goes on to use it: there the piece must
     still stand there after the opponent's reply and still be on the board at the end, so a knight
     that lands on an outpost and is traded at once is not an outpost. */
  function events(fens, seq, white) {
    var S = fens.map(snapshot), n = S.length - 1, me = white ? 'w' : 'b', op = white ? 'b' : 'w';
    var col = colour(white), ocol = colour(!white), out = [], seen = {};
    var add = function (e) { if (!seen[e.key]) { seen[e.key] = 1; out.push(e); } };
    // first ply k >= 1 where test(k) holds, provided it also holds at n
    var first = function (test) { if (n < 1 || !test(n)) return 0; for (var k = 1; k <= n; k++) if (test(k)) return k; return 0; };
    var s0 = S[0];

    // outposts occupied by a knight or bishop that was not on that square at the start
    // (it must still be there after the opponent's reply, and still on the board at the end of the line)
    var occupied = function (j, o) { return S[j][me].outposts.some(function (x) { return x.sq === o.sq && x.piece === o.piece; }); };
    var seenOut = {};
    S.forEach(function (Sj, j) {
      if (!j) return;
      Sj[me].outposts.forEach(function (o) {
        if (!o.piece || seenOut[o.sq] || occupied(0, o)) return;
        seenOut[o.sq] = 1;
        if (j < n && !occupied(j + 1, o)) return;
        var t = track(seq.slice(j), n - j, o.sq); if (!t) return;
        add({ kind: 'outpost', key: 'outpost:' + o.sq, w: o.piece === 'n' ? 46 : 40, k: j, squares: [o.sq], side: 'gain',
          state: 'the ' + NAME[o.piece] + ' lands on ' + o.sq + ', an outpost no ' + ocol + ' pawn can attack' });
      });
    });
    // enemy knights and bishops shut in: three or more safe squares at the start, at most one at the end.
    // If the piece moved on the way, its last move must have been a retreat from a pawn's attack: a piece
    // its owner parks on a quiet square of its own accord is not shut in by this side.
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = s0.bd[r][f]; if (!p || p.white === white || 'nb'.indexOf(p.type) < 0) continue;
      var s = sq(f, r), before = safeSquares(s0.bd, s0.att, s).length; if (before < 3) continue;
      var where = function (j) { var t = track(seq, j, s); return t && pieceAt(S[j].bd, t) && pieceAt(S[j].bd, t).type === p.type ? t : null; };
      var k = first(function (j) { var t = where(j); return t && safeSquares(S[j].bd, S[j].att, t).length <= 1; });
      if (!k) continue;
      var lastMove = -1; for (var i = 0; i < n; i++) if (track(seq, i, s) && seq[i].from === track(seq, i, s)) lastMove = i;
      if (lastMove > -1) { var lf = xy(seq[lastMove].from); if (!pawnAttacks(S[lastMove].bd, lf[0], lf[1], white)) continue; }
      var t = where(n), left = safeSquares(S[n].bd, S[n].att, t).length;
      add({ kind: 'shut', key: 'shut:' + s, w: 44, k: k, squares: [t], side: 'harm',
        state: 'the ' + NAME[p.type] + ' on ' + t + (left ? ' has just one square not covered by a ' + col + ' pawn' : ' is shut in: a ' + col + ' pawn covers every square it can reach, or a ' + ocol + ' piece stands there') });
    }

    // the enemy king boxed in: no free square next to it, and at least two of those squares covered by this side
    var kb = function (j) { var x = S[j][op].king; return x && !x.flight.length && x.covered >= 2; };
    var kk = first(kb);
    if (kk && s0[op].king && s0[op].king.flight.length) {
      add({ kind: 'box', key: 'box', w: 45, k: kk, squares: [S[n][op].king.sq], side: 'harm', state: 'the king on ' + S[n][op].king.sq + ' has no free square left' });
    }

    // a pawn that sheltered the enemy king is gone and its file has no pawn of the king's side left,
    // while this side has a rook or queen to use it and the enemy has no rook or queen on that file
    if (s0[op].king && s0[op].king.home && (find(S[n].bd, white, 'r').length || find(S[n].bd, white, 'q').length)) {
      s0[op].king.shieldFiles.forEach(function (fl) {
        var bareAt = function (j) {
          var x = S[j][op].king; if (!x || !x.home || x.bare.indexOf(fl) < 0) return false;
          for (var rr = 0; rr < 8; rr++) { var q = S[j].bd[rr][fl]; if (q && q.white !== white && (q.type === 'r' || q.type === 'q')) return false; }
          return true;
        };
        var k = first(bareAt);
        if (k) add({ kind: 'bare', key: 'bare:' + fl, w: 38, k: k, squares: [S[n][op].king.sq], side: 'harm',
          state: 'the king on ' + S[n][op].king.sq + ' has lost the pawn that sheltered it on the ' + fileName(fl) });
      });
    }

    // holes in front of the enemy king that its pawns can no longer guard (the king itself has not moved)
    if (s0[op].king && S[n][op].king && s0[op].king.sq === S[n][op].king.sq) {
      S[n][op].holes.forEach(function (h) {
        if (s0[op].holes.indexOf(h) > -1) return;
        var k = first(function (j) { return S[j][op].holes.indexOf(h) > -1; });
        if (k) add({ kind: 'hole', key: 'hole:' + h, w: 39, k: k, squares: [h], side: 'harm',
          state: h + ' becomes a hole in front of the king: no ' + ocol + ' pawn can guard it any more' });
      });
    }

    // more pieces aimed at the enemy king
    if (s0[op].king && S[n][op].king) {
      var a0 = s0[op].king.attackers, an = S[n][op].king.attackers;
      if (an >= 3 && an >= a0 + 2) {
        var k = first(function (j) { return S[j][op].king && S[j][op].king.attackers >= a0 + 2; });
        add({ kind: 'attack', key: 'attack', w: 40, k: k, squares: [S[n][op].king.sq], side: 'gain',
          state: (an === 3 ? 'three ' : an === 4 ? 'four ' : an + ' ') + col + ' pieces now aim at the squares around the king' });
      }
    }

    // a pawn pushed to the fifth rank or beyond (space), noting an enemy bishop it blunts
    seq.slice(0, n).forEach(function (m, i) {
      if (m.piece !== 'p' || (m.color === 'w') !== white || m.captured || m.promotion) return;
      var t = track(seq.slice(i + 1), n - i - 1, m.to); if (t !== m.to) return;        // still there at the end
      var p = xy(m.to); if (rel(p[1], white) < 5) return;
      if (S[n][me].passed.indexOf(m.to) > -1) return;                                  // a passed pawn speaks for itself
      var blunt = null;
      find(s0.bd, !white, 'b').forEach(function (bp) {
        var bs = sq(bp[0], bp[1]), df = p[0] - bp[0], dr = p[1] - bp[1];
        if (blunt || Math.abs(df) !== Math.abs(dr) || !df) return;
        for (var j = 1; j < Math.abs(df); j++) if (S[i + 1].bd[bp[1] + j * Math.sign(dr)][bp[0] + j * Math.sign(df)]) return;
        var t2 = track(seq, n, bs); if (t2 !== bs) return;                             // the bishop is still there
        var r0 = safeSquares(s0.bd, s0.att, bs).length, r1 = safeSquares(S[n].bd, S[n].att, bs).length;
        if (r0 - r1 >= 2) blunt = bs;
      });
      add({ kind: 'space', key: 'space:' + m.to, w: blunt ? 42 : 28, k: i + 1, squares: blunt ? [m.to, blunt] : [m.to], side: 'gain',
        state: 'the pawn on ' + m.to + ' gains space' + (blunt ? ' and blunts the bishop on ' + blunt : '') });
    });

    // a pawn that takes a central square on the side's own fourth rank (d4 or e4 for White)
    S[n][me].centre.pawns.forEach(function (c) {
      if (s0[me].centre.pawns.indexOf(c) > -1 || rel(xy(c)[1], white) !== 4) return;
      var k = first(function (j) { return S[j][me].centre.pawns.indexOf(c) > -1; });
      if (k) add({ kind: 'centre', key: 'centre:' + c, w: 27, k: k, squares: [c], side: 'gain', state: 'the pawn on ' + c + ' takes a central square' });
    });

    // new pawn weaknesses for the enemy
    var ps0 = s0[op].pawns, psn = S[n][op].pawns;
    psn.doubled.forEach(function (fl) {
      if (ps0.doubled.indexOf(fl) > -1) return;
      var k = first(function (j) { return S[j][op].pawns.doubled.indexOf(fl) > -1; });
      if (k) add({ kind: 'doubled', key: 'doubled:' + fl, w: 30, k: k, squares: [], side: 'harm', state: ocol.replace(/^./, function (c) { return c.toUpperCase(); }) + ' has doubled pawns on the ' + fl + '-file' });
    });
    psn.isolated.forEach(function (s) {
      if (ps0.isolated.some(function (x) { return x[0] === s[0]; })) return;
      var k = first(function (j) { return S[j][op].pawns.isolated.some(function (x) { return x[0] === s[0]; }); });
      if (k) add({ kind: 'isolated', key: 'isolated:' + s[0], w: 31, k: k, squares: [s], side: 'harm',
        state: 'the ' + ocol + ' pawn on ' + s + ' is isolated: no ' + ocol + ' pawn beside it can guard it' });
    });
    psn.backward.forEach(function (s) {
      if (ps0.backward.indexOf(s) > -1) return;
      var k = first(function (j) { return S[j][op].pawns.backward.indexOf(s) > -1; });
      if (k) add({ kind: 'backward', key: 'backward:' + s, w: 32, k: k, squares: [s], side: 'harm',
        state: 'the ' + ocol + ' pawn on ' + s + ' is backward: no pawn can guard it, and a ' + col + ' pawn covers the square in front' });
    });

    // passed pawns created along the line
    S[n][me].passed.forEach(function (s) {
      if (s0[me].passed.some(function (x) { return x[0] === s[0]; })) return;
      var k = first(function (j) { return S[j][me].passed.indexOf(s) > -1 || S[j][me].passed.some(function (x) { return x[0] === s[0]; }); });
      if (k) add({ kind: 'passer', key: 'passer:' + s[0], w: 37, k: k, squares: [s], side: 'gain', state: col.replace(/^./, function (c) { return c.toUpperCase(); }) + ' gets a passed pawn on ' + s });
    });

    // rooks: an open or half-open file, the seventh rank, connected
    S[n][me].rooks.forEach(function (x) {
      var on = function (j) { return S[j][me].rooks.some(function (y) { return y.file === x.file && y.state === x.state; }); };
      if (on(0)) return;                                     // a rook already used that file
      var k = first(function (j) { return S[j][me].rooks.some(function (y) { return y.sq === x.sq && y.state === x.state; }); });
      if (k) add({ kind: 'file', key: 'file:' + x.file, w: x.state === 'open' ? 38 : 34, k: k, squares: [x.sq], side: 'gain',
        state: 'the rook on ' + x.sq + ' stands on the ' + (x.state === 'open' ? 'open ' + fileName(x.file) + ', with no pawns on it' : 'half-open ' + fileName(x.file) + ', with no ' + col + ' pawn on it') });
    });
    S[n][me].seventh.forEach(function (s) {
      if (s0[me].seventh.indexOf(s) > -1) return;
      var k = first(function (j) { return S[j][me].seventh.indexOf(s) > -1; });
      if (k) add({ kind: 'seventh', key: 'seventh:' + s, w: 41, k: k, squares: [s], side: 'gain', state: 'the rook reaches the ' + (white ? 'seventh' : 'second') + ' rank on ' + s });
    });
    if (S[n][me].connected && !s0[me].connected) {
      var kc = first(function (j) { return S[j][me].connected; });
      if (kc) add({ kind: 'connected', key: 'connected', w: 20, k: kc, squares: [], side: 'gain', state: 'the rooks are connected, guarding each other' });
    }

    // bishops: the pair, and an enemy bishop turned bad
    if (S[n][me].pair && !S[n][op].pair && !(s0[me].pair && !s0[op].pair)) {
      var kp = first(function (j) { return S[j][me].pair && !S[j][op].pair; });
      if (kp) add({ kind: 'pair', key: 'pair', w: 33, k: kp, squares: [], side: 'gain', state: col.replace(/^./, function (c) { return c.toUpperCase(); }) + ' has the bishop pair and ' + ocol.replace(/^./, function (c) { return c.toUpperCase(); }) + ' does not' });
    }
    S[n][op].bad.forEach(function (s) {
      if (s0[op].bad.length) return;
      var k = first(function (j) { return S[j][op].bad.indexOf(s) > -1; });
      if (k) add({ kind: 'bad', key: 'bad:' + s, w: 32, k: k, squares: [s], side: 'harm',
        state: 'the bishop on ' + s + ' is a bad bishop, hemmed in by its own pawns fixed on ' + squareColour(s) + ' squares' });
    });

    // development lead, in the opening
    var full = +(fens[0].split(' ')[5] || 1);
    if (full <= 15) {
      var lead = function (j) { return S[j][me].developed - S[j][op].developed; };
      if (lead(n) >= 2 && lead(0) < 2) {
        var kd = first(function (j) { return lead(j) >= 2; });
        if (kd) add({ kind: 'develop', key: 'develop', w: 29, k: kd, squares: [], side: 'gain',
          state: col.replace(/^./, function (c) { return c.toUpperCase(); }) + ' leads in development, ' + S[n][me].developed + ' minor pieces out against ' + S[n][op].developed });
      }
    }

    // the king walks to the centre once the queens are off
    if (!S[n].queens && s0[me].king && S[n][me].king) {
      var d0 = centreDistance(s0[me].king.sq), dn = centreDistance(S[n][me].king.sq);
      if (d0 - dn >= 2) {
        var kw = first(function (j) { return S[j][me].king && centreDistance(S[j][me].king.sq) === dn; });
        add({ kind: 'kingwalk', key: 'kingwalk', w: 35, k: kw, squares: [S[kw][me].king.sq], side: 'gain', state: 'the king walks to ' + S[kw][me].king.sq + ', toward the centre, where a king is strong once the queens are off' });
      }
    }

    // own pieces that gain four or more safe squares
    for (var r2 = 0; r2 < 8; r2++) for (var f2 = 0; f2 < 8; f2++) {
      var q = s0.bd[r2][f2]; if (!q || q.white !== white || 'nbrq'.indexOf(q.type) < 0) continue;
      var s1 = sq(f2, r2), t1 = track(seq, n, s1); if (!t1 || t1 === s1) continue;
      if (full <= 15 && q.type !== 'q' && rel(r2, white) === 1) continue;           // leaving the back rank early is development
      var g0 = safeSquares(s0.bd, s0.att, s1).length, g1 = safeSquares(S[n].bd, S[n].att, t1).length;
      if (g1 - g0 < 4) continue;
      var ka = first(function (j) { var t = track(seq, j, s1); return t === t1; });
      if (ka) add({ kind: 'active', key: 'active:' + s1, w: 25, k: ka, squares: [t1], side: 'gain',
        state: 'the ' + NAME[q.type] + ' reaches ' + t1 + ', where ' + g1 + ' squares it attacks are out of reach of ' + ocol + ' pawns, instead of ' + g0 });
    }
    return out.sort(function (x, y) { return y.w - x.w || x.k - y.k; });
  }

  return {
    snapshot: snapshot, events: events, track: track,
    pawnStructure: pawnStructure, passedPawns: passedPawns, fileState: fileState, rooksOnFiles: rooksOnFiles,
    rookSeventh: rookSeventh, connectedRooks: connectedRooks, outposts: outposts, kingHoles: kingHoles,
    bishopPair: bishopPair, badBishops: badBishops, safeSquares: safeSquares, king: king, space: space,
    centre: centre, developed: developed, centreDistance: centreDistance
  };
})();
