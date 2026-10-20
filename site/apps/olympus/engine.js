// Olympus web demo: the app's pure-Dart domain engines, ported to JavaScript.
// No DOM in this file, so Node can test it (site/tests/olympus.test.mjs).
// Each block names the Dart file it comes from, under lib/features/.
// Times are milliseconds since the epoch; durations are stated in their unit.

const MIN = 60000, HOUR = 3600000;

// ------------------------------------------------------------------ running/domain/vdot.dart
// Daniels and Gilbert (1979), Oxygen Power.
export const vo2AtVelocity = v => -4.60 + 0.182258 * v + 0.000104 * v * v;
export function velocityAtVo2(vo2) {
  const a = 0.000104, b = 0.182258, c = -(4.60 + vo2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}
export const fractionOfMax = m => 0.8 + 0.1894393 * Math.exp(-0.012778 * m) + 0.2989558 * Math.exp(-0.1932605 * m);
export const MIN_RACE_MINUTES = 3.5, MAX_RACE_MINUTES = 240;

/** VDOT from a race of `metres` in `seconds`, or null outside 3.5 min to 4 h or 15 to 90. */
export function vdotFrom(metres, seconds) {
  const minutes = seconds / 60;
  if (metres <= 0 || minutes < MIN_RACE_MINUTES || minutes > MAX_RACE_MINUTES) return null;
  const vdot = vo2AtVelocity(metres / minutes) / fractionOfMax(minutes);
  return vdot < 15 || vdot > 90 ? null : vdot;
}

/** Predicted race time in milliseconds (bisection on minutes, as the Dart code does). */
export function predictTimeMs(vdot, metres) {
  let lo = 1, hi = 600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vo2AtVelocity(metres / mid) / fractionOfMax(mid) > vdot) lo = mid; else hi = mid;
  }
  return Math.round(hi * 60000);
}
export const secPerKm = v => 60000 / v;
export const paceAtPercent = (vdot, pct) => secPerKm(velocityAtVo2(vdot * pct));
export const INTENSITIES = { easySlow: 0.59, easyFast: 0.74, threshold: 0.88, interval: 0.975 };
const around = (s, pct = 0.03) => ({ fast: s * (1 - pct), slow: s * (1 + pct) });
export function trainingPaces(vdot) {
  return {
    easy: { fast: paceAtPercent(vdot, INTENSITIES.easyFast), slow: paceAtPercent(vdot, INTENSITIES.easySlow) },
    threshold: around(paceAtPercent(vdot, INTENSITIES.threshold)),
    interval: around(paceAtPercent(vdot, INTENSITIES.interval)),
    fiveK: around(predictTimeMs(vdot, 5000) / 5000, 0.02),
    tenK: around(predictTimeMs(vdot, 10000) / 10000, 0.02),
    half: around(predictTimeMs(vdot, 21097.5) / 21097.5, 0.02),
  };
}

// ------------------------------------------------------------------ nutrition/domain/targets.dart
/** Mifflin et al. (1990): 10 kg + 6.25 cm - 5 age + 5 (men) or - 161 (women). */
export const mifflinStJeor = ({ sex, weightKg, heightCm, age }) =>
  10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
export const ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 };
export const KCAL_PER_KG = 7700;                                  // Wishnofsky 1958
export const WEEKLY_RATE = { loseFat: -0.005, buildMuscle: 0.0025, strength: 0.0015, recomposition: 0, generalFitness: 0 };
export const PROTEIN_PER_KG = { loseFat: 2.0, recomposition: 2.0, buildMuscle: 1.8, strength: 1.8, generalFitness: 1.6 };
export const FAT_ENERGY_SHARE = 0.25;
export const CAFFEINE_LIMIT_MG = 400;
export const waterTargetMl = sex => (sex === 'male' ? 2000 : 1600);
export const goalDeltaKcal = (goal, kg) => WEEKLY_RATE[goal] * kg * KCAL_PER_KG / 7;
export const kcalFloor = (sex, bmr) => Math.max(bmr, sex === 'male' ? 1500 : 1200);
const roundD = x => Math.sign(x) * Math.round(Math.abs(x));   // Dart's roundToDouble: half away from zero

export function ageOn(birth, today) {
  let age = today.getFullYear() - birth.getFullYear();
  const had = today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  return had ? age : age - 1;
}

/** computeTargets without a weekly check-in (TargetMethod.mifflinStJeor). */
export function computeTargets({ sex, weightKg, heightCm, age, activity, goal }) {
  const bmr = mifflinStJeor({ sex, weightKg, heightCm, age });
  const factor = ACTIVITY_FACTORS[activity];
  const tdee = bmr * factor;
  const delta = goalDeltaKcal(goal, weightKg);
  const floor = kcalFloor(sex, bmr);
  const kcal = roundD(Math.max(tdee + delta, floor));
  const proteinG = roundD(PROTEIN_PER_KG[goal] * weightKg);
  const fatG = roundD(kcal * FAT_ENERGY_SHARE / 9);
  const carbsG = roundD(Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4));
  return { bmr, factor, tdee, delta, floor, kcal, proteinG, fatG, carbsG, waterMl: waterTargetMl(sex), caffeineMaxMg: CAFFEINE_LIMIT_MG };
}

// ------------------------------------------------------------------ nutrition/domain/caffeine_curve.dart
export const DEFAULT_HALF_LIFE_H = 5;          // Institute of Medicine 2001
export const ABSORPTION_HALF_LIFE_MIN = 7;     // Liguori, Hughes and Grass 1997
export const SLEEP_LEVEL_MG = 100;             // EFSA 2015
export const DEFAULT_BEDTIME_MIN = 23 * 60;
const STEP = 5 * MIN;

