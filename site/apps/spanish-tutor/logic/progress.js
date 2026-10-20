// XP, stars, levels, streaks, the synced-transcript index and the tap-a-word lexicon: ports of ProgressLogic.kt,
// ProgressScreen.kt (levels) and TranscriptIndex.kt, plus a small lexicon built from the vocabulary lesson only.
// Every function is pure (state in, new state and events out) and DOM-free.
import { foldEs } from './search.js';

export const Xp = { SECTION_DONE: 10, CORRECT_ANSWER: 2, QUIZ_PASSED: 10, QUIZ_PERFECT: 5, FINAL_EXAM_PASSED: 30, CARD_KNOWN: 1,
  CHAT_TURN: 3, DAILY_BONUS: 5, PASS_PCT: 80 };

/** 0 to 3 stars for a quiz score in percent. */
export const starsFor = pct => (pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0);

/** Level n starts at 25·(n−1)·(n+2) XP (0, 100, 250, 450…). */
const levelThreshold = n => 25 * (n - 1) * (n + 2);
export function levelFor(xp) {
  let n = 1;
  while (xp >= levelThreshold(n + 1)) n++;
  const floorXp = levelThreshold(n), nextXp = levelThreshold(n + 1);
  return { number: n, floorXp, nextXp, fraction: Math.min(1, Math.max(0, (xp - floorXp) / (nextXp - floorXp))) };
}

export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const minusDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() - n); return x; };

/** Consecutive study days ending today, or yesterday (the streak survives until the learner studies today). */
export function streak(dayXp, today) {
  let d = dayXp[dayKey(today)] !== undefined ? today : minusDays(today, 1), n = 0;
  while (dayXp[dayKey(d)] !== undefined) { n++; d = minusDays(d, 1); }
  return n;
}

export function emptyProgress() {
  return { xp: 0, dayXp: {}, lessons: {}, targets: {}, quizAnswered: 0, quizCorrect: 0, chatTurns: 0 };
}
const lessonOf = (s, key) => s.lessons[key] || { completed: [], visited: [], known: [], review: [], bestScorePct: null, attempts: 0 };

/** Adds XP (plus the first-of-the-day bonus) → [state, events]. */
export function gain(state, amount, today, events) {
  const day = dayKey(today);
  let total = amount;
  if (state.dayXp[day] === undefined) { total += Xp.DAILY_BONUS; events.push({ type: 'xp', amount: Xp.DAILY_BONUS, reason: 'daily' }); }
  events.push({ type: 'xp', amount });
  return { ...state, xp: state.xp + total, dayXp: { ...state.dayXp, [day]: (state.dayXp[day] || 0) + total } };
}

export function visit(state, key, section) {
  const p = lessonOf(state, key);
  if (p.visited.includes(section)) return state;
  return { ...state, lessons: { ...state.lessons, [key]: { ...p, visited: [...p.visited, section] } } };
}

export function completeSection(state, key, section, today) {
  const p = lessonOf(state, key), events = [];
  if (p.completed.includes(section)) return { state, events };
  let s = { ...state, lessons: { ...state.lessons, [key]: { ...p, completed: [...p.completed, section], visited: [...new Set([...p.visited, section])] } } };
  events.push({ type: 'section', key, section });
  s = gain(s, Xp.SECTION_DONE, today, events);
  return { state: s, events };
}

/** One graded answer: XP when right, and the per-target record behind «A repasar». */
export function answer(state, key, targets, correct, today, now = Date.now()) {
  const events = [];
  const t = { ...state.targets };
  for (const [target, label] of targets) {
    const id = key + '#' + target, old = t[id] || { lessonId: key, target, label, correct: 0, total: 0, recent: '' };
    t[id] = { ...old, label: label || old.label, correct: old.correct + (correct ? 1 : 0), total: old.total + 1, lastSeen: now,
      recent: (old.recent + (correct ? '1' : '0')).slice(-5) };
  }
  let s = { ...state, targets: t, quizAnswered: state.quizAnswered + 1, quizCorrect: state.quizCorrect + (correct ? 1 : 0) };
  if (correct) s = gain(s, Xp.CORRECT_ANSWER, today, events);
  return { state: s, events };
}

export function finishQuiz(state, key, scorePct, sections, finalExam, today) {
  const score = Math.max(0, Math.min(100, scorePct));
  const p = lessonOf(state, key);
  const newBest = p.bestScorePct == null || score > p.bestScorePct;
  const ids = [...new Set([...sections, 'tests'])];
  const newlyDone = ids.filter(id => !p.completed.includes(id));
  let s = { ...state, lessons: { ...state.lessons, [key]: { ...p, bestScorePct: Math.max(score, p.bestScorePct || 0), lastScorePct: score,
    attempts: p.attempts + 1, completed: [...new Set([...p.completed, ...ids])], visited: [...new Set([...p.visited, ...ids])] } } };
  const events = [];
  const passed = score >= Xp.PASS_PCT;
  events.push({ type: 'quiz', key, score, stars: starsFor(score), passed, newBest });
  for (const id of newlyDone) { events.push({ type: 'section', key, section: id }); s = gain(s, Xp.SECTION_DONE, today, events); }
  if (passed) s = gain(s, finalExam ? Xp.FINAL_EXAM_PASSED : Xp.QUIZ_PASSED, today, events);
  if (score >= 100) s = gain(s, Xp.QUIZ_PERFECT, today, events);
  return { state: s, events };
}

