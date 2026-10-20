/* The demo's world: fictional companies, simulated indices and seeded OHLCV, all generated here
   from fixed seeds (java.util.Random, as the app's screen generator uses). Nothing is downloaded.
   Pure module (no DOM), so the tests can import it. */
import {
  JavaRandom, walk, analyze, SeriesBuilder, regimeTimeline, regional, Indicators as I, autoLists, plusDays, plusSessions, dayOfWeek,
  CONFIG, MARKETS, methodTrades, regimeOf,
} from './engine.js';

export const TODAY = '2026-10-16';
export const CAPITAL = 10000;
export const RISK = 0.005;
/** Euros per dollar, fixed for the demo. */
export const EUR_PER_USD = 1 / 1.09;

const SESSIONS = 504; // the two years the evening scan keeps

/** Weekday dates ending on [end], [n] of them. */
function weekdaysTo(end, n) {
  const out = [];
  let d = end;
  while (out.length < n) { if (dayOfWeek(d) < 6) out.push(d); d = plusDays(d, -1); }
  return out.reverse();
}

/**
 * A walk that follows a path: [legs] are [sessions, price factor at the end, volume factor]. The
 * noise is mean-reverting around the path, so the drawn shape survives; OHLC and volume are made
 * as walk() makes them.
 */
function shaped(seed, start, legs, { noise = 0.012, range = 0.014, vol = 1.0, baseVolume = 1500000, n = SESSIONS } = {}) {
  const rnd = new JavaRandom(seed);
  const path = [], vmul = [];
  let p = start;
  for (const [len, factor, v = 1] of legs) {
    const from = p, to = start * factor;
    for (let i = 1; i <= len; i++) { path.push(from * (to / from) ** (i / len)); vmul.push(v); }
    p = to;
  }
  while (path.length < n) { path.unshift(path[0]); vmul.unshift(1); }
  const tail = path.slice(-n), vt = vmul.slice(-n);
  const dates = weekdaysTo(TODAY, n);
  const bars = [];
  let dev = 0, prev = tail[0];
  for (let i = 0; i < n; i++) {
    dev = 0.82 * dev + noise * rnd.nextGaussian();
    const close = tail[i] * Math.exp(dev);
    const r = close / prev - 1;
    const open = prev * (1 + noise / 3 * rnd.nextGaussian());
    const high = Math.max(open, close) * (1 + Math.abs(rnd.nextGaussian()) * range);
    const low = Math.min(open, close) * (1 - Math.abs(rnd.nextGaussian()) * range);
    const volume = Math.trunc(baseVolume * vol * vt[i] * Math.exp(0.3 * rnd.nextGaussian()) * (r > 0.015 ? 1.6 : r < -0.015 ? 1.3 : 1));
    bars.push({ date: dates[i], open, high, low, close, volume });
    prev = close;
  }
  return bars;
}

/** Replaces the last [k] bars by a handle drifting down and a breakout through its pivot on [ratio]× volume. */
function breakoutTail(bars, { ratio = 2.6, above = 0.018, agoDays = 0, quietAfter = 0.9 }) {
  const out = bars.map((b) => ({ ...b }));
  const t = out.length - 1 - agoDays;
  const avg = I.averageVolumeBefore(out, t, 50);
  // The pivot as the strategy will find it: the handle's high plus the buffer; place the bar above it.
  const recentHigh = I.highest(out, t - 12, t - 1);
  const close = recentHigh * (1 + above);
  out[t] = { date: out[t].date, open: out[t - 1].close * 1.004, high: close * 1.006, low: out[t - 1].close * 0.998, close, volume: Math.trunc(avg * ratio) };
  for (let i = t + 1; i < out.length; i++) {
    const c = out[i - 1].close * (1 + 0.004 * ((i % 3) - 0.6));
    out[i] = { date: out[i].date, open: out[i - 1].close, high: Math.max(c, out[i - 1].close) * 1.006, low: Math.min(c, out[i - 1].close) * 0.994, close: c, volume: Math.trunc(avg * quietAfter) };
  }
  return out;
}

// ---------- companies (all fictional) ----------

