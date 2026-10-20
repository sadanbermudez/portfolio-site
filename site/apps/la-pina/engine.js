/* La Piña Investments: the strategy's engine, ported from the app's Kotlin module `engine`
   (Analyzer, Patterns, Indicators, SupplyAndRs, MarketRegime, AutoLists, Explain, Risk, Sectors).
   Pure functions, no DOM: the page imports it and so do the Node tests.
   Simplifications against the Kotlin are listed in SIMPLIFICATIONS at the bottom. */

// ---------- java.util.Random, bit for bit (the app's screens seed their random walks with it) ----------

const P24 = 16777216;
const M_HI = 0x5de, M_LO = 0xece66d; // 0x5DEECE66D split at bit 24

export class JavaRandom {
  constructor(seed) {
    // (seed ^ 0x5DEECE66D) & (2^48 - 1), on two 24-bit halves.
    const s = BigInt.asUintN(48, BigInt(seed) ^ 0x5deece66dn);
    this.hi = Number(s >> 24n);
    this.lo = Number(s & 0xffffffn);
    this.nextNextGaussian = 0;
    this.haveNextNextGaussian = false;
  }
  next(bits) {
    const p0 = this.lo * M_LO + 0xb;
    const lo = p0 % P24;
    const carry = Math.floor(p0 / P24);
    const hi = (this.hi * M_LO + this.lo * M_HI + carry) % P24;
    this.hi = hi; this.lo = lo;
    const v = Math.floor((hi * P24 + lo) / 2 ** (48 - bits));
    return bits === 32 ? v | 0 : v;
  }
  nextInt(bound) {
    if (bound === undefined) return this.next(32);
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits, val;
    do { bits = this.next(31); val = bits % bound; } while (bits - val + (bound - 1) >= 2 ** 31);
    return val;
  }
  nextDouble() { return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992; }
  nextGaussian() {
    if (this.haveNextNextGaussian) { this.haveNextNextGaussian = false; return this.nextNextGaussian; }
    let v1, v2, s;
    do { v1 = 2 * this.nextDouble() - 1; v2 = 2 * this.nextDouble() - 1; s = v1 * v1 + v2 * v2; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    this.nextNextGaussian = v2 * m; this.haveNextNextGaussian = true;
    return v1 * m;
  }
}

// ---------- dates (ISO strings, UTC arithmetic) ----------

const DAY_MS = 86400000;
export const toEpochDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;
export const fromEpochDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const plusDays = (iso, n) => fromEpochDay(toEpochDay(iso) + n);
/** ISO day of week: 1 Monday .. 7 Sunday. */
export const dayOfWeek = (iso) => ((toEpochDay(iso) + 3) % 7 + 7) % 7 + 1;
const isWeekend = (iso) => dayOfWeek(iso) >= 6;
const FRIDAY = 5;

/** Weekdays between two dates, a proxy for exchange sessions (Indicators.sessionsBetween). */
export function sessionsBetween(from, to) {
  if (to <= from) return 0;
  let n = 0;
  for (let d = toEpochDay(from) + 1, e = toEpochDay(to); d <= e; d++) if (dayOfWeek(fromEpochDay(d)) < 6) n++;
  return n;
}
/** The date [n] weekdays after [from]. */
export function plusSessions(from, n) {
  let d = from, k = 0;
  while (k < n) { d = plusDays(d, 1); if (!isWeekend(d)) k++; }
  return d;
}

// ---------- formatting, Spanish style, as the engine writes its texts ----------

const NBSP = ' ';
function fixedHalfUp(x, digits) {
  const f = 10 ** digits;
  const r = Math.round(Math.abs(x) * f + 1e-9) / f; // HALF_UP, like Java's Formatter
  return (x < 0 && r !== 0 ? '-' : '') + r.toFixed(digits);
}
/** "73.000,00": a dot every three digits and a decimal comma (Patterns.kt fmt). */
export function fmt(x, digits = 2) {
  const s = fixedHalfUp(x, digits);
  const neg = s.startsWith('-');
  const [int, dec] = (neg ? s.slice(1) : s).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + grouped + (dec ? ',' + dec : '');
}
/** "3,2 %" with a no-break space. */
export const pct = (x) => fixedHalfUp(x * 100, 1).replace('.', ',') + NBSP + '%';
export const times = (x) => fixedHalfUp(x, 2).replace('.', ',') + '×';
/** Volume ratios are compared at the precision they are shown with. */
export const ratio2 = (x) => Math.round(x * 100) / 100;
export const priceDigits = (p) => (p == null ? 2 : Math.abs(p) < 1 ? 4 : 2);
export const priceFmt = (ref) => { const d = priceDigits(ref); return (x) => fmt(x, d); };
export const signedPct = (x) => (x >= 0 ? '+' : '−') + pct(Math.abs(x));
export const eur = (x) => fmt(x, 2) + NBSP + '€';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
/** "6 mar 2025". */
export const day = (iso) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
export const shortDay = (iso) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
export const monthName = (iso) => MONTHS[+iso.slice(5, 7) - 1];
const count = (x) => fmt(Math.trunc(x), 0);

// ---------- configuration (Config.kt defaults) ----------

export const CONFIG = Object.freeze({
  minHistoryBars: 260, minPriceUsd: 5, minPriceEur: 2, minAdv50Usd: 10e6, minAdv50Eur: 2e6,
  tt3Window: 21, tt3PreferredWindow: 84, tt6AboveLow: 0.30, tt7BelowHigh: 0.25, crossWindow: 60,
  rsApproved: 90, rsWatch: 80, rsApprovedUnderPressure: 95, strengthWindow: 20, strengthIndexDrop: 0.05,
  nearHigh: 0.10, belowSma200Tolerance: 0.05, darvasConfirmBars: 3, darvasMaxDepth: 0.15,
  cupMinDepth: 0.12, cupMaxDepth: 0.33, cupMinBars: 35, cupMaxBars: 325, cupPriorUptrend: 0.30,
  handleMinBars: 5, handleMaxBars: 25, handleMaxDepth: 0.12, htfMinPole: 0.90, htfMaxPullback: 0.25,
  flagMinPole: 0.15, flagMaxRetrace: 0.50,
  bufferUsd: 0.10, bufferEuPct: 0.002, buyRangePct: 0.05,
  minVolumeRatio: 1.4, strongVolumeRatio: 2.0, minClv: 0.5, strongClv: 0.67, minWeeklyVolumeRatio: 1.4, validitySessions: 5,
  supplyBand: 0.15, supplyWindow: 504,
  maxAboveSma50: 0.25, maxAtrAboveSma50: 5.0, watchZone: 0.05,
  maxLoss: 0.08, maActivationGain: 0.10, verticalThreshold: 0.15, breakevenGain: 0.15,
  earningsNoBuySessions: 10, earningsCushion: 0.10, blockUnknownEarnings: false,
  maxPositions: 8, maxOpenRisk: 0.04,
  tranche2Gain: 0.025, partialGain: 0.20, partialFraction: 0.5, fastGainSessions: 15, partialWaitSessions: 40,
  climaxGain: 0.25, climaxSessions: 15,
  scoreApproved: 70, scoreWatch: 50, dryVolumeRatio: 0.7,
});

// ---------- model ----------

export const MARKETS = {
  US: { label: 'EE. UU.', region: 'US', currency: 'USD', localIndex: 'IDX_US', localIndexName: 'Índice EE. UU.' },
  SPAIN: { label: 'España', region: 'EUROPE', currency: 'EUR', localIndex: 'IDX_ES', localIndexName: 'Índice España' },
  GERMANY: { label: 'Alemania', region: 'EUROPE', currency: 'EUR', localIndex: 'IDX_DE', localIndexName: 'Índice Alemania' },
  FRANCE: { label: 'Francia', region: 'EUROPE', currency: 'EUR', localIndex: 'IDX_FR', localIndexName: 'Índice Francia' },
};

export const RULES = {
  DATA: 'H1 · Datos suficientes', LIQUIDITY: 'H2 · Liquidez y precio', TREND: 'H3 · Plantilla de tendencia',
  RS: 'H4 · Fuerza relativa', PATTERN: 'H5 · Patrón cerca de máximos', PIVOT: 'H6 · Posición respecto al pivot',
  PAVA: 'B1 · PAVA al cierre', RS_LEADER: 'B2 · RS de líder', REGIME: 'B3 · Régimen de mercado', EARNINGS: 'B4 · Resultados',
  FLAG_STRONG: 'B5 · Bandera con PAVA fuerte', SCORE: 'S · Puntuación', SUPPLY: 'Oferta por encima (overhead supply)',
};

export const PATTERNS = {
  HIGH_TIGHT_FLAG: { label: 'High Tight Flag', quality: 20 },
  CUP_WITH_HANDLE: { label: 'Taza con asa', quality: 18 },
  DARVAS_BOX: { label: 'Caja de Darvas', quality: 15 },
  BULL_FLAG: { label: 'Bandera alcista', quality: 8 },
};

export const PAVA_GRADE = { STRONG: 'fuerte', STANDARD: 'estándar', NO_VOLUME: 'sin volumen', PENDING: 'pendiente' };
export const SUPPLY_CLASS = { OPEN_SKY: ['cielo abierto', 15], LOW: ['bajo', 10], MODERATE: ['moderado', 5], HIGH: ['alto', 0] };
export const REGIME_LABEL = { CONFIRMED: 'Tendencia confirmada', PRESSURE: 'Bajo presión', CORRECTION: 'En corrección', RALLY_ATTEMPT: 'Intento de rebote' };
export const VERDICT_LABEL = { APPROVED: 'APROBADO', WATCH: 'VIGILANCIA', REJECTED: 'RECHAZADO' };
export const STOP_LABEL = { MAX_LOSS: 'pérdida máxima', STRUCTURE: 'mínimo de la estructura', DARVAS: 'suelo de la caja Darvas' };
export const SCORE_MAX = { rs: 25, pattern: 20, volume: 20, supply: 15, trend: 10, fundamentals: 10 };

// ---------- indicators ----------

export const Indicators = {
  sma(values, period, endIndex = values.length - 1) {
    if (period <= 0 || endIndex < period - 1 || endIndex > values.length - 1) return null;
    let s = 0;
    for (let i = endIndex - period + 1; i <= endIndex; i++) s += values[i];
    return s / period;
  },
  smaSeries(values, period) {
    const out = new Array(values.length);
    let s = 0;
    for (let i = 0; i < values.length; i++) {
      s += values[i];
      if (i >= period) s -= values[i - period];
      out[i] = i >= period - 1 ? s / period : null;
    }
    return out;
  },
  /** Average volume of the [period] bars before [index] (the bar itself excluded). */
  averageVolumeBefore(bars, index, period) {
    if (index < period) return null;
    let s = 0;
    for (let i = index - period; i < index; i++) s += bars[i].volume;
    return s / period;
  },
  atr(bars, period = 14, endIndex = bars.length - 1) {
    if (endIndex < period) return null;
    const tr = [];
    for (let i = 1; i <= endIndex; i++) {
      const b = bars[i], pc = bars[i - 1].close;
      tr.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
    }
    let atr = 0;
    for (let i = 0; i < period; i++) atr += tr[i];
    atr /= period;
    for (let i = period; i < tr.length; i++) atr = (atr * (period - 1) + tr[i]) / period;
    return atr;
  },
  /** Weeks ending on Friday; the bar's date is the week's last session. */
  toWeekly(daily) {
    const out = [];
    let key = null, cur = null;
    for (const b of daily) {
      const ed = toEpochDay(b.date);
      const dow = dayOfWeek(b.date);
      const k = ed + ((FRIDAY - dow + 7) % 7);
      if (k !== key) {
        if (cur) out.push(cur);
        key = k;
        cur = { date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      } else {
        cur.date = b.date; cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low);
        cur.close = b.close; cur.volume += b.volume;
      }
    }
    if (cur) out.push(cur);
    return out;
  },
  roc(closes, bars, endIndex = closes.length - 1) {
    const start = endIndex - bars;
    if (start < 0 || closes[start] <= 0) return null;
    return closes[endIndex] / closes[start] - 1;
  },
  /** IBD-style score: 0.4·R(63) + 0.2·R(126) + 0.2·R(189) + 0.2·R(252). */
  rsScore(closes) {
    const q = [63, 126, 189, 252].map((n) => Indicators.roc(closes, n));
    if (q.some((v) => v == null)) return null;
    return 0.4 * q[0] + 0.2 * q[1] + 0.2 * q[2] + 0.2 * q[3];
  },
  /** v2 §3.4: 1 + round(98 · (values below x) / (N − 1)), in 1..99. */
  rsRating(score, universe) {
    if (universe.length < 2) return 50;
    const below = universe.filter((u) => u < score).length;
    return Math.min(99, Math.max(1, 1 + Math.round(98 * below / (universe.length - 1))));
  },
  cagr(bars) {
    if (bars.length < 2) return null;
    const days = toEpochDay(bars[bars.length - 1].date) - toEpochDay(bars[0].date);
    if (days < 180 || bars[0].close <= 0) return null;
    return (bars[bars.length - 1].close / bars[0].close) ** (365 / days) - 1;
  },
  highest(bars, from, to) { let m = -Infinity; for (let i = Math.max(0, from); i <= to; i++) if (bars[i].high > m) m = bars[i].high; return m; },
  lowest(bars, from, to) { let m = Infinity; for (let i = Math.max(0, from); i <= to; i++) if (bars[i].low < m) m = bars[i].low; return m; },
  /** Close location value: 1 = closed at the high. */
  clv(bar, previousClose) {
    if (bar.high - bar.low <= 0) return previousClose != null && bar.close > previousClose ? 1 : 0;
    return (bar.close - bar.low) / (bar.high - bar.low);
  },
  /** Closes of [other] aligned to [bars]' dates, carrying the last known one forward. */
  alignCloses(bars, other) {
    const by = new Map(other.map((b) => [b.date, b.close]));
    let last = null, j = 0;
    return bars.map((b) => {
      while (j < other.length && other[j].date <= b.date) { last = other[j].close; j++; }
      return by.has(b.date) ? by.get(b.date) : last;
    });
  },
};
const I = Indicators;

// ---------- the strategy's bases (Patterns.kt) ----------

function argMaxHigh(bars, from, to) { let best = Math.max(0, from); for (let i = best; i <= to; i++) if (bars[i].high >= bars[best].high) best = i; return best; }
function argMinLow(bars, from, to) { let best = Math.max(0, from); for (let i = best; i <= to; i++) if (bars[i].low < bars[best].low) best = i; return best; }
function isLocalHigh(bars, i, side) {
  if (i - side < 0 || i + side > bars.length - 1) return false;
  const h = bars[i].high;
  for (let k = 1; k <= side; k++) if (bars[i - k].high >= h || bars[i + k].high >= h) return false;
  return true;
}
const avgVol = (bars, from, to) => { let s = 0; for (let i = from; i <= to; i++) s += bars[i].volume; return s / (to - from + 1); };

export function breakoutBuffer(instrument) {
  return (p) => (MARKETS[instrument.market].currency === 'USD' ? CONFIG.bufferUsd : Math.max(0.01, CONFIG.bufferEuPct * p));
}

export class Patterns {
  constructor(buffer = () => 0) { this.buffer = buffer; }