/** «Lo sé» (known) or «Repasar» on a vocabulary card. */
export function markCard(state, key, entryId, known, today) {
  const p = lessonOf(state, key), events = [];
  const wasKnown = p.known.includes(entryId);
  const next = { ...p, known: known ? [...new Set([...p.known, entryId])] : p.known.filter(x => x !== entryId),
    review: known ? p.review.filter(x => x !== entryId) : [...new Set([...p.review, entryId])] };
  let s = { ...state, lessons: { ...state.lessons, [key]: next } };
  if (known && !wasKnown) s = gain(s, Xp.CARD_KNOWN, today, events);
  return { state: s, events };
}

export function chatTurn(state, today) {
  const events = [];
  return { state: gain({ ...state, chatTurns: state.chatTurns + 1 }, Xp.CHAT_TURN, today, events), events };
}

/** «A repasar»: targets answered at least twice whose recent accuracy is below 70 %, worst first. */
export function weakPoints(state, limit = 8) {
  const acc = t => (t.recent ? [...t.recent].filter(c => c === '1').length / t.recent.length : 1);
  return Object.values(state.targets).filter(t => t.total >= 2 && acc(t) < 0.7)
    .sort((a, b) => (acc(a) - acc(b)) || (b.lastSeen - a.lastSeen)).slice(0, limit).map(t => ({ ...t, accuracy: acc(t) }));
}

/**
 * Status of one topic section from the lesson keys it holds: UNAVAILABLE, NEW, STARTED or DONE (done/total).
 */
export function sectionStatus(state, section, keys) {
  if (!keys.length) return { state: 'UNAVAILABLE', done: 0, total: 0 };
  const done = keys.filter(k => (state.lessons[k] || { completed: [] }).completed.includes(section)).length;
  const visited = keys.some(k => (state.lessons[k] || { visited: [] }).visited.includes(section));
  return { state: done === keys.length ? 'DONE' : done > 0 || visited ? 'STARTED' : 'NEW', done, total: keys.length };
}

// ── synced transcript ──
export class TranscriptIndex {
  constructor(segments) {
    this.lines = segments.filter(s => s.startMs != null && s.text && s.text.trim())
      .sort((a, b) => a.startMs - b.startMs)
      .map((s, i) => ({ index: i, startMs: s.startMs, endMs: Math.max(s.startMs, s.endMs ?? s.startMs), text: s.text.trim(),
        speaker: s.speaker || null, fr: (s.translations && s.translations.fr) || null }));
  }
  /** The line active at positionMs: the last one that has started (−1 before the first). */
  indexAt(positionMs) {
    const L = this.lines;
    if (!L.length || positionMs < L[0].startMs) return -1;
    let lo = 0, hi = L.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (L[mid].startMs <= positionMs) lo = mid; else hi = mid - 1; }
    return lo;
  }
  nextStart(positionMs) { const l = this.lines.find(x => x.startMs > positionMs + 150); return l ? l.startMs : null; }
  previousStart(positionMs) {
    const i = this.indexAt(positionMs);
    if (i < 0) return null;
    const cur = this.lines[i];
    return positionMs - cur.startMs > 1500 || i === 0 ? cur.startMs : this.lines[i - 1].startMs;
  }
}

// ── tap a word: a tiny lexicon from the vocabulary lesson (the app has a full offline dictionary) ──
const variants = w => {
  const out = new Set([w]);
  const m = /^(.*)([oa])$/.exec(w);
  if (m) {
    const stem = m[1];
    for (const end of ['o', 'a', 'os', 'as']) out.add(stem + end);
    const sup = stem.replace(/c$/, 'qu').replace(/g$/, 'gu');
    for (const end of ['ísimo', 'ísima', 'ísimos', 'ísimas']) out.add(sup + end);
  } else if (/e$/.test(w)) out.add(w + 's');
  return [...out];
};

/**
 * Builds { single: Map(fold → entry), phrases: [{ words: [Set(fold)], entry }] } from vocabulary entries. Multi-word
 * expressions drop a leading ser / estar so «estoy de acuerdo» and «hecha polvo» still match.
 */
export function buildLexicon(entries) {
  const single = new Map(), phrases = [];
  for (const e of entries) {
    const words = foldEs(e.term).split(/\s+/).filter(Boolean);
    const core = words.length > 1 && (words[0] === 'estar' || words[0] === 'ser') ? words.slice(1) : words;
    if (core.length === 1) for (const v of variants(core[0])) { if (!single.has(foldEs(v))) single.set(foldEs(v), e); }
    else phrases.push({ words: core.map(w => new Set(variants(w).map(foldEs))), entry: e });
  }
  return { single, phrases };
}

/**
 * Splits Spanish text into parts: { text } for plain runs and { text, entry } for words or expressions found in the
 * lexicon (longest expression first).
 */
export function segmentWords(text, lexicon) {
  const re = /[\p{L}\p{M}]+/gu;
  const toks = [...String(text).matchAll(re)].map(m => ({ word: m[0], fold: foldEs(m[0]), start: m.index, end: m.index + m[0].length }));
  const parts = [];
  let pos = 0, i = 0;
  while (i < toks.length) {
    let hit = null, len = 0;
    for (const p of lexicon.phrases) {
      const n = p.words.length;
      if (n > len && i + n <= toks.length && p.words.every((set, k) => set.has(toks[i + k].fold))) { hit = p.entry; len = n; }
    }
    if (!hit && lexicon.single.has(toks[i].fold)) { hit = lexicon.single.get(toks[i].fold); len = 1; }
    if (hit) {
      const start = toks[i].start, end = toks[i + len - 1].end;
      if (start > pos) parts.push({ text: text.slice(pos, start) });
      parts.push({ text: text.slice(start, end), entry: hit });
      pos = end;
      i += len;
    } else i++;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return parts;
}
