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
require('../chess-position.js');
require('../chess-teach.js');
const T = window.ChessTeach;
const PO = window.ChessPosition;
const board = (fen) => window.ChessCore.parse(fen);
// the positions along a line, and the events it brings for one side
const line = (fen, ms) => { const g = new Chess(fen), fens = [fen], seq = []; for (const m of ms) { seq.push(g.move(m)); fens.push(g.fen()); } return { fens, seq }; };
const events = (fen, ms, white) => { const L = line(fen, ms); return PO.events(L.fens, L.seq, white); };

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

// ---------- positional detectors (chess-position.js) ----------

// doubled, isolated and backward pawns
{
  const d = PO.pawnStructure(board('4k3/8/8/8/8/2P5/2P5/4K3 w - - 0 1'), true);
  assert.deepEqual(d.doubled, ['c']);
  assert.deepEqual(d.isolated.sort(), ['c2', 'c3']);
  const i = PO.pawnStructure(board('4k3/8/8/8/3P4/8/PP3PPP/4K3 w - - 0 1'), true);
  assert.deepEqual(i.isolated, ['d4']);
  assert.deepEqual(i.doubled, []);
  // d3 has pawns beside it on c4 and e4, both further up, and the black c5 pawn covers d4
  const b = PO.pawnStructure(board('4k3/8/8/2p5/2P1P3/3P4/8/4K3 w - - 0 1'), true);
  assert.deepEqual(b.backward, ['d3']);
  // with the c5 pawn gone, d3 can step up to d4 and is not backward
  assert.deepEqual(PO.pawnStructure(board('4k3/8/8/8/2P1P3/3P4/8/4K3 w - - 0 1'), true).backward, []);
  ok('pawn structure: doubled, isolated, backward');
}

// knight outpost: guarded by a pawn, and no enemy pawn can ever attack it
{
  const o = PO.outposts(board('4k3/pp3ppp/8/3N4/4P3/8/8/4K3 w - - 0 1'), true);
  assert.ok(o.some((x) => x.sq === 'd5' && x.piece === 'n'));
  // a black pawn on c7 could still come to c6 and chase the knight
  const o2 = PO.outposts(board('4k3/ppp2ppp/8/3N4/4P3/8/8/4K3 w - - 0 1'), true);
  assert.ok(!o2.some((x) => x.sq === 'd5'));
  // a square in the side's own half is never an outpost
  assert.ok(!PO.outposts(board('4k3/pp3ppp/8/8/3N4/4P3/8/4K3 w - - 0 1'), true).some((x) => x.sq === 'd4'));
  const e = events('4k3/pp3ppp/8/8/4P3/2N5/8/4K3 w - - 0 1', ['Nd5', 'Kd7'], true);
  assert.ok(e.some((x) => x.kind === 'outpost' && x.state === 'the knight lands on d5, an outpost no black pawn can attack'));
  ok('outpost: d5 counted, and not with a c-pawn that can still chase it');
}

// open and half-open files, the seventh rank, connected rooks
{
  const r = PO.rooksOnFiles(board('4k3/pp3ppp/8/8/8/8/PP3PPP/3RK3 w - - 0 1'), true);
  assert.deepEqual(r, [{ sq: 'd1', file: 3, state: 'open' }]);
  assert.equal(PO.rooksOnFiles(board('4k3/pp3ppp/3p4/8/8/8/PP3PPP/3RK3 w - - 0 1'), true)[0].state, 'half');
  assert.deepEqual(PO.rooksOnFiles(board('4k3/pp3ppp/8/8/8/8/PP1P1PPP/3RK3 w - - 0 1'), true), []);
  const e = events('4k3/pp3ppp/8/8/8/8/PP3PPP/R3K3 w - - 0 1', ['Rd1', 'Ke7'], true);
  assert.ok(e.some((x) => x.kind === 'file' && /open d-file/.test(x.state)), JSON.stringify(e));
  assert.deepEqual(PO.rookSeventh(board('4k3/1R3ppp/8/8/8/8/5PPP/6K1 w - - 0 1'), true), ['b7']);
  assert.deepEqual(PO.rookSeventh(board('8/1R6/8/8/8/8/5PPP/k5K1 w - - 0 1'), true), []);     // nothing to attack there
  assert.equal(PO.connectedRooks(board('4k3/8/8/8/8/8/8/R4RK1 w - - 0 1'), true), true);
  assert.equal(PO.connectedRooks(board('4k3/8/8/8/8/8/8/R2Q1RK1 w - - 0 1'), true), false);
  ok('rooks: open and half-open files, the seventh rank, connected');
}