  detect(bars, end, sma200) {
    if (end < 252) return [];
    const yearHigh = I.highest(bars, end - 252 + 1, end);
    return [this.highTightFlag(bars, end), this.cupWithHandle(bars, end), this.darvasBox(bars, end), this.bullFlag(bars, end)]
      .filter((m) => m && m.pivot >= (1 - CONFIG.nearHigh) * yearHigh && this.held(bars, m, end, sma200))
      .sort((a, b) => PATTERNS[b.type].quality - PATTERNS[a.type].quality);
  }

  held(bars, m, end, sma200) {
    const start = bars.findIndex((b) => b.date >= m.baseStart);
    for (let i = start; i <= end; i++) {
      const s = sma200[i];
      if (s == null) continue;
      if (bars[i].close < s * (1 - CONFIG.belowSma200Tolerance)) return false;
    }
    return true;
  }

  darvasBox(bars, end) {
    const confirm = CONFIG.darvasConfirmBars;
    const t0 = argMaxHigh(bars, end - 252 + 1, end);
    if (end - t0 < confirm) return null;
    const top = bars[t0].high;
    if (top < I.highest(bars, t0 - 252 + 1, t0)) return null;
    const m = argMinLow(bars, t0, end);
    if (end - m < confirm) return null;
    const floor = bars[m].low;
    const depth = 1 - floor / top;
    if (depth > CONFIG.darvasMaxDepth || depth <= 0) return null;
    const length = end - t0 + 1;
    const px = priceFmt(bars[bars.length - 1].close);
    return {
      type: 'DARVAS_BOX', pivot: top + this.buffer(top), pivotDate: bars[t0].date, baseStart: bars[t0].date, baseEnd: bars[end].date,
      baseLow: floor, depth, lengthBars: length,
      description: `Caja de ${pct(depth)} durante ${length} sesiones: techo ${px(top)} (máximo de 52 semanas), suelo ${px(floor)}.`,
      points: [{ date: bars[t0].date, price: top, label: 'Techo' }, { date: bars[m].date, price: floor, label: 'Suelo' }],
    };
  }

  cupWithHandle(bars, end) {
    const from = Math.max(5, end - CONFIG.cupMaxBars);
    const to = end - CONFIG.cupMinBars;
    if (to <= from) return null;
    let a = -1;
    for (let i = from; i <= to; i++) if (isLocalHigh(bars, i, 5) && (a < 0 || bars[i].high > bars[a].high)) a = i;
    if (a < 0) return null;
    const lipHigh = bars[a].high;
    const priorTo = a - 63;
    if (priorTo < 0) return null;
    const priorLow = I.lowest(bars, a - 252, priorTo);
    if (lipHigh / priorLow - 1 < CONFIG.cupPriorUptrend) return null;
    const b = argMinLow(bars, a + 1, end);
    const bottom = bars[b].low;
    const depth = 1 - bottom / lipHigh;
    if (depth < CONFIG.cupMinDepth || depth > CONFIG.cupMaxDepth) return null;
    if (b + 1 > end - 5) return null;
    const d = argMaxHigh(bars, b + 1, end - 5);
    const rightLip = bars[d].high;
    if (rightLip < 0.9 * lipHigh || rightLip > 1.05 * lipHigh) return null;
    const cupBars = d - a;
    if (cupBars < CONFIG.cupMinBars || cupBars > CONFIG.cupMaxBars) return null;
    const handleBars = end - d;
    if (handleBars < CONFIG.handleMinBars || handleBars > CONFIG.handleMaxBars) return null;
    const handleLow = I.lowest(bars, d + 1, end);
    if (I.highest(bars, d + 1, end) > rightLip) return null;
    const handleHigh = rightLip;
    const handleDepth = 1 - handleLow / rightLip;
    if (handleDepth > CONFIG.handleMaxDepth) return null;
    if ((handleHigh + handleLow) / 2 <= (lipHigh + bottom) / 2) return null;
    const hv = avgVol(bars, d + 1, end);
    const before = I.averageVolumeBefore(bars, d, 50);
    const dry = before != null && hv < before;
    return {
      type: 'CUP_WITH_HANDLE', pivot: handleHigh + this.buffer(handleHigh), pivotDate: bars[d].date, baseStart: bars[a].date, baseEnd: bars[end].date,
      baseLow: handleLow, depth, lengthBars: end - a + 1,
      description: `Taza de ${pct(depth)} en ${Math.round(cupBars / 5)} semanas y asa de ${handleBars} sesiones (${pct(handleDepth)}${dry ? ', volumen seco' : ''}).`,
      points: [
        { date: bars[a].date, price: lipHigh, label: 'Borde izq.' }, { date: bars[b].date, price: bottom, label: 'Fondo' },
        { date: bars[d].date, price: rightLip, label: 'Borde der.' }, { date: bars[argMinLow(bars, d + 1, end)].date, price: handleLow, label: 'Asa' },
      ],
    };
  }