const SECTOR = {
  TECHNOLOGY: 'Tecnología', COMMUNICATION: 'Comunicación', CONSUMER_DISCRETIONARY: 'Consumo discrecional', CONSUMER_STAPLES: 'Consumo básico',
  HEALTH_CARE: 'Salud', FINANCIALS: 'Financiero', INDUSTRIALS: 'Industria', ENERGY: 'Energía', MATERIALS: 'Materiales', UTILITIES: 'Servicios públicos',
};
export { SECTOR };

// [symbol, name, market, sector, kind, seed, options]
const COMPANIES = [
  ['EJSEM', 'Ejemplo Semiconductores', 'US', 'TECHNOLOGY', 'cupBreakout', 101, { start: 42 }],
  ['EJROB', 'Ejemplo Robótica', 'US', 'INDUSTRIALS', 'darvasBreakout', 102, { start: 31 }],
  ['EJNUB.MC', 'Ejemplo Nube Ibérica', 'SPAIN', 'TECHNOLOGY', 'cupBreakout2', 103, { start: 18 }],
  ['EJCIB', 'Ejemplo Ciberseguridad', 'US', 'TECHNOLOGY', 'nearPivot', 104, { start: 55 }],
  ['EJPAG', 'Ejemplo Pagos', 'US', 'FINANCIALS', 'noVolume', 105, { start: 48 }],
  ['EJBIO', 'Ejemplo Biotecnología', 'US', 'HEALTH_CARE', 'earnings', 106, { start: 26 }],
  ['EJSAT.DE', 'Ejemplo Satélites', 'GERMANY', 'INDUSTRIALS', 'nearPivot', 107, { start: 64 }],
  ['EJDEF.DE', 'Ejemplo Defensa', 'GERMANY', 'INDUSTRIALS', 'extended', 108, { start: 70, ago: 12 }],
  ['EJSOL', 'Ejemplo Energía Solar', 'US', 'UTILITIES', 'extended', 109, { start: 22, ago: 15 }],
  ['EJVID', 'Ejemplo Videojuegos', 'US', 'COMMUNICATION', 'failed', 110, { start: 37, ago: 40 }],
  ['EJBAN.MC', 'Ejemplo Banco Ibérico', 'SPAIN', 'FINANCIALS', 'midBase', 111, { start: 7 }],
  ['EJLUJ.PA', 'Ejemplo Lujo', 'FRANCE', 'CONSUMER_DISCRETIONARY', 'midBase', 112, { start: 160 }],
  ['EJFAR', 'Ejemplo Farmacéutica', 'US', 'HEALTH_CARE', 'flat', 113, { start: 75 }],
  ['EJAER.PA', 'Ejemplo Aerolíneas', 'FRANCE', 'INDUSTRIALS', 'down', 114, { start: 21 }],
  ['EJAUT.DE', 'Ejemplo Automoción', 'GERMANY', 'CONSUMER_DISCRETIONARY', 'down', 115, { start: 58 }],
  ['EJQUI.DE', 'Ejemplo Química', 'GERMANY', 'MATERIALS', 'down', 116, { start: 90 }],
  ['EJTEL.MC', 'Ejemplo Telecom', 'SPAIN', 'COMMUNICATION', 'flat', 117, { start: 4.2 }],
  ['EJELE.MC', 'Ejemplo Eléctrica', 'SPAIN', 'UTILITIES', 'walk', 118, {}],
  ['EJCON.MC', 'Ejemplo Construcción', 'SPAIN', 'INDUSTRIALS', 'walk', 119, {}],
  ['EJMOD.MC', 'Ejemplo Moda', 'SPAIN', 'CONSUMER_DISCRETIONARY', 'walk', 120, {}],
  ['EJSEG.PA', 'Ejemplo Seguros', 'FRANCE', 'FINANCIALS', 'walk', 121, {}],
  ['EJALI.PA', 'Ejemplo Alimentación', 'FRANCE', 'CONSUMER_STAPLES', 'walk', 122, {}],
  ['EJPET', 'Ejemplo Petróleo', 'US', 'ENERGY', 'walk', 123, {}],
  ['EJLOG', 'Ejemplo Logística', 'US', 'INDUSTRIALS', 'walk', 124, {}],
  ['EJMIN', 'Ejemplo Minería', 'US', 'MATERIALS', 'walk', 125, {}],
  ['EJSOF', 'Ejemplo Software', 'US', 'TECHNOLOGY', 'uptrendNoBase', 126, { start: 40 }],
  ['EJHOT', 'Ejemplo Hoteles', 'US', 'CONSUMER_DISCRETIONARY', 'walk', 127, {}],
  ['EJCER', 'Ejemplo Cervezas', 'US', 'CONSUMER_STAPLES', 'walk', 128, {}],
];