// the bishop pair and a bad bishop
{
  assert.equal(PO.bishopPair(board('4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1'), true), true);
  assert.equal(PO.bishopPair(board('4k3/8/8/8/8/8/3B4/2B1K3 w - - 0 1'), true), false);       // c1 and d2 are both dark squares
  // c3, d4 and e5 sit on dark squares, each blocked by a black pawn: the c1 bishop is bad
  assert.deepEqual(PO.badBishops(board('4k3/8/4p3/3pP3/2pP4/2P5/8/2B1K3 w - - 0 1'), true), ['c1']);
  assert.deepEqual(PO.badBishops(board('4k3/8/4p3/3pP3/2pP4/2P5/8/3BK3 w - - 0 1'), true), []);  // the light-squared one is not
  ok('bishops: the pair, and a bad bishop behind its own fixed pawns');
}

// the king's pawn shield, and a hole in front of the king
{
  const C = window.ChessCore, b0 = board('4k3/8/8/8/8/8/5PPP/6K1 w - - 0 1'), b1 = board('4k3/8/8/8/6P1/8/5P1P/6K1 w - - 0 1');
  assert.equal(PO.king(b0, C.attacks(b0), true).shield, 3);
  assert.equal(PO.king(b1, C.attacks(b1), true).shield, 2);
  // f2-f4 with the g-pawn gone from g2: no white pawn can guard g3 any more
  const e = events('r3k3/8/8/8/6P1/8/5P2/6K1 w - - 0 1', ['f4', 'Kd7'], false);
  assert.ok(e.some((x) => x.kind === 'hole' && x.squares[0] === 'g3'), JSON.stringify(e));
  assert.ok(!PO.kingHoles(board('4k3/8/8/8/6P1/8/5P2/6K1 w - - 0 1'), true).includes('g3'));     // f2 still guards g3
  ok('king: pawn shield counted, a hole on g3 after f4');
}

// space: a pawn on the fifth rank that blunts an enemy bishop
{
  const e = events('rnbqk1nr/ppp1ppbp/3p2p1/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 4', ['e5', 'Nd7'], true);
  const sp = e.find((x) => x.kind === 'space');
  assert.ok(sp, JSON.stringify(e));
  assert.equal(sp.state, 'the pawn on e5 gains space and blunts the bishop on g7');
  assert.deepEqual(PO.space(board('rnbqk1nr/ppp1ppbp/3p2p1/4P3/3P4/2N5/PPP2PPP/R1BQKBNR b KQkq - 0 4'), true).advanced, ['e5']);
  ok('space: e5 gains space and blunts the g7 bishop');
}

// ---------- grounding rules for positional notes ----------

// no positional praise for a move that loses material in the engine's line, even if graded good
{
  const fen = '3qk3/pp3ppp/8/8/4P3/2N5/8/4K3 w - - 0 1';
  const r = T.explain({ Chess, fen, played: 'c3d5', best: 'c3d5', pvAfter: ['Qxd5'], grade: 'good', cpBefore: 0, cpAfter: 0 });
  assert.ok(!/outpost/.test(text(r)), text(r));
  // the same knight jump with nothing hanging is praised for the outpost
  const fen2 = '4k3/pp3ppp/8/8/4P3/2N5/8/4K3 w - - 0 1';
  const r2 = T.explain({ Chess, fen: fen2, played: 'c3d5', best: 'c3d5', pvAfter: ['Kd7', 'Kd2'], cpBefore: 300, cpAfter: 320 });
  assert.equal(text(r2), 'With Nd5, the knight lands on d5, an outpost no black pawn can attack.');
  assert.ok(r2.marks.squares.includes('d5'));
  ok('grounding: no outpost praise when the line takes the knight');
}

