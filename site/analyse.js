/* Analyse any game in the browser: paste a PGN or a Lichess link, and Stockfish 19 (WebAssembly,
   lite single-threaded build, run in a Web Worker) evaluates every position. Moves are graded with
   Lichess's winning-chances method, the same as the jarvis-chess server, and the viewer fills in
   live as the engine works. Nothing leaves the visitor's browser except the Lichess fetch. */
(function () {
  var form = document.getElementById('import-form');
  if (!form) return;
  var pgnBox = document.getElementById('pgn-input'), status = document.getElementById('import-status');
  var progress = document.getElementById('import-progress'), btn = document.getElementById('import-go');
  var speed = document.getElementById('import-speed');
  var MATE = 10000, engine = null, busy = false, cancel = false;

  function wc(cp) { return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1; }
  function grade(d) { return d >= 0.3 ? 'blunder' : d >= 0.2 ? 'mistake' : d >= 0.1 ? 'inaccuracy' : null; }
  function say(t) { status.textContent = t; }

  // one UCI engine in a worker, with a promise per search
  function startEngine() {
    if (engine) return Promise.resolve(engine);
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker('../engine/stockfish-19-lite-single.js'); } catch (e) { reject(e); return; }
      var waiting = null;
      w.onmessage = function (e) {
        var line = typeof e.data === 'string' ? e.data : '';
        if (line === 'uciok') { w.postMessage('isready'); }
        else if (line === 'readyok' && !engine) { engine = { w: w, set: function (fn) { waiting = fn; } }; resolve(engine); }
        else if (waiting) waiting(line);
      };
      w.onerror = function (e) { reject(e); };
      w.postMessage('uci');
    });
  }
  function search(fen, ms) {
    return new Promise(function (resolve) {
      var last = { cp: 0, mate: null, pv: [] };
      engine.set(function (line) {
        if (line.indexOf('info') === 0 && line.indexOf(' pv ') > -1) {
          var m = line.match(/score (cp|mate) (-?\d+)/), pv = line.split(' pv ')[1].trim().split(' ');
          if (m) last = { cp: m[1] === 'cp' ? +m[2] : (+m[2] > 0 ? MATE : -MATE), mate: m[1] === 'mate' ? +m[2] : null, pv: pv };
        } else if (line.indexOf('bestmove') === 0) {
          engine.set(null);
          resolve(last);
        }
      });
      engine.w.postMessage('position fen ' + fen);
      engine.w.postMessage('go movetime ' + ms);
    });
  }

  function lichessId(text) {
    var m = text.trim().match(/lichess\.org\/([a-zA-Z0-9]{8})/);
    return m ? m[1] : null;
  }

  async function run(e) {
    e.preventDefault();
    if (busy) { cancel = true; return; }
    var text = pgnBox.value.trim();
    if (!text) { say('Paste a PGN or a Lichess game link first.'); return; }
    busy = true; cancel = false; btn.textContent = 'Stop';
    try {
      var id = lichessId(text);
      if (id && text.indexOf('[') < 0 && text.split(/\s+/).length < 3) {
        say('Fetching the game from Lichess…');
        var r = await fetch('https://lichess.org/game/export/' + id + '?clocks=false&evals=false&opening=true', { headers: { Accept: 'application/x-chess-pgn' } });
        if (!r.ok) throw new Error('Lichess answered ' + r.status + '. Check the link, or paste the PGN instead.');
        text = await r.text();
      }
      say('Reading the moves…');
      var mod = await import('../vendor/chess.js');
      var chess = new mod.Chess();
      try { chess.loadPgn(text); } catch (err) { throw new Error('That PGN could not be read: ' + (err.message || err)); }
      var moves = chess.history({ verbose: true });
      if (!moves.length) throw new Error('No moves found in that PGN.');
      var h = chess.getHeaders ? chess.getHeaders() : chess.header();
      var start = h.FEN || mod.DEFAULT_POSITION;
      var replay = new mod.Chess(start);
      var G = { white: h.White || 'White', black: h.Black || 'Black', white_elo: h.WhiteElo || '', black_elo: h.BlackElo || '',
        result: h.Result || '*', opening: h.Opening || '', start_fen: start, plies: [], key_moments: [] };
      moves.forEach(function (m) {
        replay.move(m.san);
        G.plies.push({ fen: replay.fen(), uci: m.from + m.to + (m.promotion || ''), san: m.san, side: m.color === 'w' ? 'White' : 'Black', cp: null, mate: null, grade: null, best: null, best_uci: null, best_line: '', drop: null });
      });
      window.ChessViewer.load(G, -1);

      say('Starting Stockfish 19 in your browser…');
      await startEngine();
      var ms = +speed.value, evals = [];
      for (var i = -1; i < G.plies.length; i++) {
        if (cancel) { say('Stopped. ' + (i + 1) + ' of ' + G.plies.length + ' positions analysed.'); break; }
        var fen = i < 0 ? start : G.plies[i].fen, pos = new mod.Chess(fen), res;
        if (pos.isGameOver()) {
          res = { cp: pos.isCheckmate() ? (pos.turn() === 'w' ? -MATE : MATE) : 0, mate: null, pv: [] };
        } else {
          res = await search(fen, ms);
          if (pos.turn() === 'b') { res.cp = -res.cp; if (res.mate != null) res.mate = -res.mate; }   // engine scores are side-to-move
        }
        evals.push(res);
        if (i >= 0) {
          var p = G.plies[i], before = evals[evals.length - 2], sign = p.side === 'White' ? 1 : -1;
          p.cp = Math.max(-1500, Math.min(1500, res.cp)); p.mate = res.mate;
          var drop = Math.max(0, wc(sign * before.cp) - wc(sign * res.cp));
          var prev = new mod.Chess(i === 0 ? start : G.plies[i - 1].fen), line = [], bestSan = null;
          before.pv.slice(0, 6).forEach(function (u, k) {
            try { var mv = prev.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (k === 0) bestSan = mv.san; line.push(mv.san); } catch (err) { /* stop at an illegal tail */ }
          });
          p.best = bestSan; p.best_uci = before.pv[0] || null; p.best_line = line.join(' '); p.drop = +drop.toFixed(3);
          p.grade = p.uci !== p.best_uci ? grade(drop) : null;
          progress.value = (i + 1) / G.plies.length;
          say('Analysing move ' + (i + 1) + ' of ' + G.plies.length + ' · ' + (ms / 1000) + ' s per position');
          if (i % 2 === 1 || i === G.plies.length - 1) window.ChessViewer.refresh();
        }
      }
      var fmt = function (e) { return e.mate != null ? (e.mate > 0 ? 'White mates in ' + e.mate : 'Black mates in ' + (-e.mate)) : (e.cp >= 0 ? '+' : '') + (e.cp / 100).toFixed(2); };
      G.key_moments = G.plies.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return x.p.grade; })
        .sort(function (a, b) { return b.p.drop - a.p.drop; }).slice(0, 5).sort(function (a, b) { return a.i - b.i; })
        .map(function (x) { return { ply: x.i + 1, side: x.p.side, played: x.p.san, best: x.p.best, best_line: x.p.best_line, grade: x.p.grade, eval_before: fmt(evals[x.i]), eval_after: fmt(evals[x.i + 1]), win_chance_drop: x.p.drop }; });
      if (!cancel) say('Done: ' + G.plies.length + ' moves analysed in your browser by Stockfish 19.');
      window.ChessViewer.load(G, G.key_moments.length ? G.key_moments[G.key_moments.length - 1].ply - 1 : -1);
    } catch (err) {
      say(err.message || String(err));
    } finally {
      busy = false; btn.textContent = 'Analyse';
    }
  }
  form.addEventListener('submit', run);
  document.getElementById('pgn-file').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var rd = new FileReader(); rd.onload = function () { pgnBox.value = rd.result; say('Loaded ' + f.name + '. Press Analyse.'); }; rd.readAsText(f);
  });
})();
