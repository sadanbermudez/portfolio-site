/* Chess facts from a FEN, computed by the rules alone: which squares each side attacks, which
   pieces hang (attacked and undefended), which are attacked by a cheaper piece, and material.
   The same rule the jarvis-chess MCP server applies, so imported games get the same verified
   facts as the reviewed one. Also feeds the 3D board's lines of force. */
window.ChessCore = (function () {
  var VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

  function parse(fen) {                                   // board[rank][file], rank 0 = rank 1
    var b = [], rows = fen.split(' ')[0].split('/');
    for (var r = 0; r < 8; r++) b.push(new Array(8).fill(null));
    rows.forEach(function (row, i) {
      var f = 0, rank = 7 - i;
      row.split('').forEach(function (c) {
        if (/\d/.test(c)) f += +c;
        else { b[rank][f] = { type: c.toLowerCase(), white: c === c.toUpperCase() }; f++; }
      });
    });
    return b;
  }
  function sq(f, r) { return String.fromCharCode(97 + f) + (r + 1); }
  function inside(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }

  // every (from, to) attack: squares a piece attacks, whether empty, enemy or friendly (defence)
  function attacks(board) {
    var out = [];
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = board[r][f]; if (!p) continue;
      var add = function (tf, tr) { if (inside(tf, tr)) out.push({ from: [f, r], to: [tf, tr], white: p.white, type: p.type }); };
      var ray = function (df, dr) {
        for (var k = 1; k < 8; k++) { var tf = f + df * k, tr = r + dr * k; if (!inside(tf, tr)) break; add(tf, tr); if (board[tr][tf]) break; }
      };
      if (p.type === 'p') { var d = p.white ? 1 : -1; add(f - 1, r + d); add(f + 1, r + d); }
      else if (p.type === 'n') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(function (o) { add(f + o[0], r + o[1]); });
      else if (p.type === 'k') for (var a = -1; a <= 1; a++) for (var c = -1; c <= 1; c++) { if (a || c) add(f + a, r + c); }
      else {
        if (p.type !== 'b') [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { ray(o[0], o[1]); });
        if (p.type !== 'r') [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (o) { ray(o[0], o[1]); });
      }
    }
    return out;
  }

  function facts(fen) {
    var board = parse(fen), att = attacks(board), hanging = [], cheaper = [], material = 0;
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = board[r][f]; if (!p) continue;
      material += (p.white ? 1 : -1) * VAL[p.type];
      if (p.type === 'k') continue;
      var enemy = att.filter(function (a) { return a.white !== p.white && a.to[0] === f && a.to[1] === r; });
      if (!enemy.length) continue;
      var friends = att.filter(function (a) { return a.white === p.white && a.to[0] === f && a.to[1] === r; });
      var label = (p.white ? 'White ' : 'Black ') + NAME[p.type] + ' on ' + sq(f, r);
      if (!friends.length) hanging.push(label);
      else if (Math.min.apply(null, enemy.map(function (a) { return VAL[a.type]; })) < VAL[p.type]) cheaper.push(label);
    }
    return { hanging_pieces: hanging, attacked_by_a_cheaper_piece: cheaper, pinned_pieces: [], mate_in_one_for_side_to_move: [], material_white_minus_black: material };
  }

  function hangingSquares(fen) {
    return facts(fen).hanging_pieces.map(function (s) { return s.slice(-2); });
  }

  return { parse: parse, attacks: attacks, facts: facts, hangingSquares: hangingSquares, sq: sq };
})();