/** Bateman function: share of a dose in the body `ms` after it was taken. */
export function caffeineFraction(ms, halfLifeH = DEFAULT_HALF_LIFE_H) {
  if (ms < 0) return 0;
  const h = Math.floor(ms / 1000) / 3600;       // Dart uses whole seconds
  const ke = Math.LN2 / halfLifeH, ka = Math.LN2 / (ABSORPTION_HALF_LIFE_MIN / 60);
  return ka / (ka - ke) * (Math.exp(-ke * h) - Math.exp(-ka * h));
}
export const caffeineAt = (doses, t, halfLifeH = DEFAULT_HALF_LIFE_H) =>
  doses.reduce((a, d) => a + d.mg * caffeineFraction(t - d.at, halfLifeH), 0);

function bedtimeOn(dayMs, bedMin) {
  const d = new Date(dayMs);
  const next = bedMin < 12 * 60 ? 1 : 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + next, Math.floor(bedMin / 60), bedMin % 60).getTime();
}
export function nextBedtime(now, bedMin = DEFAULT_BEDTIME_MIN) {
  const counts = 6 * HOUR;
  const n = new Date(now);
  const yesterday = bedtimeOn(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1, n.getHours(), n.getMinutes()).getTime(), bedMin);
  if (now < yesterday + counts) return yesterday;
  const tonight = bedtimeOn(now, bedMin);
  if (now < tonight + counts) return tonight;
  return bedtimeOn(new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, n.getHours(), n.getMinutes()).getTime(), bedMin);
}
function ceilToStep(t) {
  const d = new Date(t);
  const m = d.getMinutes() % 5;
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime();
  if (m === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0) return base;
  return base + (5 - m) * MIN;
}

/** CaffeineOutlook: what the curve means for tonight. */
export class CaffeineOutlook {
  constructor({ doses, now, bedtime, halfLifeH = DEFAULT_HALF_LIFE_H }) {
    this.doses = doses.filter(d => d.at <= now && d.mg > 0);
    this.now = now; this.bedtime = bedtime; this.halfLifeH = halfLifeH;
  }
  at(t) { return caffeineAt(this.doses, t, this.halfLifeH); }
  get nowMg() { return this.at(this.now); }
  get bedtimeMg() { return this.at(this.bedtime); }
  get sleepPeakMg() { return this.peakFrom(this.doses, this.bedtime); }
  get sleepOk() { return this.sleepPeakMg < SLEEP_LEVEL_MG; }
  get clearAt() {
    if (!this.doses.length) return null;
    let last = null;
    for (let t = this.now; t <= this.now + 48 * HOUR; t += STEP) if (this.at(t) >= SLEEP_LEVEL_MG) last = t;
    return last === null ? null : last + STEP;
  }
  /** Latest time from now that a drink of `mg` keeps the night under 100 mg; null if too late. */
  lastDoseBy(mg) {
    const fine = t => this.peakFrom([...this.doses, { at: t, mg }], this.bedtime) < SLEEP_LEVEL_MG;
    const start = ceilToStep(this.now);
    if (!(start < this.bedtime) || !fine(start)) return null;
    let ok = start;
    for (let t = start + STEP; t <= this.bedtime; t += STEP) {
      if (!fine(t)) return ok;
      ok = t;
    }
    return this.bedtime;
  }
  curve(from, to, step = 10 * MIN) {
    const out = [];
    for (let t = from; t <= to; t += step) out.push([t, this.at(t)]);
    return out;
  }
  peakFrom(ds, from) {
    let peak = 0;
    for (let t = from; t <= from + 12 * HOUR; t += STEP) {
      const v = caffeineAt(ds, t, this.halfLifeH);
      if (v > peak) peak = v;
      if (v < peak && ds.every(d => Math.trunc((t - d.at) / MIN) > 50)) break;
    }
    return peak;
  }
}

// ------------------------------------------------------------------ training/domain/plates.dart
export const DEFAULT_BAR_KG = 20;
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
/** Greedy, heaviest first, never over the target; works in grams. */
export function loadBar(targetKg, barKg = DEFAULT_BAR_KG, platesKg = DEFAULT_PLATES_KG) {
  const plates = platesKg.filter(p => p > 0).sort((a, b) => b - a);
  let remaining = Math.round((targetKg - barKg) / 2 * 1000);
  const perSide = [];
  for (const p of plates) {
    const g = Math.round(p * 1000);
    while (remaining >= g) { perSide.push(p); remaining -= g; }
  }
  const side = perSide.reduce((s, p) => s + p, 0);
  const totalKg = barKg + 2 * side;
  return { perSide, totalKg, targetKg, barKg, isExact: Math.abs(totalKg - targetKg) < 0.001 };
}
export const smallestBarJump = plates => { const p = plates.filter(x => x > 0); return p.length ? 2 * Math.min(...p) : 2.5; };
export function roundDownTo(kg, step) {
  if (step <= 0) return kg;
  return +((Math.floor((kg + 0.001) / step)) * step).toFixed(3);
}

// ------------------------------------------------------------------ training/domain/one_rep_max.dart
export const MAX_REPS_FOR_ESTIMATE = 12;
export function epley(w, r) {
  if (w <= 0 || r < 1 || r > MAX_REPS_FOR_ESTIMATE) return null;
  return r === 1 ? w : w * (1 + r / 30);
}
export function brzycki(w, r) {
  if (w <= 0 || r < 1 || r > MAX_REPS_FOR_ESTIMATE) return null;
  return w * 36 / (37 - r);
}
export function oneRepMaxRange(w, r) {
  const a = epley(w, r), b = brzycki(w, r);
  if (a === null || b === null) return null;
  return a <= b ? { low: a, high: b } : { low: b, high: a };
}

