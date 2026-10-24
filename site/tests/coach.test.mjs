// "Ask Jarvis" chess coach: input cleaning, and the checker that removes sentences naming moves, squares or
// evaluations that are not in the facts.
import assert from 'node:assert/strict';
import { buildCoachMessages, checkCoach, cleanCoachInput } from '../server/coach.js';

const base = {
  fen: 'r2qr1k1/5ppp/p4n2/1pbPnbB1/8/N1N2B2/PP1Q1PPP/3R1RK1 b - - 1 16', played: 'Nd3', best: 'Qd6', side: 'Black',
  line: ['Qd6', 'Be2', 'Rad8'], evalBefore: '-0.44', evalAfter: '-0.08',
  ideas: ['Nd3 gives Black a knight deep in the enemy camp on d3, where no enemy pawn can ever attack it.'], title: 'The octopus knight',
};

const f = cleanCoachInput(base);
assert.ok(f, 'a well-formed request is accepted');
assert.equal(cleanCoachInput({ ...base, fen: 'not a fen' }), null);
assert.equal(cleanCoachInput({ ...base, played: 'Nd3; DROP TABLE' }), null);
assert.equal(cleanCoachInput({ ...base, evalBefore: 'winning' }).evalBefore, '', 'free-text evaluations are dropped');
console.log('ok  coach input: malformed positions and moves refused, free-text evaluations dropped');

const msgs = buildCoachMessages(f);
assert.match(msgs[1].content, /Strategic fact found by the rules: Nd3 gives Black/);
assert.match(msgs[1].content, /The engine preferred Qd6\./);
console.log('ok  coach prompt carries only the facts');

const good = 'Kasparov puts the knight on d3, deep in White\'s camp. No white pawn can ever attack it there. The engine still slightly preferred Qd6.';
let r = checkCoach(good, f);
assert.equal(r.kept.length, 3); assert.equal(r.removed.length, 0);
const bad = 'The knight lands on d3. Next comes Nxf2 winning a pawn. Black is now +2.50 better. It controls e1 and c1.';
r = checkCoach(bad, f);
assert.deepEqual(r.kept, ['The knight lands on d3.']);
assert.deepEqual(r.removed.map(x => x.unsupported), [['Nxf2'], ['2.50'], ['e1', 'c1']]);
console.log('ok  checker keeps sentences grounded in the facts and removes invented moves, squares and evaluations');

r = checkCoach('<think>hidden</think>A quiet move that improves the knight.', f);
assert.deepEqual(r.kept, ['A quiet move that improves the knight.']);
console.log('ok  sentences without chess claims pass; hidden reasoning is stripped');