// a move that loses evaluation is never praised for what it gains
{
  const fen = '4k3/pp3ppp/8/8/4P3/2N5/P7/4K3 w - - 0 1';
  const r = T.explain({ Chess, fen, played: 'c3d5', best: 'a2a4', pvBest: ['a4'], pvAfter: ['Kd7'], cpBefore: 300, cpAfter: 100 });
  assert.ok(!/outpost/.test(text(r)), text(r));
  ok('grounding: a move that loses evaluation gets no positional praise');
}

// "Stockfish prefers": the plan is read from the engine's own line, and only what the played line lacks
{
  const fen = '4k3/pp3ppp/8/8/4P3/2N5/P7/4K3 w - - 0 1';
  const r = T.explain({ Chess, fen, played: 'a2a3', best: 'c3d5', pvBest: ['Nd5', 'Kd7', 'Kd2'], pvAfter: ['Kd7', 'Nd5'], cpBefore: 300, cpAfter: 200 });
  assert.ok(!/outpost/.test(text(r)), 'the played line reaches the outpost too: ' + text(r));
  const r2 = T.explain({ Chess, fen, played: 'a2a3', best: 'c3d5', pvBest: ['Nd5', 'Kd7', 'Kd2'], pvAfter: ['Kd7', 'Kd2'], cpBefore: 300, cpAfter: 200 });
  assert.match(text(r2), /^Stockfish prefers Nd5: the knight lands on d5, an outpost no black pawn can attack\./);
  // a plan the engine's line does not play is not claimed: here its line is Kd2 alone
  const r3 = T.explain({ Chess, fen, played: 'a2a3', best: 'e1d2', pvBest: ['Kd2'], pvAfter: ['Kd7', 'Kd2'], cpBefore: 300, cpAfter: 200 });
  assert.ok(!/outpost/.test(text(r3)), text(r3));
  ok('grounding: the plan comes from the engine line and tells the two moves apart');
}

// the reviewed game: 17...d4 lets White bury the g7 bishop, and gxh5 would have stopped h6
{
  const fen = '1rb2rk1/2q2pbp/2n1p1p1/2ppPn1P/8/2PP1NP1/4QPB1/R1B1RNK1 b - - 0 17';
  const r = T.explain({ Chess, fen, played: 'd5d4', best: 'g6h5', pvBest: '17...gxh5 18. Ne3 Nfe7 19. d4 f6 20. exf6',
    pvAfter: '18. g4 Nfe7 19. h6 Bh8 20. cxd4 Nd5', cpBefore: 41, cpAfter: 325, grade: 'blunder' });
  assert.equal(r.sentences[0], 'd4 allows g4 Nfe7 h6 Bh8: the bishop on h8 is shut in, with every square it can reach covered by a white pawn or taken by a black piece.');
  assert.equal(r.sentences[1], 'Stockfish prefers gxh5, which takes the pawn on h5 before it can go to h6.');
  assert.ok(r.marks.squares.includes('h8'));
  ok('game: 17...d4 shuts the bishop in on h8; gxh5 prevents h6');
}

// a pawn "lost" that the engine line wins back is not called lost (11. h5 gxh5 ... Qxh5)
{
  const fen = '1rbq1rk1/1p2npbp/p1n1p1p1/2pp4/P3P2P/3P1NP1/1PPN1PB1/R1BQR1K1 w - - 0 11';
  const r = T.explain({ Chess, fen, played: 'h4h5', best: 'e4e5', pvBest: '11. e5 Qc7 12. Nf1 Bd7 13. Bf4 d4',
    pvAfter: '11...gxh5 12. Nh4 Ng6 13. Qxh5 Nxh4 14. gxh4', cpBefore: 58, cpAfter: 0, grade: 'inaccuracy' });
  assert.ok(!/undefended|loses material/.test(text(r)), text(r));
  assert.equal(r.sentences[0], 'Stockfish prefers e5: the pawn on e5 gains space and blunts the bishop on g7.');
  ok('honesty: a pawn the line wins back is not reported as lost');
}

// SAN lines with move numbers, as the reviewed game stores them
assert.deepEqual(T.moves('35...Bxc5+ 36. Nxc5'), ['Bxc5+', 'Nxc5']);
assert.deepEqual(T.moves('22. Ne4 Bb7 23. Bd2'), ['Ne4', 'Bb7', 'Bd2']);
ok('reads engine lines written with move numbers');

console.log(passed + ' passed');