// ------------------------------------------------------------------ training/domain/overload.dart
export function repSchemeFor(goal, compound) {
  if (goal === 'strength') return compound ? { min: 3, max: 6, targetRir: 2 } : { min: 8, max: 12, targetRir: 2 };
  if (goal === 'generalFitness') return { min: 10, max: 15, targetRir: 2 };
  return compound ? { min: 6, max: 10, targetRir: 2 } : { min: 10, max: 15, targetRir: 2 };
}
export function weightStepFor(equipment, plates = DEFAULT_PLATES_KG) {
  switch (equipment) {
    case 'barbell': case 'ezBar': return smallestBarJump(plates);
    case 'dumbbell': return 2;
    case 'kettlebells': return 4;
    case 'machine': return 5;
    default: return 2.5;
  }
}
/** Double progression (no machine stack). sets: [{weightKg, reps, rir}]. */
export function suggestNext(lastSession, scheme, weightStep) {
  const sets = lastSession.filter(s => (s.reps ?? 0) > 0);
  if (!sets.length) return null;
  const topWeight = Math.max(...sets.map(s => s.weightKg ?? 0));
  if (topWeight <= 0) {
    const best = Math.max(...sets.map(s => s.reps));
    return { weightKg: null, reps: best + 1, reason: 'addRepBodyweight', lastWeightKg: null, lastReps: best };
  }
  const top = sets.filter(s => (s.weightKg ?? 0) === topWeight);
  const bestReps = Math.max(...top.map(s => s.reps)), worstReps = Math.min(...top.map(s => s.reps));
  const allAtTop = top.every(s => s.reps >= scheme.max && (s.rir ?? scheme.targetRir) >= scheme.targetRir - 1);
  if (allAtTop) return { weightKg: topWeight + weightStep, reps: scheme.min, reason: 'addWeight', lastWeightKg: topWeight, lastReps: bestReps };
  if (top.some(s => s.reps < scheme.min && (s.rir ?? 1) === 0)) {
    const lower = roundDownTo(topWeight * 0.9, weightStep);
    return { weightKg: lower > 0 ? lower : topWeight, reps: scheme.min, reason: 'reduceWeight', lastWeightKg: topWeight, lastReps: bestReps };
  }
  const nextReps = Math.min(Math.max(worstReps + 1, scheme.min), scheme.max);
  return { weightKg: topWeight, reps: nextReps, reason: 'addRep', lastWeightKg: topWeight, lastReps: bestReps };
}

// ------------------------------------------------------------------ sync/domain/readiness.dart
export const SLEEP_GOAL_H = 7, SLEEP_FLOOR_H = 4, MIN_BASELINE_DAYS = 7, BASELINE_DAYS = 28;
const clamp100 = v => Math.round(Math.min(100, Math.max(0, v)));
export const sleepPart = h => ({ score: clamp100((h - SLEEP_FLOOR_H) / (SLEEP_GOAL_H - SLEEP_FLOOR_H) * 100), value: h });
function meanSd(xs) {
  if (xs.length < MIN_BASELINE_DAYS) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1));
  return [mean, sd];
}
export function restingHrPart(today, baseline) {
  const ms = meanSd(baseline);
  if (!ms) return null;
  const z = (today - ms[0]) / Math.max(ms[1], 1);
  return { score: clamp100(75 - 25 * z), value: today, baseline: ms[0] };
}
export function hrvPart(todayMs, baselineMs) {
  const ms = meanSd(baselineMs.filter(b => b > 0).map(Math.log));
  if (!ms || todayMs <= 0) return null;
  const z = (Math.log(todayMs) - ms[0]) / Math.max(ms[1], 0.05);
  return { score: clamp100(75 + 25 * z), value: todayMs, baseline: Math.exp(ms[0]) };
}
export function readiness({ sleepHours = null, restingHr = null, restingHrBaseline = [], hrvMs = null, hrvBaseline = [] }) {
  const s = sleepHours === null ? null : sleepPart(sleepHours);
  const r = restingHr === null ? null : restingHrPart(restingHr, restingHrBaseline);
  const h = hrvMs === null ? null : hrvPart(hrvMs, hrvBaseline);
  const parts = [s, r, h].filter(Boolean);
  if (!parts.length) return null;
  const score = Math.round(parts.reduce((a, p) => a + p.score, 0) / parts.length);
  return { score, sleep: s, restingHr: r, hrv: h, band: score >= 70 ? 'ready' : score >= 40 ? 'steady' : 'low' };
}

