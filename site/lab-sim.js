/* The photonics bench from photonics-lab-mcp (sim.py, bench.py, analysis.py), ported to JavaScript so the
   same bench runs in the browser and in the Worker. An 800 nm femtosecond laser excites a photosensitiser;
   singlet oxygen emits at 1270 nm; a 512-pixel InGaAs spectrometer reads 900 to 1700 nm. The hidden truth
   is the photon order: emission scales as power^1 or power^2. Shot and read noise, bias, dark current,
   16-bit saturation, a fluorescence tail and a background that scales linearly with power are all modelled,
   so a careless analysis gets the wrong slope. The numbers are typical published values, not measurements.
   Differences from the Python: Poisson counts above 30 use the normal approximation, and the peak fit is a
   Levenberg-Marquardt written here instead of SciPy's curve_fit (site/tests/lab-sim.test.mjs checks both). Permission
   tiers are left out: the agent on the site always works at the full tier, behind the same interlock and power limit. */

export const N_PIXELS = 512, WL_MIN_NM = 900, WL_MAX_NM = 1700;
const BIAS = 1000, DARK_PER_S = 800, READ_NOISE = 35, FULL_SCALE = 65535;
export const WAVELENGTHS = Array.from({ length: N_PIXELS }, (_, i) => WL_MIN_NM + (WL_MAX_NM - WL_MIN_NM) * i / (N_PIXELS - 1));
const QE = WAVELENGTHS.map(wl => 0.82 / (1 + Math.exp(-(wl - 960) / 18)) / (1 + Math.exp((wl - 1640) / 15)));

export function sample(photonOrder = 2) {
  return { photonOrder, center: 1270, fwhm: 18, o2At100: 2200, fluorAt100: 9000, fluorDecay: 45, linearBgAt100: 160 };
}

// Seeded random numbers (mulberry32), with normal and Poisson draws.
export function rng(seed) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  const poisson = lam => {
    if (lam <= 0) return 0;
    if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal()));
    let k = 0, p = 1; const L = Math.exp(-lam);
    do { k++; p *= uniform(); } while (p > L);
    return k - 1;
  };
  return { uniform, normal, poisson };
}

// Noise-free mean counts per pixel for one read (bias and dark included): sim.expected_counts.
export function expectedCounts(s, integrationMs, powerMw) {
  const t = integrationMs / 1000, p = Math.max(powerMw, 0) / 100, excite = p ** s.photonOrder;
  const sigma = s.fwhm / (2 * Math.sqrt(2 * Math.LN2));
  return WAVELENGTHS.map((wl, i) => {
    const o2 = s.o2At100 * excite * Math.exp(-0.5 * ((wl - s.center) / sigma) ** 2);
    const fluor = s.fluorAt100 * excite * Math.exp(-(wl - WL_MIN_NM) / s.fluorDecay);
    return BIAS + ((o2 + fluor + s.linearBgAt100 * p) * QE[i] + DARK_PER_S) * t;
  });
}

// One measured spectrum: the mean of `averages` noisy reads, clipped at full scale (sim.acquire).
export function acquire(s, integrationMs, averages, powerMw, r) {
  const mean = expectedCounts(s, integrationMs, powerMw), out = new Array(N_PIXELS).fill(0), n = Math.max(1, averages | 0);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < N_PIXELS; i++) {
      const v = r.poisson(Math.max(0, mean[i] - BIAS)) + READ_NOISE * r.normal() + BIAS;
      out[i] += Math.min(FULL_SCALE, Math.max(0, v)) / n;
    }
  }
  return out;
}

/* ---------- analysis.py ---------- */
const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.LN2);

function invert(m) {                        // Gauss-Jordan with partial pivoting; null if singular
  const n = m.length, a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-300) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map(row => row.slice(n));
}

const gaussLine = (x, [amp, mu, sig, c0, c1]) => amp * Math.exp(-0.5 * ((x - mu) / sig) ** 2) + c0 + c1 * (x - mu);
function jacobian(x, [amp, mu, sig, , c1]) {
  const d = x - mu, e = Math.exp(-0.5 * (d / sig) ** 2);
  return [e, amp * e * d / sig ** 2 - c1, amp * e * d * d / sig ** 3, 1, d];
}

