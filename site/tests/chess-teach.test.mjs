// Move explanations: node site/tests/chess-teach.test.mjs
// Each position is built so one motif is unambiguous; the "engine line" is the forcing line a
// strong engine plays there. The last cases check the honesty rules: no fork without the line
// that wins with it, and a plain evaluation sentence when no motif is found.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Chess } from '../vendor/chess.js';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../chess-core.js');
require('../chess-teach.js');
const T = window.ChessTeach;

let passed = 0;
const ok = (name) => { passed++; console.log('ok  ' + name); };
const kinds = (fen, move, line) => T.motifs(Chess, fen, move, line).list.map((m) => m.k);
const say = (fen, move, line, k) => T.motifs(Chess, fen, move, line).list.find((m) => m.k === k)?.say;
const text = (r) => r.sentences.join(' ');

// knight fork of king and rook, and the line takes the rook
{
  const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
  assert.ok(kinds(fen, 'Nc7+', ['Kd7', 'Nxa8']).includes('fork'));
  assert.equal(say(fen, 'Nc7+', ['Kd7', 'Nxa8'], 'fork'), 'forks the king and the rook on a8');
  assert.equal(say(fen, 'Nc7+', ['Kd7', 'Nxa8'], 'wins'), 'wins the rook on a8');
  const r = T.explain({ Chess, fen, played: 'd5c7', best: 'd5c7', pvAfter: ['Kd7', 'Nxa8'], cpBefore: 500, cpAfter: 520 });
  assert.equal(r.verdict, 'best');
  assert.equal(text(r), 'Nc7+ forks the king and the rook on a8, winning the rook on a8.');
  assert.deepEqual(r.marks.squares.sort(), ['a8', 'e8']);
  ok('fork: Nc7+ forks king and rook, confirmed by Nxa8 in the line');
}

// absolute pin
{
  const fen = '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1';
  assert.equal(say(fen, 'Bb5', [], 'pin'), 'pins the knight on c6 to the king');
  ok('absolute pin: Bb5 pins the c6 knight to the king');
}

// relative pin
{
  const fen = '3qk3/8/5n2/8/8/8/8/2B1K3 w - - 0 1';
  assert.equal(say(fen, 'Bg5', [], 'pin'), 'pins the knight on f6 to the queen on d8');
  ok('relative pin: Bg5 pins the f6 knight to the queen');
}

// skewer through the king, cashed in by the line
{
  const fen = '3r4/8/8/8/3k4/8/7K/7R w - - 0 1';
  const list = kinds(fen, 'Rd1+', ['Ke5', 'Rxd8']);
  assert.ok(list.includes('skewer'));
  assert.equal(say(fen, 'Rd1+', ['Ke5', 'Rxd8'], 'skewer'), 'skewers the king and the rook on d8');
  assert.ok(!kinds(fen, 'Rd1+', ['Ke5']).includes('skewer'), 'no skewer claim when the line does not take the rook');
  ok('skewer: Rd1+ skewers king and rook, only when the line wins the rook');
}

// discovered check that wins the queen
{
  const fen = '4k3/3q4/8/8/4N3/8/8/K3R3 w - - 0 1';
  const m = T.motifs(Chess, fen, 'Nc5+', ['Kf8', 'Nxd7+']);
  assert.equal(m.list.find((x) => x.k === 'discovered').say, 'uncovers a discovered check from the rook on e1');
  assert.equal(m.list.find((x) => x.k === 'wins').say, 'wins the queen on d7');
  ok('discovered check: Nc5+ opens the e-file and the line takes the queen');
}