// ------------------------------------------------------------------ training/domain/engine/recovery.dart
export const MUSCLES = ['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings',
  'lats', 'lowerBack', 'middleBack', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps'];
// lifting_plan.dart smallMuscles
export const SMALL_MUSCLES = new Set(['biceps', 'triceps', 'calves', 'abdominals', 'forearms', 'neck', 'traps', 'abductors', 'adductors']);
export const recoveryHours = m => (SMALL_MUSCLES.has(m) ? 48 : 72);
export const FATIGUE_CAPACITY = 10, LOAD_PER_SET_UNIT = 50;
export const SPORT_MUSCLE_SHARE = {
  running: { quadriceps: 1, calves: 1, hamstrings: 0.7, glutes: 0.7 },
  climbing: { forearms: 1, lats: 0.8, biceps: 0.7, middleBack: 0.5, shoulders: 0.4, abdominals: 0.3 },
};
/** Session load (schedule.dart): RPE x minutes, in arbitrary units. */
export const sessionLoad = (rpe, minutes) => rpe * minutes;
export const stimuliFromActivities = acts => acts.flatMap(a =>
  Object.entries(SPORT_MUSCLE_SHARE[a.sport] || {}).map(([m, share]) =>
    ({ muscle: m, units: sessionLoad(a.rpe, a.minutes) / LOAD_PER_SET_UNIT * share, at: a.at })));
/** Sets: 1 unit per main muscle, 0.5 per secondary one. */
export const stimuliFromSets = sets => sets.flatMap(s => [
  ...s.primary.map(m => ({ muscle: m, units: s.sets, at: s.at })),
  ...(s.secondary || []).filter(m => !s.primary.includes(m)).map(m => ({ muscle: m, units: 0.5 * s.sets, at: s.at })),
]);
export function fatigueAt(stimuli, now) {
  const out = {};
  for (const s of stimuli) {
    const hours = Math.trunc((now - s.at) / MIN) / 60;
    if (hours < 0) continue;
    const tau = recoveryHours(s.muscle) / Math.log(20);
    const left = s.units * Math.exp(-hours / tau);
    if (left < 0.01) continue;
    out[s.muscle] = (out[s.muscle] || 0) + left;
  }
  return out;
}
export function freshness(stimuli, now) {
  const f = fatigueAt(stimuli, now);
  return Object.fromEntries(MUSCLES.map(m => [m, Math.min(1, Math.max(0, 1 - (f[m] || 0) / FATIGUE_CAPACITY))]));
}
export const bandOf = f => (f >= 0.8 ? 'fresh' : f >= 0.5 ? 'recovering' : f >= 0.2 ? 'tired' : 'veryTired');
/** Hours from `now` until `muscle` is back to `target` freshness (hour steps; 0 if already there). */
export function hoursUntilFresh(stimuli, muscle, now, target = 0.95) {
  for (let h = 0; h <= 240; h++) if (freshness(stimuli, now + h * HOUR)[muscle] >= target) return h;
  return null;
}

// ------------------------------------------------------------------ training/domain/engine/session_time.dart + adaptation.dart
export const WORK_SECONDS_PER_SET = 40, SETUP_SECONDS_PER_EXERCISE = 60, SUPERSET_SWITCH_SECONDS = 15;
export function sessionSeconds(exercises) {
  const live = exercises.filter(e => e.sets > 0);
  let total = 0;
  const groups = new Map();
  for (const e of live) {
    if (e.supersetGroup == null) total += e.sets * WORK_SECONDS_PER_SET + (e.sets - 1) * e.restSeconds + SETUP_SECONDS_PER_EXERCISE;
    else { if (!groups.has(e.supersetGroup)) groups.set(e.supersetGroup, []); groups.get(e.supersetGroup).push(e); }
  }
  for (const g of groups.values()) {
    const rounds = Math.max(...g.map(e => e.sets));
    const all = g.reduce((n, e) => n + e.sets, 0);
    const rest = Math.max(...g.map(e => e.restSeconds));
    total += all * WORK_SECONDS_PER_SET + (rounds - 1) * rest + (all - rounds) * SUPERSET_SWITCH_SECONDS + g.length * SETUP_SECONDS_PER_EXERCISE;
  }
  return total;
}
export const sessionMinutes = exercises => Math.ceil(sessionSeconds(exercises) / 60);

export function trimToMinutes(exercises, minutes) {
  const list = exercises.map(e => ({ ...e }));
  const cut = {};
  const fits = () => sessionMinutes(list) <= minutes;
  const takeFrom = (which, floor) => {
    while (!fits()) {
      let pick = -1;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (!which(e) || e.sets <= floor) continue;
        if (pick < 0 || e.sets > list[pick].sets) pick = i;
      }
      if (pick < 0) return;
      const e = list[pick];
      cut[e.id] = (cut[e.id] || 0) + 1;
      list[pick] = { ...e, sets: e.sets - 1, cutSets: (e.cutSets || 0) + 1 };
    }
  };
  takeFrom(e => !e.compound, 0);
  takeFrom(e => e.compound, 2);
  return { kept: list.filter(e => e.sets > 0), cut };
}
const REGION = { squat: 'lower', hinge: 'lower', lunge: 'lower', kneeFlexion: 'lower', kneeExtension: 'lower', glutes: 'lower', calves: 'lower',
  station: 'lower', horizontalPush: 'push', inclinePush: 'push', chestFly: 'push', verticalPush: 'push', lateralRaise: 'push', triceps: 'push',
  verticalPull: 'pull', horizontalPull: 'pull', rearDelt: 'pull', biceps: 'pull', abs: 'core' };
export const canSuperset = (a, b) => REGION[a.slot] !== REGION[b.slot] || a.slot === 'abs';