function seriesFor(kind, seed, o) {
  const s = o.start ?? 50;
  switch (kind) {
    // A year-long advance, an 18 % cup over 12 weeks, a dry handle, and today's breakout with PAVA.
    case 'cupBreakout': return breakoutTail(shaped(seed, s, [[150, 1.0], [170, 2.4], [30, 2.0, 0.9], [32, 2.38, 1.0], [10, 2.24, 0.55], [1, 2.24]], { noise: 0.008 }), { ratio: 2.7 });
    case 'cupBreakout2': return breakoutTail(shaped(seed, s, [[160, 1.0], [160, 2.0], [28, 1.7, 0.9], [30, 1.98, 1.0], [9, 1.88, 0.55], [3, 1.88]], { noise: 0.008, baseVolume: 2500000 }), { ratio: 2.2, agoDays: 2 });
    // A steady rise to a 52-week high, a box under it and the breakout.
    case 'darvasBreakout': return breakoutTail(shaped(seed, s, [[200, 1.0], [270, 2.3], [8, 2.13, 0.7], [8, 2.24, 0.7], [8, 2.15, 0.6], [1, 2.2]], { noise: 0.006 }), { ratio: 2.1, above: 0.012 });
    case 'nearPivot': return shaped(seed, s, [[150, 1.0], [170, 2.1], [30, 1.78, 0.9], [32, 2.08, 1.0], [8, 1.95, 0.5], [4, 2.03, 0.5]], { noise: 0.007 });
    case 'noVolume': return breakoutTail(shaped(seed, s, [[150, 1.0], [170, 2.2], [30, 1.85, 0.9], [32, 2.17, 1.0], [10, 2.04, 0.55], [1, 2.04]], { noise: 0.007 }), { ratio: 1.15 });
    case 'earnings': return breakoutTail(shaped(seed, s, [[150, 1.0], [170, 2.5], [30, 2.1, 0.9], [32, 2.47, 1.0], [10, 2.33, 0.55], [1, 2.33]], { noise: 0.008 }), { ratio: 2.4 });
    // Broke out [ago] sessions back and ran: too far above the pivot to buy now.
    case 'extended': return shaped(seed, s, [[120, 1.0], [150, 1.9], [30, 1.62, 0.9], [30, 1.88, 1.0], [10, 1.8, 0.55], [2, 1.95, 2.6], [o.ago - 2, 2.55, 1.3]], { noise: 0.007 });
    case 'failed': return shaped(seed, s, [[120, 1.0], [150, 1.9], [30, 1.62, 0.9], [30, 1.88, 1.0], [10, 1.8, 0.55], [2, 1.94, 2.4], [8, 1.7, 1.4], [o.ago - 10, 1.45, 1.1]], { noise: 0.008 });
    case 'midBase': return shaped(seed, s, [[150, 1.0], [170, 1.9], [40, 1.55, 0.9], [20, 1.7, 0.9]], { noise: 0.009 });
    case 'flat': return shaped(seed, s, [[504, 1.03]], { noise: 0.012 });
    case 'down': return shaped(seed, s, [[200, 1.1], [304, 0.62]], { noise: 0.013 });
    case 'uptrendNoBase': return shaped(seed, s, [[200, 1.0], [304, 2.1]], { noise: 0.02 });
    default: { const rnd = new JavaRandom(seed); return walk(rnd, 0.0002 + 0.0007 * rnd.nextDouble(), 0.012 + 0.012 * rnd.nextDouble(), plusDays(TODAY, -735), TODAY).slice(-SESSIONS); }
  }
}

// ---------- indices ----------

/**
 * An index: daily returns around a path, on volume that falls on down days, except on the
 * sessions picked to be distribution days ([dd] of them in the last 25). The state each index
 * ends in is not set by hand: the real state machine reads it from these bars.
 */
