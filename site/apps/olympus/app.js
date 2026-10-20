// Olympus web demo: the phone UI. A recreation of the Flutter app's screens, driven by the ported
// domain engines in engine.js and the sample data below. No network calls; nothing is stored.
import * as E from './engine.js';
import { STR, EXERCISES, FOODS, MUSCLE_NAMES, POSE_NAMES } from './i18n.js';

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const root = document.getElementById('olympus');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ------------------------------------------------------------------ demo clock and sample data
const real = new Date();
const TODAY = new Date(real.getFullYear(), real.getMonth(), real.getDate());
const at = (dayOffset, h, m = 0) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + dayOffset, h, m).getTime();
const DEMO_START = at(0, 13, 45);            // the demo always opens at 13:45 today
const loadedAt = Date.now();
const nowDemo = () => DEMO_START + (Date.now() - loadedAt);

const PROFILE = { name: 'Alex', sex: 'male', heightCm: 178, weightKg: 76, birth: new Date(TODAY.getFullYear() - 34, 2, 14), activity: 'moderate', goal: 'buildMuscle', homeAltitudeM: 650 };
const FITNESS = { metres: 5000, seconds: 22 * 60 + 30, daysAgo: 21 };
const VDOT = E.vdotFrom(FITNESS.metres, FITNESS.seconds);

// The plan's Upper A, as the training engine would lay it out for a build-muscle goal.
const plan = (id, sets) => {
  const x = EXERCISES[id], scheme = E.repSchemeFor(PROFILE.goal, x.compound);
  return { id, slot: x.slot, compound: x.compound, sets, repsMin: scheme.min, repsMax: scheme.max, rir: 2, restSeconds: x.compound ? 120 : 90, supersetGroup: null };
};
const BASE_SESSION = [plan('bench', 3), plan('row', 3), plan('ohp', 3), plan('pulldown', 3), plan('lateral', 3), plan('curl', 2), plan('pushdown', 2)];
// Last time's working sets, for the overload hint.
const LAST = {
  bench: [[60, 10, 2], [60, 10, 2], [60, 10, 2]], row: [[55, 10, 2], [55, 9, 1], [55, 8, 1]], ohp: [[18, 10, 2], [18, 10, 2], [18, 10, 2]],
  pulldown: [[50, 9, 2], [50, 8, 1], [50, 8, 1]], lateral: [[8, 15, 2], [8, 15, 2], [8, 15, 2]], curl: [[12, 12, 2], [12, 11, 1]],
  pushdown: [[25, 15, 1], [25, 15, 1]],
};
const SUGGEST = Object.fromEntries(Object.entries(LAST).map(([id, sets]) => {
  const x = EXERCISES[id];
  return [id, E.suggestNext(sets.map(([weightKg, reps, rir]) => ({ weightKg, reps, rir })), E.repSchemeFor(PROFILE.goal, x.compound), E.weightStepFor(x.equipment))];
}));
const RECORDS = Object.fromEntries(Object.entries(LAST).map(([id, sets]) =>
  [id, { kg: Math.max(...sets.map(s => s[0])), e1rm: Math.max(...sets.map(s => E.epley(s[0], s[1]) || 0)) }]));

// What tired which muscle recently (relative to the demo clock).
const PAST_SETS = [
  { primary: ['quadriceps'], secondary: ['glutes', 'adductors'], sets: 4, at: at(-1, 15, 45) },
  { primary: ['hamstrings'], secondary: ['glutes', 'lowerBack'], sets: 3, at: at(-1, 16, 5) },
  { primary: ['calves'], secondary: [], sets: 3, at: at(-1, 16, 25) },
  ...['bench', 'row', 'ohp', 'pulldown', 'curl'].map((id, i) => ({ primary: EXERCISES[id].primary, secondary: EXERCISES[id].secondary, sets: id === 'curl' ? 2 : 3, at: at(-3, 18, 10 * i) })),
];
const PAST_ACTIVITIES = [{ sport: 'running', minutes: 45, rpe: 6, at: at(0, 7, 30) }, { sport: 'climbing', minutes: 75, rpe: 7, at: at(-4, 19, 0) }];

// Races: the app's "Sample 10K" (20 days out, 9:00, road, 10 km) and a trail race with a typed course.
const TRAIL_PROFILE = [[0, 1050], [2000, 1120], [5000, 1330], [8000, 1480], [11000, 1300], [14000, 1150], [17000, 1320], [19000, 1180], [21000, 1050]];
const TRAIL_SECTIONS = E.sectionsFromProfile(TRAIL_PROFILE);
const RACES = {
  sample10k: { id: 'sample10k', nameKey: 'raceSample10k', start: at(20, 9), distanceM: 10000, terrain: 'road' },
  trail: { id: 'trail', nameKey: 'raceTrail', start: at(48, 8, 30), distanceM: 21000, terrain: 'trail', altitudeM: 1250,
    gainM: TRAIL_SECTIONS.reduce((a, s) => a + s.gainM, 0), lossM: TRAIL_SECTIONS.reduce((a, s) => a + s.lossM, 0),
    sections: TRAIL_SECTIONS, profile: TRAIL_PROFILE, tempC: 19, humidity: 55 },
};
const PREDICTIONS = Object.fromEntries(Object.values(RACES).map(r => [r.id, E.predictRace(r, VDOT, PROFILE.homeAltitudeM)]));
const READY = E.demoReadiness(TODAY);
const YESTERDAY = E.demoDay(new Date(TODAY.getTime() - DAY));

// ------------------------------------------------------------------ state
const S = {
  lang: 'en', theme: 'light', tab: 'today', stack: [], trainView: 'session', side: 'front', muscle: null,
  profile: { ...PROFILE }, adaptedTo: null, sets: {}, records: structuredClone(RECORDS), todayStimuli: [],
  log: [
    { food: 'oats', at: at(0, 8, 0) }, { food: 'milk', at: at(0, 8, 0) }, { food: 'banana', at: at(0, 8, 0) }, { food: 'coffee', at: at(0, 8, 5) },
    { food: 'espresso', at: at(0, 11, 0) }, { food: 'chicken', at: at(0, 13, 15) }, { food: 'rice', at: at(0, 13, 15) }, { food: 'oil', at: at(0, 13, 15) },
  ],
  water: 1250, coach: [], coachYogurtLogged: false, climb: { system: 'font', label: '6B+' },
  breath: { pattern: 'cyclicSighing', minutes: 5, running: false, t0: 0, done: false }, rest: null, ringPrev: {},
};
for (const e of BASE_SESSION) {
  const s = SUGGEST[e.id];
  S.sets[e.id] = Array.from({ length: e.sets }, () => ({ kg: s.weightKg, reps: s.reps, rir: e.rir, done: false }));
}