/** "I only have N minutes": supersets first (isolation pairs, then compound), then trims sets. */
export function adaptSession(exercises, minutes) {
  const before = sessionMinutes(exercises);
  let list = exercises.map(e => ({ ...e }));
  let pairs = 0;
  if (before > minutes) {
    let nextGroup = Math.max(0, ...list.map(e => e.supersetGroup ?? 0)) + 1;
    for (const compound of [false, true]) {
      let i = 0;
      while (i < list.length && sessionMinutes(list) > minutes) {
        const a = list[i];
        if (a.compound !== compound || a.supersetGroup != null) { i++; continue; }
        let j = -1;
        for (let k = i + 1; k < list.length; k++) {
          const b = list[k];
          if (b.compound === compound && b.supersetGroup == null && canSuperset(a, b)) { j = k; break; }
        }
        if (j < 0) { i++; continue; }
        const [b] = list.splice(j, 1);
        list[i] = { ...a, supersetGroup: nextGroup };
        list.splice(i + 1, 0, { ...b, supersetGroup: nextGroup });
        nextGroup++; pairs++; i += 2;
      }
    }
  }
  const trimmed = trimToMinutes(list, minutes);
  list = trimmed.kept;
  const counts = {};
  for (const e of list) if (e.supersetGroup != null) counts[e.supersetGroup] = (counts[e.supersetGroup] || 0) + 1;
  list = list.map(e => (e.supersetGroup != null && counts[e.supersetGroup] === 1 ? { ...e, supersetGroup: null } : e));
  const cutSets = Object.values(trimmed.cut).reduce((a, b) => a + b, 0);
  return { exercises: list, cut: trimmed.cut, cutSets, supersets: pairs, changed: cutSets > 0 || pairs > 0, minutesBefore: before, minutesAfter: sessionMinutes(list), minutesAvailable: minutes };
}

// ------------------------------------------------------------------ running/domain/heat.dart
export const vapourPressure = (t, rh) => rh / 100 * 6.105 * Math.exp(17.27 * t / (237.7 + t));
export const wbgtFrom = (t, rh) => 0.567 * t + 0.393 * vapourPressure(t, rh) + 3.94;
export const ELY_POINTS = [[7.5, 0], [12.5, 0.8], [17.5, 1.6], [22.5, 2.8]];
export const HEAT_CAP_WBGT = 28;
export function heatPercent(wbgt) {
  if (wbgt <= ELY_POINTS[0][0]) return 0;
  const w = Math.min(wbgt, HEAT_CAP_WBGT);
  for (let i = 1; i < ELY_POINTS.length; i++) {
    const [x1, y1] = ELY_POINTS[i];
    if (w <= x1) { const [x0, y0] = ELY_POINTS[i - 1]; return y0 + (y1 - y0) * (w - x0) / (x1 - x0); }
  }
  const [x0, y0] = ELY_POINTS[2], [x1, y1] = ELY_POINTS[3];
  return y1 + (y1 - y0) / (x1 - x0) * (w - x1);
}
export function heatAdjustment(tempC, humidity) {
  const wbgt = wbgtFrom(tempC, humidity), percent = heatPercent(wbgt);
  return { tempC, humidity, wbgt, percent, applies: percent >= 0.1, factor: 1 + percent / 100 };
}

// ------------------------------------------------------------------ races/domain/race_prediction.dart
export const VO2_DROP_PER_1000M = 0.063, ALTITUDE_BASE_M = 300;    // Wehrlin and Hallen 2006
export function altitudeDrop(altitudeM, homeM = null) {
  if (altitudeM == null) return 0;
  const base = Math.max(ALTITUDE_BASE_M, homeM ?? 0);
  return altitudeM <= base ? 0 : VO2_DROP_PER_1000M * (altitudeM - base) / 1000;
}
/** Minetti et al. 2002, J/kg/m on gradient i, clamped to +-0.45. */
export function minettiCost(i) {
  const g = Math.min(0.45, Math.max(-0.45, i));
  return 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
}
export const FLAT_COST = 3.6, DESCENT_CREDIT = 0.5;
export function hillFactor(metres, gainM, lossM) {
  if (metres <= 0 || gainM + lossM <= 0) return 1;
  const grade = (gainM + lossM) / metres;
  const upM = metres * gainM / (gainM + lossM), downM = metres - upM;
  const up = minettiCost(grade) / FLAT_COST;
  const down = 1 - DESCENT_CREDIT * (1 - minettiCost(-grade) / FLAT_COST);
  return (upM * up + downM * down) / metres;
}
export function courseFactor(metres, gainM, lossM, sections) {
  if (metres <= 0) return 1;
  let covered = 0, gain = 0, loss = 0, cost = 0;
  for (const s of sections) {
    const m = s.toM - s.fromM;
    if (m <= 0) continue;
    covered += m; gain += s.gainM; loss += s.lossM;
    cost += m * hillFactor(m, s.gainM, s.lossM);
  }
  const rest = Math.max(0, metres - covered);
  if (rest > 0) cost += rest * hillFactor(rest, Math.max(0, gainM - gain), Math.max(0, lossM - loss));
  return cost / Math.max(metres, covered);
}
export const TERRAIN_FACTOR = { road: 1, track: 1, trail: 1.05, mixed: 1.025, sand: 1.6 };
export const MIN_SHOWN_PERCENT = 0.1;