function indexSeries(seed, level, legs, dd, n = 520) {
  const rnd = new JavaRandom(seed);
  const path = [];
  let p = 1;
  for (const [len, factor] of legs) { const from = p; for (let i = 1; i <= len; i++) path.push(from * (factor / from) ** (i / len)); p = factor; }
  while (path.length < n) path.unshift(path[0]);
  const tail = path.slice(-n);
  const dates = weekdaysTo(TODAY, n);
  const ddAt = new Set();
  for (let k = 0; ddAt.size < dd && k < 200; k++) ddAt.add(n - 2 - Math.floor(rnd.nextDouble() * 23));
  const bars = [];
  let c = level * tail[0], v = 3e9, dev = 0;
  for (let i = 0; i < n; i++) {
    const prev = c;
    dev = 0.7 * dev + 0.0045 * rnd.nextGaussian();
    const target = level * tail[i] * Math.exp(dev);
    let r = target / prev - 1;
    const thrust = !ddAt.has(i) && rnd.nextDouble() < 0.03;
    if (ddAt.has(i)) r = -0.004 - 0.006 * rnd.nextDouble();
    else if (thrust) r = 0.013 + 0.008 * rnd.nextDouble();
    c = prev * (1 + r);
    v = ddAt.has(i) || thrust ? v * 1.25 : r < 0 ? v * (0.9 + 0.05 * rnd.nextDouble()) : 3e9 * (0.95 + 0.15 * rnd.nextDouble());
    const open = prev * (1 + 0.002 * rnd.nextGaussian());
    bars.push({ date: dates[i], open, high: Math.max(open, c) * (1 + 0.004 * Math.abs(rnd.nextGaussian())), low: Math.min(open, c) * (1 - 0.004 * Math.abs(rnd.nextGaussian())), close: c, volume: Math.trunc(v) });
  }
  return bars;
}

const INDICES = {
  IDX_US: ['Índice EE. UU.', 201, 4800, [[200, 1.0], [250, 1.28], [30, 1.33], [24, 1.37]], 1],
  IDX_TECH: ['Índice tecnológico EE. UU.', 202, 15200, [[200, 1.0], [250, 1.36], [30, 1.41], [24, 1.46]], 2],
  IDX_EU: ['Índice Europa', 203, 510, [[200, 1.0], [260, 1.17], [24, 1.19], [20, 1.21]], 1],
  IDX_ES: ['Índice España', 204, 11800, [[200, 1.0], [270, 1.24], [34, 1.29]], 2],
  IDX_DE: ['Índice Alemania', 205, 18600, [[200, 1.0], [250, 1.14], [34, 1.13], [20, 1.12]], 5],
  IDX_FR: ['Índice Francia', 206, 7600, [[200, 1.0], [250, 1.12], [30, 1.0], [24, 0.94]], 2],
};

export const REGIONS = [
  { key: 'US', label: 'EE. UU.', flag: 'us', indices: ['IDX_US', 'IDX_TECH'], name: 'Mercado EE. UU.' },
  { key: 'SPAIN', label: 'España', flag: 'es', indices: ['IDX_EU', 'IDX_ES'], name: 'Europa (Índice Europa + Índice España)' },
  { key: 'GERMANY', label: 'Alemania', flag: 'de', indices: ['IDX_EU', 'IDX_DE'], name: 'Europa (Índice Europa + Índice Alemania)' },
  { key: 'FRANCE', label: 'Francia', flag: 'fr', indices: ['IDX_EU', 'IDX_FR'], name: 'Europa (Índice Europa + Índice Francia)' },
];

// ---------- the world, built once ----------

let world = null;

