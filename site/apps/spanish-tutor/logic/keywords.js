// Deterministic matching of a speaking lesson's keyword triggers and grammar targets against what the learner
// wrote: a port of the app's KeywordMatcher.kt. Runs before (and independently of) the language model, so the
// goal chips are reproducible and instant. DOM-free.
import { icuRegex, escapeRegex } from './regex.js';

/** Lower-case, accents stripped (á → a) but ñ kept, punctuation except . ? ! removed, spaces collapsed. */
export function normalise(s) {
  const keep = String(s).replace(/[ñÑ]/g, '\u0001');
  const stripped = keep.normalize('NFD').replace(/\p{Mn}+/gu, '').replace(/\u0001/g, 'ñ').toLowerCase();
  return stripped.replace(/[^a-z0-9ñ.?! ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const countMatches = (rx, text) => [...text.matchAll(rx)].map(m => m[0]);

export class KeywordMatcher {
  constructor(lesson) {
    this.lesson = lesson;
    this.triggerRegexes = new Map((lesson.keywordTriggers || []).map(t => [t.id, t.patterns.map(p => icuRegex(p, 'gi'))]));
    this.targetRegexes = (lesson.grammarTargets || []).map(t => [t, icuRegex(t.pattern, 'gi')]);
  }

  /** Analyse the learner's turns so far: which triggers are satisfied, coverage, fillers, word count. */
  analyse(learnerTurns) {
    const text = normalise(learnerTurns.join(' . '));
    const triggers = (this.lesson.keywordTriggers || []).map(t => {
      const found = this.triggerRegexes.get(t.id).flatMap(rx => countMatches(rx, text));
      const occurrences = found.length;
      const satisfied = occurrences >= (t.minOccurrences ?? 1);
      const overused = t.maxOccurrences != null && occurrences > t.maxOccurrences;
      return { trigger: t, occurrences, matches: found, satisfied, overused };
    });
    const targets = this.targetRegexes.map(([t, rx]) => {
      const occurrences = countMatches(rx, text).length;
      return { target: t, occurrences, satisfied: occurrences >= (t.requiredCount ?? 1) };
    });
    const fillers = ((this.lesson.scoring && this.lesson.scoring.fillerWords) || []).map(normalise);
    const words = text.split(' ').filter(w => w.trim());
    const fillerCount = words.filter(w => fillers.includes(w)).length +
      fillers.filter(f => f.includes(' ')).reduce((n, f) => n + countMatches(icuRegex('\\b' + escapeRegex(f) + '\\b', 'g'), text).length, 0);
    const total = triggers.reduce((s, r) => s + (r.trigger.weight ?? 0.5), 0);
    const coverage = total === 0 ? 0 : triggers.reduce((s, r) => s + (!r.satisfied ? 0 : r.overused ? (r.trigger.weight ?? 0.5) * 0.5 : (r.trigger.weight ?? 0.5)), 0) / total;
    return { triggers, targets, fillerCount, wordCount: words.length, coverage, missed: triggers.filter(r => !r.satisfied) };
  }

  /** One-line nudge for the tutor: what the learner still has not produced (the two heaviest misses). */
  pendingHint(report, max = 2) {
    const pending = [...report.missed]
      .sort((a, b) => (b.trigger.weight ?? 0.5) - (a.trigger.weight ?? 0.5))
      .slice(0, max)
      .map(r => (r.trigger.feedbackOnMiss && r.trigger.feedbackOnMiss.es) || r.trigger.label)
      .filter(Boolean);
    return pending.length ? pending.join(' ') : null;
  }
}

/** The hidden note the app attaches to a learner message when target expressions are still missing. */
export const NOTE_PREFIX = '[Nota para el tutor:';
export function pendingExpressionsNote(hint) {
  return `aún no ha usado: ${hint} Llévala con tus preguntas a que lo produzca, sin decirle la forma.`;
}
/** What the model receives for a learner message: the text, plus the hidden note (she never sees it). */
export function withHiddenNote(text, note) {
  return note && note.trim() ? `${text}\n\n${NOTE_PREFIX} ${note}]` : text;
}
