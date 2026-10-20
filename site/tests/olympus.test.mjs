// Tests for the Olympus web demo's ported formulas: node site/tests/olympus.test.mjs
// Expected values are what the Dart code in lib/features/*/domain gives for the same inputs
// (worked by hand from the same equations, and checked against the published tables where they exist).
import assert from 'node:assert/strict';
import * as E from '../apps/olympus/engine.js';

const ok = name => console.log('ok  ' + name);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ± ${tol}`);

// running/domain/vdot.dart: Daniels and Gilbert (1979)
near(E.vdotFrom(5000, 20 * 60), 49.81, 0.01, 'VDOT from a 20:00 5K');          // Daniels' table: 49.8
near(E.vdotFrom(5000, 25 * 60), 38.31, 0.01, 'VDOT from a 25:00 5K');          // Daniels' table: 38.3
assert.equal(E.vdotFrom(1000, 3 * 60), null);                                   // under 3.5 minutes: outside the formula
assert.equal(E.vdotFrom(42195, 5 * 3600), null);                                // over 4 hours
ok('VDOT from a race time');
near(E.predictTimeMs(E.vdotFrom(5000, 1200), 5000) / 1000, 1200, 0.5, 'predictTime inverts vdotFrom');
near(E.predictTimeMs(50, 10000) / 1000, 41 * 60 + 21, 3, 'VDOT 50 10K');       // Daniels' table: 41:21
near(E.velocityAtVo2(E.vo2AtVelocity(250)), 250, 1e-9, 'velocityAtVo2 inverts vo2AtVelocity');
ok('race time from VDOT');

// nutrition/domain/targets.dart: Mifflin-St Jeor and the targets built on it
assert.equal(E.mifflinStJeor({ sex: 'male', weightKg: 76, heightCm: 178, age: 34 }), 1707.5);
assert.equal(E.mifflinStJeor({ sex: 'female', weightKg: 60, heightCm: 165, age: 25 }), 1345.25);
ok('Mifflin-St Jeor BMR');
const tg = E.computeTargets({ sex: 'male', weightKg: 76, heightCm: 178, age: 34, activity: 'moderate', goal: 'buildMuscle' });
near(tg.tdee, 2646.625, 1e-9, 'TDEE');
near(tg.delta, 209, 1e-9, 'goal surplus: 0.25 % x 76 kg x 7700 / 7');
assert.deepEqual([tg.kcal, tg.proteinG, tg.fatG, tg.carbsG, tg.waterMl], [2856, 137, 79, 399, 2000]);
const cut = E.computeTargets({ sex: 'female', weightKg: 50, heightCm: 155, age: 60, activity: 'sedentary', goal: 'loseFat' });
assert.equal(cut.kcal, 1200);                                                   // the floor: never under 1200 kcal for women
ok('daily targets');

// nutrition/domain/caffeine_curve.dart: Bateman function, 5 h half-life, 7 min absorption half-life
near(E.caffeineFraction(5 * 3600e3), 0.5119454, 1e-6, 'share left after 5 h');
near(E.caffeineFraction(10 * 3600e3), 0.2559727, 1e-6, 'share left after 10 h');
assert.equal(E.caffeineFraction(-1000), 0);
near(E.caffeineAt([{ at: 0, mg: 100 }], 5 * 3600e3), 51.19, 0.01, '100 mg after 5 h');
const t = (h, m = 0) => new Date(2026, 9, 20, h, m).getTime();
const o = new E.CaffeineOutlook({ doses: [{ at: t(8), mg: 95 }, { at: t(11), mg: 63 }], now: t(13, 45), bedtime: t(23) });
assert.ok(o.sleepOk);
assert.equal(o.lastDoseBy(95), t(21, 10));                                      // scanned in 5-minute steps
const late = new E.CaffeineOutlook({ doses: [{ at: t(20), mg: 200 }], now: t(20, 30), bedtime: t(23) });
assert.equal(late.lastDoseBy(95), null);
assert.equal(E.nextBedtime(t(13, 45)), t(23));
assert.equal(E.nextBedtime(new Date(2026, 9, 21, 2).getTime()), t(23));         // past midnight still counts as that night
ok('caffeine curve and last coffee');

// training/domain/plates.dart: greedy loading, never over the target
assert.deepEqual(E.loadBar(100).perSide, [25, 15]);
assert.deepEqual(E.loadBar(62.5).perSide, [20, 1.25]);
assert.deepEqual(E.loadBar(142.5).perSide, [25, 25, 10, 1.25]);
const odd = E.loadBar(61);
assert.deepEqual([odd.perSide, odd.totalKg, odd.isExact], [[20], 60, false]);
assert.deepEqual(E.loadBar(20).perSide, []);
assert.equal(E.roundDownTo(56.7, 2.5), 55);
ok('plate breakdown');

// training/domain/one_rep_max.dart
near(E.epley(100, 5), 116.667, 0.001, 'Epley');
assert.equal(E.brzycki(100, 5), 112.5);
assert.equal(E.epley(100, 1), 100);
assert.equal(E.epley(100, 13), null);                                           // over 12 reps: no estimate
assert.deepEqual(E.oneRepMaxRange(100, 5), { low: 112.5, high: 100 * (1 + 5 / 30) });
ok('e1RM');

// training/domain/overload.dart: double progression
const scheme = E.repSchemeFor('buildMuscle', true);
assert.deepEqual([scheme.min, scheme.max], [6, 10]);
let s = E.suggestNext([{ weightKg: 60, reps: 10, rir: 2 }, { weightKg: 60, reps: 10, rir: 2 }], scheme, E.weightStepFor('barbell'));
assert.deepEqual([s.reason, s.weightKg, s.reps], ['addWeight', 62.5, 6]);
s = E.suggestNext([{ weightKg: 55, reps: 10, rir: 2 }, { weightKg: 55, reps: 8, rir: 1 }], scheme, 2.5);
assert.deepEqual([s.reason, s.weightKg, s.reps], ['addRep', 55, 9]);
s = E.suggestNext([{ weightKg: 80, reps: 4, rir: 0 }], scheme, 2.5);
assert.deepEqual([s.reason, s.weightKg], ['reduceWeight', 70]);  // 90 % of 80 is 72, rounded down to a 2.5 kg step
ok('progressive overload');

// sync/domain/readiness.dart
assert.equal(E.sleepPart(7).score, 100);
assert.equal(E.sleepPart(5.5).score, 50);
const base = [54, 55, 56, 54, 55, 56, 55];
assert.equal(E.restingHrPart(55, base).score, 75);                              // the baseline scores 75
assert.equal(E.readiness({ sleepHours: 5.5 }).band, 'steady');
ok('readiness');

// training/domain/engine/recovery.dart
const now = 100 * 3600e3;
const fresh = E.freshness([{ muscle: 'quadriceps', units: 10, at: now }], now);
assert.equal(fresh.quadriceps, 0);
near(E.freshness([{ muscle: 'quadriceps', units: 10, at: now - 72 * 3600e3 }], now).quadriceps, 0.95, 1e-9, '72 h later, 95 % fresh');
near(E.freshness([{ muscle: 'biceps', units: 10, at: now - 48 * 3600e3 }], now).biceps, 0.95, 1e-9, 'small muscles: 48 h');
ok('muscle recovery');

// training/domain/engine/session_time.dart and adaptation.dart
const ex = (id, slot, compound, sets, rest) => ({ id, slot, compound, sets, restSeconds: rest, supersetGroup: null });
const upper = [ex('bench', 'horizontalPush', true, 3, 120), ex('row', 'horizontalPull', true, 3, 120), ex('ohp', 'verticalPush', true, 3, 120),
  ex('pulldown', 'verticalPull', true, 3, 120), ex('lateral', 'lateralRaise', false, 3, 90), ex('curl', 'biceps', false, 2, 90), ex('pushdown', 'triceps', false, 2, 90)];
assert.equal(E.sessionMinutes(upper), 42);
const a = E.adaptSession(upper, 30);
assert.ok(a.minutesAfter <= 30 && a.supersets > 0);
assert.ok(a.exercises.filter(e => e.compound).every(e => e.sets >= 2));
ok('session time and "I only have 30 minutes"');

// races/domain/race_prediction.dart and running/domain/heat.dart
near(E.altitudeDrop(1300), 0.063, 1e-12, 'Wehrlin and Hallén: 6.3 % per 1000 m above 300 m');
assert.equal(E.hillFactor(10000, 0, 0), 1);
near(E.minettiCost(0), 3.6, 1e-12, 'Minetti flat cost');
assert.equal(E.heatPercent(7), 0);
near(E.heatPercent(15), 1.2, 1e-12, 'Ely: halfway between 0.8 % and 1.6 %');
const flat = E.predictRace({ distanceM: 10000, terrain: 'road' }, 50);
assert.deepEqual(flat.adjustments, []);
const hilly = E.predictRace({ distanceM: 21000, terrain: 'trail', altitudeM: 1250, gainM: 600, lossM: 600, tempC: 19, humidity: 55 }, 43.4, 650);
assert.deepEqual(hilly.adjustments.map(x => x.kind), ['altitude', 'hills', 'terrain', 'heat']);
assert.ok(hilly.seconds > hilly.flatSeconds);
ok('race prediction adjustments');

// climbing/domain/grades.dart: IRCRA (Draper et al. 2015)
assert.equal(E.convertGrade(E.parseGrade('font', '6b+'), 'v').label, 'V4');
assert.equal(E.convertGrade(E.parseGrade('v', 'V2'), 'font').label, '5+');      // 15.5: tie goes to the lower grade
assert.equal(E.nearestGrade('font', 16).label, '6A');                           // first of the grades sharing a step
ok('grade conversion');

// coach/domain/number_guard.dart
const allowed = E.numbersIn({ protein_left_g: 45, predicted: '46:40' });
assert.deepEqual(E.unverifiedNumbers('You have 45 g left; 46:40 for the 10K, top 15 %.', allowed).map(n => n.text), ['15']);
assert.deepEqual(E.readings('2,450').sort((x, y) => x - y), [2.45, 2450]);
assert.deepEqual(E.unverifiedNumbers('Do 3 sets', new Set()).map(n => n.text), ['3']);   // a unit makes a small number data
ok('number guard');

// mobility/domain/pose_figures.dart
assert.equal(E.poseProgress(0), 0);
assert.equal(E.poseProgress(0.5), 1);
assert.equal(Object.keys(E.POSE_FIGURES).length, 12);
ok('yoga pose keyframes');
