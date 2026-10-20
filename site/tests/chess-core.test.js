// Rules-module tests, run with `node site/tests/chess-core.test.js`. The positions are the ones
// jarvis-chess's Python tests use, so the browser and the server must agree on them.
const assert = require('node:assert/strict');
global.window = {};
require('../chess-core.js');
const { facts } = window.ChessCore;

const cases = [
  ['undefended knight attacked by a queen is hanging', '4k3/8/8/4n3/8/8/4Q3/4K3 w - - 0 1',
    { hanging_pieces: ['Black knight on e5'], attacked_by_a_cheaper_piece: [] }],
  ['defended knight attacked by a pawn is not hanging', '4k3/8/3p4/4n3/3P4/8/8/4K3 w - - 0 1',
    { hanging_pieces: [], attacked_by_a_cheaper_piece: ['Black knight on e5'] }],
  ['a king is not a cheaper attacker of a defended piece', '8/8/8/8/8/3qk3/3r4/3K4 w - - 0 1',
    { hanging_pieces: [], attacked_by_a_cheaper_piece: [] }],
];
for (const [name, fen, want] of cases) {
  const got = facts(fen);
  for (const key of Object.keys(want)) assert.deepEqual(got[key], want[key], `${name}: ${key}`);
  console.log('ok  ' + name);
}
assert.equal(facts('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').material_white_minus_black, 0);
console.log('ok  start position material is level');