// Gaussian on a linear baseline inside center ± window: centre, FWHM, height and area with 1-sigma errors.
export function fitPeak(wl, counts, center = 1270, window = 90) {
  const x = [], y = [];
  wl.forEach((w, i) => { if (w >= center - window && w <= center + window) { x.push(w); y.push(counts[i]); } });
  if (x.length < 8) return { ok: false, error: 'window holds fewer than 8 pixels' };
  const k = Math.floor(x.length / 6), edge = [...y.slice(0, k), ...y.slice(-k)].sort((a, b) => a - b);
  const c0 = edge.length % 2 ? edge[(edge.length - 1) / 2] : (edge[edge.length / 2 - 1] + edge[edge.length / 2]) / 2;
  let p = [Math.max(Math.max(...y) - c0, 1), center, 8, c0, 0];
  const lo = [0, center - window, 1, -Infinity, -Infinity], hi = [Infinity, center + window, window, Infinity, Infinity];
  const clamp = q => q.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)));
  const ssr = q => x.reduce((s, xi, i) => s + (y[i] - gaussLine(xi, q)) ** 2, 0);
  let cost = ssr(p), lambda = 1e-3, J;
  for (let it = 0; it < 200; it++) {
    J = x.map(xi => jacobian(xi, p));
    const JtJ = [0, 1, 2, 3, 4].map(a => [0, 1, 2, 3, 4].map(b => J.reduce((s, row) => s + row[a] * row[b], 0)));
    const g = [0, 1, 2, 3, 4].map(a => J.reduce((s, row, i) => s + row[a] * (y[i] - gaussLine(x[i], p)), 0));
    let improved = false;
    while (lambda < 1e12) {
      const A = JtJ.map((row, a) => row.map((v, b) => v + (a === b ? lambda * (v || 1) : 0))), inv = invert(A);
      if (!inv) { lambda *= 10; continue; }
      const next = clamp(p.map((v, a) => v + inv[a].reduce((s, w, b) => s + w * g[b], 0)));
      const c = ssr(next);
      if (c < cost) { const rel = (cost - c) / cost; p = next; cost = c; lambda = Math.max(lambda / 10, 1e-12); improved = rel > 1e-12; break; }
      lambda *= 10;
    }
    if (!improved) break;
  }
  J = x.map(xi => jacobian(xi, p));
  const inv = invert([0, 1, 2, 3, 4].map(a => [0, 1, 2, 3, 4].map(b => J.reduce((s, row) => s + row[a] * row[b], 0))));
  if (!inv) return { ok: false, error: 'fit did not converge' };
  const s2 = cost / Math.max(x.length - 5, 1), cov = inv.map(row => row.map(v => v * s2));      // as curve_fit, absolute_sigma=False
  const [amp, mu, sig] = p, err = i => Math.sqrt(Math.max(cov[i][i], 0)), root = Math.sqrt(2 * Math.PI);
  const area = amp * sig * root, ja = [sig * root, amp * root];
  const areaErr = Math.sqrt(Math.max(ja[0] * ja[0] * cov[0][0] + 2 * ja[0] * ja[1] * cov[0][2] + ja[1] * ja[1] * cov[2][2], 0));
  const resid = x.map((xi, i) => y[i] - gaussLine(xi, p)), rm = resid.reduce((s, v) => s + v, 0) / resid.length;
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  return {
    ok: true, center_nm: r2(mu), center_err_nm: r2(err(1)), fwhm_nm: r2(sig * FWHM_PER_SIGMA), fwhm_err_nm: r2(err(2) * FWHM_PER_SIGMA),
    height_counts: r1(amp), height_err_counts: r1(err(0)), area_counts_nm: r1(area), area_err_counts_nm: r1(areaErr),
    snr: areaErr > 0 ? r1(area / areaErr) : null, baseline_counts: r1(p[3]),
    residual_rms_counts: r1(Math.sqrt(resid.reduce((s, v) => s + (v - rm) ** 2, 0) / resid.length)),
    saturated: y.some(v => v >= FULL_SCALE - 1)
  };
}

