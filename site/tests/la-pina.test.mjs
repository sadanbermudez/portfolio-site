// Tests for the La Piña Investments web demo's engine port: node site/tests/la-pina.test.mjs
// The fixtures and the expected verdicts are those of the app's Kotlin tests
// (engine/src/test/.../Fixtures.kt and AnalyzerTest.kt).
import assert from 'node:assert/strict';
import {
  JavaRandom, SeriesBuilder, analyze, approvalGap, Indicators, regimeTimeline, regional, regimeOf, positionSize, pyramid,
  squarify, autoLists, plusDays, fmt, pct, times, toneColor, overheadSupply, walk,
} from '../apps/la-pina/engine.js';
import { buildWorld, practiceIndex, labBars, labContext, LAB_INSTRUMENT, LAB_PIVOT, replayData } from '../apps/la-pina/data.js';

let passed = 0;
const ok = (name) => { passed++; console.log('ok  ' + name); };

// ---- Fixtures.kt ----
const stock = { symbol: 'TEST', name: 'Test Inc', market: 'US' };
const leader = { rsRating: 95, rsUniverse: 'EE. UU.' };
const cupWithHandleBase = () => new SeriesBuilder(40).leg(200, 100).leg(30, 85).leg(30, 100).leg(8, 93, 600000);
const cupBreakout = (volume = 3000000) => cupWithHandleBase().bar(94, 104, 101, 103.5, volume).build();
const cupNearPivot = () => new SeriesBuilder(40).leg(200, 100).leg(30, 85).leg(30, 100).leg(6, 93, 600000).leg(3, 97, 500000);
const highTightFlag = () => new SeriesBuilder(40).leg(230, 50).leg(30, 105, 2000000).leg(15, 90, 700000).bar(92, 109, 91, 108, 4000000).build();
const darvas = () => new SeriesBuilder(40).leg(260, 100).leg(5, 94, 700000).leg(5, 98, 700000).leg(5, 95, 700000).bar(96, 103, 95.5, 102.5, 2500000).build();
const downtrend = () => new SeriesBuilder(120).leg(300, 60).build();
const risingIndex = () => new SeriesBuilder(100, '2023-01-02').leg(800, 135).build();
const status = (a, id) => a.rules.find((r) => r.rule === id).status;