// back-rank mate
{
  const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  const r = T.explain({ Chess, fen, played: 'a1a8', best: 'a1a8', pvAfter: [] });
  assert.equal(text(r), 'Ra8# is a back-rank mate.');
  const r2 = T.explain({ Chess, fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1', played: 'h7h6', best: 'h7h6', pvAfter: [] });
  assert.ok(!/mate/.test(text(r2)));
  ok('back-rank mate: Ra8# named as a back-rank mate');
}

// a piece left hanging
{
  const fen = '4k3/8/2n5/8/8/8/8/3QK3 b - - 0 1';
  const r = T.explain({ Chess, fen, played: 'c6d4', best: 'e8e7', pvBest: ['Ke7'], pvAfter: ['Qxd4'], cpBefore: 0, cpAfter: 350 });
  assert.equal(r.verdict, 'blunder');
  assert.equal(r.sentences[0], 'Nd4 puts the knight on an undefended square, and Qxd4 takes it.');
  assert.ok(r.sentences[1].startsWith('Stockfish prefers Ke7'), 'the knight is named once, not twice');
  assert.deepEqual(r.marks.arrows, [{ uci: 'd1d4', kind: 'reply' }]);
  ok('hanging piece: Nd4 walks into Qxd4');
}

// a threat ignored: the knight on f6 was already attacked
{
  const fen = '4k3/8/5n2/8/8/8/8/4KQ2 b - - 0 1';
  const r = T.explain({ Chess, fen, played: 'e8d7', best: 'f6e4', pvBest: ['Ne4'], pvAfter: ['Qxf6'], cpBefore: 0, cpAfter: 350 });
  assert.equal(r.sentences[0], 'Kd7 ignores the threat to the knight on f6: Qxf6 takes it.');
  ok('threat ignored: Kd7 leaves the attacked f6 knight to Qxf6');
}

// allowing a fork: the engine's reply forks, and its line cashes in
{
  const fen = 'r2k4/8/8/1N6/8/8/8/4K3 b - - 0 1';
  const r = T.explain({ Chess, fen, played: 'd8e8', best: 'd8d7', pvBest: ['Kd7'], pvAfter: ['Nc7+', 'Kd7', 'Nxa8'], cpBefore: 0, cpAfter: 400 });
  assert.equal(r.sentences[0], 'Ke8 allows Nc7+, which forks the king and the rook on a8.');
  assert.equal(r.sentences[1], 'In the engine\'s line White wins the rook on a8.');
  assert.ok(r.marks.arrows.some((a) => a.kind === 'reply' && a.uci === 'b5c7'));
  ok('allowed fork: Ke8 runs into Nc7+, forking king and rook');
}

// the fork pattern alone is not called a fork when the engine line does not win with it
{
  const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
  assert.ok(!kinds(fen, 'Nc7+', ['Kd7', 'Kd1']).includes('fork'));
  ok('honesty: no "fork" without the capture in the engine line');
}

// a capture the engine line never plays is never reported as "the line wins it"
{
  const fen = '4k3/8/2n5/8/8/8/8/3QK3 b - - 0 1';
  assert.ok(!kinds(fen, 'Nd4', ['Qd2', 'Ke7']).includes('loses'));
  ok('honesty: no material claim for a capture outside the engine line');
}

// missed win: the best move wins material, the played move does not
{
  const fen = '4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1';
  const r = T.explain({ Chess, fen, played: 'e1e2', best: 'd1d5', pvBest: ['Qxd5'], pvAfter: ['Nf4+'], cpBefore: 900, cpAfter: 600 });
  assert.match(text(r), /Missed: Qxd5 wins the knight on d5\./);
  ok('missed win: Qxd5 named with the knight it wins');
}

// no motif: the evaluation speaks
{
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const r = T.explain({ Chess, fen, played: 'e2e4', best: 'e2e4', pvAfter: ['e5', 'Nf3'], cpBefore: 20, cpAfter: 25 });
  assert.equal(text(r), 'e4 is Stockfish\'s first choice; the position is about equal (+0.3).');
  ok('fallback: e4 described by the evaluation alone');
}

// development and castling
{
  assert.equal(say('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'Nf3', [], 'develop'), 'develops the knight');
  assert.ok(kinds('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O', []).includes('castle'));
  assert.ok(kinds('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'Kf1', []).includes('nocastle'));
  ok('development, castling and losing the right to castle');
}

// passed pawn and removing the defender
{
  assert.equal(say('4k3/8/8/2p5/3P4/8/8/4K3 w - - 0 1', 'dxc5', [], 'passer'), 'creates a passed pawn on c5');
  // Bxf6 removes the f6 knight that guarded the e4 bishop; the line then takes it
  const fen = '4k3/8/5n2/8/4b3/8/1B6/4R1K1 w - - 0 1';
  const m = T.motifs(Chess, fen, 'Bxf6', ['Kf7', 'Rxe4']);
  assert.ok(m.list.some((x) => x.k === 'defender' && x.say === 'removes the defender of the bishop on e4'), JSON.stringify(m.list));
  ok('passed pawn created, defender removed');
}

// SAN lines with move numbers, as the reviewed game stores them
assert.deepEqual(T.moves('35...Bxc5+ 36. Nxc5'), ['Bxc5+', 'Nxc5']);
assert.deepEqual(T.moves('22. Ne4 Bb7 23. Bd2'), ['Ne4', 'Bb7', 'Bd2']);
ok('reads engine lines written with move numbers');

console.log(passed + ' passed');
