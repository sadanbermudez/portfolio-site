// Deterministic, offline grading of the nine exercise formats: a port of the app's QuizGrader.kt and
// AnswerNormalizer. Open answers (free_response, speak_and_check, llm_rubric transforms) are only pre-checked here
// and flagged needsTutor, exactly as on the phone. DOM-free.
import { icuRegex } from './regex.js';

// \p{Punct} (ASCII punctuation) plus the Spanish and typographic marks the app adds.
const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~¿¡«»“”‘’…—–]/g;

export const AnswerNormalizer = {
  stripAccents(s) { return s.normalize('NFD').replace(/\p{M}+/gu, ''); },
  normalize(s, caseSensitive = false, accentSensitive = true) {
    let t = String(s).normalize('NFC').replace(/’/g, "'");
    t = t.replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
    if (!caseSensitive) t = t.toLowerCase();
    if (!accentSensitive) t = AnswerNormalizer.stripAccents(t);
    return t;
  },
  /** 1 − Levenshtein / max length, on normalised text (accents count as small errors). */
  similarity(a, b) {
    const x = AnswerNormalizer.normalize(a), y = AnswerNormalizer.normalize(b);
    if (!x && !y) return 1;
    return 1 - AnswerNormalizer.levenshtein(x, y) / Math.max(x.length, y.length);
  },
  levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i), cur = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[b.length];
  },
  wordCount(s) { return AnswerNormalizer.normalize(s).split(' ').filter(w => w.trim()).length; },
};

export const BLANK_REGEX = /\{\{(\d+)(?::([^}]*))?\}\}/g;

export function same(a, b, caseSensitive = false, accentSensitive = true) {
  return AnswerNormalizer.normalize(a, caseSensitive, accentSensitive) === AnswerNormalizer.normalize(b, caseSensitive, accentSensitive);
}

/** The fill-blank sentence with the first accepted answer in every blank. */
export function fillSolution(item) {
  return item.text.replace(BLANK_REGEX, (m, n) => {
    const a = (item.answers || [])[Number(n) - 1];
    return a && a.length ? a[0] : m;
  });
}

/** The blanks of a fill_blank text, in order: [{ n, infinitive }]. */
export function blanksOf(text) {
  return [...text.matchAll(BLANK_REGEX)].map(m => ({ n: m[1], infinitive: m[2] || '' }));
}

const result = (score, correct, expected = null, details = [], needsTutor = false) => ({ score, correct, expected, details, needsTutor });

/**
 * Grades one quiz item. answer shapes: multiple_choice {selected:[i]}, fill_blank {blanks:[s]}, matching {pairs:{left:right}},
 * ordering {order:[i]}, every other format {text}.
 */
export function grade(item, answer = {}) {
  switch (item.format) {
    case 'multiple_choice': {
      const sel = new Set(answer.selected || []), want = new Set(item.correctIndex || []);
      const ok = sel.size === want.size && [...want].every(i => sel.has(i));
      return result(ok ? 1 : 0, ok, (item.correctIndex || []).map(i => item.options[i] ?? '?').join(' / '));
    }
    case 'fill_blank': {
      const given = answer.blanks || [];
      const details = [];
      let right = 0;
      (item.answers || []).forEach((accepted, i) => {
        const g = String(given[i] ?? '').trim();
        const ok = accepted.some(a => same(a, g, !!item.caseSensitive, item.accentSensitive !== false));
        if (ok) right++;
        details.push(ok ? `${i + 1}. ✓ ${g}` : `${i + 1}. ✗ ${g || '—'} → ${accepted.join(' / ')}`);
      });
      const total = Math.max(item.answers.length, 1);
      return result(right / total, right === item.answers.length, fillSolution(item), details);
    }
    case 'transform': {
      const g = answer.text || '', grading = item.grading || 'normalized';
      const ok = grading === 'exact' ? item.acceptedAnswers.some(a => a.trim() === g.trim()) : item.acceptedAnswers.some(a => same(a, g));
      return result(ok ? 1 : 0, ok, item.acceptedAnswers[0], [], !ok && grading === 'llm_rubric');
    }
    case 'error_correction': {
      const g = answer.text || '';
      const expected = (item.errors || []).reduce((s, e) => { const i = s.indexOf(e.wrong); return i < 0 ? s : s.slice(0, i) + e.right + s.slice(i + e.wrong.length); }, item.sentence);
      const ok = same(expected, g) || (!!item.mayBeCorrect && !(item.errors || []).length && same(item.sentence, g));
      return result(ok ? 1 : 0, ok, expected, (item.errors || []).map(e => `${e.wrong} → ${e.right}`));
    }
    case 'matching': {
      const given = answer.pairs || {};
      const correct = (item.pairs || []).filter(p => p.length === 2);
      const right = correct.filter(([l, r]) => Number(given[l]) === r && given[l] !== undefined && given[l] !== null).length;
      const total = Math.max(correct.length, 1);
      return result(right / total, right === correct.length,
        correct.map(([l, r]) => `${item.left[l] ?? '?'} → ${item.right[r] ?? '?'}`).join('; '));
    }
    case 'ordering': {
      const order = answer.order || [];
      const valid = [item.segments.map((_, i) => i), ...(item.alternativeOrders || [])];
      const ok = valid.some(v => v.length === order.length && v.every((x, i) => x === order[i]));
      return result(ok ? 1 : 0, ok, item.segments.join(' '));
    }
    case 'free_response': {
      const g = answer.text || '';
      const words = AnswerNormalizer.wordCount(g);
      const checks = [];
      let passed = 0, total = 0;
      if (item.minWords != null) {
        total++;
        if (words >= item.minWords) passed++;
        checks.push(`Extensión: ${words} palabras (mínimo ${item.minWords})` + (words >= item.minWords ? ' ✓' : ' ✗'));
      }
      if (item.maxWords != null && words > item.maxWords) checks.push(`Demasiado larga: máximo ${item.maxWords} palabras`);
      for (const pattern of item.requiredStructures || []) {
        total++;
        let found = false;
        try { found = icuRegex(pattern, 'i').test(g); } catch { found = false; }
        if (found) passed++;
        checks.push((found ? '✓ ' : '✗ ') + 'estructura objetivo');
      }
      return result(total === 0 ? 0 : passed / total, false, item.modelAnswer ?? null, checks, true);
    }
    case 'listen_and_type': {
      const sim = AnswerNormalizer.similarity(item.transcript, answer.text || '');
      return result(sim, sim >= (item.tolerance ?? 0.9), item.transcript, [`Coincidencia: ${Math.trunc(sim * 100)} %`]);
    }
    case 'speak_and_check': {
      const g = answer.text || '';
      const sim = Math.max(...[item.targetSentence, ...(item.acceptedVariants || [])].map(s => AnswerNormalizer.similarity(s, g)));
      return result(sim, sim >= (item.tolerance ?? 0.85), item.targetSentence, [], true);
    }
    default:
      return result(0, false, null, ['Formato desconocido']);
  }
}

export const FORMATS = ['multiple_choice', 'fill_blank', 'transform', 'error_correction', 'matching', 'ordering',
  'free_response', 'listen_and_type', 'speak_and_check'];