// ---- AnalyzerTest.kt, case by case ----
{
  const a = analyze(stock, cupBreakout(), { ...leader, passiveIndex: risingIndex(), passiveIndexName: 'S&P 500' });
  assert.equal(a.pattern?.type, 'CUP_WITH_HANDLE');
  assert.equal(a.verdict, 'APPROVED');
  assert.equal(a.headline, null);
  assert.ok(a.score >= 70);
  assert.equal(a.pava.grade, 'STRONG');
  assert.ok(a.plan.actionable);
  assert.ok(a.plan.riskPct <= 0.08 + 1e-9);
  assert.equal(a.comparison.conclusion, 'Muestra insuficiente');
  assert.ok(Math.abs(a.pattern.pivot - 102.10) < 1e-9, `pivot ${a.pattern.pivot}`);
  ok('cup with handle breakout on heavy volume is APROBADO, pivot 102,10');
}
{
  const a = analyze(stock, cupBreakout(900000), leader);
  assert.equal(a.verdict, 'WATCH');
  assert.ok(a.codes.includes('rotura_sin_volumen'));
  ok('breakout without volume stays on watch');
}
{
  const base = cupWithHandleBase().build();
  const avg = base.slice(-50).reduce((s, b) => s + b.volume, 0) / 50;
  const breakout = (ratio) => analyze(stock, cupBreakout(Math.trunc(avg * ratio)), leader);
  const above = breakout(1.396);
  assert.equal(above.pava.volumeRatio, 1.40);
  assert.equal(status(above, 'PAVA'), 'PASS');
  const below = breakout(1.394);
  assert.equal(status(below, 'PAVA'), 'BLOCK');
  assert.ok(below.rules.find((r) => r.rule === 'PAVA').reason.includes('1,39×'));
  ok('PAVA grading: 1,40× passes and 1,39× blocks, judged on the figure shown');
}
{
  const a = analyze(stock, cupNearPivot().build(), leader);
  assert.equal(a.verdict, 'WATCH');
  assert.ok(a.codes.includes('cerca_pivot'));
  assert.ok(a.codes.includes('pava_pendiente'));
  assert.equal(a.plan.actionable, false);
  ok('price within 5 % of the pivot is on watch with a conditional plan');
}
{
  const a = analyze(stock, cupWithHandleBase().build(), leader);
  assert.equal(a.verdict, 'REJECTED');
  assert.ok(a.codes.includes('mitad_consolidacion'));
  ok('price deep inside the base is rejected');
}
{
  const a = analyze(stock, cupNearPivot().bar(97, 103, 96.5, 99.5, 3000000).build(), leader);
  assert.equal(a.verdict, 'WATCH');
  assert.ok(a.rules.find((r) => r.rule === 'PAVA').reason.includes('intradía'));
  ok('an intraday poke above the pivot is pending, never a breakout');
}
{
  const a = analyze(stock, cupWithHandleBase().bar(94, 104, 101, 103.5, 3000000).leg(5, 114, 1500000).build(), leader);
  assert.equal(a.verdict, 'REJECTED');
  assert.ok(a.codes.includes('extendido'));
  ok('extended price is rejected');
}
{
  const low = analyze(stock, cupBreakout(), { ...leader, rsRating: 70 });
  assert.equal(low.verdict, 'REJECTED');
  assert.ok(low.codes.includes('rs_bajo'));
  const mid = analyze(stock, cupBreakout(), { ...leader, rsRating: 85 });
  assert.equal(mid.verdict, 'WATCH');
  assert.ok(mid.codes.includes('rs_80_89'));
  ok('RS below 80 is rejected and 80 to 89 is on watch');
}
{
  const a = analyze(stock, downtrend(), leader);
  assert.equal(a.verdict, 'REJECTED');
  assert.equal(status(a, 'TREND'), 'FAIL');
  assert.ok(a.headline.includes('TT'));
  ok('downtrend fails the trend template');
}
{
  const a = analyze(stock, new SeriesBuilder(10).leg(100, 20).build(), leader);
  assert.equal(a.verdict, 'REJECTED');
  assert.deepEqual(a.codes, ['datos_insuficientes']);
  ok('short history is rejected for lack of data');
}
{
  const a = analyze(stock, darvas(), leader);
  assert.equal(a.pattern?.type, 'DARVAS_BOX');
  assert.equal(a.verdict, 'APPROVED');
  assert.ok(a.plan.stopType === 'DARVAS' || a.plan.stopType === 'MAX_LOSS');
  ok('Darvas box breakout is approved with a Darvas or maximum-loss stop');
}
{
  const a = analyze(stock, highTightFlag(), leader);
  assert.equal(a.pattern?.type, 'HIGH_TIGHT_FLAG');
  assert.ok(a.codes.includes('extendido'));
  ok('high tight flag is detected but rejected as extended from the SMA50');
}
{
  const a = analyze(stock, cupBreakout(), { ...leader, regime: regimeOf('Mercado EE. UU.', 'CORRECTION', 0, 6) });
  assert.equal(a.verdict, 'WATCH');
  assert.ok(a.codes.includes('regimen_correccion'));
  ok('market in correction blocks new buys');
}
{
  const regime = regimeOf('Mercado EE. UU.', 'PRESSURE', 50, 4);
  regime.layer1Bullish = true;
  const a = analyze(stock, cupBreakout(), { ...leader, rsRating: 92, regime });
  assert.equal(a.verdict, 'WATCH');
  assert.ok(a.codes.includes('regimen_presion'));
  const strong = analyze(stock, cupBreakout(), { ...leader, rsRating: 97, regime });
  assert.equal(strong.verdict, 'APPROVED');
  ok('market under pressure needs RS 95');
}
{
  const bars = cupBreakout();
  const a = analyze(stock, bars, { ...leader, nextEarnings: plusDays(bars.at(-1).date, 7) });
  assert.equal(a.verdict, 'WATCH');
  assert.ok(a.codes.includes('resultados_en_d_sesiones'));
  assert.equal(a.plan.sessionsToEarnings, 5);
  ok('earnings within 10 sessions block new buys');
}
{
  const bars = cupBreakout().map((b) => ({ ...b, open: b.open / 200, high: b.high / 200, low: b.low / 200, close: b.close / 200 }));
  const a = analyze({ symbol: 'BCPX', name: 'Penny', market: 'SPAIN' }, bars, { rsRating: 95, rsUniverse: 'Europa' });
  assert.match(a.rules.find((r) => r.rule === 'LIQUIDITY').reason, /Precio 0,\d{4} € por debajo del mínimo de 2,00 €/);
  assert.match(a.rules.find((r) => r.rule === 'PATTERN').reason, /Pivot 0,\d{4}\./);
  assert.match(analyze(stock, cupBreakout(), leader).rules.find((r) => r.rule === 'PATTERN').reason, /Pivot \d+,\d{2}\./);
  ok('prices under 1 are written with four decimals in the verdict texts');
}