  highTightFlag(bars, end) {
    const p = argMaxHigh(bars, end - 25, end - 10);
    const top = bars[p].high;
    if (p >= end || I.highest(bars, p + 1, end) >= top) return null;
    const poleLow = I.lowest(bars, p - 42, p);
    const pole = top / poleLow - 1;
    if (pole < CONFIG.htfMinPole) return null;
    const flagBars = end - p;
    if (flagBars < 10 || flagBars > 25) return null;
    const flagLow = I.lowest(bars, p + 1, end);
    const correction = 1 - flagLow / top;
    if (correction > CONFIG.htfMaxPullback) return null;
    const flagVol = avgVol(bars, p + 1, end), poleVol = avgVol(bars, p - 20, p);
    return {
      type: 'HIGH_TIGHT_FLAG', pivot: top + this.buffer(top), pivotDate: bars[p].date, baseStart: bars[Math.max(0, p - 42)].date, baseEnd: bars[end].date,
      baseLow: flagLow, depth: correction, lengthBars: end - p + 42,
      description: `Mástil de +${pct(pole)} y bandera de ${flagBars} sesiones con corrección de ${pct(correction)}${flagVol < poleVol ? ', volumen decreciente.' : '.'}`,
      points: [],
    };
  }

  bullFlag(bars, end) {
    const p = argMaxHigh(bars, end - 15, end - 5);
    const top = bars[p].high;
    if (p >= end || I.highest(bars, p + 1, end) >= top) return null;
    const poleLow = I.lowest(bars, p - 20, p);
    const pole = top / poleLow - 1;
    if (pole < CONFIG.flagMinPole) return null;
    const flagBars = end - p;
    if (flagBars < 5 || flagBars > 15) return null;
    const flagLow = I.lowest(bars, p + 1, end);
    const retrace = (top - flagLow) / (top - poleLow);
    if (retrace > CONFIG.flagMaxRetrace) return null;
    const flagHigh = I.highest(bars, p + 1, end);
    return {
      type: 'BULL_FLAG', pivot: flagHigh + this.buffer(flagHigh), pivotDate: bars[argMaxHigh(bars, p + 1, end)].date,
      baseStart: bars[Math.max(0, p - 20)].date, baseEnd: bars[end].date, baseLow: flagLow, depth: 1 - flagLow / top, lengthBars: end - p + 20,
      description: `Mástil de +${pct(pole)} y bandera de ${flagBars} sesiones que retrocede el ${pct(retrace)} del mástil.`,
      points: [],
    };
  }
}

// ---------- overhead supply and the RS line (SupplyAndRs.kt) ----------

export function overheadSupply(bars, pivot) {
  const t = bars.length - 1;
  const c = bars[t].close;
  let maxHigh = -Infinity;
  for (const b of bars) if (b.high > maxHigh) maxHigh = b.high;
  const ath = c >= 0.98 * maxHigh;
  const from = Math.max(0, bars.length - CONFIG.supplyWindow);
  let lo = Infinity, hi = -Infinity;
  for (let i = from; i < bars.length; i++) { lo = Math.min(lo, bars[i].low); hi = Math.max(hi, bars[i].high); }
  const bins = new Array(50).fill(0);
  const width = (hi - lo) / 50;
  let total = 0;
  if (width > 0) {
    for (let i = from; i < bars.length; i++) {
      const b = bars[i];
      const tp = (b.high + b.low + b.close) / 3;
      const k = Math.min(49, Math.max(0, Math.floor((tp - lo) / width)));
      bins[k] += b.volume; total += b.volume;
    }
  }
  let above = 0;
  if (width > 0) for (let k = 0; k < 50; k++) { const mid = lo + (k + 0.5) * width; if (mid > pivot && mid <= pivot * (1 + CONFIG.supplyBand)) above += bins[k]; }
  const ratio = total > 0 ? above / total : 0;
  let nearest = null;
  for (let i = from + 5; i <= t - 5; i++) {
    const h = bars[i].high;
    if (h <= pivot) continue;
    let ok = true;
    for (let k = 1; k <= 5; k++) if (!(bars[i - k].high < h && bars[i + k].high < h)) { ok = false; break; }
    if (ok) { const d = h / pivot - 1; if (nearest == null || d < nearest) nearest = d; }
  }
  const res = nearest == null ? Infinity : nearest;
  const cls = ath || (ratio < 0.02 && res > 0.25) ? 'OPEN_SKY' : ratio >= 0.10 || res <= 0.05 ? 'HIGH' : ratio < 0.05 && res > 0.10 ? 'LOW' : 'MODERATE';
  return { supplyClass: cls, supplyRatio: ratio, nearestResistancePct: nearest, allTimeHigh: ath };
}

export function rsLine(bars, index) {
  const idx = I.alignCloses(bars, index);
  const line = bars.map((b, i) => (idx[i] > 0 ? b.close / idx[i] : null));
  const t = bars.length - 1;
  const last = line[t];
  if (last == null) return null;
  const win = line.slice(Math.max(0, t - 252 + 1), t + 1).filter((v) => v != null);
  const at52wHigh = last >= Math.max(...win);
  const w = CONFIG.strengthWindow;
  let strength = false;
  for (let end = Math.max(w, t - 40); end <= t; end++) {
    const window = [];
    for (let k = end - w + 1; k <= end; k++) if (idx[k] != null) window.push(idx[k]);
    const idxEnd = idx[end];
    if (idxEnd == null || !window.length) continue;
    if (idxEnd / Math.max(...window) - 1 <= -CONFIG.strengthIndexDrop && bars[end].close / bars[end - w + 1].close - 1 > 0) { strength = true; break; }
  }
  const weekly = [];
  for (let i = 0; i <= t; i++) if ((i === t || dayOfWeek(bars[i + 1].date) < dayOfWeek(bars[i].date)) && line[i] != null) weekly.push(line[i]);
  const s = I.sma(weekly, 52);
  return { at52wHigh, strengthInDecline: strength, mansfield: s == null ? null : (weekly[weekly.length - 1] / s - 1) * 100 };
}

// ---------- market regime (MarketRegime.kt) ----------

export const REGIME_PARAMS = Object.freeze({ ddDrop: -0.002, ddLife: 25, ddExpiryGain: 0.05, ddPressure: 4, ddCorrection: 6, ftdGain: 0.0125, ftdMinDay: 4, layer1Closes: 2 });
export const REGIME_MIN_BARS = 220;

/**
 * The state at every bar (null before the 220th). Each entry also carries what happened that
 * day (a new distribution day, a transition and why), which the step-through shows.
 */
export function regimeTimeline(bars, p = REGIME_PARAMS) {
  const out = new Array(Math.min(bars.length, REGIME_MIN_BARS - 1)).fill(null);
  if (bars.length < REGIME_MIN_BARS) return out;
  const closes = bars.map((b) => b.close);
  const s50 = I.smaSeries(closes, 50), s200 = I.smaSeries(closes, 200);
  const hasVolume = bars.slice(-60).filter((b) => b.volume > 0).length > 50;
  let state = 'CONFIRMED';
  let dd = [];
  let correctionLow = Number.MAX_VALUE, day1 = -1, day1Low = 0, ftd = null;
  for (let t = 200; t < bars.length; t++) {
    const c = closes[t], prev = closes[t - 1];
    const ma50 = s50[t], ma200 = s200[t];
    let newDd = false;
    if (hasVolume && c / prev - 1 <= p.ddDrop && bars[t].volume > bars[t - 1].volume) { dd.push(t); newDd = true; }
    const before = dd.length;
    dd = dd.filter((k) => !(t - k > p.ddLife || c >= closes[k] * (1 + p.ddExpiryGain)));
    const expired = before - dd.length;
    const n = dd.length;
    const ma50Falling = s50[t - 5] != null ? ma50 < s50[t - 5] : false;
    const from = state;
    let why = '';
    switch (state) {
      case 'CONFIRMED':
        if (n >= p.ddPressure) { state = 'PRESSURE'; why = `${n} días de distribución en 25 sesiones (umbral ${p.ddPressure}).`; }
        else if (c < ma50) { state = 'PRESSURE'; why = 'El índice cierra bajo su SMA50.'; }
        break;
      case 'PRESSURE':
        if (n >= p.ddCorrection || (c < ma50 && ma50Falling) || c < ma200) {
          correctionLow = bars[t].low; state = 'CORRECTION';
          why = n >= p.ddCorrection ? `${n} días de distribución (umbral ${p.ddCorrection}).` : c < ma200 ? 'Cierre bajo la SMA200.' : 'Cierre bajo una SMA50 que ya baja.';
        } else if (n <= 2 && c > ma50) { state = 'CONFIRMED'; why = 'Quedan 2 días de distribución o menos y cierra sobre la SMA50.'; }
        break;
      case 'CORRECTION':
        if (bars[t].low < correctionLow) {
          correctionLow = bars[t].low;
          if (c > prev && I.clv(bars[t], prev) >= 0.5) { day1 = t; day1Low = correctionLow; state = 'RALLY_ATTEMPT'; why = 'Nuevo mínimo, pero cierra al alza en la mitad alta del día: día 1 del intento de rebote.'; }
        } else if (c > prev) { day1 = t; day1Low = correctionLow; state = 'RALLY_ATTEMPT'; why = 'Primer cierre al alza sin perforar el mínimo: día 1 del intento de rebote.'; }
        break;
      case 'RALLY_ATTEMPT':
        if (bars[t].low < day1Low) { correctionLow = bars[t].low; state = 'CORRECTION'; why = 'Perfora el mínimo del día 1: el intento de rebote fracasa.'; }
        else if (t - day1 + 1 >= p.ftdMinDay && c / prev - 1 >= p.ftdGain && (!hasVolume || bars[t].volume > bars[t - 1].volume)) {
          ftd = bars[t].date; dd = []; state = 'CONFIRMED';
          why = `Día de seguimiento: día ${t - day1 + 1} del rebote, +${pct(c / prev - 1)} con más volumen que la sesión anterior.`;
        }
        break;
    }
    if (t >= REGIME_MIN_BARS - 1) {
      let layer1 = ma50 > ma200;
      for (let k = 0; k < p.layer1Closes; k++) if (!(closes[t - k] > s200[t - k])) layer1 = false;
      out.push({
        state, distributionDays: dd.length, ddIndices: dd.slice(), layer1Bullish: layer1, lastFollowThrough: ftd, hasVolume,
        newDistributionDay: newDd, expired, from, why: from !== state ? why : '', rallyDay: state === 'RALLY_ATTEMPT' ? t - day1 + 1 : null,
      });
    }
  }
  return out;
}

export function regimeEvaluate(bars) { return bars.length < REGIME_MIN_BARS ? null : regimeTimeline(bars).at(-1); }

const SEVERITY = { CONFIRMED: 0, PRESSURE: 1, RALLY_ATTEMPT: 2, CORRECTION: 3 };
export function regional(name, states) {
  const known = states.filter((s) => s[1] != null);
  if (!known.length) return null;
  const worst = known.reduce((w, s) => (SEVERITY[s[1].state] > SEVERITY[w] ? s[1].state : w), 'CONFIRMED');
  const layer1 = known.every((s) => s[1].layer1Bullish);
  const exposure = worst === 'CORRECTION' || worst === 'RALLY_ATTEMPT' ? 0 : worst === 'PRESSURE' || !layer1 ? 50 : 100;
  return {
    name, state: worst, distributionDays: Math.max(...known.map((s) => s[1].distributionDays)), layer1Bullish: layer1,
    lastFollowThrough: known.map((s) => s[1].lastFollowThrough).filter(Boolean).sort().at(-1) || null, maxExposurePct: exposure, notes: [],
  };
}

/** A regime as the Kotlin tests build one: just the state and the exposure it allows. */
export function regimeOf(name, state, exposure = state === 'CONFIRMED' ? 100 : state === 'PRESSURE' ? 50 : 0, distributionDays = 0) {
  return { name, state, distributionDays, layer1Bullish: exposure === 100, lastFollowThrough: null, maxExposurePct: exposure, notes: [] };
}

// ---------- the analyzer (Analyzer.kt) ----------

function maxCalendarGap(bars) { let m = 0; for (let i = 1; i < bars.length; i++) m = Math.max(m, toEpochDay(bars[i].date) - toEpochDay(bars[i - 1].date)); return m; }
const rule = (id, status, reason, code = null) => ({ rule: id, title: RULES[id], status, reason, code });

export function liquidityOf(instrument, daily) {
  const usd = MARKETS[instrument.market].currency === 'USD';
  const price = daily.length ? daily[daily.length - 1].close : 0;
  const adv50 = I.sma(daily.map((b) => b.close * b.volume), 50) || 0;
  const minPrice = usd ? CONFIG.minPriceUsd : CONFIG.minPriceEur, minAdv = usd ? CONFIG.minAdv50Usd : CONFIG.minAdv50Eur;
  return { price, adv50, minPrice, minAdv, usd, passes: price >= minPrice && adv50 >= minAdv };
}

const TT_TEXT = {
  TT1: 'precio bajo la SMA150 o la SMA200', TT2: 'SMA150 bajo la SMA200', TT3: 'SMA200 sin subir en el último mes',
  TT4: 'SMA50 (10 semanas) bajo la SMA150 o la SMA200 (40 semanas)', TT5: 'precio bajo la SMA50',
  TT6: `menos de un ${pct(CONFIG.tt6AboveLow)} sobre el mínimo de 52 semanas`, TT7: `más de un ${pct(CONFIG.tt7BelowHigh)} bajo el máximo de 52 semanas`,
};
export const TT_RULES = {
  TT1: 'Precio sobre la SMA150 y la SMA200', TT2: 'SMA150 sobre la SMA200', TT3: 'SMA200 subiendo al menos un mes',
  TT4: 'SMA50 sobre la SMA150 y la SMA200', TT5: 'Precio sobre la SMA50', TT6: 'Al menos un 30 % sobre el mínimo de 52 semanas',
  TT7: 'A menos de un 25 % del máximo de 52 semanas',
};

function trendTemplate(daily, closes, s50, s150, s200) {
  const t = daily.length - 1;
  const c = closes[t];
  const a50 = s50[t], a150 = s150[t], a200 = s200[t];
  const low52 = I.lowest(daily, t - 252 + 1, t), high52 = I.highest(daily, t - 252 + 1, t);
  const prev200 = s200[t - CONFIG.tt3Window];
  const checks = {
    TT1: c > a150 && c > a200, TT2: a150 > a200, TT3: (prev200 == null ? Number.MAX_VALUE : prev200) < a200,
    TT4: a50 > a150 && a50 > a200, TT5: c > a50, TT6: c >= (1 + CONFIG.tt6AboveLow) * low52, TT7: c >= (1 - CONFIG.tt7BelowHigh) * high52,
  };
  const weekly = I.toWeekly(daily);
  const wc = weekly.map((w) => w.close);
  const w10 = I.sma(wc, 10), w40 = I.sma(wc, 40), w40prev = I.sma(wc, 40, wc.length - 1 - 4);
  const weeklyOk = w10 != null && w40 != null && w40prev != null && w10 > w40 && w40 > w40prev;
  let cross = null;
  for (let k = 0; k <= CONFIG.crossWindow; k++) {
    const i = t - k;
    const a = s50[i], b = s200[i], pa = s50[i - 1], pb = s200[i - 1];
    if (a != null && b != null && pa != null && pb != null && a > b && pa <= pb) { cross = daily[i].date; break; }
  }
  return { sma50: a50, sma150: a150, sma200: a200, distFrom52wHighPct: c / high52 - 1, distFrom52wLowPct: c / low52 - 1, crossDate: cross, weeklyOk, checks };
}

function findBase(daily, patterns, s200) {
  const t = daily.length - 1;
  let pending = null;
  for (let end = t; end >= Math.max(0, t - 20); end--) {
    const m = patterns.detect(daily, end, s200)[0];
    if (!m) continue;
    let breakout = -1;
    for (let i = end + 1; i <= t; i++) if (daily[i].close > m.pivot) { breakout = i; break; }
    if (breakout < 0) { if (!pending) pending = { match: m, end }; continue; }
    return pending && t - breakout >= 2 * CONFIG.validitySessions ? pending : { match: m, end };
  }
  return pending;
}

function volumeRatio(daily, i) { const a = I.averageVolumeBefore(daily, i, 50); return a > 0 ? ratio2(daily[i].volume / a) : 0; }

function pavaFor(daily, base) {
  const p = base.match.pivot;
  const t = daily.length - 1;
  let b = -1;
  for (let i = base.end + 1; i <= t; i++) if (daily[i].close > p && daily[i - 1].close <= p) { b = i; break; }
  if (b < 0) return { weekly: false, breakoutDate: null, confirmedDate: null, grade: 'PENDING', volumeRatio: null, clv: null };
  const k = CONFIG.validitySessions;
  for (let q = b; q <= Math.min(b + k - 1, t); q++) {
    if (daily[q].close > p && volumeRatio(daily, q) >= CONFIG.minVolumeRatio && I.clv(daily[q], daily[q - 1].close) >= CONFIG.minClv) {
      const vr = volumeRatio(daily, q), clv = I.clv(daily[q], daily[q - 1].close);
      return { weekly: false, breakoutDate: daily[b].date, confirmedDate: daily[q].date, grade: vr >= CONFIG.strongVolumeRatio && clv >= CONFIG.strongClv ? 'STRONG' : 'STANDARD', volumeRatio: vr, clv };
    }
  }
  const weekly = I.toWeekly(daily);
  const w = weekly.findIndex((x) => x.date >= daily[b].date);
  const complete = (w >= 0 && w < weekly.length - 1) || (w === weekly.length - 1 && dayOfWeek(daily[t].date) === FRIDAY);
  if (w >= 10 && complete) {
    const wb = weekly[w];
    const a = I.averageVolumeBefore(weekly, w, 10);
    const wvr = a > 0 ? ratio2(wb.volume / a) : 0;
    const wclv = I.clv(wb, weekly[w - 1].close);
    if (wb.close > p && wvr >= CONFIG.minWeeklyVolumeRatio && wclv >= CONFIG.minClv) return { weekly: true, breakoutDate: daily[b].date, confirmedDate: wb.date, grade: 'STANDARD', volumeRatio: wvr, clv: wclv };
  }
  return { weekly: false, breakoutDate: daily[b].date, confirmedDate: null, grade: 'NO_VOLUME', volumeRatio: volumeRatio(daily, b), clv: I.clv(daily[b], daily[b - 1].close) };
}

function pavaRule(pava, pattern, t, daily) {
  const p = pattern.pivot, k = CONFIG.validitySessions;
  if (!pava.breakoutDate) {
    const recent = daily.slice(-3);
    const poked = recent.some((b) => b.high > p) ||
      recent.some((b) => b.date === pattern.pivotDate && b.close < b.high * 0.99 && b.date > plusDays(pattern.baseStart, 7));
    return rule('PAVA', 'BLOCK', poked ? 'Superó el pivot en intradía sin cerrar por encima: pendiente. Nunca se confirma en intradía.'
      : `Sin cierre por encima del pivot ${priceFmt(daily[t].close)(p)} todavía.`, 'pava_pendiente');
  }
  const since = daily.findIndex((b) => b.date === pava.breakoutDate);
  let closedBelow = false;
  for (let i = since; i <= t; i++) if (daily[i].close < p) closedBelow = true;
  if (!pava.confirmedDate) {
    const left = k - (t - since);
    const vr = pava.volumeRatio || 0;
    const why = vr >= CONFIG.minVolumeRatio
      ? `volumen ${times(vr)} la media (mín. ${times(CONFIG.minVolumeRatio)}), pero cerró al ${pct(pava.clv || 0)} del rango del día (se exige la mitad alta, ≥ ${pct(CONFIG.minClv)})`
      : `volumen ${times(vr)} la media (mín. ${times(CONFIG.minVolumeRatio)}): sin dinero institucional`;
    return rule('PAVA', 'BLOCK', `Rotura del ${day(pava.breakoutDate)} con ${why}. ${left > 0 ? `Puede validarse en ${left} sesiones más.` : 'No válida.'}`, 'rotura_sin_volumen');
  }
  let confirmedIdx = -1;
  for (let i = 0; i < daily.length; i++) if (daily[i].date <= pava.confirmedDate) confirmedIdx = i;
  const vol = `${times(pava.volumeRatio || 0)} ${pava.weekly ? 'la media semanal' : 'la media de 50 sesiones'}`;
  if (closedBelow) return rule('PAVA', 'BLOCK', `La rotura del ${day(pava.breakoutDate)} volvió a cerrar bajo el pivot.`, 'pava_pendiente');
  if (t - confirmedIdx >= k) return rule('PAVA', 'BLOCK', `PAVA confirmado el ${day(pava.confirmedDate)} (${vol}), pero han pasado más de ${k} sesiones: esperar nueva base o retroceso.`, 'pava_pendiente');
  return rule('PAVA', 'PASS', `Rotura confirmada al cierre del ${day(pava.confirmedDate)}: volumen ${vol}, cierre en el ${pct(pava.clv || 0)} alto del rango (grado ${PAVA_GRADE[pava.grade]}).`);
}

export function volumeDry(daily) {
  const v50 = I.averageVolumeBefore(daily, daily.length - 1, 50);
  if (v50 == null) return false;
  const v5 = avgVol(daily, daily.length - 5, daily.length - 1);
  return v50 > 0 && v5 < CONFIG.dryVolumeRatio * v50;
}

function score(rs, line, pattern, pava, supply, trend, daily, closes) {
  const t = daily.length - 1;
  const rsBase = 15 * Math.min(1, Math.max(0, ((rs ?? 80) - 80) / 19));
  const rsPts = rsBase + (line?.at52wHigh ? 5 : 0) + (line?.strengthInDecline ? 5 : 0);
  const patternPts = PATTERNS[pattern.type].quality;
  let volPts;
  if (pava?.confirmedDate) volPts = 10 + 8 * Math.min(1, Math.max(0, ((pava.volumeRatio || 0) - 1.4) / 1.6)) + ((pava.clv || 0) >= CONFIG.strongClv ? 2 : 0);
  else if (pava?.breakoutDate) volPts = 5;
  else volPts = volumeDry(daily) ? 10 : 0;
  const supplyPts = supply ? SUPPLY_CLASS[supply.supplyClass][1] : 0;
  const s200 = I.smaSeries(closes, 200);
  const prevS = s200[t - CONFIG.tt3PreferredWindow];
  const ttPref = (prevS == null ? Number.MAX_VALUE : prevS) < (s200[t] ?? 0);
  const trendPts = (ttPref ? 4 : 0) + (trend.distFrom52wHighPct >= -0.05 ? 3 : 0) + (trend.weeklyOk ? 3 : 0);
  const raw = rsPts + patternPts + volPts + supplyPts + trendPts;
  // No fundamentals in the demo: the other 90 points are rescaled to 100, as the app does without a source.
  const total = Math.min(100, Math.max(0, Math.round(raw * 100 / 90)));
  return { rs: rsPts, pattern: patternPts, volume: volPts, supply: supplyPts, trend: trendPts, fundamentals: null, total };
}

export function stockStop(pattern, entry, buffer) {
  const maxLoss = entry * (1 - CONFIG.maxLoss);
  const structure = pattern.baseLow - buffer(pattern.baseLow);
  return structure > maxLoss ? [structure, pattern.type === 'DARVAS_BOX' ? 'DARVAS' : 'STRUCTURE'] : [maxLoss, 'MAX_LOSS'];
}

/**
 * Methodology v2 (§4.1) for a stock: structural filters H1-H6 reject; temporary blocks B1-B5
 * leave it in VIGILANCIA; the 0-100 score must reach 70 for APROBADO. Every input is a closed bar.
 * ctx: { rsRating, rsUniverse, rsIndex, rsIndexName, regime, nextEarnings, passiveIndex, passiveIndexName }
 */
export function analyze(instrument, daily, ctx = {}) {
  const rules = [], notes = [];
  const gap = maxCalendarGap(daily.slice(-252));
  const volumeOk = daily.slice(-60).filter((b) => b.volume > 0).length >= 50;
  const dataReason = daily.length < CONFIG.minHistoryBars ? `Hacen falta al menos ${CONFIG.minHistoryBars} sesiones cerradas; hay ${daily.length}.`
    : gap > 9 ? `Hay un hueco de ${gap} días sin datos en el último año.`
      : !volumeOk ? 'La fuente no da volumen para este valor: no se puede validar PAVA.' : null;
  if (dataReason) {
    rules.push(rule('DATA', 'FAIL', dataReason, 'datos_insuficientes'));
    const last = daily.at(-1);
    return finish({ instrument, asOf: last?.date ?? null, lastClose: last?.close ?? null, verdict: 'REJECTED', score: null, rules, notes, trend: null, pattern: null, pava: null, rs: null, supply: null, extensionPct: null, regime: null, plan: null, scoreParts: null });
  }
  rules.push(rule('DATA', 'PASS', `${daily.length} sesiones cerradas, la última del ${day(daily.at(-1).date)}.`));

  const t = daily.length - 1;
  const last = daily[t];
  const px = priceFmt(last.close);
  const closes = daily.map((b) => b.close);
  const s50 = I.smaSeries(closes, 50), s150 = I.smaSeries(closes, 150), s200 = I.smaSeries(closes, 200);
  const atr = I.atr(daily, 14) || 0;
  const buffer = breakoutBuffer(instrument);

  // H2 liquidity
  const q = liquidityOf(instrument, daily);
  const cur = q.usd ? '$' : '€';
  const millions = (x) => `${fmt(x / 1e6)} M`;
  rules.push(q.price < q.minPrice ? rule('LIQUIDITY', 'FAIL', `Precio ${px(q.price)} ${cur} por debajo del mínimo de ${fmt(q.minPrice)} ${cur}.`, 'liquidez')
    : q.adv50 < q.minAdv ? rule('LIQUIDITY', 'FAIL', `Efectivo medio negociado ${millions(q.adv50)} ${cur}, por debajo de ${millions(q.minAdv)} ${cur}.`, 'liquidez')
      : rule('LIQUIDITY', 'PASS', `Efectivo medio negociado ${millions(q.adv50)} ${cur} al día (50 sesiones).`));

  // H3 trend template
  const trend = trendTemplate(daily, closes, s50, s150, s200);
  const failedTt = Object.keys(trend.checks).filter((k) => !trend.checks[k]);
  rules.push(failedTt.length === 0
    ? rule('TREND', 'PASS', `Cumple TT1-TT7: precio sobre SMA50/150/200, medias ordenadas y SMA200 subiendo; a ${pct(-trend.distFrom52wHighPct)} del máximo de 52 semanas.`)
    : rule('TREND', 'FAIL', `Falla ${failedTt.join(', ')}: ${failedTt.map((k) => TT_TEXT[k]).join('; ')}.`, 'tendencia'));
  if (trend.crossDate) notes.push(`Cruce alcista de la media de 10 semanas sobre la de 40 el ${day(trend.crossDate)} (transición de etapa 1 a 2).`);

  // H4 relative strength
  const line = ctx.rsIndex ? rsLine(daily, ctx.rsIndex) : null;
  const rs = ctx.rsRating ?? null;
  const universe = ctx.rsUniverse || '';
  rules.push(rs == null ? rule('RS', 'FAIL', 'Sin histórico suficiente para calcular el RS.', 'rs_bajo')
    : rs < CONFIG.rsWatch ? rule('RS', 'FAIL', `RS ${rs} < ${CONFIG.rsWatch} en el universo ${universe}: no es un líder.`, 'rs_bajo')
      : rule('RS', 'PASS', `RS ${rs} en el universo ${universe} (percentil de rentabilidad ponderada 40/20/20/20 a 12 meses).`));

  // H5 pattern
  const base = findBase(daily, new Patterns(buffer), s200);
  const pattern = base?.match ?? null;
  rules.push(pattern == null
    ? rule('PATTERN', 'FAIL', `Sin Caja de Darvas, Taza con asa, High Tight Flag, Bandera ni Base plana válida con el pivot a menos del ${pct(CONFIG.nearHigh)} del máximo de 52 semanas.`, 'sin_patron')
    : rule('PATTERN', 'PASS', `${PATTERNS[pattern.type].label}: ${pattern.description} Pivot ${px(pattern.pivot)}.`));

  // H6 position vs pivot
  let extension = null;
  if (pattern) {
    const p = pattern.pivot;
    const extPivot = last.close / p - 1;
    const extS50 = s50[t] != null ? last.close / s50[t] - 1 : 0;
    const extAtr = atr > 0 ? (last.close - (s50[t] ?? last.close)) / atr : 0;
    extension = extPivot;
    rules.push(extPivot > CONFIG.buyRangePct || extS50 > CONFIG.maxAboveSma50 || extAtr > CONFIG.maxAtrAboveSma50
      ? rule('PIVOT', 'FAIL', `Extendido: ${pct(extPivot)} sobre el pivot, ${pct(extS50)} sobre la SMA50, ${fmt(extAtr)} ATR sobre la SMA50 (máx. ${pct(CONFIG.buyRangePct)} / ${pct(CONFIG.maxAboveSma50)} / ${fmt(CONFIG.maxAtrAboveSma50)}). Esperar nueva base o retroceso.`, 'extendido')
      : last.close > p ? rule('PIVOT', 'PASS', `En rango de compra: ${pct(extPivot)} sobre el pivot (máx. ${pct(CONFIG.buyRangePct)}).`)
        : last.close >= p * (1 - CONFIG.watchZone) ? rule('PIVOT', 'BLOCK', `Cerca del pivot: a ${pct(-extPivot)} por debajo. Esperar el cierre por encima.`, 'cerca_pivot')
          : rule('PIVOT', 'FAIL', `En mitad de la consolidación: ${pct(-extPivot)} bajo el pivot. Nunca comprar dentro de la base.`, 'mitad_consolidacion'));
  }

  // B1 PAVA
  const pava = pattern ? pavaFor(daily, base) : null;
  if (pava) rules.push(pavaRule(pava, pattern, t, daily));

  // B2 RS leader, B3 regime
  const regime = ctx.regime ?? null;
  if (rs != null && rs >= CONFIG.rsWatch) {
    rules.push(rs >= CONFIG.rsApproved ? rule('RS_LEADER', 'PASS', `RS ${rs} ≥ ${CONFIG.rsApproved}.`)
      : rule('RS_LEADER', 'BLOCK', `RS ${rs} entre ${CONFIG.rsWatch} y ${CONFIG.rsApproved - 1}: en seguimiento hasta ser líder.`, 'rs_80_89'));
  }
  if (regime) {
    const lbl = REGIME_LABEL[regime.state].toLowerCase();
    rules.push(regime.maxExposurePct === 0 ? rule('REGIME', 'BLOCK', `${regime.name}: ${lbl}. Sin compras nuevas; la lista se prepara ahora.`, 'regimen_correccion')
      : regime.maxExposurePct === 50 && (rs ?? 0) < CONFIG.rsApprovedUnderPressure
        ? rule('REGIME', 'BLOCK', `${regime.name}: ${lbl}${!regime.layer1Bullish ? ' (índice bajo su SMA200)' : ''}. Exposición máx. 50 % y solo RS ≥ ${CONFIG.rsApprovedUnderPressure}.`, 'regimen_presion')
        : rule('REGIME', 'PASS', `${regime.name}: ${lbl}, exposición máxima ${regime.maxExposurePct} %.`));
  } else {
    rules.push(rule('REGIME', 'INFO', 'Sin datos del índice para el régimen de mercado.'));
  }

  // B4 earnings
  let sessionsToEarnings = null;
  if (ctx.nextEarnings == null) {
    rules.push(rule('EARNINGS', CONFIG.blockUnknownEarnings ? 'BLOCK' : 'INFO',
      `Fecha de resultados no disponible: compruébala antes de comprar. Sin compras en las ${CONFIG.earningsNoBuySessions} sesiones previas.`, 'fecha_resultados_desconocida'));
  } else {
    const d = sessionsBetween(last.date, ctx.nextEarnings);
    sessionsToEarnings = d;
    rules.push(d >= 1 && d <= CONFIG.earningsNoBuySessions
      ? rule('EARNINGS', 'BLOCK', `Resultados en ${d} sesiones: sin compras nuevas en las ${CONFIG.earningsNoBuySessions} previas.`, 'resultados_en_d_sesiones')
      : rule('EARNINGS', 'PASS', `Resultados el ${day(ctx.nextEarnings)} (${d} sesiones).`));
  }

  // B5 simple flag needs a strong PAVA
  if (pattern?.type === 'BULL_FLAG' && pava?.confirmedDate && pava.grade !== 'STRONG') {
    rules.push(rule('FLAG_STRONG', 'BLOCK', `La bandera simple falla a menudo (44 % en los estudios de patrones): exige volumen ≥ ${times(CONFIG.strongVolumeRatio)}.`, 'bandera_sin_pava_fuerte'));
  }

  // Overhead supply (scored)
  const supply = pattern ? overheadSupply(daily, pattern.pivot) : null;
  if (supply) {
    rules.push(rule('SUPPLY', 'INFO', `Oferta ${SUPPLY_CLASS[supply.supplyClass][0]}: ${pct(supply.supplyRatio)} del volumen de 2 años entre el pivot y +${pct(CONFIG.supplyBand)}` +
      (supply.nearestResistancePct != null ? `; resistencia más cercana a +${pct(supply.nearestResistancePct)}` : '; sin resistencias por encima') +
      (supply.allTimeHigh ? '; en máximos históricos.' : '.')));
  }

  // S score
  const hardFail = rules.some((r) => r.status === 'FAIL');
  const scoreParts = hardFail || !pattern ? null : score(rs, line, pattern, pava, supply, trend, daily, closes);
  const sc = scoreParts?.total ?? null;
  if (sc != null) {
    rules.push(sc >= CONFIG.scoreApproved ? rule('SCORE', 'PASS', `Puntuación ${sc}/100 (mín. ${CONFIG.scoreApproved}).`)
      : sc >= CONFIG.scoreWatch ? rule('SCORE', 'BLOCK', `Puntuación ${sc}/100: entre ${CONFIG.scoreWatch} y ${CONFIG.scoreApproved - 1}.`, 'puntuacion_baja')
        : rule('SCORE', 'FAIL', `Puntuación ${sc}/100 < ${CONFIG.scoreWatch}.`, 'puntuacion_baja'));
  }

  const verdict = rules.some((r) => r.status === 'FAIL') ? 'REJECTED' : rules.some((r) => r.status === 'BLOCK') ? 'WATCH' : 'APPROVED';

  let plan = null;
  if (pattern && verdict !== 'REJECTED') {
    const entry = pava?.confirmedDate ? last.close : pattern.pivot;
    const [stop, stopType] = stockStop(pattern, entry, buffer);
    notes.push(`Stops dinámicos (al cierre): tras +${pct(CONFIG.maActivationGain)}, cierre semanal bajo la media de 10 semanas con volumen; si el precio se aleja más de un ${pct(CONFIG.verticalThreshold)} de la SMA20, cierre bajo la SMA20; con +${pct(CONFIG.breakevenGain)}, stop a precio de entrada. El stop nunca baja.`);
    plan = { entry, buyRangeLow: pattern.pivot, buyRangeHigh: pattern.pivot * (1 + CONFIG.buyRangePct), stop, stopType, riskPct: (entry - stop) / entry, sessionsToEarnings, actionable: verdict === 'APPROVED' };
  }

  let comparison = null;
  if (ctx.passiveIndex) {
    const cagr = I.cagr(ctx.passiveIndex);
    const same = cagr == null ? null : (1 + cagr) ** (63 / 252) - 1;
    const name = ctx.passiveIndexName || 'índice';
    comparison = {
      indexName: name, conclusion: 'Muestra insuficiente', indexCagrPct: cagr,
      summary: `Sin backtest fuera de muestra todavía: no hay ventaja demostrada frente al ${name}. ` +
        (cagr != null ? `El ${name} ha rentado ${pct(cagr)} anual en el histórico simulado, unos ${pct(same)} en 3 meses. ` : '') +
        (plan ? `Esta operación arriesga un ${pct(plan.riskPct)} hasta el stop. ` : '') +
        'Según SPIVA, entre el 65 % y el 98 % de los fondos activos no bate a su índice.',
    };
  }

  const avg50 = I.averageVolumeBefore(daily, t, 50);
  return finish({
    instrument, asOf: last.date, lastClose: last.close, verdict, score: sc, rules, notes, trend, pattern, pava,
    rs: { rating: rs, universe, lineAt52wHigh: line?.at52wHigh ?? false, strengthInDecline: line?.strengthInDecline ?? false, mansfield: line?.mansfield ?? null },
    supply, extensionPct: extension, regime, plan, comparison, relativeVolume: avg50 > 0 ? last.volume / avg50 : null,
    sessionsToEarnings, scoreParts,
  });
}

function finish(a) {
  const fail = a.rules.find((r) => r.status === 'FAIL');
  const block = a.rules.find((r) => r.status === 'BLOCK');
  a.headline = fail ? `${fail.title}: ${fail.reason}` : block ? `${block.title}: ${block.reason}` : null;
  a.codes = a.rules.filter((r) => r.status === 'FAIL' || r.status === 'BLOCK').map((r) => r.code).filter(Boolean);
  return a;
}

// ---------- "Qué falta para APROBADO" (Explain.kt) ----------

export function approvalGap(a, daily) {
  if (a.verdict === 'APPROVED') return [];
  const pivot = a.pattern?.pivot ?? null;
  const last = a.lastClose;
  const avg50 = I.averageVolumeBefore(daily, daily.length, 50);
  const px = priceFmt(last ?? pivot);
  const shares = (ratio) => (avg50 != null ? ` (≥ ${count(Math.ceil(avg50 * ratio))} acciones, ${times(ratio)} la media de 50 sesiones)` : ` (${times(ratio)} la media de 50 sesiones)`);
  const closeAbove = pivot == null ? null : `Un cierre por encima del pivot ${px(pivot)}` + (last != null && last < pivot ? ` (hoy a ${pct(1 - last / pivot)} por debajo)` : '') +
    ` con volumen${shares(CONFIG.minVolumeRatio)} y en la mitad alta del rango del día.`;
  const rs = a.rs?.rating;
  const out = [];
  for (const r of a.rules) {
    if (r.status !== 'FAIL' && r.status !== 'BLOCK') continue;
    let text, temporary = true;
    switch (r.code) {
      case 'datos_insuficientes': case 'liquidez': text = r.reason; temporary = false; break;
      case 'tendencia': text = `Plantilla de tendencia completa. ${r.reason} Suele tardar semanas en corregirse.`; temporary = false; break;
      case 'rs_bajo': text = `RS ≥ ${CONFIG.rsWatch} para vigilarlo y ≥ ${CONFIG.rsApproved} para aprobarlo` + (rs != null ? ` (ahora ${rs}).` : '.'); temporary = false; break;
      case 'sin_patron': text = `Que forme una base válida (Caja de Darvas, Taza con asa, High Tight Flag, Bandera o Base plana) con el pivot a menos del ${pct(CONFIG.nearHigh)} del máximo de 52 semanas.`; temporary = false; break;
      case 'extendido': text = pivot != null ? `Esperar un retroceso al rango de compra ${px(pivot)}–${px(pivot * (1 + CONFIG.buyRangePct))} o una base nueva: comprar extendido multiplica el riesgo.` : r.reason; break;
      case 'mitad_consolidacion': case 'cerca_pivot': text = closeAbove ?? r.reason; break;
      case 'pava_pendiente': text = a.pava?.confirmedDate && !r.reason.includes('volvió') ? 'La rotura ya es antigua: esperar una base nueva o un retroceso controlado hasta el pivot.' : closeAbove ?? r.reason; break;
      case 'rotura_sin_volumen': text = pivot != null ? `Un nuevo cierre sobre ${px(pivot)} con volumen${shares(CONFIG.minVolumeRatio)} en las próximas ${CONFIG.validitySessions} sesiones, o un cierre semanal con ≥ ${times(CONFIG.minWeeklyVolumeRatio)} la media semanal.` : r.reason; break;
      case 'bandera_sin_pava_fuerte': text = `Una bandera simple solo vale con volumen fuerte en la rotura${shares(CONFIG.strongVolumeRatio)}.`; break;
      case 'rs_80_89': text = `RS ≥ ${CONFIG.rsApproved}` + (rs != null ? ` (ahora ${rs})` : '') + ': se recalcula en cada cierre.'; break;
      case 'regimen_correccion': text = `Que ${a.regime?.name ?? 'el mercado'} confirme una nueva tendencia alcista (día de seguimiento con volumen). Mientras tanto, preparar la lista.`; break;
      case 'regimen_presion': text = `Que ${a.regime?.name ?? 'el mercado'} vuelva a tendencia confirmada, o RS ≥ ${CONFIG.rsApprovedUnderPressure}` + (rs != null ? ` (ahora ${rs})` : '') + '.'; break;
      case 'resultados_en_d_sesiones': text = 'Esperar a que publique resultados' + (a.sessionsToEarnings != null ? ` (en ${a.sessionsToEarnings} sesiones)` : '') + ' y ver cómo reacciona el precio.'; break;
      case 'fecha_resultados_desconocida': text = 'Introducir la fecha de resultados en la pestaña Plan.'; break;
      case 'puntuacion_baja': text = scoreText(a); break;
      default: text = r.reason; temporary = r.status === 'BLOCK';
    }
    if (!out.some((x) => x.text === text)) out.push({ rule: r.rule, title: r.title, text, temporary });
  }
  return out;
}

function scoreText(a) {
  const p = a.scoreParts;
  if (!p) return `Puntuación ≥ ${CONFIG.scoreApproved}.`;
  const gaps = [['RS y línea RS', SCORE_MAX.rs - p.rs], ['volumen de la rotura', SCORE_MAX.volume - p.volume], ['oferta por encima', SCORE_MAX.supply - p.supply],
    ['tendencia', SCORE_MAX.trend - p.trend], ['calidad del patrón', SCORE_MAX.pattern - p.pattern]]
    .filter((g) => g[1] >= 1).sort((x, y) => y[1] - x[1]).slice(0, 2);
  return `Puntuación ≥ ${CONFIG.scoreApproved} (ahora ${p.total})` + (gaps.length ? ': donde más puntos faltan es en ' + gaps.map((g) => `${g[0]} (−${Math.trunc(g[1])})`).join(' y ') + '.' : '.');
}

// ---------- the Escáner's automatic lists (AutoLists.kt) ----------

export const AUTO_LISTS = {
  PAVA_BREAKOUT: 'Roturas con PAVA', NEAR_PIVOT: 'Cerca del pivot', RS_LEADER: 'RS líder', DRY_VOLUME: 'Volumen seco',
  VERDICT_CHANGE: 'Cambios de veredicto', EXTENDED: 'Extendidos',
};
export function autoLists(a, daily, previous) {
  const out = [];
  if (!a.asOf) return out;
  const candidate = a.verdict !== 'REJECTED';
  const pivot = a.pattern?.pivot, close = a.lastClose;
  if (a.pava?.confirmedDate && a.pava.confirmedDate === a.asOf) out.push('PAVA_BREAKOUT');
  if (candidate && pivot != null && close < pivot && close >= pivot * (1 - CONFIG.watchZone)) out.push('NEAR_PIVOT');
  if (a.rs?.rating != null && a.rs.rating >= CONFIG.rsApproved && a.rs.lineAt52wHigh) out.push('RS_LEADER');
  if (candidate && a.pattern && !a.pava?.breakoutDate && daily && volumeDry(daily)) out.push('DRY_VOLUME');
  if (previous && previous !== a.verdict) out.push('VERDICT_CHANGE');
  if ((a.extensionPct ?? 0) > CONFIG.buyRangePct) out.push('EXTENDED');
  return out;
}

// ---------- sizing and the pyramid (Risk.kt) ----------

const floorTo = (x, step) => Math.floor(x / step + 1e-9) * step;
export function positionSize(capital, riskFraction, entry, stop, maxWeight = 0.20, fx = 1, step = 1) {
  const perUnit = (entry - stop) * fx;
  if (perUnit <= 0 || capital <= 0 || riskFraction <= 0 || entry <= 0 || fx <= 0) return { quantity: 0, positionValue: 0, weightPct: 0, riskAmount: 0 };
  const byRisk = floorTo(capital * riskFraction / perUnit, step);
  const byWeight = floorTo(capital * maxWeight / (entry * fx), step);
  const quantity = Math.max(0, Math.min(byRisk, byWeight));
  const value = quantity * entry * fx;
  return { quantity, positionValue: value, weightPct: value / capital, riskAmount: quantity * perUnit, byRisk, byWeight };
}
export function pyramid(target, entry, pivot, digits = 2) {
  const t1 = floorTo(target * 0.5, 1), t2 = floorTo(target * 0.3, 1), t3 = Math.round(target - t1 - t2);
  return [
    { number: 1, quantity: t1, condition: 'Al confirmarse el PAVA al cierre.' },
    { number: 2, quantity: t2, condition: `Si el cierre llega a ${fmt(entry * 1.025, digits)} (+2,5 %) sin pasar de ${fmt(pivot * 1.05, digits)}, sin resultados cerca y con el régimen permitiendo compras.` },
    { number: 3, quantity: t3, condition: 'Tras un retroceso a la SMA10 o SMA21 sin cierre por debajo, y una sesión alcista con volumen ≥ su media; posición en beneficio y sin extensión.' },
  ];
}
export const SELL_RULES = [
  'V1 · Stop de pérdida máxima o breakeven: orden real en el broker.',
  'V2 · Colchón ante resultados: sin el colchón, vender o reducir antes del informe.',
  'V3 · Stop por estructura o media: caja Darvas, media de 10 semanas, SMA20 en movimientos verticales (al cierre).',
  'V4 · Toma parcial: con +20 %, vender la mitad y dejar el resto con stop dinámico.',
  'V5 · Regla de las 8 semanas: si gana +20 % en 15 sesiones o menos desde la rotura, no aplicar V4 hasta 40 sesiones después.',
  'V7 · Clímax (aviso): +25 % en 15 sesiones con la mayor subida y el mayor volumen desde la rotura.',
  'V8 · Patrón bajista confirmado (aviso): HCH, doble techo o rotura a la baja de un rango, triángulo o cuña. Mandan los stops; no se añade.',
];

// ---------- an open position, close by close (Paper.kt's stops and sell rules, simplified) ----------

/**
 * Opens a position at [price] on bar [i] with [stop]; [step] then applies one closed session:
 * the stop (V1, a real order: at the stop, or at the open on a gap), the stop to breakeven at
 * +15 %, V3 (vertical move: a close under the SMA20 after one 15 % above it; and the weekly
 * close under the 10-week average with volume once the gain reached 10 %), V4 with V5's wait,
 * and V7 as a warning. Signals are returned; whether to follow them is the caller's choice.
 */
export function openPosition(bars, i, price, stop, quantity, breakoutIndex) {
  return { entryIndex: i, entry: price, quantity, initialQuantity: quantity, stop, initialStop: stop, stopKind: 'Stop inicial',
    highestClose: price, vertical: false, partialTaken: false, partialWait: false, climaxWarned: false, breakoutIndex: breakoutIndex ?? i,
    realized: 0, fills: [{ index: i, price, quantity }], weekChecked: null };
}

export function stepPosition(pos, bars, i, closesCache) {
  const bar = bars[i];
  const events = [];
  if (bar.low <= pos.stop) {
    const gapDown = bar.open <= pos.stop;
    events.push({ kind: 'STOP', rule: 'V1', price: gapDown ? bar.open : pos.stop, label: pos.stopKind, gap: gapDown });
    return events;
  }
  const closes = closesCache || bars.map((b) => b.close);
  const c = closes[i];
  pos.highestClose = Math.max(pos.highestClose, c);
  const gain = c / pos.entry - 1;
  // V3, vertical move
  const s20 = I.sma(closes, 20, i);
  if (s20 != null) {
    if (!pos.vertical) {
      if (c / s20 - 1 > CONFIG.verticalThreshold && c > pos.entry) { pos.vertical = true; events.push({ kind: 'NOTICE', rule: 'V3', text: `Cierra un ${pct(c / s20 - 1)} sobre su SMA20: desde ahora, un cierre por debajo de la SMA20 es señal de venta.` }); }
    } else if (c < s20) events.push({ kind: 'SELL', rule: 'V3', label: 'Cierre bajo la SMA20 tras una subida vertical', text: `Cierre ${fmt(c)} bajo la SMA20 (${fmt(s20)}) después de la subida vertical.` });
  }
  // V3, 10-week average on Fridays once the best gain reached 10 %
  if (dayOfWeek(bar.date) === FRIDAY && pos.highestClose / pos.entry - 1 >= CONFIG.maActivationGain) {
    const weeks = I.toWeekly(bars.slice(0, i + 1));
    const wc = weeks.map((w) => w.close);
    const ma = I.sma(wc, 10);
    const av = I.averageVolumeBefore(weeks, weeks.length - 1, 10);
    const wk = weeks.at(-1);
    if (ma != null && av > 0 && wk.close < ma && wk.volume > av) events.push({ kind: 'SELL', rule: 'V3', label: 'Cierre semanal bajo la media de 10 semanas', text: `Cierre semanal ${fmt(wk.close)} bajo la media de 10 semanas (${fmt(ma)}) con volumen ${times(wk.volume / av)} su media semanal.` });
  }
  // V4 with V5
  if (!pos.partialTaken && gain >= CONFIG.partialGain) {
    const since = i - pos.breakoutIndex;
    if (!pos.partialWait && since <= CONFIG.fastGainSessions) {
      pos.partialWait = true;
      events.push({ kind: 'NOTICE', rule: 'V5', text: `${pct(gain)} en ${since} sesiones desde la rotura: es un líder fuerte. La toma parcial espera a 40 sesiones después de la rotura.` });
    } else if (!pos.partialWait || since >= CONFIG.partialWaitSessions) {
      pos.partialTaken = true;
      events.push({ kind: 'SELL', rule: 'V4', partial: true, label: 'Toma parcial', text: `${pct(gain)} sobre la entrada: se vende la mitad y el resto sigue con su stop.` });
    }
  }
  // V7, a warning
  if (!pos.climaxWarned) {
    const from = Math.max(pos.breakoutIndex, i - CONFIG.climaxSessions);
    if (from < i) {
      let low = Infinity; for (let k = from; k < i; k++) low = Math.min(low, closes[k]);
      if (c / low - 1 >= CONFIG.climaxGain) { pos.climaxWarned = true; events.push({ kind: 'NOTICE', rule: 'V7', text: `${pct(c / low - 1)} en ${i - from} sesiones: posible clímax. Es solo un aviso; mandan los stops.` }); }
    }
  }
  // Stop to breakeven at +15 % (the stop never goes down)
  if (pos.highestClose / pos.entry - 1 >= CONFIG.breakevenGain && pos.entry > pos.stop) {
    pos.stop = pos.entry; pos.stopKind = 'Stop en el precio de entrada';
    events.push({ kind: 'STOP_RAISED', rule: 'V1', text: `Stop subido a ${fmt(pos.entry)}: la ganancia máxima llegó al +${pct(CONFIG.breakevenGain)}.` });
  }
  return events;
}

/** Sells [quantity] (all when null) at [price]; returns the realised result of that sale. */
export function sell(pos, i, price, quantity = null) {
  const q = quantity ?? pos.quantity;
  const result = q * (price - pos.entry);
  pos.quantity -= q; pos.realized += result;
  pos.fills.push({ index: i, price, quantity: -q });
  return result;
}

/**
 * The method on one stock over [from]..[to] (Backtest.symbol, simplified): it buys at the open
 * after an APROBADO evening when that open is inside the buy range and above the plan's stop,
 * sizes by risk, and follows every sell rule at the next open. One position at a time.
 */
export function methodTrades(instrument, bars, from, to, analysisAt, account = { capital: 10000, riskFraction: 0.005, maxWeight: 0.2, fx: 1 }) {
  const trades = [];
  const closes = bars.map((b) => b.close);
  const traded = new Set();
  let t = from;
  while (t < to) {
    const a = analysisAt(t);
    if (a.verdict !== 'APPROVED' || !a.plan || !a.pattern) { t++; continue; }
    const breakout = a.pava?.breakoutDate ?? bars[t].date;
    const next = bars[t + 1];
    if (traded.has(breakout) || next.open <= a.plan.stop || next.open < a.pattern.pivot || next.open > a.pattern.pivot * (1 + CONFIG.buyRangePct)) { t++; continue; }
    traded.add(breakout);
    const stop = Math.max(a.plan.stop, next.open * (1 - CONFIG.maxLoss));
    const size = positionSize(account.capital, account.riskFraction, next.open, stop, account.maxWeight, account.fx);
    const qty = Math.max(1, size.quantity);
    const bIdx = bars.findIndex((b) => b.date === breakout);
    const pos = openPosition(bars, t + 1, next.open, stop, qty, bIdx);
    const risk = qty * (next.open - stop);
    let pendingSell = null, exitIndex = null, exitRule = null;
    for (let i = t + 1; i <= to; i++) {
      if (pendingSell && i > t + 1) {
        sell(pos, i, bars[i].open, pendingSell.partial ? Math.floor(pos.quantity / 2) : null);
        if (pos.quantity <= 0) { exitIndex = i; exitRule = pendingSell.rule; break; }
        pendingSell = null;
      }
      const ev = i === t + 1 ? stepFirst(pos, bars, i, closes) : stepPosition(pos, bars, i, closes);
      const stopEv = ev.find((e) => e.kind === 'STOP');
      if (stopEv) { sell(pos, i, stopEv.price); exitIndex = i; exitRule = 'V1'; break; }
      const sig = ev.find((e) => e.kind === 'SELL');
      if (sig && i < to) pendingSell = sig;
    }
    const open = exitIndex == null;
    const lastPrice = bars[to].close;
    const result = pos.realized + (open ? pos.quantity * (lastPrice - pos.entry) : 0);
    trades.push({ entryIndex: t + 1, entryDate: next.date, entry: next.open, stop, currentStop: pos.stop, quantity: qty, exitIndex, exitDate: open ? null : bars[exitIndex].date,
      exitRule, result, r: risk > 0 ? result / risk : null, gain: result / (qty * next.open), fills: pos.fills, open, verdictScore: a.score });
    t = open ? to : exitIndex;
  }
  return trades;
}
// The session bought at its open can already reach the stop with its own low.
function stepFirst(pos, bars, i, closes) { return stepPosition(pos, bars, i, closes); }

// ---------- the heat map (Sectors.kt) ----------

export function squarify(weights, area) {
  const out = weights.map(() => ({ x: area.x, y: area.y, w: 0, h: 0 }));
  const order = weights.map((w, i) => i).filter((i) => weights[i] > 0 && Number.isFinite(weights[i])).sort((a, b) => weights[b] - weights[a]);
  const total = order.reduce((s, i) => s + weights[i], 0);
  if (!order.length || total <= 0 || area.w <= 0 || area.h <= 0) return out;
  const scale = area.w * area.h / total;
  const sizes = order.map((i) => weights[i] * scale);
  const worst = (from, until, sum, side) => {
    if (sum <= 0 || side <= 0) return Number.MAX_VALUE;
    let hi = 0, lo = Number.MAX_VALUE;
    for (let k = from; k < until; k++) { hi = Math.max(hi, sizes[k]); lo = Math.min(lo, sizes[k]); }
    const s2 = sum * sum, w2 = side * side;
    return Math.max(w2 * hi / s2, s2 / (w2 * lo));
  };
  let rect = { ...area };
  let i = 0;
  while (i < order.length) {
    const side = Math.min(rect.w, rect.h);
    let j = i + 1, sum = sizes[i], wst = worst(i, j, sum, side);
    while (j < order.length) {
      const s = sum + sizes[j];
      const w = worst(i, j + 1, s, side);
      if (w > wst) break;
      wst = w; sum = s; j++;
    }
    const lastRow = j === order.length;
    if (rect.w >= rect.h) {
      const colW = lastRow ? rect.w : rect.h > 0 ? Math.min(rect.w, sum / rect.h) : 0;
      let y = rect.y;
      for (let k = i; k < j; k++) {
        const h = colW > 0 ? sizes[k] / colW : 0;
        out[order[k]] = { x: rect.x, y, w: colW, h: k === j - 1 ? rect.y + rect.h - y : h };
        y += h;
      }
      rect = { x: rect.x + colW, y: rect.y, w: Math.max(0, rect.w - colW), h: rect.h };
    } else {
      const rowH = lastRow ? rect.h : rect.w > 0 ? Math.min(rect.h, sum / rect.w) : 0;
      let x = rect.x;
      for (let k = i; k < j; k++) {
        const w = rowH > 0 ? sizes[k] / rowH : 0;
        out[order[k]] = { x, y: rect.y, w: k === j - 1 ? rect.x + rect.w - x : w, h: rowH };
        x += w;
      }
      rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: Math.max(0, rect.h - rowH) };
    }
    i = j;
  }
  return out;
}