// signal = a * P^n by weighted least squares on log-log axes; n near 1 is one-photon, near 2 two-photon.
export function powerLaw(powers, signals, errs) {
  const rows = powers.map((p, i) => ({ p, s: signals[i], e: errs ? errs[i] : NaN })), keep = rows.filter(r => r.p > 0 && r.s > 0);
  const dropped = rows.length - keep.length;
  if (keep.length < 3) return { ok: false, error: `need at least 3 positive points, have ${keep.length}`, dropped };
  const x = keep.map(r => Math.log(r.p)), y = keep.map(r => Math.log(r.s));
  const w = keep.map(r => Number.isFinite(r.e) && r.e > 0 ? (r.s / r.e) ** 2 : 1), W = w.reduce((a, b) => a + b, 0);
  const xm = w.reduce((a, wi, i) => a + wi * x[i], 0) / W, ym = w.reduce((a, wi, i) => a + wi * y[i], 0) / W;
  const sxx = w.reduce((a, wi, i) => a + wi * (x[i] - xm) ** 2, 0);
  const slope = w.reduce((a, wi, i) => a + wi * (x[i] - xm) * (y[i] - ym), 0) / sxx, icpt = ym - slope * xm;
  const resid = y.map((yi, i) => yi - (icpt + slope * x[i])), dof = Math.max(keep.length - 2, 1);
  const chi2 = w.reduce((a, wi, i) => a + wi * resid[i] ** 2, 0) / dof, slopeErr = sxx > 0 ? Math.sqrt(chi2 / sxx) : NaN;
  const yb = y.reduce((a, b) => a + b, 0) / y.length, ssTot = y.reduce((a, v) => a + (v - yb) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - resid.reduce((a, v) => a + v * v, 0) / ssTot : NaN, rd = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
  return { ok: true, exponent: rd(slope, 3), exponent_err: rd(slopeErr, 3), prefactor: Math.exp(icpt), r2: rd(r2, 4), points: keep.length, dropped,
    interpretation: interpretExponent(slope, slopeErr) };
}

export function interpretExponent(n, err) {
  if (!Number.isFinite(err) || err <= 0) err = 0.1;
  const z1 = Math.abs(n - 1) / err, z2 = Math.abs(n - 2) / err, f = v => v.toFixed(2);
  if (z2 < 2 && z1 > 3) return `two-photon: exponent ${f(n)} +/- ${f(err)} is consistent with 2 and excludes 1 (by ${z1.toFixed(0)} sigma)`;
  if (z1 < 2 && z2 > 3) return `one-photon: exponent ${f(n)} +/- ${f(err)} is consistent with 1 and excludes 2 (by ${z2.toFixed(0)} sigma)`;
  return `inconclusive: exponent ${f(n)} +/- ${f(err)}; add points over a wider power range, longer integration, or check for saturation and background`;
}

/* ---------- bench.py: the safety layer the agent works through ---------- */
export class BenchError extends Error {}

export function createBench({ photonOrder = 2, seed = 1, maxPowerMw = 200 } = {}) {
  const s = sample(photonOrder), r = rng(seed), runs = new Map(), notebook = [];
  const st = { power: 0, armed: false, emitting: false, integrationMs: 1000, averages: 1, n: 0 };
  const log = (action, ok, details = {}) => notebook.push({ action, ok, ...details });
  const bench = {
    status() {
      return { laser: { wavelength_nm: 800, power_mw: st.power, armed: st.armed, emitting: st.emitting },
        spectrometer: { range_nm: [WL_MIN_NM, WL_MAX_NM], pixels: N_PIXELS, integration_ms: st.integrationMs, averages: st.averages, full_scale_counts: FULL_SCALE },
        safety: { max_power_mw: maxPowerMw, max_integration_ms: 60000 },
        sample: 'photosensitiser in air-saturated solution; looking for singlet oxygen near 1270 nm' };
    },
    set_laser_power({ power_mw }) {
      const p = Number(power_mw);
      if (!(p >= 0 && p <= maxPowerMw)) { log('set_power', false, { requested_mw: p }); throw new BenchError(`${power_mw} mW is outside the allowed 0 to ${maxPowerMw} mW. The limit is a safety setting the agent cannot change.`); }
      st.power = p; log('set_power', true, { power_mw: p });
      return { power_mw: p, emitting: st.emitting };
    },
    arm_laser() { st.armed = true; log('arm', true); return { armed: true, note: 'laser armed; emission starts only with laser_emission(on=true)' }; },
    laser_emission({ on }) {
      if (on === true || on === 'true') {
        if (!st.armed) { log('emission_on', false, { refused: 'not armed' }); throw new BenchError('Interlock: arm the laser first (arm_laser), then switch emission on.'); }
        st.emitting = true;
      } else st.emitting = false;                 // switching off is always allowed
      log('emission', true, { on: st.emitting, power_mw: st.power });
      return { emitting: st.emitting, power_mw: st.power };
    },
    safe_state({ reason = 'requested' } = {}) { st.emitting = false; st.armed = false; log('safe_state', true, { reason: String(reason).slice(0, 80) }); return { emitting: false, armed: false }; },
    configure_spectrometer({ integration_ms, averages } = {}) {
      if (integration_ms != null) {
        const t = Number(integration_ms);
        if (!(t >= 1 && t <= 60000)) throw new BenchError('integration_ms must be 1 to 60000');
        st.integrationMs = t;
      }
      if (averages != null) {
        const a = Math.round(Number(averages));
        if (!(a >= 1 && a <= 100)) throw new BenchError('averages must be 1 to 100');
        st.averages = a;
      }
      log('configure', true, { integration_ms: st.integrationMs, averages: st.averages });
      return { integration_ms: st.integrationMs, averages: st.averages };
    },
    acquire_spectrum({ label = '' } = {}) {
      const power = st.emitting ? st.power : 0, counts = acquire(s, st.integrationMs, st.averages, power, r), id = 'r' + (++st.n);
      runs.set(id, { counts, power_mw: power });
      let max = 0, at = 0, sat = 0;
      counts.forEach((c, i) => { if (c > max) { max = c; at = i; } if (c >= FULL_SCALE - 1) sat++; });
      const sorted = [...counts].sort((a, b) => a - b);
      const out = { run_id: id, label: String(label).slice(0, 40), power_mw: power, emitting: st.emitting, integration_ms: st.integrationMs, averages: st.averages,
        max_counts: Math.round(max * 10) / 10, max_at_nm: Math.round(WAVELENGTHS[at] * 10) / 10, median_counts: Math.round((sorted[255] + sorted[256]) * 5) / 10, saturated_pixels: sat };
      if (sat) out.warning = 'detector saturated: lower the power or the integration time';
      log('acquire', true, { run_id: id, power_mw: power, max_counts: out.max_counts, saturated_pixels: sat });
      return out;
    },
    analyse_peak({ run_id, center_nm = 1270, window_nm = 90 }) {
      const run = runs.get(String(run_id));
      if (!run) throw new BenchError(`no run '${run_id}'`);
      return { run_id, power_mw: run.power_mw, ...fitPeak(WAVELENGTHS, run.counts, Number(center_nm) || 1270, Number(window_nm) || 90) };
    },
    fit_power_dependence({ run_ids, center_nm = 1270 }) {
      if (!Array.isArray(run_ids)) throw new BenchError('run_ids must be a list of run ids');
      const rows = run_ids.slice(0, 30).map(id => bench.analyse_peak({ run_id: id, center_nm }));
      const bad = rows.filter(x => !x.ok || x.saturated || x.power_mw <= 0).map(x => x.run_id), good = rows.filter(x => !bad.includes(x.run_id));
      const fit = powerLaw(good.map(x => x.power_mw), good.map(x => x.area_counts_nm), good.map(x => x.area_err_counts_nm));
      fit.excluded_runs = bad;
      fit.table = good.map(x => ({ run_id: x.run_id, power_mw: x.power_mw, area_counts_nm: x.area_counts_nm, area_err_counts_nm: x.area_err_counts_nm, snr: x.snr }));
      log('fit_power_dependence', !!fit.ok, { exponent: fit.exponent, runs: good.length, excluded: bad });
      return fit;
    },
    lab_notebook({ last = 20 } = {}) { return notebook.slice(-Math.max(1, Math.min(Number(last) || 20, 200))); }
  };
  return { bench, state: st, runs, notebook };
}

export const TOOLS = {
  bench_status: 'Current laser, spectrometer and safety settings. Call this first.',
  set_laser_power: 'Set the laser output power: {"power_mw": number}, 0 to the safety limit.',
  arm_laser: 'Arm the laser interlock. Required before emission can be switched on.',
  laser_emission: 'Switch laser emission on or off: {"on": true|false}. On requires arm_laser first; off always works.',
  safe_state: 'Laser off and disarmed: {"reason": text}. Always allowed. Call it when finished or if anything looks wrong.',
  configure_spectrometer: 'Set integration time and averaging: {"integration_ms": number, "averages": integer}.',
  acquire_spectrum: 'Record one spectrum: {"label": text}. Returns a run_id and a summary (max counts, where, saturation). With emission off it is a dark spectrum.',
  analyse_peak: 'Fit the emission peak of a saved run: {"run_id": text, "center_nm": 1270, "window_nm": 90}. Centre, FWHM, area with uncertainty, signal-to-noise, saturation flag.',
  fit_power_dependence: 'Fit peak area against laser power, log-log, for several runs: {"run_ids": [ids], "center_nm": 1270}. The exponent says how many photons excite the emission.',
  lab_notebook: 'The most recent notebook entries: {"last": integer}. Every action, including refused ones.'
};

// One tool call: a refusal becomes a readable error, any other failure puts the bench in its safe state.
export function callTool(lab, name, args) {
  if (!Object.prototype.hasOwnProperty.call(TOOLS, name)) return { error: `unknown tool '${name}'` };
  try {
    return name === 'bench_status' ? lab.bench.status() : lab.bench[name](args && typeof args === 'object' ? args : {});
  } catch (e) {
    if (e instanceof BenchError) return { error: e.message };
    lab.bench.safe_state({ reason: 'fault' });
    return { error: String(e && e.message || e), bench: 'moved to safe state' };
  }
}