/** predictRace for a course without stretch-by-stretch ground (the 0.11.37 path) and no own-trail factor. */
export function predictRace(race, vdot, homeAltitudeM = null) {
  const d = race.distanceM;
  if (!d || d <= 0) return null;
  const heat = race.tempC != null && race.humidity != null ? heatAdjustment(race.tempC, race.humidity) : null;
  const flat = predictTimeMs(vdot, d);
  const vdotAlt = vdot * (1 - altitudeDrop(race.altitudeM, homeAltitudeM));
  const hills = courseFactor(d, race.gainM || 0, race.lossM || 0, race.sections || []);
  const terrain = TERRAIN_FACTOR[race.terrain || 'road'];
  const atAltitude = predictTimeMs(vdotAlt, d), withHills = predictTimeMs(vdotAlt, d * hills), onTerrain = predictTimeMs(vdotAlt, d * hills * terrain);
  const mins = ms => ms / 60000;
  const flatOk = mins(flat) >= MIN_RACE_MINUTES && mins(flat) <= MAX_RACE_MINUTES;
  if (!flatOk || mins(onTerrain) > MAX_RACE_MINUTES || mins(onTerrain) < MIN_RACE_MINUTES) {
    return { metres: d, flatSeconds: flatOk ? Math.floor(flat / 1000) : null, seconds: null, adjustments: [], heat, hills, terrain };
  }
  const heatFactor = heat && heat.applies ? heat.factor : 1;
  const onGround = onTerrain / 1000, finalSeconds = onGround * heatFactor;
  const steps = [['altitude', flat / 1000, atAltitude / 1000], ['hills', atAltitude / 1000, withHills / 1000],
    ['terrain', withHills / 1000, onGround], ['heat', onGround, finalSeconds]];
  const adjustments = steps
    .filter(([, b, a]) => Math.abs((a - b) / b * 100) >= MIN_SHOWN_PERCENT)
    .map(([kind, b, a]) => ({ kind, seconds: Math.round(a - b), percent: (a - b) / b * 100 }));
  return { metres: d, flatSeconds: Math.floor(flat / 1000), seconds: Math.round(finalSeconds), adjustments, heat, hills, terrain, vdotAtAltitude: vdotAlt };
}

/** Course sections (one per kilometre) from an elevation profile [[metres, altitude], ...]. */
export function sectionsFromProfile(profile, every = 1000) {
  const out = [];
  for (let from = 0; from < profile[profile.length - 1][0]; from += every) {
    const to = Math.min(from + every, profile[profile.length - 1][0]);
    let gain = 0, loss = 0;
    for (let i = 1; i < profile.length; i++) {
      const [x0, y0] = profile[i - 1], [x1, y1] = profile[i];
      if (x1 <= from || x0 >= to) continue;
      const share = (Math.min(x1, to) - Math.max(x0, from)) / (x1 - x0);
      const dy = (y1 - y0) * share;
      if (dy > 0) gain += dy; else loss -= dy;
    }
    out.push({ fromM: from, toM: to, gainM: gain, lossM: loss });
  }
  return out;
}

// ------------------------------------------------------------------ climbing/domain/grades.dart
// Draper et al. 2015, IRCRA position statement on comparative grading scales.
export const FONT_GRADES = [['3', 11], ['4', 12], ['4+', 13], ['5', 14], ['5+', 15], ['6A', 16], ['6A+', 16], ['6B', 17], ['6B+', 18],
  ['6C', 19], ['6C+', 19], ['7A', 20], ['7A+', 21], ['7B', 22], ['7B+', 23], ['7C', 24], ['7C+', 25], ['8A', 26], ['8A+', 27],
  ['8B', 28], ['8B+', 29], ['8C', 31], ['8C+', 32]].map(([label, ircra]) => ({ system: 'font', label, ircra }));
export const V_GRADES = [['VB', 9], ['V0', 12], ['V1', 14], ['V2', 15.5], ['V3', 17], ['V4', 18], ['V5', 19], ['V6', 20], ['V7', 21],
  ['V8', 22.5], ['V9', 24], ['V10', 25], ['V11', 26], ['V12', 27], ['V13', 28], ['V14', 29.5], ['V15', 31], ['V16', 32]]
  .map(([label, ircra]) => ({ system: 'v', label, ircra }));
export const gradesOf = s => (s === 'font' ? FONT_GRADES : V_GRADES);
export function parseGrade(system, label) {
  const k = label.replace(/ /g, '').toUpperCase();
  return gradesOf(system).find(g => g.label.toUpperCase() === k) || null;
}
export function nearestGrade(system, ircra) {
  const list = gradesOf(system);
  let best = list[0];
  for (const g of list) if (Math.abs(g.ircra - ircra) < Math.abs(best.ircra - ircra)) best = g;
  return best;
}
export const convertGrade = (g, to) => (g.system === to ? g : nearestGrade(to, g.ircra));

// ------------------------------------------------------------------ sync/domain/heart_zones.dart
export const tanakaMaxHr = age => Math.round(208 - 0.7 * age);   // Tanaka, Monahan and Seals 2001
export const ZONE_STARTS = [0.5, 0.6, 0.7, 0.8, 0.9];             // Karvonen et al. 1957
export function heartZoneStarts(maxHr, restHr = null) {
  const floor = restHr != null && restHr < maxHr ? restHr : 0;
  return ZONE_STARTS.map(s => Math.round(floor + s * (maxHr - floor)));
}

// ------------------------------------------------------------------ wellbeing/domain/breathing.dart
export const BREATH_PATTERNS = {
  cyclicSighing: [['inhale', 2.5], ['topUp', 1], ['exhale', 6.5]],   // Balban et al. 2023
  box: [['inhale', 4], ['hold', 4], ['exhale', 4], ['holdEmpty', 4]], // Balban et al. 2023
  sixPerMinute: [['inhale', 5], ['exhale', 5]],                        // Lehrer and Gevirtz 2014
};
export const BREATHING_MINUTES = [1, 3, 5, 10];
export const cycleSeconds = p => BREATH_PATTERNS[p].reduce((s, [, x]) => s + x, 0);
export function pacerAt(pattern, elapsed) {
  const phases = BREATH_PATTERNS[pattern], len = cycleSeconds(pattern);
  const t = elapsed < 0 ? 0 : elapsed;
  const cycle = Math.floor(t / len);
  let inCycle = t - cycle * len, i = 0;
  while (i < phases.length - 1 && inCycle >= phases[i][1]) { inCycle -= phases[i][1]; i++; }
  const [kind, secs] = phases[i];
  const progress = Math.min(1, Math.max(0, inCycle / secs));
  const full = phases.some(p => p[0] === 'topUp') ? 0.8 : 1;
  const lungs = { inhale: progress * full, topUp: 0.8 + progress * 0.2, hold: 1, exhale: 1 - progress, holdEmpty: 0 }[kind];
  return { cycle, phaseIndex: i, kind, seconds: secs, progress, lungs };
}
export const breathsIn = (p, minutes) => Math.min(1000, Math.max(1, Math.floor(minutes * 60 / cycleSeconds(p))));