// ------------------------------------------------------------------ helpers
const t = (k, ...a) => { const v = STR[S.lang][k] ?? STR.en[k]; return typeof v === 'function' ? v(...a) : v; };
const loc = () => (S.lang === 'es' ? 'es-ES' : 'en-GB');
const nf = (n, d = 0) => new Intl.NumberFormat(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const kgf = n => new Intl.NumberFormat(loc(), { maximumFractionDigits: 2 }).format(n);
const nf3 = n => new Intl.NumberFormat(loc(), { maximumFractionDigits: 3 }).format(n);
const pad = n => String(n).padStart(2, '0');
const hhmm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
const pace = s => { const r = Math.round(s); return `${Math.floor(r / 60)}:${pad(r % 60)}`; };
const dateShort = ms => new Intl.DateTimeFormat(loc(), { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = n => `<span class="ms" aria-hidden="true">${n}</span>`;
const exName = id => EXERCISES[id][S.lang];
const food = id => FOODS.find(f => f.id === id);
const foodName = f => f[S.lang];
const serving = f => (S.lang === 'es' && f.servingEs) || f.serving;
const muscleName = m => MUSCLE_NAMES[S.lang][m];
const ageNow = () => E.ageOn(S.profile.birth, TODAY);
const targets = () => E.computeTargets({ ...S.profile, age: ageNow() });
const session = () => (S.adaptedTo ? E.adaptSession(BASE_SESSION, S.adaptedTo).exercises : BASE_SESSION);
const totals = () => S.log.reduce((a, l) => { const f = food(l.food); a.kcal += f.kcal; a.p += f.p; a.c += f.c; a.f += f.f; return a; }, { kcal: 0, p: 0, c: 0, f: 0 });
const doses = () => S.log.filter(l => food(l.food).caffeine).map(l => ({ at: l.at, mg: food(l.food).caffeine }));
const outlook = () => new E.CaffeineOutlook({ doses: doses(), now: nowDemo(), bedtime: E.nextBedtime(nowDemo()) });
const stimuli = () => [...E.stimuliFromSets([...PAST_SETS, ...S.todayStimuli]), ...E.stimuliFromActivities(PAST_ACTIVITIES)];
const daysTo = ms => Math.ceil((ms - nowDemo()) / DAY);

function freshColor(f) {
  const stops = [[0, [0xE5, 0x39, 0x35]], [0.5, [0xFF, 0xB3, 0x00]], [1, [0x43, 0xA0, 0x47]]];
  const [a, b] = f <= 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const k = (f - a[0]) / (b[0] - a[0]);
  return `rgb(${a[1].map((v, i) => Math.round(v + (b[1][i] - v) * k)).join(',')})`;
}

// ------------------------------------------------------------------ shell
function renderShell() {
  root.setAttribute('lang', S.lang);
  root.dataset.theme = S.theme;
  const tabs = [['today', 'wb_sunny', 'navToday'], ['train', 'fitness_center', 'navTrain'], ['eat', 'restaurant', 'navEat'], ['coach', 'auto_awesome', 'navCoach'], ['profile', 'person', 'navProfile']];
  root.querySelector('.navbar').setAttribute('aria-label', t('tabs'));
  root.querySelector('.navbar').innerHTML = tabs.map(([id, icon, key]) =>
    `<button type="button" class="nav-item" data-act="tab" data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ''}><span class="nav-pill">${ic(icon)}</span><span class="nav-label">${t(key)}</span></button>`).join('');
}

function render({ keepScroll = true } = {}) {
  const screen = root.querySelector('.screen');
  const top = keepScroll ? screen.scrollTop : 0;
  renderShell();
  const route = S.stack[S.stack.length - 1];
  let title = 'Olympus', body = '';
  if (route?.type === 'race') { title = t(RACES[route.id].nameKey); body = raceDetail(RACES[route.id]); }
  else if (route?.type === 'breathe') { title = t('breathingTitle'); body = breathing(); }
  else if (S.tab === 'today') body = today();
  else if (S.tab === 'train') { title = t('navTrain'); body = train(); }
  else if (S.tab === 'eat') { title = t('eatTitle'); body = eat(); }
  else if (S.tab === 'coach') { title = t('navCoach'); body = coach(); }
  else { title = t('profileTitle'); body = profile(); }
  root.querySelector('.appbar').innerHTML =
    (route ? `<button type="button" class="icon-btn" data-act="back" aria-label="${t('back')}">${ic('arrow_back')}</button>` : '') +
    `<h3 class="appbar-title">${esc(title)}</h3>` +
    (!route ? `<button type="button" class="icon-btn" data-act="tab" data-tab="profile" aria-label="${t('settings')}">${ic('settings')}</button>` : '');
  screen.innerHTML = body;
  screen.scrollTop = top;
  afterRender();
}

function afterRender() {
  animateRings();
  startPoses();
  if (S.rest) updateRest();
}

// ------------------------------------------------------------------ rings (custom painter, 600 ms easeOutCubic)
function ring(key, frac, r, w, cls, label = '') {
  const size = 2 * r + w, c = size / 2, C = 2 * Math.PI * r, prev = S.ringPrev[key] ?? 0;
  return `<svg class="m-ring ${cls}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle class="ring-track" cx="${c}" cy="${c}" r="${r}" stroke-width="${w}"/>
    <circle class="ring-bar" data-ring="${key}" data-frac="${Math.min(1, Math.max(0, frac))}" cx="${c}" cy="${c}" r="${r}" stroke-width="${w}"
      stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - prev)}" transform="rotate(-90 ${c} ${c})"/>${label}</svg>`;
}
function animateRings() {
  const bars = [...root.querySelectorAll('[data-ring]')];
  if (!bars.length) return;
  const items = bars.map(el => ({ el, key: el.dataset.ring, from: S.ringPrev[el.dataset.ring] ?? 0, to: +el.dataset.frac, C: 2 * Math.PI * +el.getAttribute('r') }));
  items.forEach(i => { S.ringPrev[i.key] = i.to; });
  if (reduceMotion.matches) { items.forEach(i => i.el.setAttribute('stroke-dashoffset', i.C * (1 - i.to))); return; }
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 600), e = 1 - (1 - k) ** 3;
    items.forEach(i => i.el.setAttribute('stroke-dashoffset', i.C * (1 - (i.from + (i.to - i.from) * e))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ Today
function today() {
  const r = READY.result, tg = targets(), tot = totals(), race = RACES.sample10k, pred = PREDICTIONS.sample10k;
  const bandText = { ready: t('readinessReady'), steady: t('readinessSteady'), low: t('readinessLow') }[r.band];
  const sess = session(), mins = E.sessionMinutes(sess);
  const part = (label, p) => p ? `<div class="part"><span>${label}</span><span class="bar"><span style="width:${p.score}%"></span></span><span class="num">${p.score}</span></div>` : '';
  return `
  <div class="pad">
    <h1 class="headline">${t('greeting', S.profile.name)}</h1>
    <p class="subtitle">${t('todaySubtitle')}</p>
  </div>
  <section class="m-card outlined readiness" id="readiness-card" aria-labelledby="ready-h">
    <div class="ready-ring">${ring('readiness', r.score / 100, 26, 7, 'primary', `<text x="29.5" y="35" text-anchor="middle" class="ring-text">${r.score}</text>`)}</div>
    <div>
      <h3 id="ready-h" class="title-m">${t('readinessTitle', r.score)}</h3>
      <p class="body-m">${bandText}</p>
      <p class="body-s muted">${t('readinessParts', nf(r.sleep.value, 1), r.restingHr.value, nf(r.restingHr.baseline), r.hrv.value, nf(r.hrv.baseline))}</p>
      <div class="m-parts">${part(t('partSleep'), r.sleep)}${part(t('partHr'), r.restingHr)}${part(t('partHrv'), r.hrv)}</div>
      <p class="body-s muted">${t('readinessAbout')}</p>
    </div>
  </section>
  <button type="button" class="m-card filled row-card" data-act="go" data-tab="train" data-view="session" id="next-session">
    ${ic('event_note')}<span><span class="title-s">${t('nextSession', t('upperA'), t('today'))}</span><span class="body-m muted">${t('sessionMeta', sess.length, mins)}</span></span>${ic('chevron_right')}
  </button>
  <button type="button" class="m-card filled food-mini" data-act="tab" data-tab="eat">
    <span class="title-s">${t('nutritionToday')}</span>
    <span class="mini-rings">
      ${[['kcal', tot.kcal, tg.kcal, 'kcal', 'ring-kcal'], ['protein', tot.p, tg.proteinG, 'protein', 'ring-p'], ['carbs', tot.c, tg.carbsG, 'carbs', 'ring-c'], ['fat', tot.f, tg.fatG, 'fat', 'ring-f']]
        .map(([k, v, g, lk, cls]) => `<span class="mini">${ring('mini-' + k, v / g, 16, 5, cls)}<span class="body-s">${t(lk)}</span><span class="label-s num">${nf(v)}/${nf(g)}</span></span>`).join('')}
    </span>
  </button>
  <button type="button" class="m-card filled row-card" data-act="race" data-id="sample10k" id="race-card">
    ${ic('emoji_events')}<span><span class="title-s">${t('raceNext', t(race.nameKey))}</span>
    <span class="body-m muted">${dateShort(race.start)} · ${t('raceIn', daysTo(race.start))} · ${t('predicted')} ${dur(pred.seconds)}</span></span>${ic('chevron_right')}
  </button>
  <button type="button" class="m-card filled row-card" data-act="breathe" id="breathe-card">
    ${ic('air')}<span><span class="title-s">${t('breatheCard')}</span><span class="body-m muted">${t('breatheCardBody')}</span></span>${ic('chevron_right')}
  </button>
  <p class="body-s muted pad">${t('stepsYesterday', nf(YESTERDAY.steps))} · ${t('sampleData')}</p>`;
}

// ------------------------------------------------------------------ Train
function train() {
  const views = [['session', 'session'], ['recovery', 'recovery'], ['run', 'run'], ['climb', 'climb'], ['yoga', 'yoga']];
  const chips = `<div class="chips" role="group" aria-label="${t('trainViews')}">${views.map(([id, k]) =>
    `<button type="button" class="chip" data-act="view" data-view="${id}" aria-pressed="${S.trainView === id}">${t(k)}</button>`).join('')}</div>`;
  const body = { session: trainSession, recovery: recoveryView, run: runView, climb: climbView, yoga: yogaView }[S.trainView]();
  return chips + body;
}

function trainSession() {
  const sess = session();
  const groupLetter = {};
  let letter = 65;
  for (const e of sess) if (e.supersetGroup != null && !(e.supersetGroup in groupLetter)) groupLetter[e.supersetGroup] = String.fromCharCode(letter++);
  let done = 0, all = 0, vol = 0;
  for (const e of sess) S.sets[e.id].slice(0, e.sets).forEach(s => { all++; if (s.done) { done++; vol += (s.kg || 0) * (s.reps || 0); } });
  const adapted = S.adaptedTo ? E.adaptSession(BASE_SESSION, S.adaptedTo) : null;
  return `
  <div class="pad session-head">
    <div><h2 class="title-l">${t('upperA')}</h2><p class="body-m muted">${t('blockInfo')} · ${t('sessionMeta', sess.length, E.sessionMinutes(sess))}</p></div>
    <button type="button" class="m-btn outlined" data-act="short" id="less-time">${ic('timer')}${t('lessTime')}</button>
  </div>
  ${adapted ? `<div class="banner" id="adapt-banner" role="status"><strong>${t('adaptFromTo', adapted.minutesBefore, adapted.minutesAfter)}</strong> ${t('adaptDetail', adapted.supersets, adapted.cutSets)}
    <button type="button" class="m-btn text" data-act="unadapt">${t('fullSession')}</button></div>` : ''}
  <p class="body-s muted pad" id="session-progress">${t('progress', done, all, nf(vol))}</p>
  ${sess.map(e => exerciseCard(e, groupLetter[e.supersetGroup])).join('')}`;
}

function exerciseCard(e, group) {
  const x = EXERCISES[e.id], sug = SUGGEST[e.id], rows = S.sets[e.id].slice(0, e.sets);
  const reason = t('reason_' + sug.reason, e.repsMax);
  const last = LAST[e.id];
  const best = rows.filter(s => s.done && s.kg && s.reps).map(s => E.oneRepMaxRange(s.kg, s.reps)).filter(Boolean).sort((a, b) => b.high - a.high)[0];
  return `<section class="m-card outlined exercise" id="ex-${e.id}" aria-labelledby="exh-${e.id}">
    <div class="ex-head">
      <div><h3 class="title-m" id="exh-${e.id}">${exName(e.id)}</h3>
        <p class="body-s muted">${group ? `<span class="badge">${t('superset', group)}</span> ` : ''}${t('scheme', e.sets, e.repsMin, e.repsMax, e.rir, dur(e.restSeconds))}</p></div>
      ${x.equipment === 'barbell' ? `<button type="button" class="m-btn tonal small" data-act="plates" data-ex="${e.id}">${ic('fitness_center')}${t('plates')}</button>` : ''}
    </div>
    <p class="hint body-s">${ic('trending_up')}<span>${t('lastTime', kgf(sug.lastWeightKg), sug.lastReps)} → <strong>${t('todayTarget', kgf(sug.weightKg), sug.reps)}</strong>. ${reason}</span></p>
    <table class="sets">
      <thead><tr><th scope="col">${t('colSet')}</th><th scope="col">${t('colPrev')}</th><th scope="col">${t('colKg')}</th><th scope="col">${t('colReps')}</th><th scope="col">${t('colRir')}</th><th scope="col"><span class="sr">✓</span></th></tr></thead>
      <tbody>${rows.map((s, i) => `<tr class="${s.done ? 'done' : ''}">
        <td class="num">${i + 1}</td>
        <td class="num muted">${last[i] ? `${kgf(last[i][0])} × ${last[i][1]}` : '-'}</td>
        <td><input type="number" inputmode="decimal" step="0.5" min="0" value="${s.kg ?? ''}" name="kg" data-field="kg" data-ex="${e.id}" data-i="${i}" aria-label="${t('setLabel', i + 1, 'kg')}"></td>
        <td><input type="number" inputmode="numeric" step="1" min="0" value="${s.reps ?? ''}" name="reps" data-field="reps" data-ex="${e.id}" data-i="${i}" aria-label="${t('setLabel', i + 1, t('colReps'))}"></td>
        <td><input type="number" inputmode="numeric" step="1" min="0" max="5" value="${s.rir ?? ''}" name="rir" data-field="rir" data-ex="${e.id}" data-i="${i}" aria-label="${t('setLabel', i + 1, 'RIR')}"></td>
        <td><button type="button" class="tick" data-act="tick" data-ex="${e.id}" data-i="${i}" aria-pressed="${s.done}" aria-label="${t('setDone', i + 1)}">${ic('check')}</button></td>
      </tr>`).join('')}</tbody>
    </table>
    ${best ? `<p class="body-s muted">${t('e1rmNote', kgf(Math.round(best.low * 2) / 2), kgf(Math.round(best.high * 2) / 2))}</p>` : ''}
  </section>`;
}

function tickSet(id, i) {
  const s = S.sets[id][i];
  s.done = !s.done;
  if (s.done) {
    const types = [], rec = S.records[id];
    if (s.kg > rec.kg) { types.push(t('recWeight')); rec.kg = s.kg; }
    const e1 = E.epley(s.kg, s.reps);
    if (e1 && e1 > rec.e1rm + 0.01) { types.push(t('recE1rm')); rec.e1rm = e1; }
    const x = EXERCISES[id];
    S.todayStimuli.push({ primary: x.primary, secondary: x.secondary, sets: 1, at: nowDemo(), ex: id, i });
    const sess = session(), idx = sess.findIndex(e => e.id === id), e = sess[idx];
    const g = e.supersetGroup;
    const lastInGroup = g == null || sess.map(q => q.supersetGroup).lastIndexOf(g) === idx;
    if (lastInGroup) startRest(e.restSeconds);
    else snack(t('supersetGo', exName(sess[idx + 1].id)));
    if (types.length) setTimeout(() => snack(t('newRecord', types.join(', ')), 'record'), lastInGroup ? 0 : 1600);
  } else {
    S.todayStimuli = S.todayStimuli.filter(st => !(st.ex === id && st.i === i));
  }
  render();
}

// ------------------------------------------------------------------ rest timer
function startRest(seconds) { S.rest = { end: Date.now() + seconds * 1000, total: seconds }; updateRest(); }
let restTick = null;
function updateRest() {
  const bar = root.querySelector('.restbar');
  if (!S.rest) { bar.hidden = true; clearInterval(restTick); restTick = null; return; }
  const left = Math.max(0, Math.ceil((S.rest.end - Date.now()) / 1000));
  if (left <= 0) { S.rest = null; bar.hidden = true; clearInterval(restTick); restTick = null; snack(t('restOver')); return; }
  bar.hidden = false;
  if (!bar.firstChild) {
    bar.innerHTML = `<span class="rest-label">${ic('timer')}<span class="rest-name"></span> <span class="rest-time num" role="timer" aria-live="off"></span></span>
      <span class="rest-progress" aria-hidden="true"><span></span></span>
      <button type="button" class="m-btn text small" data-act="rest-adj" data-d="-15">-15 s</button>
      <button type="button" class="m-btn text small" data-act="rest-adj" data-d="15">+15 s</button>
      <button type="button" class="m-btn tonal small" data-act="rest-skip">${t('restSkip')}</button>`;
  }
  bar.querySelector('.rest-name').textContent = t('restTimer');
  bar.querySelector('[data-act="rest-skip"]').textContent = t('restSkip');
  bar.querySelector('.rest-time').textContent = dur(left);
  bar.querySelector('.rest-progress span').style.width = `${(left / S.rest.total) * 100}%`;
  if (!restTick) restTick = setInterval(updateRest, 250);
}

// ------------------------------------------------------------------ snackbar
let snackTimer = null;
function snack(msg, kind = '') {
  const el = root.querySelector('.snackbar');
  el.className = 'snackbar show ' + kind;
  el.innerHTML = (kind === 'record' ? ic('emoji_events') : '') + `<span>${esc(msg)}</span>`;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { el.className = 'snackbar'; }, 3200);
}

// ------------------------------------------------------------------ bottom sheets
let sheetOpener = null, sheetKind = null, sheetData = {};
function openSheet(kind, data = {}) {
  sheetKind = kind; sheetData = data;
  if (!root.querySelector('.scrim').classList.contains('open')) sheetOpener = document.activeElement;
  renderSheet();
  const scrim = root.querySelector('.scrim');
  scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add('open'));
  root.querySelector('.sheet [data-autofocus]')?.focus() || root.querySelector('.sheet button')?.focus();
}
function closeSheet() {
  const scrim = root.querySelector('.scrim');
  scrim.classList.remove('open'); scrim.hidden = true; sheetKind = null;
  if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus();
}
function renderSheet() {
  const sheet = root.querySelector('.sheet');
  let title = '', body = '';
  if (sheetKind === 'plates') { title = t('plateTitle'); body = plateSheet(); }
  else if (sheetKind === 'short') { title = t('shortTitle'); body = shortSheet(); }
  else if (sheetKind === 'food') { title = t('addFoodTitle'); body = foodSheet(); }
  sheet.setAttribute('aria-label', title);
  sheet.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-head"><h3 class="title-l">${title}</h3>
    <button type="button" class="icon-btn" data-act="sheet-close" aria-label="${t('close')}">${ic('close')}</button></div>${body}`;
}

const PLATE_COLOURS = { 25: '#d32f2f', 20: '#1565c0', 15: '#f9a825', 10: '#2e7d32', 5: '#eceff1', 2.5: '#c62828', 1.25: '#90a4ae' };
function plateSheet() {
  const target = sheetData.target;
  const load = E.loadBar(target);
  let x = 150;
  const plates = load.perSide.map(p => {
    const h = 30 + p * 3.2, w = p >= 10 ? 12 : 9;
    const r = `<rect x="${x}" y="${50 - h / 2}" width="${w}" height="${h}" rx="2" fill="${PLATE_COLOURS[p]}" stroke="rgba(0,0,0,.35)"/>`;
    x += w + 2; return r;
  }).join('');
  return `<div class="plate-input">
      <button type="button" class="icon-btn tonal" data-act="plate-adj" data-d="-2.5" aria-label="-2.5 kg">${ic('remove')}</button>
      <label class="field"><span class="label-s">${t('plateTarget')}</span><input type="number" step="0.5" min="20" value="${target}" name="plate-target" data-field="plate-target" data-autofocus aria-label="${t('plateTarget')} (kg)"><span class="suffix">kg</span></label>
      <button type="button" class="icon-btn tonal" data-act="plate-adj" data-d="2.5" aria-label="+2.5 kg">${ic('add')}</button>
    </div>
    <svg class="plate-svg" viewBox="0 0 320 100" role="img" aria-label="${t('platePerSide')}: ${load.perSide.map(kgf).join(' + ') || '0'} kg">
      <rect x="10" y="46" width="300" height="8" rx="3" class="bar-steel"/><rect x="140" y="38" width="8" height="24" rx="2" class="bar-steel"/>${plates}
    </svg>
    <p class="title-m">${t('platePerSide')}: ${load.perSide.length ? load.perSide.map(kgf).join(' + ') + ' kg' : t('plateNone')}</p>
    <p class="body-m muted">${t('plateBar', 20)} · ${kgf(load.totalKg)} kg</p>
    ${load.isExact ? '' : `<p class="body-m warn">${t('plateBelow', kgf(target), kgf(load.totalKg))}</p>`}
    <p class="body-s muted">${t('plateNote')}</p>`;
}

function shortSheet() {
  const m = sheetData.minutes, a = E.adaptSession(BASE_SESSION, m);
  return `<label class="m-slider"><span class="body-m"><strong class="num" id="short-val">${m}</strong> ${t('minutes')}</span>
      <input type="range" min="20" max="60" step="5" value="${m}" name="short" data-field="short" data-autofocus aria-label="${t('shortTitle')}"></label>
    <div class="banner" aria-live="polite"><strong>${t('adaptFromTo', a.minutesBefore, a.minutesAfter)}</strong>
      ${a.changed ? t('adaptDetail', a.supersets, a.cutSets) : t('adaptNone')}</div>
    <ul class="adapt-list">${a.exercises.map(e => `<li><span>${exName(e.id)}</span><span class="num muted">${e.sets} × ${e.repsMin}-${e.repsMax}${e.supersetGroup ? ' · SS' : ''}${a.cut[e.id] ? ` (-${a.cut[e.id]})` : ''}</span></li>`).join('')}
      ${BASE_SESSION.filter(b => !a.exercises.some(e => e.id === b.id)).map(b => `<li class="cut"><span>${exName(b.id)}</span><span class="num">-${b.sets}</span></li>`).join('')}</ul>
    <p class="body-s muted">${t('adaptRule')}</p>
    <div class="sheet-actions"><button type="button" class="m-btn filled" data-act="short-apply">${t('apply')}</button></div>`;
}

function foodSheet() {
  return `<p class="body-s muted">${t('foodNote')}</p><ul class="food-list">${FOODS.map(f => `<li>
    <span><span class="body-l">${foodName(f)}</span><span class="body-s muted">${serving(f)} · ${f.kcal} kcal · P ${nf(f.p, f.p % 1 ? 1 : 0)} g${f.caffeine ? ` · ${f.caffeine} mg caf.` : ''}</span></span>
    <button type="button" class="m-btn tonal small" data-act="add-food" data-food="${f.id}" aria-label="${t('add')}: ${foodName(f)}">${ic('add')}${t('add')}</button></li>`).join('')}</ul>`;
}

// ------------------------------------------------------------------ recovery body map
const SHAPES = {
  front: {
    neck: [['e', 100, 55, 8, 6]], traps: [['e', 84, 66, 9, 5], ['e', 116, 66, 9, 5]],
    shoulders: [['e', 62, 78, 13, 11], ['e', 138, 78, 13, 11]], chest: [['e', 83, 95, 17, 13], ['e', 117, 95, 17, 13]],
    biceps: [['e', 50, 117, 8, 19], ['e', 150, 117, 8, 19]], forearms: [['e', 42, 166, 7, 22], ['e', 158, 166, 7, 22]],
    abdominals: [['r', 87, 114, 26, 66, 8]], abductors: [['e', 66, 206, 6, 14], ['e', 134, 206, 6, 14]],
    quadriceps: [['e', 81, 262, 12, 38], ['e', 119, 262, 12, 38]], adductors: [['e', 94, 240, 5, 20], ['e', 106, 240, 5, 20]],
    calves: [['e', 84, 338, 8, 26], ['e', 116, 338, 8, 26]],
  },
  back: {
    neck: [['e', 100, 54, 8, 6]], traps: [['p', 'M78,64 Q100,56 122,64 L112,98 Q100,104 88,98 Z']],
    shoulders: [['e', 62, 78, 13, 11], ['e', 138, 78, 13, 11]], middleBack: [['e', 100, 120, 10, 15]],
    lats: [['e', 77, 130, 12, 26], ['e', 123, 130, 12, 26]], triceps: [['e', 50, 117, 8, 19], ['e', 150, 117, 8, 19]],
    forearms: [['e', 42, 166, 7, 22], ['e', 158, 166, 7, 22]], lowerBack: [['e', 100, 168, 13, 15]],
    glutes: [['e', 86, 206, 15, 15], ['e', 114, 206, 15, 15]], hamstrings: [['e', 84, 262, 12, 36], ['e', 116, 262, 12, 36]],
    calves: [['e', 85, 334, 10, 26], ['e', 115, 334, 10, 26]],
  },
};
const SILHOUETTE = `<ellipse cx="100" cy="30" rx="16" ry="19"/><rect x="91" y="44" width="18" height="18" rx="5"/>
  <path d="M60,66 Q100,56 140,66 L148,96 L140,150 L136,192 L64,192 L60,150 L52,96 Z"/><path d="M64,186 L136,186 L142,224 L58,224 Z"/>
  <ellipse cx="50" cy="112" rx="12" ry="32"/><ellipse cx="150" cy="112" rx="12" ry="32"/><ellipse cx="42" cy="166" rx="10" ry="28"/><ellipse cx="158" cy="166" rx="10" ry="28"/>
  <circle cx="38" cy="200" r="7"/><circle cx="162" cy="200" r="7"/><ellipse cx="83" cy="262" rx="17" ry="44"/><ellipse cx="117" cy="262" rx="17" ry="44"/>
  <ellipse cx="85" cy="338" rx="12" ry="36"/><ellipse cx="115" cy="338" rx="12" ry="36"/><ellipse cx="83" cy="380" rx="12" ry="6"/><ellipse cx="117" cy="380" rx="12" ry="6"/>`;
const shape = s => s[0] === 'e' ? `<ellipse cx="${s[1]}" cy="${s[2]}" rx="${s[3]}" ry="${s[4]}"/>`
  : s[0] === 'r' ? `<rect x="${s[1]}" y="${s[2]}" width="${s[3]}" height="${s[4]}" rx="${s[5]}"/>` : `<path d="${s[1]}"/>`;

function recoveryView() {
  const now = nowDemo(), st = stimuli(), fresh = E.freshness(st, now);
  const shapes = SHAPES[S.side];
  const sel = S.muscle;
  const groups = Object.entries(shapes).map(([m, list]) => {
    const pct = Math.round(fresh[m] * 100);
    return `<g class="muscle${sel === m ? ' m-sel' : ''}" data-act="muscle" data-muscle="${m}" tabindex="0" role="button" aria-pressed="${sel === m}" aria-label="${muscleName(m)}, ${t('freshPct', pct)}" style="fill:${freshColor(fresh[m])}">${list.map(shape).join('')}</g>`;
  }).join('');
  const sorted = Object.keys(fresh).filter(m => SHAPES.front[m] || SHAPES.back[m]).sort((a, b) => fresh[a] - fresh[b]);
  let detail = `<p class="body-m muted">${t('tapMuscle')}</p>`;
  if (sel) {
    const f = fresh[sel], h = E.hoursUntilFresh(st, sel, now);
    detail = `<p class="title-m"><span class="m-dot" style="background:${freshColor(f)}"></span>${muscleName(sel)} · ${t('freshPct', Math.round(f * 100))} · ${t(E.bandOf(f))}</p>
      <p class="body-m muted">${t('backIn', h)} (${E.recoveryHours(sel)} h ${S.lang === 'es' ? 'para volver al 95 %' : 'to 95 %'})</p>`;
  }
  return `<section class="m-card outlined" id="recovery-card" aria-labelledby="rec-h">
    <div class="ex-head"><h3 class="title-m" id="rec-h">${t('recoveryTitle')}</h3>
      <div class="m-seg" role="group" aria-label="${t('recoveryTitle')}">
        <button type="button" data-act="side" data-side="front" aria-pressed="${S.side === 'front'}">${t('front')}</button>
        <button type="button" data-act="side" data-side="back" aria-pressed="${S.side === 'back'}">${t('backSide')}</button></div></div>
    <div class="body-wrap">
      <svg class="bodymap" viewBox="0 0 200 392" role="group" aria-label="${t('recoveryTitle')}, ${S.side === 'front' ? t('front') : t('backSide')}">
        <g class="silhouette" aria-hidden="true">${SILHOUETTE}</g>${groups}</svg>
      <div class="m-legend" aria-hidden="true"><span class="grad"></span><span class="body-s">${t('veryTired')}</span><span class="body-s">${t('fresh')}</span></div>
    </div>
    <div class="muscle-detail" aria-live="polite">${detail}</div>
    <p class="body-s muted">${t('recentLoad')}</p>
    <p class="body-s muted source">${ic('info')}${t('recoverySource')}</p>
  </section>
  <section class="m-card outlined" aria-labelledby="all-h"><h3 class="title-s" id="all-h">${t('allMuscles')}</h3>
    <ul class="fresh-list">${sorted.map(m => `<li><button type="button" data-act="muscle" data-muscle="${m}" aria-pressed="${sel === m}">
      <span>${muscleName(m)}</span><span class="bar"><span style="width:${Math.round(fresh[m] * 100)}%;background:${freshColor(fresh[m])}"></span></span><span class="num">${Math.round(fresh[m] * 100)} %</span></button></li>`).join('')}</ul>
  </section>`;
}

// ------------------------------------------------------------------ run and races
function runView() {
  const p = E.trainingPaces(VDOT);
  const maxHr = E.tanakaMaxHr(ageNow()), rest = READY.today.restingHr;
  const starts = E.heartZoneStarts(maxHr, rest);
  const zoneCol = ['#64B5F6', '#4DB6AC', '#FFD54F', '#FF8A65', '#E57373'];
  const band = r => `${pace(r.fast)}-${pace(r.slow)}`;
  return `<section class="m-card outlined" aria-labelledby="vdot-h">
      <h3 class="title-l" id="vdot-h">${t('vdotTitle', nf(VDOT, 1))}</h3>
      <p class="body-s muted">${t('vdotFrom', dur(FITNESS.seconds), FITNESS.daysAgo)}</p>
      <h4 class="title-s">${t('paces')}</h4>
      <dl class="kv">
        <div><dt>${t('paceEasy')}</dt><dd class="num">${band(p.easy)} ${t('perKm')}</dd></div>
        <div><dt>${t('paceThreshold')}</dt><dd class="num">${band(p.threshold)} ${t('perKm')}</dd></div>
        <div><dt>${t('paceInterval')}</dt><dd class="num">${band(p.interval)} ${t('perKm')}</dd></div>
        <div><dt>${t('pace10k')}</dt><dd class="num">${band(p.tenK)} ${t('perKm')}</dd></div>
      </dl>
    </section>
    <section class="m-card outlined" aria-labelledby="zones-h"><h3 class="title-s" id="zones-h">${t('zonesTitle')}</h3>
      <ul class="zones">${starts.map((s, i) => `<li><span class="zone" style="background:${zoneCol[i]}">Z${i + 1}</span><span class="num">${s}-${i < 4 ? starts[i + 1] - 1 : maxHr} bpm</span></li>`).join('')}</ul>
      <p class="body-s muted">${t('zonesNote', maxHr, rest)}</p></section>
    <h3 class="title-s pad">${t('races')}</h3>
    ${Object.values(RACES).map(r => `<button type="button" class="m-card filled row-card" data-act="race" data-id="${r.id}" id="race-${r.id}">
      ${ic(r.terrain === 'trail' ? 'landscape' : 'directions_run')}<span><span class="title-s">${t(r.nameKey)}</span>
      <span class="body-m muted">${dateShort(r.start)} · ${nf(r.distanceM / 1000)} km · ${t(r.terrain === 'trail' ? 'trail' : 'road')} · ${t('predicted')} ${dur(PREDICTIONS[r.id].seconds)}</span></span>${ic('chevron_right')}</button>`).join('')}`;
}

function raceDetail(r) {
  const pr = PREDICTIONS[r.id];
  const adjKey = { altitude: 'adjAltitude', hills: 'adjHills', terrain: 'adjTerrain', heat: 'adjHeat' };
  const signed = (s, pct) => `${s >= 0 ? '+' : '-'}${dur(Math.abs(s))} (${pct >= 0 ? '+' : ''}${nf(pct, 1)} %)`;
  let profile = '';
  if (r.profile) {
    const W = 320, H = 130, L = 34, B = 20, maxX = r.distanceM, alts = r.profile.map(p => p[1]);
    const lo = Math.floor(Math.min(...alts) / 100) * 100, hi = Math.ceil(Math.max(...alts) / 100) * 100;
    const X = x => L + x / maxX * (W - L - 6), Y = y => 8 + (1 - (y - lo) / (hi - lo)) * (H - B - 8);
    const line = r.profile.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
    profile = `<figure class="m-card outlined"><figcaption class="title-s">${t('elevation')}</figcaption>
      <svg class="m-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('elevationAria', nf(Math.min(...alts)), nf(Math.max(...alts)), nf(r.gainM))}">
        ${[lo, (lo + hi) / 2, hi].map(v => `<line class="grid" x1="${L}" x2="${W - 6}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis" x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${nf(v)}</text>`).join('')}
        <path class="area" d="${line} L${X(maxX)},${Y(lo)} L${X(0)},${Y(lo)} Z"/><path class="line" d="${line}"/>
        ${[0, 7000, 14000, 21000].map((x, i) => `<text class="axis" x="${X(x)}" y="${H - 6}" text-anchor="${i === 3 ? 'end' : i === 0 ? 'start' : 'middle'}">${x / 1000} km</text>`).join('')}
      </svg></figure>`;
  }
  return `<div class="pad">
      <p class="body-m muted">${dateShort(r.start)} ${hhmm(r.start)} · ${t('raceIn', daysTo(r.start))}</p>
      <p class="label-s">${t('predicted')}</p>
      <p class="display num" id="race-time">${dur(pr.seconds)}</p>
      <p class="body-m muted">${t('avgPace', pace(pr.seconds / pr.metres * 1000))} · ${t('fitnessLine', nf(VDOT, 1))}</p>
      <p class="body-s muted">${r.gainM ? t('courseStats', nf(r.distanceM / 1000), nf(r.gainM), nf(r.lossM), nf(r.altitudeM)) + ' · ' + t(r.terrain) : `${nf(r.distanceM / 1000)} km · ${t('road')}`}</p>
      ${pr.heat ? `<p class="body-s muted">${t('weather', r.tempC, r.humidity, nf(pr.heat.wbgt, 1))} · ${t('youTrain', nf(PROFILE.homeAltitudeM))}</p>` : ''}
    </div>
    ${profile}
    <section class="m-card outlined" id="race-adjust" aria-labelledby="adj-h">
      <h3 class="title-s" id="adj-h">${t('flatTime')}: <span class="num">${dur(pr.flatSeconds)}</span></h3>
      ${pr.adjustments.length ? `<ul class="adjust">${pr.adjustments.map(a => `<li><div class="adj-row"><span class="title-s">${t(adjKey[a.kind])}</span><span class="num">${signed(a.seconds, a.percent)}</span></div>
        <p class="body-s muted">${t(adjKey[a.kind] + 'Source')}</p></li>`).join('')}</ul>
        <div class="adj-row total"><span class="title-s">${t('predicted')}</span><span class="num">${dur(pr.seconds)}</span></div>`
      : `<p class="body-m muted">${t('noAdjust')}</p>`}
    </section>`;
}

// ------------------------------------------------------------------ climbing grades
function climbView() {
  const sys = S.climb.system, other = sys === 'font' ? 'v' : 'font';
  const g = E.parseGrade(sys, S.climb.label) || E.gradesOf(sys)[0];
  const out = E.convertGrade(g, other);
  return `<section class="m-card outlined" aria-labelledby="grade-h"><h3 class="title-m" id="grade-h">${t('gradeTitle')}</h3>
    <div class="form-row">
      <label class="field"><span class="label-s">${t('gradeSystem')}</span><select name="climb-system" data-field="climb-system">
        <option value="font" ${sys === 'font' ? 'selected' : ''}>${t('fontLabel')}</option><option value="v" ${sys === 'v' ? 'selected' : ''}>${t('vLabel')}</option></select></label>
      <label class="field"><span class="label-s">${t('grade')}</span><select name="climb-grade" data-field="climb-grade">
        ${E.gradesOf(sys).map(x => `<option ${x.label === g.label ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
    </div>
    <p class="display-s" aria-live="polite">${t('gradeResult', g.label, out.label, nf(g.ircra, g.ircra % 1 ? 1 : 0))}</p>
    <ol class="ladder" aria-label="IRCRA">${E.FONT_GRADES.filter((x, i, a) => i === 0 || x.ircra !== a[i - 1].ircra).slice(4, 16).map(x =>
      `<li class="${Math.round(x.ircra) === Math.round(g.ircra) ? 'm-on' : ''}"><span class="num">${x.ircra}</span><span>${x.label}</span><span>${E.nearestGrade('v', x.ircra).label}</span></li>`).join('')}</ol>
    <p class="body-s muted source">${ic('info')}${t('gradeSource')}</p></section>`;
}

// ------------------------------------------------------------------ yoga figures (pose_figure.dart painter)
function poseSvg(id) {
  const lines = E.BONES.map(([a, b]) => `<line data-a="${a}" data-b="${b}" class="${E.isFar(a) || E.isFar(b) ? 'far' : 'near'}"/>`).join('');
  const wall = E.POSE_WALL_X[id] ? `<line class="floor" x1="${E.POSE_WALL_X[id]}" y1="20" x2="${E.POSE_WALL_X[id]}" y2="${E.FLOOR_Y + 2.5}"/>` : '';
  return `<svg class="pose" data-pose="${id}" viewBox="0 0 100 100" aria-hidden="true"><line class="floor" x1="6" y1="${E.FLOOR_Y + 2.5}" x2="94" y2="${E.FLOOR_Y + 2.5}"/>${wall}${lines}<circle class="head" r="${E.HEAD_RADIUS}"/></svg>`;
}
function yogaView() {
  return `<button type="button" class="m-card filled row-card" data-act="breathe">${ic('air')}<span><span class="title-s">${t('breathingTitle')}</span><span class="body-m muted">${t('breathCyclic')} · ${t('breathBox')} · ${t('breathSix')}</span></span>${ic('chevron_right')}</button>
    <h3 class="title-s pad">${t('yogaTitle')}</h3>
    <ul class="poses" id="poses">${Object.keys(E.POSE_FIGURES).map(id => `<li class="pose-card"><figure>${poseSvg(id)}<figcaption class="body-m">${POSE_NAMES[S.lang][id]}</figcaption></figure></li>`).join('')}</ul>
    <p class="body-s muted pad">${t('yogaNote')}</p>`;
}
let poseRaf = null;
function drawPoses(phase) {
  const figs = root.querySelectorAll('svg.pose');
  if (!figs.length) { poseRaf = null; return false; }
  const p = E.poseProgress(phase);
  figs.forEach(svg => {
    const [a, b] = E.POSE_FIGURES[svg.dataset.pose];
    const j = E.lerpFrame(a, b, p);
    svg.querySelectorAll('line[data-a]').forEach(l => {
      const pa = j[l.dataset.a], pb = j[l.dataset.b];
      l.setAttribute('x1', pa[0]); l.setAttribute('y1', pa[1]); l.setAttribute('x2', pb[0]); l.setAttribute('y2', pb[1]);
    });
    const h = svg.querySelector('.head'); h.setAttribute('cx', j.head[0]); h.setAttribute('cy', j.head[1]);
  });
  return true;
}
function startPoses() {
  if (reduceMotion.matches) { drawPoses(0.5); return; }       // inside the hold: the pose itself
  if (poseRaf) return;
  if (!drawPoses(performance.now() / (E.POSE_LOOP_SECONDS * 1000))) return;
  const loop = now => { if (drawPoses(now / (E.POSE_LOOP_SECONDS * 1000))) poseRaf = requestAnimationFrame(loop); };
  poseRaf = requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ breathing pacer
const PATTERN_KEYS = { cyclicSighing: ['breathCyclic', 'breathCyclicEvidence'], box: ['breathBox', 'breathBoxEvidence'], sixPerMinute: ['breathSix', 'breathSixEvidence'] };
function breathing() {
  const b = S.breath;
  return `<div class="pad"><div class="m-seg wrap" role="group" aria-label="${t('pattern')}">${Object.entries(PATTERN_KEYS).map(([k, [n]]) =>
      `<button type="button" data-act="breath-pattern" data-p="${k}" aria-pressed="${b.pattern === k}">${t(n)}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="${t('length')}">${E.BREATHING_MINUTES.map(m => `<button type="button" class="chip" data-act="breath-min" data-m="${m}" aria-pressed="${b.minutes === m}">${m} min</button>`).join('')}</div>
    <div class="pacer" aria-hidden="true"><div class="pacer-ring"></div><div class="pacer-fill" id="pacer-fill"></div></div>
    <p class="title-l center" id="pacer-phase" aria-live="polite">${b.done ? t('breathDone') : t('ph_inhale')}</p>
    <p class="body-m muted center num" id="pacer-left">${t('breathsLeft', E.breathsIn(b.pattern, b.minutes))}</p>
    <div class="center"><button type="button" class="m-btn filled" data-act="breath-toggle" id="breath-btn">${ic(b.running ? 'stop' : 'play_arrow')}${b.running ? t('stop') : t('start')}</button></div>
    <p class="body-s muted source">${ic('info')}${t(PATTERN_KEYS[b.pattern][1])}</p></div>`;
}
let breathRaf = null, lastPhase = '';
function breathLoop() {
  const b = S.breath, fill = root.querySelector('#pacer-fill');
  if (!b.running || !fill) { breathRaf = null; return; }
  const elapsed = (performance.now() - b.t0) / 1000, total = E.breathsIn(b.pattern, b.minutes);
  const st = E.pacerAt(b.pattern, elapsed);
  if (st.cycle >= total) { b.running = false; b.done = true; render(); return; }
  fill.style.transform = `scale(${0.35 + 0.65 * st.lungs})`;
  const label = t('ph_' + st.kind);
  if (label !== lastPhase) { root.querySelector('#pacer-phase').textContent = label; lastPhase = label; }
  root.querySelector('#pacer-left').textContent = t('breathsLeft', total - st.cycle);
  breathRaf = requestAnimationFrame(breathLoop);
}

// ------------------------------------------------------------------ Eat
function eat() {
  const tg = targets(), tot = totals(), o = outlook(), now = nowDemo();
  const meals = [['breakfast', l => new Date(l.at).getHours() < 11], ['lunch', l => { const h = new Date(l.at).getHours(); return h >= 11 && h < 16; }], ['snacks', l => new Date(l.at).getHours() >= 16]];
  const macro = (k, v, g, cls) => `<div class="macro">${ring('m-' + k, v / g, 24, 7, cls)}<span class="label-s">${t(k)}</span><span class="body-s num">${t('ofTarget', nf(v), nf(g) + ' g')}</span></div>`;
  return `<section class="m-card outlined rings-card" id="rings-card" aria-labelledby="rings-h">
      <h3 class="sr" id="rings-h">${t('nutritionToday')}</h3>
      <div class="big-ring">${ring('kcal', tot.kcal / tg.kcal, 54, 12, 'ring-kcal', `<text x="60" y="58" text-anchor="middle" class="ring-text big">${nf(tot.kcal)}</text><text x="60" y="76" text-anchor="middle" class="ring-sub">/ ${nf(tg.kcal)} kcal</text>`)}
        <p class="body-m">${t('kcalLeft', nf(Math.max(0, tg.kcal - tot.kcal)))}</p></div>
      <div class="macros">${macro('protein', tot.p, tg.proteinG, 'ring-p')}${macro('carbs', tot.c, tg.carbsG, 'ring-c')}${macro('fat', tot.f, tg.fatG, 'ring-f')}</div>
    </section>
    <section class="m-card filled water" aria-label="${t('water')}">${ic('water_drop')}<span class="title-s">${t('water')}</span>
      <span class="num body-m">${nf(S.water)} / ${nf(tg.waterMl)} ml</span><button type="button" class="icon-btn tonal" data-act="water" aria-label="${t('addWater')}">${ic('add')}</button></section>
    <div class="pad"><button type="button" class="m-btn filled" data-act="food-sheet" id="add-food">${ic('add')}${t('addFood')}</button></div>
    ${meals.map(([k, f]) => { const items = S.log.map((l, i) => [l, i]).filter(([l]) => f(l)); return items.length ? `<section class="meal" aria-labelledby="meal-${k}"><h3 class="title-s" id="meal-${k}">${t(k)}</h3><ul>${items.map(([l, i]) => {
      const fd = food(l.food); return `<li><span><span class="body-l">${foodName(fd)}</span><span class="body-s muted">${hhmm(l.at)} · ${serving(fd)}${fd.caffeine ? ` · ${fd.caffeine} mg caf.` : ''}</span></span><span class="num body-m">${fd.kcal} kcal</span>
      <button type="button" class="icon-btn" data-act="remove-food" data-i="${i}" aria-label="${t('remove', foodName(fd))}">${ic('close')}</button></li>`; }).join('')}</ul></section>` : ''; }).join('')}
    ${caffeineCard(o, now)}`;
}

function caffeineCard(o, now) {
  const from = at(0, 6), to = at(1, 6), pts = o.curve(from, to, 10 * MIN);
  const W = 320, H = 150, L = 30, B = 22, maxY = Math.max(150, ...pts.map(p => p[1])) * 1.08;
  const X = ms => L + (ms - from) / (to - from) * (W - L - 6), Y = v => 18 + (1 - v / maxY) * (H - B - 18);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const bed = o.bedtime, cof = food('coffee');
  const last = o.lastDoseBy(cof.caffeine), drink = foodName(cof);
  const lastText = last === null ? t('caffeineTooLate', drink, cof.caffeine) : last === bed ? t('caffeineAnyTime', drink, cof.caffeine) : t('caffeineLastBy', drink, cof.caffeine, hhmm(last));
  const clear = o.clearAt;
  return `<section class="m-card outlined" id="caffeine-card" aria-labelledby="caf-h">
    <h3 class="title-m" id="caf-h">${ic('local_cafe')} ${t('caffeineCurveTitle')}</h3>
    <p class="body-m">${t('caffeineNow', nf(o.nowMg))} · ${o.sleepOk ? t('caffeineSleepOk') : t('caffeineSleepHigh', clear ? hhmm(clear) : '-')}</p>
    <svg class="m-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('caffeineChartAria', nf(o.nowMg), nf(o.bedtimeMg))}">
      ${[0, 100, 200].filter(v => v < maxY).map(v => `<text class="axis" x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`).join('')}
      <line class="grid" x1="${L}" x2="${W - 6}" y1="${Y(0)}" y2="${Y(0)}"/>
      <line class="limit" x1="${L}" x2="${W - 6}" y1="${Y(100)}" y2="${Y(100)}"/><text class="axis limit-t" x="${W - 8}" y="${Y(100) - 4}" text-anchor="end">${t('sleepLevel')}</text>
      <path class="area" d="${line} L${X(to)},${Y(0)} L${X(from)},${Y(0)} Z"/><path class="line" d="${line}"/>
      <line class="marker" x1="${X(now)}" x2="${X(now)}" y1="14" y2="${Y(0)}"/><text class="axis" x="${X(now)}" y="10" text-anchor="middle">${t('chartNow')}</text>
      <line class="marker bed" x1="${X(bed)}" x2="${X(bed)}" y1="14" y2="${Y(0)}"/><text class="axis" x="${X(bed)}" y="10" text-anchor="middle">${t('chartBed')}</text>
      ${[6, 12, 18, 24].map(h => `<text class="axis" x="${X(at(0, h))}" y="${H - 6}" text-anchor="middle">${h % 24}:00</text>`).join('')}
    </svg>
    <p class="title-s">${t('caffeineLastCoffeeTitle')}</p><p class="body-l" id="last-coffee">${lastText}</p>
    <p class="body-s muted source">${ic('info')}${t('caffeineSource')}</p></section>`;
}

function addFood(id) {
  S.log.push({ food: id, at: nowDemo() });
  S.log.sort((a, b) => a.at - b.at);
  snack(t('logged', foodName(food(id))));
}

// ------------------------------------------------------------------ Coach (scripted replay, guarded by the ported number check)
const EXCHANGES = [
  { q: 'q1', tool: 'get_nutrition', src: 'src1', data: () => { const tg = targets(), tot = totals(); return { protein_eaten_g: Math.round(tot.p), protein_target_g: tg.proteinG, protein_left_g: Math.max(0, Math.round(tg.proteinG - tot.p)), kcal_left: Math.max(0, tg.kcal - Math.round(tot.kcal)) }; },
    reply: d => t('a1', d.protein_eaten_g, d.protein_target_g, d.protein_left_g, nf(d.kcal_left)) },
  { q: 'q2', tool: 'search_food', src: 'src2', action: 'yogurt', data: () => ({ results: [{ name: 'Greek yogurt 2 %', grams: 250, protein_g: 25, kcal: 183 }, { name: 'Grilled chicken breast', grams: 150, protein_g: 46, kcal: 248 }] }),
    reply: () => t('a2') },
  { q: 'q3', tool: 'get_nutrition', src: 'src3', data: () => { const o = outlook(), l = o.lastDoseBy(95); return { caffeine_now_mg: Math.round(o.nowMg), coffee_mg: 95, last_coffee_by: l ? hhmm(l) : null, bedtime: '23:00', sleep_level_mg: 100 }; },
    reply: d => (d.last_coffee_by ? t('a3', d.caffeine_now_mg, d.last_coffee_by) : t('a3late', d.caffeine_now_mg)) },
  { q: 'q4', tool: 'get_runs', src: 'src4', data: () => ({ vdot: +VDOT.toFixed(1), race: 'Sample 10K', predicted: dur(PREDICTIONS.sample10k.seconds), pace_per_km: pace(PREDICTIONS.sample10k.seconds / 10) }),
    reply: d => t('a4', nf(d.vdot, 1), d.predicted, d.pace_per_km) },
];
function coach() {
  const asked = new Set(S.coach.map(c => c.i));
  return `<div class="banner replay" role="note">${ic('info')}<span>${t('coachReplay')}</span></div>
    <div class="chat" id="chat">
      <div class="msg bot"><p>${t('coachHello')}</p></div>
      ${S.coach.map((c, n) => coachMessage(c, n === S.coach.length - 1)).join('')}
    </div>
    <div class="chips suggest" role="group" aria-label="${t('navCoach')}">${EXCHANGES.map((x, i) => asked.has(i) ? '' :
      `<button type="button" class="chip" data-act="ask" data-i="${i}">${t(x.q)}</button>`).join('')}</div>
    <p class="body-s muted pad">${t('coachGuardNote')}</p>`;
}
function coachMessage(c, newest) {
  const x = EXCHANGES[c.i], reply = x.reply(c.data);
  const allowed = E.numbersIn([c.data, t(x.q)]);
  const bad = E.unverifiedNumbers(reply, allowed);
  let html = '', pos = 0;
  for (const n of bad) { html += esc(reply.slice(pos, n.start)) + `<mark class="unverified">${esc(n.text)}</mark>`; pos = n.end; }
  html += esc(reply.slice(pos));
  const fresh = newest && c.fresh;
  c.fresh = false;
  return `<div class="msg user"><p>${t(x.q)}</p></div>
    <div class="msg bot${fresh ? ' arriving' : ''}">
      <p class="tool label-s">${ic('database')}${t('coachTool', x.tool)}</p>
      <p>${html}</p>
      ${bad.length ? `<p class="flag body-s">${ic('warning')}${t('coachUnverified', bad.length, bad.map(b => b.text).join(', '))}</p>` : ''}
      ${x.action ? `<div class="action-card"><span><span class="title-s">${foodName(food(x.action))}</span><span class="body-s muted">${serving(food(x.action))} · ${food(x.action).kcal} kcal · P ${food(x.action).p} g</span></span>
        <button type="button" class="m-btn filled small" data-act="coach-log" ${S.coachYogurtLogged ? 'disabled' : ''}>${ic(S.coachYogurtLogged ? 'check' : 'add')}${S.coachYogurtLogged ? t('loggedDone') : t('logThisFood')}</button></div>` : ''}
      <p class="sources"><span class="label-s">${t('coachFrom')}</span>${t(x.src).map(s => `<span class="src-chip">${s}</span>`).join('')}</p>
    </div>`;
}
function ask(i) {
  if (S.coach.some(c => c.i === i)) return;
  S.coach.push({ i, data: EXCHANGES[i].data(), fresh: true });
  render();
  const chat = root.querySelector('.screen');
  const last = root.querySelector('#chat .msg.bot:last-child');
  if (last) chat.scrollTop = last.offsetTop - 60;
}

// ------------------------------------------------------------------ Profile
function profile() {
  const p = S.profile, tg = targets(), age = ageNow();
  const sel = (field, opts, cur, key) => `<select name="${field}" data-field="${field}">${opts.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${t(key + o)}</option>`).join('')}</select>`;
  const pct = E.WEEKLY_RATE[p.goal] * 100;
  const step = (label, how, val, id = '') => `<li ${id ? `id="${id}"` : ''}><span class="step-label">${label}</span><span class="step-how num">${how}</span><span class="step-val num">${val}</span></li>`;
  return `<div class="pad prof-head"><span class="avatar" aria-hidden="true">A</span><div><h2 class="title-l">${p.name}</h2><p class="body-s muted">${t('demoProfile')}</p></div></div>
    <section class="m-card outlined" aria-label="${t('demoProfile')}">
      <div class="form-grid">
        <label class="field"><span class="label-s">${t('sex')}</span><select name="sex" data-field="sex"><option value="male" ${p.sex === 'male' ? 'selected' : ''}>${t('male')}</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>${t('female')}</option></select></label>
        <div class="field"><span class="label-s">${t('age')}</span><span class="body-l num">${age}</span></div>
        <div class="field"><span class="label-s">${t('height')}</span><span class="body-l num">${p.heightCm} cm</span></div>
        <div class="field"><span class="label-s">${t('weight')}</span><span class="m-stepper">
          <button type="button" class="icon-btn tonal" data-act="weight" data-d="-0.5" aria-label="${t('weightDown')}">${ic('remove')}</button>
          <span class="body-l num">${kgf(p.weightKg)} kg</span>
          <button type="button" class="icon-btn tonal" data-act="weight" data-d="0.5" aria-label="${t('weightUp')}">${ic('add')}</button></span></div>
        <label class="field"><span class="label-s">${t('activity')}</span>${sel('activity', Object.keys(E.ACTIVITY_FACTORS), p.activity, 'act_')}</label>
        <label class="field"><span class="label-s">${t('goal')}</span>${sel('goal', Object.keys(E.WEEKLY_RATE), p.goal, 'goal_')}</label>
      </div>
    </section>
    <section class="m-card outlined" id="targets-card" aria-labelledby="tg-h"><h3 class="title-m" id="tg-h">${t('targetsTitle')}</h3>
      <ol class="steps">
        ${step(t('stepBmr'), `10 × ${kgf(p.weightKg)} + ${nf(6.25, 2)} × ${p.heightCm} - 5 × ${age} ${p.sex === 'male' ? '+ 5' : '- 161'}`, `${nf(tg.bmr, 1)} kcal`)}
        ${step(t('stepTdee', nf3(tg.factor)), `${nf(tg.bmr, 1)} × ${nf3(tg.factor)}`, `${nf(tg.tdee, 1)} kcal`)}
        ${step(t('stepGoal'), t('stepGoalHow', `${pct > 0 ? '+' : ''}${nf(pct, 2)}`, kgf(p.weightKg)), `${tg.delta >= 0 ? '+' : ''}${nf(tg.delta)} kcal`)}
        ${step(t('stepKcal'), `${nf(tg.tdee, 1)} ${tg.delta >= 0 ? '+' : '-'} ${nf(Math.abs(tg.delta))}; ${t('stepFloor', p.sex === 'male' ? 1500 : 1200)}`, `<strong>${nf(tg.kcal)} kcal</strong>`, 'step-kcal')}
        ${step(t('stepProtein'), `${nf(E.PROTEIN_PER_KG[p.goal], 1)} g/kg × ${kgf(p.weightKg)} kg`, `${nf(tg.proteinG)} g`)}
        ${step(t('stepFat'), `${nf(tg.kcal)} × ${nf(0.25, 2)} ÷ 9`, `${nf(tg.fatG)} g`)}
        ${step(t('stepCarbs'), `(${nf(tg.kcal)} - ${nf(tg.proteinG)} × 4 - ${nf(tg.fatG)} × 9) ÷ 4`, `${nf(tg.carbsG)} g`)}
        ${step(t('stepWater'), '', `${nf(tg.waterMl)} ml`)}
        ${step(t('stepCaffeine'), '', `${nf(tg.caffeineMaxMg)} mg`)}
      </ol></section>
    <section class="m-card outlined" aria-label="${t('settings')}">
      <div class="setting"><span class="title-s">${t('language')}</span><div class="m-seg" role="group" aria-label="${t('language')}">
        <button type="button" data-act="lang" data-lang="en" aria-pressed="${S.lang === 'en'}">English</button><button type="button" data-act="lang" data-lang="es" aria-pressed="${S.lang === 'es'}">Español</button></div></div>
      <div class="setting"><span class="title-s">${t('theme')}</span><div class="m-seg" role="group" aria-label="${t('theme')}">
        <button type="button" data-act="theme" data-theme-set="light" aria-pressed="${S.theme === 'light'}">${t('light')}</button><button type="button" data-act="theme" data-theme-set="dark" aria-pressed="${S.theme === 'dark'}">${t('dark')}</button></div></div>
    </section>
    <section class="m-card filled"><h3 class="title-s">${t('sourcesTitle')}</h3><p class="body-m">${t('sourcesBody')}</p></section>`;
}

// ------------------------------------------------------------------ language, theme, page controls
function setLang(l) { S.lang = l; syncPageControls(); render(); if (sheetKind) renderSheet(); }
function setTheme(th) { S.theme = th; syncPageControls(); render(); }
function syncPageControls() {
  document.querySelectorAll('[data-page-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pageLang === S.lang)));
  document.querySelectorAll('[data-page-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pageTheme === S.theme)));
}
document.querySelectorAll('[data-page-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.pageLang)));
document.querySelectorAll('[data-page-theme]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.pageTheme)));

// ------------------------------------------------------------------ events
function goTab(tab, view) {
  S.tab = tab; S.stack = [];
  if (view) S.trainView = view;
  render({ keepScroll: false });
}
root.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el)) {
    if (e.target.classList.contains('scrim')) closeSheet();
    return;
  }
  const d = el.dataset;
  switch (d.act) {
    case 'tab': goTab(d.tab); break;
    case 'go': goTab(d.tab, d.view); break;
    case 'view': S.trainView = d.view; render({ keepScroll: false }); break;
    case 'back': S.stack.pop(); S.breath.running = false; render({ keepScroll: false }); break;
    case 'race': S.stack.push({ type: 'race', id: d.id }); render({ keepScroll: false }); break;
    case 'breathe': S.stack.push({ type: 'breathe' }); render({ keepScroll: false }); break;
    case 'tick': tickSet(d.ex, +d.i); break;
    case 'rest-skip': S.rest = null; updateRest(); break;
    case 'rest-adj': if (S.rest) { S.rest.end += +d.d * 1000; S.rest.total = Math.max(S.rest.total, Math.ceil((S.rest.end - Date.now()) / 1000)); updateRest(); } break;
    case 'plates': openSheet('plates', { target: S.sets[d.ex].find(s => !s.done)?.kg ?? S.sets[d.ex][0].kg }); break;
    case 'plate-adj': sheetData.target = Math.max(20, sheetData.target + +d.d); renderSheet(); root.querySelector('[data-act="plate-adj"][data-d="' + d.d + '"]').focus(); break;
    case 'short': openSheet('short', { minutes: S.adaptedTo || 30 }); break;
    case 'short-apply': applyShort(sheetData.minutes); closeSheet(); break;
    case 'unadapt': S.adaptedTo = null; render(); break;
    case 'sheet-close': closeSheet(); break;
    case 'food-sheet': openSheet('food'); break;
    case 'add-food': addFood(d.food); render(); break;
    case 'remove-food': S.log.splice(+d.i, 1); render(); break;
    case 'water': S.water += 250; render(); break;
    case 'side': S.side = d.side; render(); break;
    case 'muscle': S.muscle = d.muscle; render(); break;
    case 'ask': ask(+d.i); break;
    case 'coach-log': addFood('yogurt'); S.coachYogurtLogged = true; render(); break;
    case 'weight': S.profile.weightKg = Math.min(300, Math.max(30, S.profile.weightKg + +d.d)); render(); break;
    case 'lang': setLang(d.lang); break;
    case 'theme': setTheme(d.themeSet); break;
    case 'breath-pattern': S.breath = { ...S.breath, pattern: d.p, running: false, done: false }; render(); break;
    case 'breath-min': S.breath = { ...S.breath, minutes: +d.m, running: false, done: false }; render(); break;
    case 'breath-toggle':
      S.breath.running = !S.breath.running; S.breath.done = false; S.breath.t0 = performance.now(); lastPhase = '';
      render(); root.querySelector('#breath-btn')?.focus();
      if (S.breath.running) breathRaf = requestAnimationFrame(breathLoop);
      break;
  }
});
root.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheetKind) { closeSheet(); return; }
  const g = e.target.closest?.('g[data-act]');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); S.muscle = g.dataset.muscle; render(); root.querySelector(`g[data-muscle="${S.muscle}"]`)?.focus(); }
  // keep Tab inside an open sheet
  if (e.key === 'Tab' && sheetKind) {
    const f = [...root.querySelectorAll('.sheet button, .sheet input, .sheet select')].filter(x => !x.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
root.addEventListener('input', e => {
  const d = e.target.dataset;
  if (d.field === 'short') {
    sheetData.minutes = +e.target.value;
    renderSheet();
    const r = root.querySelector('[data-field="short"]'); r.focus();
  }
});
root.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (['kg', 'reps', 'rir'].includes(d.field)) { S.sets[d.ex][+d.i][d.field] = el.value === '' ? null : +el.value; return; }
  if (d.field === 'plate-target') { sheetData.target = Math.max(20, +el.value || 20); renderSheet(); root.querySelector('[data-field="plate-target"]').focus(); return; }
  if (d.field === 'climb-system') { const g = E.parseGrade(S.climb.system, S.climb.label); S.climb = { system: el.value, label: E.convertGrade(g, el.value).label }; render(); return; }
  if (d.field === 'climb-grade') { S.climb.label = el.value; render(); root.querySelector('[data-field="climb-grade"]').focus(); return; }
  if (['sex', 'activity', 'goal'].includes(d.field)) { S.profile[d.field] = el.value; render(); root.querySelector(`[data-field="${d.field}"]`).focus(); }
});
reduceMotion.addEventListener?.('change', () => render());

function applyShort(minutes) {
  S.adaptedTo = minutes;     // sets beyond the new count stay stored but hidden
  render();
}

// ------------------------------------------------------------------ API for the guided tour
export const api = {
  go(tab, view) { closeSheet(); goTab(tab, view); },
  openRace(id) { closeSheet(); S.tab = 'train'; S.trainView = 'run'; S.stack = [{ type: 'race', id }]; render({ keepScroll: false }); },
  tickNext(id) {
    closeSheet(); S.tab = 'train'; S.trainView = 'session'; S.stack = []; render({ keepScroll: false });
    const i = S.sets[id].findIndex(s => !s.done);
    if (i >= 0) tickSet(id, i);
  },
  applyShort(m) { closeSheet(); S.tab = 'train'; S.trainView = 'session'; S.stack = []; applyShort(m); root.querySelector('.screen').scrollTop = 0; },
  selectMuscle(m, side = 'front') { closeSheet(); S.tab = 'train'; S.trainView = 'recovery'; S.stack = []; S.side = side; S.muscle = m; render({ keepScroll: false }); },
  addFood(id) { closeSheet(); S.tab = 'eat'; S.stack = []; addFood(id); render({ keepScroll: false }); },
  ask(i) { closeSheet(); S.tab = 'coach'; S.stack = []; render({ keepScroll: false }); ask(i); },
  yoga() { closeSheet(); goTab('train', 'yoga'); },
  highlight(sel) {
    const el = root.querySelector(sel);
    if (!el) return;
    const screen = root.querySelector('.screen');
    if (screen.contains(el)) screen.scrollTop += el.getBoundingClientRect().top - screen.getBoundingClientRect().top - 12;
    el.classList.remove('tour-focus'); void el.getBoundingClientRect(); el.classList.add('tour-focus');
    setTimeout(() => el.classList.remove('tour-focus'), 2600);
  },
  get state() { return S; },
};

render({ keepScroll: false });
syncPageControls();
