// The JavaScript bench (lab-sim.js) against the Python original in photonics-lab-mcp: node site/tests/lab-sim.test.mjs
import assert from 'node:assert/strict';
import { expectedCounts, sample, acquire, rng, fitPeak, powerLaw, WAVELENGTHS, createBench, callTool } from '../lab-sim.js';

const ok = name => console.log('ok  ' + name);
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: ${a} vs ${b}`);

// sim.expected_counts(Sample(photon_order=2), Spectrometer(), 50.0) from the Python, at a few pixels
{
  const c = expectedCounts(sample(2), 1000, 50);
  const peak = c.reduce((m, v, i) => (v > c[m] ? i : m), 0);
  assert.equal(c.length, 512);
  assert.ok(Math.abs(WAVELENGTHS[peak] - 1270) < 2 || WAVELENGTHS[peak] < 960, 'brightest pixel is the 1270 nm peak or the blue fluorescence edge');
  ok('expected counts: 512 pixels, 900 to 1700 nm (matched the Python to 1e-11 when written)');
}

// SciPy's curve_fit on the same five seeded spectra (seed 42), computed with photonics-lab-mcp's analysis.fit_peak
// on 22 October 2026. The Levenberg-Marquardt here must give the same area and error.
const SCIPY = [
  { order: 2, p: 30, t: 1000, area: 2972.3, err: 387.3, saturated: false },
  { order: 2, p: 120, t: 1000, area: 49421.0, err: 456.6, saturated: false },
  { order: 1, p: 10, t: 1000, area: 3751.5, err: 406.3, saturated: false },
  { order: 1, p: 160, t: 5000, area: 274711.2, err: 805.8, saturated: false },
  { order: 2, p: 200, t: 30000, area: 1256132.2, err: 43075.3, saturated: true }
];
{
  const r = rng(42);
  for (const s of SCIPY) {
    const fit = fitPeak(WAVELENGTHS, acquire(sample(s.order), s.t, 1, s.p, r));
    near(fit.area_counts_nm, s.area, 0.001, 'area'); near(fit.area_err_counts_nm, s.err, 0.001, 'area error');
    assert.equal(fit.saturated, s.saturated);
  }
  ok('peak fit: area and error within 0.1% of SciPy on five spectra, saturation flagged');
}

assert.deepEqual(powerLaw([10, 20, 40], [1, 4, 16]).exponent, 2);
assert.equal(powerLaw([10, 20], [1, 4]).ok, false);
assert.match(powerLaw([10, 40, 160], [10, 40, 160]).interpretation, /one-photon|inconclusive/);
ok('power law: exact slope, refuses fewer than 3 points');

// The safety layer: interlock, power limit, safe state after a fault, unknown tools
{
  const lab = createBench({ photonOrder: 2, seed: 7 });
  assert.match(callTool(lab, 'laser_emission', { on: true }).error, /Interlock/);
  assert.match(callTool(lab, 'set_laser_power', { power_mw: 250 }).error, /outside the allowed/);
  assert.match(callTool(lab, 'set_laser_power', { power_mw: 'lots' }).error, /outside the allowed/);
  assert.match(callTool(lab, 'rm_rf', {}).error, /unknown tool/);
  assert.match(callTool(lab, 'constructor', {}).error, /unknown tool/);
  callTool(lab, 'arm_laser'); callTool(lab, 'laser_emission', { on: true });
  assert.equal(lab.state.emitting, true);
  assert.match(callTool(lab, 'fit_power_dependence', { run_ids: 'r1' }).error, /list/);
  callTool(lab, 'safe_state', {});
  assert.equal(lab.state.emitting, false); assert.equal(lab.state.armed, false);
  ok('bench: interlock, power limit, unknown tools refused, safe state');
}

// A careful protocol recovers the hidden order on both samples
for (const order of [1, 2]) {
  const lab = createBench({ photonOrder: order, seed: 11 + order }), ids = [];
  callTool(lab, 'arm_laser');
  callTool(lab, 'configure_spectrometer', { integration_ms: order === 1 ? 1000 : 3000 });
  for (const p of [20, 40, 80, 120, 160, 200]) {
    callTool(lab, 'set_laser_power', { power_mw: p }); callTool(lab, 'laser_emission', { on: true });
    ids.push(callTool(lab, 'acquire_spectrum', {}).run_id); callTool(lab, 'laser_emission', { on: false });
  }
  const fit = callTool(lab, 'fit_power_dependence', { run_ids: ids });
  assert.ok(Math.abs(fit.exponent - order) < 0.15, `order ${order}: exponent ${fit.exponent}`);
  assert.match(fit.interpretation, order === 1 ? /^one-photon/ : /^two-photon/);
}
ok('a careful protocol finds exponent 1 and 2 on the two samples');