// ------------------------------------------------------------------ mobility/domain/pose_figures.dart
export const JOINTS = ['head', 'shoulder', 'hip', 'elbowNear', 'handNear', 'elbowFar', 'handFar', 'kneeNear', 'footNear', 'kneeFar', 'footFar'];
export const BONES = [['shoulder', 'hip'], ['shoulder', 'elbowFar'], ['elbowFar', 'handFar'], ['hip', 'kneeFar'], ['kneeFar', 'footFar'],
  ['shoulder', 'elbowNear'], ['elbowNear', 'handNear'], ['hip', 'kneeNear'], ['kneeNear', 'footNear']];
export const FLOOR_Y = 90, HEAD_RADIUS = 5.5, POSE_LOOP_SECONDS = 4;
export const isFar = j => j === 'elbowFar' || j === 'handFar' || j === 'kneeFar' || j === 'footFar';
function frame(j) {
  const nudge = p => [p[0] + 2.5, p[1] - 1];
  return { ...j, elbowFar: j.elbowFar || nudge(j.elbowNear), handFar: j.handFar || nudge(j.handNear),
    kneeFar: j.kneeFar || nudge(j.kneeNear), footFar: j.footFar || nudge(j.footNear) };
}
export const lerpFrame = (a, b, t) => Object.fromEntries(JOINTS.map(j => [j, [a[j][0] + (b[j][0] - a[j][0]) * t, a[j][1] + (b[j][1] - a[j][1]) * t]]));
export function poseProgress(phase) {
  const p = phase - Math.floor(phase);
  const ease = x => x * x * (3 - 2 * x);
  if (p < 0.35) return ease(p / 0.35);
  if (p < 0.75) return 1;
  return 1 - ease((p - 0.75) / 0.25);
}
const tabletop = frame({ head: [24, 58], shoulder: [32, 64], hip: [66, 64], elbowNear: [32, 77], handNear: [32, 90], kneeNear: [66, 90], footNear: [86, 90] });
const supine = frame({ head: [14, 83], shoulder: [24, 86], hip: [56, 86], elbowNear: [40, 87], handNear: [52, 87], kneeNear: [72, 86], footNear: [90, 87] });
const standing = frame({ head: [50, 14], shoulder: [50, 25], hip: [50, 53], elbowNear: [50, 39], handNear: [50, 53], kneeNear: [50, 71], footNear: [50, 90] });
export const POSE_FIGURES = {
  downward_dog: [tabletop, frame({ head: [37, 76], shoulder: [36, 69], hip: [58, 38], elbowNear: [30, 80], handNear: [24, 90], kneeNear: [68, 64], footNear: [78, 90] })],
  low_lunge: [tabletop, frame({ head: [50, 27], shoulder: [51, 38], hip: [53, 66], elbowNear: [44, 26], handNear: [41, 14], kneeNear: [34, 70], footNear: [34, 90], kneeFar: [70, 88], footFar: [88, 90] })],
  pigeon: [tabletop, frame({ head: [41, 43], shoulder: [44, 53], hip: [50, 79], elbowNear: [38, 71], handNear: [35, 89], kneeNear: [32, 85], footNear: [45, 89], kneeFar: [70, 88], footFar: [90, 90] })],
  cobra: [frame({ head: [18, 84], shoulder: [28, 86], hip: [58, 87], elbowNear: [36, 84], handNear: [30, 89], kneeNear: [74, 88], footNear: [90, 89] }),
    frame({ head: [24, 54], shoulder: [30, 64], hip: [58, 87], elbowNear: [34, 76], handNear: [30, 89], kneeNear: [74, 88], footNear: [90, 89] })],
  thread_the_needle: [tabletop, frame({ head: [30, 85], shoulder: [38, 82], hip: [66, 64], elbowNear: [47, 86], handNear: [57, 88], elbowFar: [30, 84], handFar: [26, 90], kneeNear: [66, 90], footNear: [86, 90] })],
  supine_twist: [supine, frame({ head: [14, 83], shoulder: [24, 86], hip: [56, 86], elbowNear: [40, 87], handNear: [52, 87], elbowFar: [24, 76], handFar: [25, 65], kneeNear: [62, 70], footNear: [74, 80], kneeFar: [72, 86], footFar: [90, 87] })],
  happy_baby: [supine, frame({ head: [14, 83], shoulder: [24, 86], hip: [52, 86], elbowNear: [34, 72], handNear: [40, 58], kneeNear: [36, 72], footNear: [40, 56] })],
  garland: [standing, frame({ head: [46, 42], shoulder: [48, 52], hip: [54, 78], elbowNear: [40, 62], handNear: [45, 57], kneeNear: [38, 66], footNear: [47, 90] })],
  puppy: [tabletop, frame({ head: [25, 86], shoulder: [32, 83], hip: [66, 64], elbowNear: [21, 87], handNear: [11, 89], kneeNear: [66, 90], footNear: [86, 90] })],
  seated_forward_fold: [frame({ head: [49, 47], shoulder: [50, 58], hip: [50, 86], elbowNear: [54, 72], handNear: [60, 85], kneeNear: [70, 86], footNear: [90, 86] }),
    frame({ head: [80, 73], shoulder: [71, 70], hip: [50, 86], elbowNear: [80, 80], handNear: [89, 84], kneeNear: [70, 86], footNear: [90, 86] })],
  wrist_stretch: [frame({ head: [46, 28], shoulder: [46, 38], hip: [47, 65], elbowNear: [41, 52], handNear: [37, 64], kneeNear: [44, 90], footNear: [68, 90] }),
    frame({ head: [32, 54], shoulder: [36, 64], hip: [55, 72], elbowNear: [30, 77], handNear: [26, 89], kneeNear: [44, 90], footNear: [68, 90] })],
  legs_up_the_wall: [supine, frame({ head: [14, 83], shoulder: [24, 86], hip: [52, 86], elbowNear: [36, 87], handNear: [46, 87], kneeNear: [53, 66], footNear: [54, 46] })],
};
export const POSE_WALL_X = { legs_up_the_wall: 57 };