export const TONE_STOPS = ['#F63538', '#BF4045', '#8B444E', '#414554', '#35764E', '#2F9E4F', '#30CC5A'];
export const changeTone = (change) => (change == null || !Number.isFinite(change) ? null : Math.max(-1, Math.min(1, change / 0.03)));
export const rsTone = (rs) => (rs == null ? null : Math.max(-1, Math.min(1, (rs - 70) / 30)));
export const heatWeight = (traded) => (traded > 0 && Number.isFinite(traded) ? Math.sqrt(traded) : 1);
export function toneColor(tone) {
  if (tone == null) return '#2C2F38';
  const x = (Math.max(-1, Math.min(1, tone)) + 1) / 2 * (TONE_STOPS.length - 1);
  const i = Math.min(TONE_STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = TONE_STOPS[i], b = TONE_STOPS[i + 1];
  const ch = (h, k) => parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16);
  const mix = [0, 1, 2].map((k) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * f));
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---------- synthetic series ----------

/** Fixtures.kt's SeriesBuilder: straight legs whose bars span ±2 %, weekdays only. */
export class SeriesBuilder {
  constructor(start, date = '2024-01-01') { this.bars = []; this.price = start; this.date = date; }
  leg(n, to, volume = 1000000) {
    const from = this.price;
    for (let i = 1; i <= n; i++) { const close = from + (to - from) * i / n; this.add(close * 0.995, close * 1.02, close * 0.98, close, volume); }
    return this;
  }
  bar(open, high, low, close, volume) { this.add(open, high, low, close, volume); return this; }
  add(open, high, low, close, volume) {
    while (isWeekend(this.date)) this.date = plusDays(this.date, 1);
    this.bars.push({ date: this.date, open, high, low, close, volume });
    this.price = close;
    this.date = plusDays(this.date, 1);
  }
  build() { return this.bars.slice(); }
}