// ---- "Qué falta para APROBADO" ----
{
  const bars = cupBreakout(900000);
  const gap = approvalGap(analyze(stock, bars, leader), bars);
  assert.ok(gap[0].text.startsWith('Un nuevo cierre sobre 102,10 con volumen'));
  assert.equal(approvalGap(analyze(stock, cupBreakout(), leader), cupBreakout()).length, 0);
  ok('what is missing turns each block into the condition that clears it');
}

// ---- RS formula (Indicators.kt) ----
{
  const closes = Array.from({ length: 253 }, (_, i) => 100 + i);
  const q = (n) => closes[252] / closes[252 - n] - 1;
  assert.ok(Math.abs(Indicators.rsScore(closes) - (0.4 * q(63) + 0.2 * q(126) + 0.2 * q(189) + 0.2 * q(252))) < 1e-12);
  assert.equal(Indicators.rsScore(closes.slice(0, 200)), null);
  const universe = [0.1, 0.2, 0.3, 0.4, 0.5];
  assert.equal(Indicators.rsRating(0.5, universe), 1 + Math.round(98 * 4 / 4));
  assert.equal(Indicators.rsRating(0.1, universe), 1);
  assert.equal(Indicators.rsRating(0.35, universe), 1 + Math.round(98 * 3 / 4));
  assert.equal(Indicators.rsRating(0.3, [0.3]), 50);
  ok('RS score is 0,4·R63 + 0,2·R126 + 0,2·R189 + 0,2·R252 and the rating 1 + round(98·below/(N−1))');
}

// ---- market regime (MarketRegime.kt) ----
{
  const p = practiceIndex();
  const states = p.timeline.filter(Boolean).map((s) => s.state);
  const order = [];
  for (const s of states) if (order.at(-1) !== s) order.push(s);
  assert.deepEqual(order, ['CONFIRMED', 'PRESSURE', 'CORRECTION', 'RALLY_ATTEMPT', 'CONFIRMED']);
  const toPressure = p.timeline.find((s) => s && s.from === 'CONFIRMED' && s.state === 'PRESSURE');
  assert.equal(toPressure.distributionDays, 4);
  const toCorrection = p.timeline.find((s) => s && s.from === 'PRESSURE' && s.state === 'CORRECTION');
  assert.ok(toCorrection.distributionDays >= 6);
  const ftd = p.timeline.find((s) => s && s.from === 'RALLY_ATTEMPT' && s.state === 'CONFIRMED');
  assert.ok(ftd.why.startsWith('Día de seguimiento'));
  assert.equal(ftd.distributionDays, 0); // a follow-through day clears the count
  ok('regime: distribution days push CONFIRMED to PRESSURE (4) and CORRECTION (6); day 1 and a follow-through confirm again');
}
{
  // A distribution day needs a 0,2 % drop on more volume than the day before.
  const base = new SeriesBuilder(100, '2023-01-02').leg(230, 160).build();
  const lastClose = base.at(-1).close;
  const withDd = base.concat([{ date: '2024-01-01', open: lastClose, high: lastClose, low: lastClose * 0.99, close: lastClose * 0.997, volume: 2000000 }]);
  const noDd = base.concat([{ date: '2024-01-01', open: lastClose, high: lastClose, low: lastClose * 0.99, close: lastClose * 0.997, volume: 900000 }]);
  assert.equal(regimeTimeline(withDd).at(-1).newDistributionDay, true);
  assert.equal(regimeTimeline(noDd).at(-1).newDistributionDay, false);
  const r = regional('Europa', [['A', { state: 'CONFIRMED', distributionDays: 1, layer1Bullish: true }], ['B', { state: 'PRESSURE', distributionDays: 4, layer1Bullish: true }]]);
  assert.equal(r.state, 'PRESSURE');
  assert.equal(r.maxExposurePct, 50);
  assert.equal(regional('X', [['A', { state: 'RALLY_ATTEMPT', distributionDays: 0, layer1Bullish: true }]]).maxExposurePct, 0);
  ok('distribution day rule, and the regional regime takes the worst state (100/50/0 %)');
}

// ---- sizing and the pyramid (Risk.kt) ----
{
  const s = positionSize(10000, 0.005, 100, 92);
  assert.equal(s.quantity, 6); // 50 € / 8 € = 6,25 → 6
  assert.equal(s.riskAmount, 48);
  const capped = positionSize(10000, 0.005, 100, 99.5); // risk allows 100, weight caps at 20
  assert.equal(capped.quantity, 20);
  const t = pyramid(10, 100, 100);
  assert.deepEqual(t.map((x) => x.quantity), [5, 3, 2]);
  ok('position size by fixed risk with the 20 % weight cap, and the 50/30/20 pyramid');
}

