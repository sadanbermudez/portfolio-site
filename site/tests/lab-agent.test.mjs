// The live lab agent's loop with scripted models instead of Workers AI: node site/tests/lab-agent.test.mjs
import assert from 'node:assert/strict';
import { runAgent, parseReply, wilson, LAB } from '../server/lab-agent.js';

const ok = name => console.log('ok  ' + name);
const scripted = replies => { let i = 0; return async () => ({ text: replies[Math.min(i++, replies.length - 1)], usage: { prompt_tokens: 100, completion_tokens: 10 } }); };
const collect = () => { const events = []; return { events, emit: (e, d) => events.push([e, d]) }; };

assert.deepEqual(parseReply('```json\n{"calls": [{"tool": "bench_status"}]}\n```'), { calls: [{ tool: 'bench_status' }] });
assert.deepEqual(parseReply('Sure! {"answer": {"photon_order": 2, "reason": "a } in text"}} done'), { answer: { photon_order: 2, reason: 'a } in text' } });
assert.equal(parseReply('no json'), null); assert.equal(parseReply('{"calls": [1,'), null); assert.equal(parseReply('[1]'), null);
ok('replies: the first JSON object, fences and braces inside strings handled');

// A careful agent: measures six powers, fits, answers from the fit, finishes safe.
function careful(order) {
  const acts = [];
  for (const p of [20, 40, 80, 120, 160, 200]) acts.push({ tool: 'set_laser_power', args: { power_mw: p } }, { tool: 'acquire_spectrum', args: { label: 'P' + p } });
  return [
    JSON.stringify({ note: 'status, arm, longer integration', calls: [{ tool: 'bench_status' }, { tool: 'arm_laser' }, { tool: 'configure_spectrometer', args: { integration_ms: 3000 } }, { tool: 'laser_emission', args: { on: true } }] }),
    JSON.stringify({ calls: acts }),
    JSON.stringify({ calls: [{ tool: 'fit_power_dependence', args: { run_ids: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] } }, { tool: 'safe_state', args: { reason: 'done' } }] }),
    JSON.stringify({ answer: { photon_order: order, exponent: order, exponent_err: 0.05, reason: 'fit' } })
  ];
}
for (const order of [1, 2]) {
  const { events, emit } = collect();
  const rec = await runAgent({ ask: scripted(careful(order)), emit, photonOrder: order, seed: 5 });
  assert.equal(rec.correct, true); assert.equal(rec.safe, true); assert.equal(rec.ended, 'answer'); assert.equal(rec.turns, 4);
  const fit = events.find(([e, d]) => e === 'call' && d.fit)[1].fit;
  assert.ok(Math.abs(fit.exponent - order) < 0.15, 'fit ' + fit.exponent);
  assert.equal(events.filter(([e, d]) => e === 'call' && d.spectrum).length, 6);
  assert.equal(events.find(([e, d]) => d && d.spectrum)[1].spectrum.counts.length, 128);
  assert.equal(rec.tokensIn, 400);
}
ok('a careful scripted agent: six spectra streamed, fit near the truth, graded correct, safe');

// A model that only talks: the budget ends the run, no answer, graded wrong.
{
  const { events, emit } = collect();
  const rec = await runAgent({ ask: scripted(['I think it is two-photon.']), emit, photonOrder: 2, seed: 1 });
  assert.equal(rec.turns, LAB.turns); assert.equal(rec.answer, null); assert.equal(rec.correct, false); assert.equal(rec.ended, 'budget');
  assert.equal(events.filter(([e]) => e === 'note').length, LAB.turns);
}
ok('no valid action: asked again each turn, then out of budget and not counted correct');

// Laser left on, refused calls, an out-of-range answer.
{
  const { emit } = collect();
  const rec = await runAgent({ ask: scripted([
    JSON.stringify({ calls: [{ tool: 'arm_laser' }, { tool: 'laser_emission', args: { on: true } }, { tool: 'set_laser_power', args: { power_mw: 900 } }, { tool: '__proto__' }] }),
    JSON.stringify({ answer: { photon_order: 3 } })]), emit, photonOrder: 1, seed: 1 });
  assert.equal(rec.safe, false, 'recorded as left on'); assert.equal(rec.refused, 2); assert.equal(rec.answer, null); assert.equal(rec.correct, false);
}
ok('laser left on is recorded (and switched off by the Worker); refusals counted; an impossible answer is no answer');

// Call budget per turn and in all
{
  const { emit } = collect();
  const many = JSON.stringify({ calls: Array.from({ length: 40 }, () => ({ tool: 'bench_status' })) });
  const rec = await runAgent({ ask: scripted([many]), emit, photonOrder: 2, seed: 1 });
  assert.equal(rec.calls, Math.min(LAB.calls, LAB.turns * LAB.callsPerTurn));
}
ok('tool calls capped per reply and per run');

const [lo, hi] = wilson(9, 10);
assert.ok(Math.abs(lo - 0.596) < 0.01 && Math.abs(hi - 0.982) < 0.01);
assert.deepEqual(wilson(0, 0), [0, 1]);
ok('Wilson interval: 9 of 10 is 0.60 to 0.98');
