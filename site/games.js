/* Your games: load the latest games of a Lichess or Chess.com account through their public APIs
   (the browser fetches them directly; no token, nothing sent anywhere else), list them as a log,
   and review them with the same in-browser Stockfish as the analyse form. Reviews are kept in
   this browser's localStorage, per site and username, so the log is still there next visit. */
(function () {
  var form = document.getElementById('account-form');
  if (!form || !window.ChessAnalysis) return;
  var siteSel = document.getElementById('acct-site'), userIn = document.getElementById('acct-user'), countSel = document.getElementById('acct-count');
  var loadBtn = document.getElementById('acct-load'), allBtn = document.getElementById('acct-review-all'), clearBtn = document.getElementById('acct-clear');
  var status = document.getElementById('acct-status'), table = document.getElementById('acct-log'), summary = document.getElementById('acct-summary');
  var speed = document.getElementById('import-speed'), QUICK_MS = 150;
  var log = null, batch = false, cancel = false, running = null;   // running: id of the game being reviewed

  function say(t) { status.textContent = t; }
  function key(site, user) { return 'chess-log:' + site + ':' + user.toLowerCase(); }
  function save() { try { localStorage.setItem(key(log.site, log.user), JSON.stringify(log)); localStorage.setItem('chess-log:last', JSON.stringify({ site: log.site, user: log.user })); } catch (e) { /* storage off: the log still works for this visit */ } }
  function restore(site, user) { try { return JSON.parse(localStorage.getItem(key(site, user)) || 'null'); } catch (e) { return null; } }
  function header(pgn, name) { var m = pgn.match(new RegExp('\\[' + name + ' "([^"]*)"\\]')); return m ? m[1] : ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  async function lichess(user, n) {
    var r = await fetch('https://lichess.org/api/games/user/' + encodeURIComponent(user) + '?max=' + n * 2 + '&pgnInJson=true&opening=true&clocks=false&evals=false', { headers: { Accept: 'application/x-ndjson' } });
    if (r.status === 404) throw new Error('Lichess has no user called ' + user + '.');
    if (r.status === 429) throw new Error('Lichess is rate-limiting requests. Try again in a minute.');
    if (!r.ok) throw new Error('Lichess answered ' + r.status + '.');
    var games = (await r.text()).split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); })
      .filter(function (g) { return g.variant === 'standard' && g.pgn; }).slice(0, n);
    return games.map(function (g) {
      return { id: 'li-' + g.id, url: 'https://lichess.org/' + g.id, date: new Date(g.createdAt).toISOString().slice(0, 10), pgn: g.pgn,
        white: header(g.pgn, 'White'), black: header(g.pgn, 'Black'), result: header(g.pgn, 'Result'), speed: g.speed, opening: (g.opening && g.opening.name) || header(g.pgn, 'Opening') };
    });
  }
  async function chesscom(user, n) {
    var r = await fetch('https://api.chess.com/pub/player/' + encodeURIComponent(user.toLowerCase()) + '/games/archives');
    if (r.status === 404) throw new Error('Chess.com has no user called ' + user + '.');
    if (!r.ok) throw new Error('Chess.com answered ' + r.status + '.');
    var months = (await r.json()).archives || [], out = [];
    for (var k = months.length - 1; k >= 0 && out.length < n; k--) {           // newest month first
      var m = await fetch(months[k]); if (!m.ok) continue;
      var games = ((await m.json()).games || []).filter(function (g) { return g.rules === 'chess' && g.pgn; }).reverse();
      games.forEach(function (g) {
        if (out.length >= n) return;
        var eco = header(g.pgn, 'ECOUrl'), opening = eco ? decodeURIComponent(eco.split('/').pop()).replace(/-/g, ' ') : '';
        out.push({ id: 'cc-' + g.url.split('/').pop(), url: g.url, date: new Date(g.end_time * 1000).toISOString().slice(0, 10), pgn: g.pgn,
          white: g.white.username, black: g.black.username, result: header(g.pgn, 'Result'), speed: g.time_class, opening: opening });
      });
    }
    return out;
  }

  function mySide(g) { var u = log.user.toLowerCase(); return g.white.toLowerCase() === u ? 'White' : g.black.toLowerCase() === u ? 'Black' : null; }
  function outcome(g) {
    var side = mySide(g);
    if (g.result === '1/2-1/2') return 'draw';
    if (!side || (g.result !== '1-0' && g.result !== '0-1')) return g.result;
    return (g.result === '1-0') === (side === 'White') ? 'win' : 'loss';
  }

  function render() {
    if (!log || !log.games.length) { table.innerHTML = ''; summary.textContent = ''; allBtn.disabled = clearBtn.disabled = true; return; }
    allBtn.disabled = clearBtn.disabled = false;
    var rows = log.games.map(function (g) {
      var side = mySide(g), rv = log.reviews[g.id], s = rv && side ? rv.stats[side] : null, opp = side === 'White' ? g.black : g.white;
      var res = outcome(g);
      return '<tr' + (running === g.id ? ' class="running"' : '') + '><td class="n">' + esc(g.date) + '</td><td>' + esc(side ? (side === 'White' ? '○ ' : '● ') + opp : g.white + ' vs ' + g.black) + '</td>' +
        '<td><span class="res ' + esc(res) + '">' + esc(res) + '</span></td><td class="n">' + esc(g.speed || '') + '</td><td class="op">' + esc(g.opening || '') + '</td>' +
        '<td class="n">' + (s && s.acpl != null ? s.acpl : (running === g.id ? '…' : '')) + '</td>' +
        '<td class="n">' + (s ? s.inaccuracy + ' / ' + s.mistake + ' / ' + '<span class="bl">' + s.blunder + '</span>' : '') + (rv && !rv.complete ? ' <span class="mono">partial</span>' : '') + '</td>' +
        '<td><button type="button" class="btn small" data-open="' + esc(g.id) + '">Analyse</button> <a href="' + esc(g.url) + '" target="_blank" rel="noopener">game</a></td></tr>';
    }).join('');
    table.innerHTML = '<table><thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>Speed</th><th>Opening</th><th>Your ACPL</th><th>Inacc. / mist. / bl.</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    var done = log.games.filter(function (g) { return log.reviews[g.id] && mySide(g); });
    var tally = { win: 0, draw: 0, loss: 0 }; log.games.forEach(function (g) { var o = outcome(g); if (tally[o] != null) tally[o]++; });
    var text = log.games.length + ' games · ' + tally.win + ' won, ' + tally.draw + ' drawn, ' + tally.loss + ' lost';
    if (done.length) {
      var moves = 0, loss = 0, b = 0, m = 0;
      done.forEach(function (g) { var s = log.reviews[g.id].stats[mySide(g)]; moves += s.moves; loss += s.acpl * s.moves; b += s.blunder; m += s.mistake; });
      text += ' · reviewed ' + done.length + ': average centipawn loss ' + Math.round(loss / Math.max(1, moves)) + ', ' + m + ' mistakes, ' + b + ' blunders';
    }
    summary.textContent = text;
  }

  async function load(e) {
    e.preventDefault();
    var site = siteSel.value, user = userIn.value.trim(), n = +countSel.value;
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(user)) { say('Enter a Lichess or Chess.com username.'); return; }
    loadBtn.disabled = true; say('Fetching the last ' + n + ' games of ' + user + ' from ' + (site === 'lichess' ? 'Lichess' : 'Chess.com') + '…');
    try {
      var games = site === 'lichess' ? await lichess(user, n) : await chesscom(user, n);
      if (!games.length) throw new Error('No standard games found for ' + user + '.');
      var old = restore(site, user);
      log = { site: site, user: user, games: games, reviews: old ? old.reviews : {} };
      save(); render();
      say('Loaded ' + games.length + ' games. Analyse one on the board, or quick-review them all at ' + QUICK_MS / 1000 + ' s per move.');
    } catch (err) {
      say(err.message || String(err));
    } finally { loadBtn.disabled = false; }
  }

  function store(id, out) { log.reviews[id] = { stats: out.stats, complete: out.complete, ms: out.ms, at: new Date().toISOString().slice(0, 10) }; save(); }

  async function open(id) {
    var g = log.games.filter(function (x) { return x.id === id; })[0]; if (!g) return;
    if (!window.ChessAnalysis.claim()) { say('Another analysis is running. Stop it first.'); return; }
    running = id; render(); cancel = false;
    var ms = +speed.value, wrap = document.getElementById('game');
    window.ChessViewer.setMe(log.user);
    document.getElementById('pgn-input').value = g.pgn;
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      var out = await window.ChessAnalysis.show(g.pgn, ms, { cancelled: function () { return cancel; },
        progress: function (i, n) { say('Analysing ' + g.date + ' against ' + (mySide(g) === 'White' ? g.black : g.white) + ': move ' + i + ' of ' + n + ' at ' + ms / 1000 + ' s per move'); } });
      out.ms = ms; store(id, out);
      say(out.complete ? 'Done. The board shows the game; its row in the log is updated.' : 'Stopped part-way; the partial review is in the log.');
    } catch (err) { say(err.message || String(err)); }
    finally { running = null; window.ChessAnalysis.release(); render(); }
  }

  async function reviewAll() {
    if (batch) { cancel = true; return; }
    var todo = log.games.filter(function (g) { var rv = log.reviews[g.id]; return !rv || !rv.complete; });
    if (!todo.length) { say('Every game in the log is already reviewed.'); return; }
    if (!window.ChessAnalysis.claim()) { say('Another analysis is running. Stop it first.'); return; }
    batch = true; cancel = false; allBtn.textContent = 'Stop';
    try {
      for (var k = 0; k < todo.length && !cancel; k++) {
        var g = todo[k]; running = g.id; render();
        var out = await window.ChessAnalysis.review(g.pgn, QUICK_MS, { cancelled: function () { return cancel; },
          progress: function (i, n) { say('Quick review, game ' + (k + 1) + ' of ' + todo.length + ': move ' + i + ' of ' + n); } });
        out.ms = QUICK_MS; store(g.id, out); render();
      }
      say(cancel ? 'Stopped. Finished reviews are kept in the log.' : 'Reviewed ' + todo.length + ' games at ' + QUICK_MS / 1000 + ' s per move.');
    } catch (err) { say(err.message || String(err)); }
    finally { batch = false; running = null; window.ChessAnalysis.release(); allBtn.textContent = 'Quick-review all'; render(); }
  }

  form.addEventListener('submit', load);
  allBtn.addEventListener('click', reviewAll);
  clearBtn.addEventListener('click', function () {
    if (!log) return;
    try { localStorage.removeItem(key(log.site, log.user)); } catch (e) { /* nothing stored */ }
    log = null; render(); say('Log cleared from this browser.');
  });
  table.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]'); if (!b) return;
    if (batch) { say('Stop the quick review first.'); return; }
    if (running) { cancel = true; return; }
    open(b.dataset.open);
  });

  try {                                                       // reopen the last log from this browser
    var last = JSON.parse(localStorage.getItem('chess-log:last') || 'null');
    if (last) { siteSel.value = last.site; userIn.value = last.user; log = restore(last.site, last.user); if (log) say('Your saved log from this browser. Load games to refresh it.'); }
  } catch (e) { /* no saved log */ }
  render();
})();