/** Screens.kt's walk(): weekday bars of a random walk to [today]; up days over 1.5 % trade 2.2 times the volume. */
export function walk(rnd, drift, volatility, start, today) {
  let price = 20 + 80 * rnd.nextDouble();
  let date = plusDays(start, -1);
  const bars = [];
  while (date < today) {
    date = plusDays(date, 1);
    if (isWeekend(date)) continue;
    const r = drift + volatility * rnd.nextGaussian();
    const open = price * (1 + volatility / 3 * rnd.nextGaussian());
    const close = price * (1 + r);
    const high = Math.max(open, close) * (1 + Math.abs(rnd.nextGaussian()) * volatility / 2);
    const low = Math.min(open, close) * (1 - Math.abs(rnd.nextGaussian()) * volatility / 2);
    const volume = Math.trunc(1000000 * Math.exp(0.3 * rnd.nextGaussian()) * (r > 0.015 ? 2.2 : 1));
    bars.push({ date, open, high, low, close, volume });
    price = close;
  }
  return bars;
}

export const SIMPLIFICATIONS = [
  'Stocks only: gold, silver and bitcoin (ratio RS, ATR stops, own-trend regime) are not ported.',
  'No chart-pattern detector (ChartPatterns.kt): no flat base from ranges and no B7 bearish-pattern block.',
  'No fundamentals layer (C/A): every score is rescaled from 90 to 100 points, as the app does without a source.',
  'Earnings dates are known or unknown; the SEC-calendar estimate is not ported.',
  'Positions: stops, breakeven, V3, V4/V5 and V7 are ported; the V2 earnings cushion, tranches 2-3 and trading costs are not simulated.',
];