// ------------------------------------------------------------------ coach/domain/number_guard.dart
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
export function readings(s) {
  const seps = (s.match(/[.,]/g) || []).length;
  if (seps === 0) return [parseFloat(s)];
  const groups = s.split(/[.,]/);
  const thousands = groups.slice(1).every(g => g.length === 3);
  const values = new Set();
  if (thousands) values.add(parseFloat(groups.join('')));
  if (seps === 1) values.add(parseFloat(s.replace(',', '.')));
  if (!values.size) values.add(parseFloat(groups.join('')));
  return [...values];
}
export function findNumbers(text) {
  const out = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const s = m[0], start = m.index, end = start + s.length;
    const before = start > 0 ? text[start - 1] : '', after = text.slice(end);
    if (/[A-Za-zÀ-ÿ]/.test(before)) continue;
    if (/^RM\b/i.test(after)) continue;
    const lineStart = start === 0 || text[start - 1] === '\n' || /\n\s*$/.test(text.slice(0, start));
    if (lineStart && /^[.)]\s/.test(after)) continue;
    out.push({ text: s, start, end, values: readings(s) });
  }
  return out;
}
export function numbersIn(value) {
  const out = new Set();
  const walk = v => {
    if (typeof v === 'number') out.add(v);
    else if (typeof v === 'string') findNumbers(v).forEach(n => n.values.forEach(x => out.add(x)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}
export const isAllowed = (value, allowed) => [...allowed].some(a => Math.abs(value - a) <= Math.max(Math.abs(a) * 0.01, 0.5));
const UNIT_AFTER = /^\s*(kg|g|gr|kcal|cal|ml|l|km|m|min|mins|minutes?|minutos?|s|seg|segundos?|seconds?|h|horas?|hours?|%|sets?|series|reps?|repeticiones|rir|rpe)\b/i;
export const unverifiedNumbers = (reply, allowed) => findNumbers(reply).filter(n => !n.values.some(v =>
  (v === Math.round(v) && v <= 10 && !UNIT_AFTER.test(reply.slice(n.end))) || isAllowed(v, allowed)));

// ------------------------------------------------------------------ sync/data/demo_health_connect.dart (synthetic)
// Same seeds and ranges as the app's screenshot data source; Dart's Random is swapped for mulberry32,
// so the numbers differ from the app's, but they are just as made up and just as repeatable.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = d => d.getFullYear() * 400 + (d.getMonth() + 1) * 32 + d.getDate();
const nextInt = (r, n) => Math.floor(r() * n);

/** The night that ends on the morning of `day`: 90-minute cycles, more deep sleep early and more REM late. */
export function demoNight(day) {
  const r = mulberry32(seedOf(day) + 1);
  const bed = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 22, 50).getTime() + nextInt(r, 70) * MIN;
  const wake = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 6, 35).getTime() + nextInt(r, 60) * MIN;
  const stages = [];
  let t = bed + (8 + nextInt(r, 10)) * MIN;
  stages.push([bed, t, 'awake']);
  let cycle = 0;
  while (t < wake) {
    const deep = Math.max(4, 34 - cycle * 8 + nextInt(r, 8));
    const rem = 12 + cycle * 6 + nextInt(r, 8);
    const light = 90 - deep - rem;
    for (const [m, s] of [[light, 'light'], [deep, 'deep'], [rem, 'rem'], [nextInt(r, 5) + 1, 'awake']]) {
      const end = t + m * MIN;
      stages.push([t, Math.min(end, wake), s]);
      t = end;
      if (t >= wake) break;
    }
    cycle++;
  }
  const asleep = stages.filter(s => s[2] !== 'awake').reduce((a, s) => a + (s[1] - s[0]), 0);
  return { bed, wake, stages, sleepHours: asleep / HOUR };
}
export function demoDay(day) {
  return {
    day,
    steps: 5200 + nextInt(mulberry32(seedOf(day)), 7000),
    night: demoNight(day),
    restingHr: 52 + nextInt(mulberry32(seedOf(day) + 2), 6),
    hrvMs: 48 + nextInt(mulberry32(seedOf(day) + 3), 22),
  };
}
/** readinessOn: today's sleep, resting HR and HRV against the 28 days before. */
export function demoReadiness(today) {
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const t = demoDay(d0);
  const before = [];
  for (let i = 1; i <= BASELINE_DAYS; i++) before.push(demoDay(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - i)));
  return {
    today: t,
    result: readiness({ sleepHours: t.night.sleepHours, restingHr: t.restingHr, restingHrBaseline: before.map(d => d.restingHr),
      hrvMs: t.hrvMs, hrvBaseline: before.map(d => d.hrvMs) }),
  };
}
