/* Analyse any game in the browser: paste a PGN or a Lichess link, and Stockfish 19 (WebAssembly,
   lite single-threaded build, run in a Web Worker) evaluates every position. Moves are graded with
   Lichess's winning-chances method, the same as the jarvis-chess server, and the viewer fills in
   live as the engine works. Nothing leaves the visitor's browser except the game fetches.
   window.ChessEngine.create() gives an independent engine (the board's explore mode uses its own);
   window.ChessAnalysis.review() analyses one PGN and returns the game plus per-side statistics,
   and window.ChessAnalysis.show() does the same while filling in the viewer (used by games.js). */
window.ChessEngine = (function () {
  var URL = '../engine/stockfish-19-lite-single.js', MATE = 10000;
  function create() {
    var w = null, ready = null, handler = null, chain = Promise.resolve();
    function start() {
      if (ready) return ready;
      ready = new Promise(function (resolve, reject) {
        var up = false;
        try { w = new Worker(URL); } catch (e) { reject(e); return; }
        w.onmessage = function (e) {
          var line = typeof e.data === 'string' ? e.data : '';
          if (line === 'uciok') w.postMessage('isready');
          else if (line === 'readyok' && !up) { up = true; resolve(); }
          else if (handler) handler(line);
        };
        w.onerror = function (e) { reject(e); };
        w.postMessage('uci');
      });
      return ready;
    }
    // One search at a time per engine: each waits for the previous one. Scores come back from
    // White's point of view (the engine reports them from the side to move).
    function search(fen, ms) {
      var whiteToMove = fen.split(' ')[1] !== 'b';
      var job = chain.then(start).then(function () {
        return new Promise(function (resolve) {
          var last = { cp: 0, mate: null, pv: [], depth: 0 };
          handler = function (line) {
            // Skip lowerbound/upperbound reports: they are provisional scores from an interrupted search.
            if (line.indexOf('info') === 0 && line.indexOf(' pv ') > -1 && line.indexOf('bound') < 0) {
              var m = line.match(/score (cp|mate) (-?\d+)/), d = line.match(/ depth (\d+)/), pv = line.split(' pv ')[1].trim().split(' ');
              if (m) last = { cp: m[1] === 'cp' ? +m[2] : (+m[2] > 0 ? MATE : -MATE), mate: m[1] === 'mate' ? +m[2] : null, pv: pv, depth: d ? +d[1] : 0 };
            } else if (line.indexOf('bestmove') === 0) {
              handler = null;
              if (!whiteToMove) { last.cp = -last.cp; if (last.mate != null) last.mate = -last.mate; }
              resolve(last);
            }
          };
          w.postMessage('position fen ' + fen);
          w.postMessage('go movetime ' + ms);
        });
      });
      chain = job.catch(function () {});
      return job;
    }
    function stop() { if (w && handler) w.postMessage('stop'); }
    return { start: start, search: search, stop: stop };
  }
  return { create: create, MATE: MATE };
})();

