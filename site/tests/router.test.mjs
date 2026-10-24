// The browser router must decide exactly as Argus's Python router: every routing eval prompt exported with the
// model (data/router-model.js "checks") gets the same route and the same probabilities to within rounding.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {}, TextEncoder, atob: s => Buffer.from(s, 'base64').toString('latin1') };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../data/router-model.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(readFileSync(new URL('../router-core.js', import.meta.url), 'utf8'), ctx);
const { RouterCore, ROUTER_MODEL } = ctx.window;
const model = RouterCore.load(ROUTER_MODEL);

let n = 0;
for (const c of ROUTER_MODEL.checks) {
  const r = RouterCore.route(model, c.text);
  assert.equal(r.route, c.route, c.text.slice(0, 60));
  r.probs.forEach((p, i) => assert.ok(Math.abs(p - c.probs[i]) < 2e-3, `${c.text.slice(0, 40)}: ${p} vs ${c.probs[i]}`));
  n++;
}
assert.ok(n >= 16);
console.log(`ok  the browser router agrees with the Python router on all ${n} routing eval prompts`);