export function buildWorld() {
  if (world) return world;
  const indices = {};
  for (const [sym, [name, seed, level, legs, dd]] of Object.entries(INDICES)) {
    indices[sym] = { symbol: sym, name, bars: indexSeries(seed, level, legs, dd) };
  }
  const indexStates = {};
  for (const [sym, ix] of Object.entries(indices)) {
    const tl = regimeTimeline(ix.bars);
    ix.timeline = tl;
    indexStates[sym] = tl.at(-1);
  }
  const regimes = {};
  for (const r of REGIONS) regimes[r.key] = regional(r.name, r.indices.map((s) => [indices[s].name, indexStates[s]]));

  // RS universe: the visible stocks plus the rest of each region's full index, as the app ranks them.
  const hidden = { US: [], EUROPE: [] };
  const hr = new JavaRandom(11);
  for (let i = 0; i < 160; i++) {
    const region = i % 3 === 0 ? 'EUROPE' : 'US';
    const b = walk(hr, 0.0002 + 0.0009 * hr.nextDouble(), 0.012 + 0.016 * hr.nextDouble(), plusDays(TODAY, -400), TODAY);
    const s = I.rsScore(b.map((x) => x.close));
    if (s != null) hidden[region].push(s);
  }

  const stocks = COMPANIES.map(([symbol, name, market, sector, kind, seed, o]) => {
    const bars = seriesFor(kind, seed, o);
    return { instrument: { symbol, name, market }, sector, kind, bars, rsScore: I.rsScore(bars.map((b) => b.close)) };
  });
  const scores = { US: hidden.US.slice(), EUROPE: hidden.EUROPE.slice() };
  for (const s of stocks) if (s.rsScore != null) scores[MARKETS[s.instrument.market].region].push(s.rsScore);
  for (const s of stocks) s.rsRating = s.rsScore == null ? null : I.rsRating(s.rsScore, scores[MARKETS[s.instrument.market].region]);

  const earningsKind = { earnings: 4 };
  const rows = stocks.map((s) => {
    const m = MARKETS[s.instrument.market];
    const ctx = contextFor(s, indices, regimes);
    if (earningsKind[s.kind]) ctx.nextEarnings = plusSessions(TODAY, earningsKind[s.kind]);
    else if (m.region === 'US') ctx.nextEarnings = plusSessions(TODAY, 18 + (s.instrument.symbol.charCodeAt(2) % 20));
    s.ctx = ctx;
    const a = analyze(s.instrument, s.bars, ctx);
    const prev = analyze(s.instrument, s.bars.slice(0, -1), ctx);
    const last = s.bars.at(-1), before = s.bars.at(-2);
    const traded = (I.sma(s.bars.map((b) => b.close * b.volume), 50) || 0) * (m.currency === 'USD' ? EUR_PER_USD : 1);
    return {
      ...s, analysis: a, previous: prev.verdict, lists: autoLists(a, s.bars, prev.verdict),
      changePct: last.close / before.close - 1, tradedValue: traded,
    };
  });
  const order = { APPROVED: 0, WATCH: 1, REJECTED: 2 };
  rows.sort((x, y) => order[x.analysis.verdict] - order[y.analysis.verdict] || (y.analysis.score ?? -1) - (x.analysis.score ?? -1) || (y.rsRating ?? 0) - (x.rsRating ?? 0));
  world = { indices, regimes, rows, today: TODAY };
  return world;
}

export function contextFor(s, indices, regimes) {
  const m = MARKETS[s.instrument.market];
  const local = indices[m.localIndex];
  return {
    rsRating: s.rsRating, rsUniverse: m.region === 'US' ? 'EE. UU.' : 'Europa', rsIndex: local.bars, rsIndexName: local.name,
    regime: regimes[s.instrument.market], passiveIndex: local.bars, passiveIndexName: local.name,
  };
}

// ---------- the regime step-through: a practice index scripted to go round the whole machine ----------

export function practiceIndex() {
  const bars = [];
  const dates = weekdaysTo('2026-09-30', 300);
  let c = 1000, v = 2.0e9;
  const push = (ret, vol, { clv = 0.6, range = 0.009 } = {}) => {
    const prev = c;
    c = prev * (1 + ret);
    const hi = Math.max(c, prev) * (1 + range * (1 - clv) * 0.6);
    const lo = Math.min(c, prev) * (1 - range * clv * 0.6);
    bars.push({ date: dates[bars.length], open: prev, high: hi, low: lo, close: c, volume: Math.trunc(vol) });
    v = vol;
  };
  const rnd = new JavaRandom(77);
  // A long advance: down days come on lighter volume, so they are not distribution.
  for (let i = 0; i < 236; i++) {
    const down = i % 4 === 3;
    push(down ? -0.0035 : 0.0028 + 0.001 * rnd.nextDouble(), down ? v * 0.9 : 2.0e9 * (1 + 0.1 * rnd.nextDouble()));
  }
  // Distribution: declines on heavier volume than the day before, between weak up days.
  const script = [
    [-0.005, 1.25], [0.002, 0.85], [0.001, 0.95], [-0.006, 1.3], [0.002, 0.85], [-0.004, 1.2], [0.001, 0.9], [0.003, 0.9],
    [-0.007, 1.3], [0.002, 0.85], [-0.005, 1.2], [0.001, 0.9], [-0.006, 1.25],
    // The correction: lower lows.
    [-0.006, 1.1], [-0.004, 0.95], [-0.007, 1.1], [-0.003, 0.9], [-0.005, 1.05],
  ];
  for (const [r, k] of script) push(r, v * k, { clv: r > 0 ? 0.7 : 0.3 });
  // Day 1 of a rally attempt, a wobble that holds the low, and the follow-through day on day 5.
  const rally = [[0.008, 0.9, 0.8], [0.006, 0.85, 0.6], [-0.001, 0.8, 0.5], [0.007, 0.9, 0.7], [0.019, 1.35, 0.9],
    [0.005, 0.95, 0.7], [0.004, 0.9, 0.6], [-0.002, 0.85, 0.4], [0.006, 1.0, 0.7], [0.003, 0.9, 0.6], [0.005, 0.95, 0.7]];
  for (const [r, k, clv] of rally) push(r, v * k, { clv });
  while (bars.length < dates.length) push(0.002 + 0.002 * rnd.nextDouble(), v * (0.95 + 0.1 * rnd.nextDouble()));
  return { name: 'Índice de práctica', bars, timeline: regimeTimeline(bars) };
}