window.ChessAnalysis = (function () {
  var MATE = window.ChessEngine.MATE, engine = null, active = false;
  function wc(cp) { return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1; }
  function grade(d) { return d >= 0.3 ? 'blunder' : d >= 0.2 ? 'mistake' : d >= 0.1 ? 'inaccuracy' : null; }
  function fmt(e) { return e.mate != null ? (e.mate > 0 ? 'White mates in ' + e.mate : 'Black mates in ' + (-e.mate)) : (e.cp >= 0 ? '+' : '') + (e.cp / 100).toFixed(2); }
  function lichessId(text) { var m = text.trim().match(/lichess\.org\/([a-zA-Z0-9]{8})/); return m ? m[1] : null; }
  function clampLoss(cp) { return Math.max(-1000, Math.min(1000, cp)); }

  async function parse(text) {
    var id = lichessId(text);
    if (id && text.indexOf('[') < 0 && text.split(/\s+/).length < 3) {
      var r = await fetch('https://lichess.org/game/export/' + id + '?clocks=false&evals=false&opening=true', { headers: { Accept: 'application/x-chess-pgn' } });
      if (!r.ok) throw new Error('Lichess answered ' + r.status + '. Check the link, or paste the PGN instead.');
      text = await r.text();
    }
    var mod = await import('../vendor/chess.js');
    var chess = new mod.Chess();
    try { chess.loadPgn(text); } catch (err) { throw new Error('That PGN could not be read: ' + (err.message || err)); }
    var moves = chess.history({ verbose: true });
    if (!moves.length) throw new Error('No moves found in that PGN.');
    var h = chess.getHeaders ? chess.getHeaders() : chess.header();
    var start = h.FEN || mod.DEFAULT_POSITION, replay = new mod.Chess(start);
    var G = { white: h.White || 'White', black: h.Black || 'Black', white_elo: h.WhiteElo || '', black_elo: h.BlackElo || '',
      result: h.Result || '*', opening: h.Opening || '', start_fen: start, plies: [], key_moments: [] };
    moves.forEach(function (m) {
      replay.move(m.san);
      G.plies.push({ fen: replay.fen(), uci: m.from + m.to + (m.promotion || ''), san: m.san, side: m.color === 'w' ? 'White' : 'Black', cp: null, mate: null, grade: null, best: null, best_uci: null, best_line: '', drop: null });
    });
    return { G: G, mod: mod };
  }

  // Evaluate every position of a parsed game. hooks: progress(i, n), cancelled(), changed().
  async function evaluate(G, mod, ms, hooks) {
    hooks = hooks || {};
    if (!engine) engine = window.ChessEngine.create();
    await engine.start();
    var evals = [], done = 0;
    var stats = { White: { loss: 0, moves: 0, inaccuracy: 0, mistake: 0, blunder: 0 }, Black: { loss: 0, moves: 0, inaccuracy: 0, mistake: 0, blunder: 0 } };
    for (var i = -1; i < G.plies.length; i++) {
      if (hooks.cancelled && hooks.cancelled()) break;
      var fen = i < 0 ? G.start_fen : G.plies[i].fen, pos = new mod.Chess(fen), res;
      if (pos.isGameOver()) res = { cp: pos.isCheckmate() ? (pos.turn() === 'w' ? -MATE : MATE) : 0, mate: null, pv: [] };
      else res = await engine.search(fen, ms);
      evals.push(res);
      if (i < 0) continue;
      var p = G.plies[i], before = evals[evals.length - 2], sign = p.side === 'White' ? 1 : -1;
      p.cp = Math.max(-1500, Math.min(1500, res.cp)); p.mate = res.mate;
      var drop = Math.max(0, wc(sign * before.cp) - wc(sign * res.cp));
      var prev = new mod.Chess(i === 0 ? G.start_fen : G.plies[i - 1].fen), line = [], bestSan = null;
      before.pv.slice(0, 6).forEach(function (u, k) {
        try { var mv = prev.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (k === 0) bestSan = mv.san; line.push(mv.san); } catch (err) { /* stop at an illegal tail */ }
      });
      p.best = bestSan; p.best_uci = before.pv[0] || null; p.best_line = line.join(' '); p.drop = +drop.toFixed(3);
      p.grade = p.uci !== p.best_uci ? grade(drop) : null;
      var s = stats[p.side];
      s.moves++; s.loss += Math.max(0, sign * (clampLoss(before.cp) - clampLoss(res.cp)));
      if (p.grade) s[p.grade]++;
      done = i + 1;
      if (hooks.progress) hooks.progress(i + 1, G.plies.length);
      if (hooks.changed && (i % 2 === 1 || i === G.plies.length - 1)) hooks.changed();
    }
    G.key_moments = G.plies.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return x.p.grade; })
      .sort(function (a, b) { return b.p.drop - a.p.drop; }).slice(0, 5).sort(function (a, b) { return a.i - b.i; })
      .map(function (x) { return { ply: x.i + 1, side: x.p.side, played: x.p.san, best: x.p.best, best_line: x.p.best_line, grade: x.p.grade, eval_before: fmt(evals[x.i]), eval_after: fmt(evals[x.i + 1]), win_chance_drop: x.p.drop }; });
    ['White', 'Black'].forEach(function (side) { var s = stats[side]; s.acpl = s.moves ? Math.round(s.loss / s.moves) : null; delete s.loss; });
    return { G: G, stats: stats, complete: done === G.plies.length, analysed: done };
  }

  // Claim the analyser so the form, a log row and the batch review never run at once.
  function claim() { if (active) return false; active = true; return true; }
  function release() { active = false; }

  async function review(text, ms, hooks) { var g = await parse(text); return evaluate(g.G, g.mod, ms, hooks); }
  async function show(text, ms, hooks) {
    hooks = hooks || {};
    var g = await parse(text);
    window.ChessViewer.load(g.G, -1);
    var out = await evaluate(g.G, g.mod, ms, { progress: hooks.progress, cancelled: hooks.cancelled, changed: function () { window.ChessViewer.refresh(); } });
    window.ChessViewer.load(out.G, out.G.key_moments.length ? out.G.key_moments[out.G.key_moments.length - 1].ply - 1 : -1);
    return out;
  }
  return { review: review, show: show, claim: claim, release: release, busy: function () { return active; } };
})();

(function () {
  var form = document.getElementById('import-form');
  if (!form) return;
  var pgnBox = document.getElementById('pgn-input'), status = document.getElementById('import-status');
  var progress = document.getElementById('import-progress'), btn = document.getElementById('import-go');
  var speed = document.getElementById('import-speed'), cancel = false, mine = false;
  function say(t) { status.textContent = t; }

  async function run(e) {
    e.preventDefault();
    if (mine) { cancel = true; return; }
    var text = pgnBox.value.trim();
    if (!text) { say('Paste a PGN or a Lichess game link first.'); return; }
    if (!window.ChessAnalysis.claim()) { say('Another analysis is running. Stop it first.'); return; }
    mine = true; cancel = false; btn.textContent = 'Stop';
    var ms = +speed.value;
    try {
      say('Reading the game and starting Stockfish 19 in your browser…');
      var out = await window.ChessAnalysis.show(text, ms, {
        cancelled: function () { return cancel; },
        progress: function (i, n) { progress.value = i / n; say('Analysing move ' + i + ' of ' + n + ' · ' + (ms / 1000) + ' s per position'); }
      });
      say(out.complete ? 'Done: ' + out.G.plies.length + ' moves analysed in your browser by Stockfish 19.' : 'Stopped. ' + out.analysed + ' of ' + out.G.plies.length + ' moves analysed.');
    } catch (err) {
      say(err.message || String(err));
    } finally {
      mine = false; window.ChessAnalysis.release(); btn.textContent = 'Analyse';
    }
  }
  form.addEventListener('submit', run);
  document.getElementById('pgn-file').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var rd = new FileReader(); rd.onload = function () { pgnBox.value = rd.result; say('Loaded ' + f.name + '. Press Analyse.'); }; rd.readAsText(f);
  });
})();