// ---- the heat map's squarified treemap ----
{
  const area = { x: 0, y: 0, w: 300, h: 200 };
  const weights = [6, 6, 4, 3, 2, 2, 1];
  const boxes = squarify(weights, area);
  const total = weights.reduce((a, b) => a + b, 0);
  boxes.forEach((b, i) => assert.ok(Math.abs(b.w * b.h - 60000 * weights[i] / total) < 1e-6));
  assert.ok(Math.abs(boxes.reduce((s, b) => s + b.w * b.h, 0) - 60000) < 1e-6);
  for (const b of boxes) assert.ok(b.x >= -1e-9 && b.y >= -1e-9 && b.x + b.w <= 300 + 1e-9 && b.y + b.h <= 200 + 1e-9);
  assert.equal(toneColor(-1), '#F63538');
  assert.equal(toneColor(0), '#414554');
  assert.equal(toneColor(1), '#30CC5A');
  ok('squarify tiles the area in proportion to the weights; the colour scale ends on Finviz\'s stops');
}

// ---- java.util.Random, the app's screenshot generator's source of randomness ----
{
  assert.equal(new JavaRandom(42).nextInt(), -1170105035);
  assert.equal(new JavaRandom(42).nextDouble(), 0.7275636800328681);
  assert.equal(new JavaRandom(42).nextGaussian(), 1.1419053154730547);
  assert.equal(new JavaRandom(7).nextInt(10), new JavaRandom(7).nextInt(10));
  const a = walk(new JavaRandom(5), 0.001, 0.02, '2026-01-01', '2026-03-01');
  const b = walk(new JavaRandom(5), 0.001, 0.02, '2026-01-01', '2026-03-01');
  assert.deepEqual(a, b);
  assert.ok(a.every((x) => x.high >= Math.max(x.open, x.close) && x.low <= Math.min(x.open, x.close)));
  ok('JavaRandom matches Java bit for bit, so walk() is deterministic');
}

// ---- formatting, es-ES ----
{
  assert.equal(fmt(1234.56), '1.234,56');
  assert.equal(fmt(73000), '73.000,00');
  assert.equal(pct(0.032), '3,2 %');
  assert.equal(times(1.4), '1,40×');
  ok('numbers in es-ES format');
}

// ---- the demo's world and lab ----
{
  const w = buildWorld();
  const n = (v) => w.rows.filter((r) => r.analysis.verdict === v).length;
  assert.ok(w.rows.length >= 25 && w.rows.length <= 30);
  assert.ok(n('APPROVED') >= 1 && n('WATCH') >= 1 && n('REJECTED') >= 10);
  assert.ok(w.rows.every((r) => r.instrument.symbol.startsWith('EJ') && r.instrument.name.startsWith('Ejemplo')));
  const breakouts = w.rows.filter((r) => r.lists.includes('PAVA_BREAKOUT'));
  assert.ok(breakouts.length >= 1);
  for (const r of breakouts) assert.deepEqual(autoLists(r.analysis, r.bars, r.previous), r.lists);
  assert.equal(w.regimes.US.state, 'CONFIRMED');
  ok(`simulated universe: ${w.rows.length} fictional stocks, ${n('APPROVED')} APROBADO, ${n('WATCH')} VIGILANCIA, ${n('REJECTED')} RECHAZADO`);
}
{
  const run = (o, c) => analyze(LAB_INSTRUMENT, labBars(o), labContext(c));
  const base = run({}, {});
  assert.equal(base.verdict, 'APPROVED');
  assert.ok(Math.abs(base.pattern.pivot - LAB_PIVOT) < 1e-9);
  assert.equal(run({ volumeRatio: 1.0 }, {}).verdict, 'WATCH');
  assert.ok(run({ closeVsPivot: 0.08 }, {}).codes.includes('extendido'));
  assert.ok(run({ closeVsPivot: -0.03 }, {}).codes.includes('cerca_pivot'));
  assert.ok(run({ closeVsPivot: -0.09 }, {}).codes.includes('mitad_consolidacion'));
  assert.ok(run({}, { rs: 85 }).codes.includes('rs_80_89'));
  assert.ok(run({}, { regime: 2 }).codes.includes('regimen_correccion'));
  assert.ok(run({}, { earnings: 5 }).codes.includes('resultados_en_d_sesiones'));
  ok('rules lab: each slider moves the verdict the way the rules say');
}
{
  const r = replayData();
  const trades = r.method();
  assert.ok(trades.length >= 1);
  assert.ok(trades.every((t) => r.analysisAt(t.entryIndex - 1).verdict === 'APPROVED'));
  ok('replay: the method buys only the morning after an APROBADO evening');
}
{
  const bars = cupBreakout();
  const s = overheadSupply(bars, 102.1);
  assert.equal(s.supplyClass, 'OPEN_SKY');
  ok('overhead supply at all-time highs is open sky');
}

console.log(`\n${passed} passed`);