// ---------- Modo repetición: a hidden stock and the method over the same sessions ----------

export function replayData() {
  // A base, a breakout with volume in the middle of the window, a run, then the turn.
  let bars = shaped(301, 24, [[140, 1.0], [150, 1.75], [30, 1.48, 0.9], [30, 1.73, 1.0], [9, 1.64, 0.55], [1, 1.66]], { noise: 0.008, n: 360 });
  bars = breakoutTail(bars, { ratio: 2.5 });
  const t0 = bars.length - 1;
  const rnd = new JavaRandom(302);
  const after = [];
  let c = bars[t0].close;
  const plan = [[22, 0.0075], [6, -0.004], [14, 0.006], [10, -0.012], [12, 0.001]];
  for (const [n, drift] of plan) for (let i = 0; i < n; i++) after.push(drift + 0.011 * rnd.nextGaussian());
  let d = bars[t0].date;
  const avg = I.averageVolumeBefore(bars, t0, 50);
  for (const r of after) {
    d = plusDays(d, 1); while (dayOfWeek(d) >= 6) d = plusDays(d, 1);
    const prev = c; c = prev * (1 + r);
    const open = prev * (1 + 0.003 * rnd.nextGaussian());
    bars.push({ date: d, open, high: Math.max(open, c) * (1 + 0.006 * Math.abs(rnd.nextGaussian())), low: Math.min(open, c) * (1 - 0.006 * Math.abs(rnd.nextGaussian())),
      close: c, volume: Math.trunc(avg * Math.exp(0.3 * rnd.nextGaussian()) * (r < -0.015 ? 1.6 : r > 0.015 ? 1.4 : 0.95)) });
  }
  // Shift the dates so the last session is TODAY.
  const dates = weekdaysTo(TODAY, bars.length);
  bars = bars.map((b, i) => ({ ...b, date: dates[i] }));
  const instrument = { symbol: 'EJMAQ.DE', name: 'Ejemplo Maquinaria', market: 'GERMANY' };
  const start = t0 - 45;
  const ctx = { rsRating: 94, rsUniverse: 'Europa', regime: regimeOf('Europa (Índice Europa + Índice Alemania)', 'CONFIRMED', 100) };
  const cache = new Map();
  const analysisAt = (t) => {
    if (!cache.has(t)) cache.set(t, analyze(instrument, bars.slice(Math.max(0, t - SESSIONS + 1), t + 1), ctx));
    return cache.get(t);
  };
  return { instrument, bars, start, end: bars.length - 1, analysisAt, method: () => methodTrades(instrument, bars, start, bars.length - 1, analysisAt) };
}

// ---------- Cartera: the method's paper account over the last months of the scan ----------

/**
 * Runs the method over every visible stock for the last [sessions] closes. Evenings that fail the
 * trend template's quick checks (close over the SMA50, SMA50 over the SMA200, near the year's
 * high) cannot be APROBADO and are skipped without a full analysis.
 */
