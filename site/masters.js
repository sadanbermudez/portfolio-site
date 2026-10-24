/* Learn from the masters: a picker over the classic games in data/master-games.js (built by jarvis-chess
   scripts/master_games.py). Choosing one loads it into the viewer from the start and shows what it teaches;
   "My game" brings back the reviewed game of mine. The Opera Game is shown first. */
(function () {
  var games = window.MASTER_GAMES || [], box = document.getElementById('masters'), lesson = document.getElementById('master-lesson');
  if (!box || !games.length || !window.ChessViewer) return;
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function show(i) {
    box.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.i === i)); });
    if (i < 0) {
      lesson.innerHTML = '<p class="label">My game</p><p>A 3-minute game of mine, reviewed by the jarvis-chess server. Fast games are full of mistakes on both sides, which makes them good for practising tactics, and poor for learning plans: for that, pick a master game.</p>';
      window.ChessViewer.load(window.CHESS_GAME);
      return;
    }
    var g = games[i];
    lesson.innerHTML = '<p class="label">' + esc(g.theme) + ' · ' + esc(g.white) + ' vs ' + esc(g.black) + ', ' + esc(g.event) + ' ' + esc(g.date) + ' · ' + esc(g.result) + '</p>' +
      '<h3>' + esc(g.title) + '</h3><p>' + esc(g.lesson) + '</p>' +
      '<p class="mono">Press Play, or jump to the key moments: each is found by Stockfish and the rules (a sacrifice that holds, the only good move, the losing side\'s turning point), and every move lists what it changed on the board.</p>';
    window.ChessViewer.load(g, -1);
  }
  box.innerHTML = games.map(function (g, i) {
    return '<button type="button" class="master" data-i="' + i + '" aria-pressed="false"><span class="t">' + esc(g.title) + '</span><span class="s">' + esc(g.theme) + ' · ' + esc(g.date) + '</span></button>';
  }).join('') + (window.CHESS_GAME ? '<button type="button" class="master mine" data-i="-1" aria-pressed="false"><span class="t">My game</span><span class="s">a blitz win, for tactics</span></button>' : '');
  box.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]');
    if (b) { show(+b.dataset.i); document.getElementById('game').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  show(0);
})();