export function paperAccount(sessions = 90) {
  const w = buildWorld();
  const trades = [];
  for (const row of w.rows) {
    const bars = row.bars;
    const closes = bars.map((b) => b.close);
    const s50 = I.smaSeries(closes, 50), s200 = I.smaSeries(closes, 200);
    const from = bars.length - 1 - sessions, to = bars.length - 1;
    const fx = MARKETS[row.instrument.market].currency === 'USD' ? EUR_PER_USD : 1;
    const cache = new Map();
    const analysisAt = (t) => {
      if (cache.has(t)) return cache.get(t);
      const quick = closes[t] > s50[t] && s50[t] > s200[t] && closes[t] >= 0.9 * I.highest(bars, t - 251, t);
      const a = quick ? analyze(row.instrument, bars.slice(0, t + 1), { ...row.ctx, nextEarnings: null }) : { verdict: 'REJECTED' };
      cache.set(t, a);
      return a;
    };
    for (const tr of methodTrades(row.instrument, bars, from, to, analysisAt, { capital: CAPITAL, riskFraction: RISK, maxWeight: 0.2, fx })) {
      trades.push({ ...tr, symbol: row.instrument.symbol, name: row.instrument.name, market: row.instrument.market, sector: row.sector, fx, lastClose: bars[to].close });
    }
  }
  // Equity curve: cash plus open positions at each close, in euros.
  const any = w.rows[0].bars;
  const from = any.length - 1 - sessions;
  const curve = [];
  for (let t = from; t < any.length; t++) {
    let v = CAPITAL;
    for (const tr of trades) {
      const bars = w.rows.find((r) => r.instrument.symbol === tr.symbol).bars;
      for (const f of tr.fills) if (f.index <= t) v += -f.quantity * f.price * tr.fx; // cash out on buys, in on sells
      let held = 0;
      for (const f of tr.fills) if (f.index <= t) held += f.quantity;
      v += held * bars[t].close * tr.fx;
    }
    curve.push({ date: any[t].date, value: v });
  }
  const idx = w.indices.IDX_US.bars;
  const i0 = idx.findIndex((b) => b.date === curve[0].date);
  const bench = curve.map((p, k) => ({ date: p.date, value: CAPITAL * idx[i0 + k].close / idx[i0].close }));
  return { trades, curve, bench };
}

// ---------- Laboratorio de reglas: the Kotlin tests' cup, with today's close set by the sliders ----------

export const LAB_INSTRUMENT = { symbol: 'EJLAB', name: 'Ejemplo de laboratorio', market: 'US' };
/** The cup's pivot: the right lip's high (100 × 1,02) plus the 0,10 $ buffer. */
export const LAB_PIVOT = 102.1;
let labBase = null;

/** Fixtures.cupWithHandleBase(): a 200-session advance, an 18 % cup over 60 sessions, an 8-session handle. */
export function labBaseBars() {
  if (labBase) return labBase;
  const b = new SeriesBuilder(40).leg(200, 100).leg(30, 85).leg(30, 100).leg(8, 93, 600000).build();
  const dates = weekdaysTo(TODAY, b.length + 1);
  labBase = b.map((x, i) => ({ ...x, date: dates[i] }));
  return labBase;
}

/**
 * The base plus today's bar: a close [closeVsPivot] from the pivot on [volumeRatio] times the
 * 50-session average, closing near the day's high (as the fixture's breakout bar does).
 */
export function labBars({ volumeRatio = 2.7, closeVsPivot = 0.014 } = {}) {
  const base = labBaseBars();
  const avg = I.averageVolumeBefore(base, base.length, 50);
  const close = LAB_PIVOT * (1 + closeVsPivot);
  const prev = base[base.length - 1].close;
  const date = weekdaysTo(TODAY, 1)[0];
  return base.concat([{ date, open: prev * 1.01, high: close * 1.004, low: Math.min(prev, close) * 0.975, close, volume: Math.trunc(avg * volumeRatio) }]);
}

export const LAB_REGIMES = [
  ['CONFIRMED', 100], ['PRESSURE', 50], ['CORRECTION', 0],
];
export function labContext({ rs = 95, regime = 0, earnings = null } = {}) {
  const [state, exposure] = LAB_REGIMES[regime];
  return {
    rsRating: rs, rsUniverse: 'EE. UU.', regime: regimeOf('Mercado EE. UU.', state, exposure),
    nextEarnings: earnings == null ? null : plusSessions(TODAY, earnings),
  };
}
