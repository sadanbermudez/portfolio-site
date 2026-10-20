// The quiz runner (QuizRunner.kt): one question at a time, «Comprobar» graded locally by the ported QuizGrader,
// coloured feedback, explanation, then the result with stars. Open answers can go to the tutor.
import { h, btn, acc, clear, Palette } from './dom.js';
import { App, reveal } from './core.js';
import { frOf, bilingual, loc, spanishText, stars, progressBar, speakButton, outlineButton } from './components.js';
import { grade, blanksOf, AnswerNormalizer } from '../logic/grader.js';
import { starsFor, Xp } from '../logic/progress.js';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffled(list, r) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const hashStr = s => [...s].reduce((x, c) => (Math.imul(31, x) + c.charCodeAt(0)) | 0, 0);

const resultMessage = pct => (pct >= 90 ? ['¡Excelente! Lo dominas.', 'Excellent ! Tu maîtrises.'] : pct >= Xp.PASS_PCT ? ['¡Muy bien! Test superado.', 'Très bien ! Test réussi.']
  : pct >= 50 ? ['¡Bien! Repasa los fallos y vuelve a intentarlo.', 'Bien ! Revois tes erreurs et réessaie.'] : ['¡Ánimo! Cada intento cuenta.', 'Courage ! Chaque essai compte.']);

/**
 * spec: { items, shuffleItems, shuffleOptions, showExplanationOn, passingScore }. opts: accent, startTitle, bestScorePct,
 * onItemGraded(item, result), onFinished(pct), onAskTutor(text).
 */
export function quizRunner(spec, opts = {}) {
  const accent = opts.accent || Palette.Tests;
  const root = h('div', { class: 'quiz acc', style: acc(accent), 'data-quiz': '' });
  let attempt = 0, started = !opts.startTitle, items = [], index = 0, scores = [];
  const prepare = () => {
    const r = rng(attempt * 7919 + spec.items.length);
    items = spec.shuffleItems ? shuffled(spec.items, r) : spec.items;
    index = 0; scores = [];
  };
  const draw = () => {
    clear(root);
    if (!started) {
      const best = typeof opts.bestScorePct === 'function' ? opts.bestScorePct() : opts.bestScorePct;
      root.append(h('div', { class: 'start-card' },
        h('span', { class: 'emoji-40', 'aria-hidden': 'true', text: '✅' }),
        h('p', { class: 't-titleLarge center', text: opts.startTitle }),
        h('p', { class: 't-bodyMedium muted', text: `${items.length} preguntas` + (App.fr('x') ? ` · ${items.length} questions` : '') }),
        best != null ? h('p', { class: 'row t-labelLarge' }, `Tu mejor resultado: ${best} %  `, stars(starsFor(best), 18)) : null,
        btn({ class: 'solid-btn t-titleMedium', 'data-start': '', on: { click: () => { started = true; draw(); focusFirst(); } } }, best == null ? '▶  Empezar' : '▶  Otra vez')));
      return;
    }
    if (index >= items.length) {
      const total = scores.reduce((a, b) => a + b, 0);
      const pct = Math.max(0, Math.min(100, Math.round(total / items.length * 100)));
      if (root.reported !== attempt) { root.reported = attempt; opts.onFinished && opts.onFinished(pct); }
      const [es, fr] = resultMessage(pct);
      const passed = pct >= Math.min(Math.round((spec.passingScore ?? 0.7) * 100), Xp.PASS_PCT);
      root.append(h('div', { class: 'result-card acc', style: acc(passed ? Palette.Success : accent), role: 'status' },
        h('span', { class: 'emoji-52', 'aria-hidden': 'true', text: pct >= 90 ? '🏆' : pct >= Xp.PASS_PCT ? '🎉' : pct >= 50 ? '👍' : '💪' }),
        stars(starsFor(pct), 34),
        h('p', { class: 't-headlineLarge', 'data-result': String(pct), text: `${pct} %` }),
        h('p', { class: 't-labelLarge muted', text: `${Number.isInteger(total) ? total : total.toFixed(1)} / ${items.length}` }),
        h('p', { class: 't-titleMedium center', text: es }), App.fr(fr) ? h('p', { class: 't-bodyMedium it center', text: fr }) : null,
        outlineButton('↺  Repetir' + (App.fr('x') ? ' · Recommencer' : ''), () => { attempt++; prepare(); draw(); focusFirst(); })));
      return;
    }
    const item = items[index];
    root.append(h('div', { class: 'quiz-progress row' }, h('span', { class: 't-labelLarge bold read', text: `${index + 1} / ${items.length}` }),
      progressBar(index / items.length, { color: 'var(--ch)', label: 'Avance del test' })),
    itemCard(item, index + 1, items.length, spec, attempt, accent, opts, score => { scores.push(score); index++; draw(); focusFirst(); }));
  };
  const focusFirst = () => { const f = root.querySelector('[data-qfocus]') || root.querySelector('button, input, textarea'); if (f) f.focus({ preventScroll: true }); reveal(root, 12); };
  prepare();
  draw();
  root.start = () => { if (!started) { started = true; draw(); } };
  return root;
}

function itemCard(item, number, total, spec, seed, accent, opts, onNext) {
  let answer = null, result = null;
  const card = h('div', { class: 'quiz-card', 'data-format': item.format });
  const check = btn({ class: 'solid-btn t-titleMedium wide', disabled: true }, 'Comprobar');
  const setAnswer = a => { answer = a; check.disabled = !a; };
  const inputs = h('div', { class: 'stack-8' });
  const lockers = [];
  card.append(h('div', { 'data-qfocus': '', tabindex: '-1' }, bilingual(item.prompt.es, frOf(item.prompt), { cls: 't-titleMedium', tappable: false })), inputs);

  switch (item.format) {
    case 'multiple_choice': {
      const r = rng(seed + hashStr(item.id));
      const order = spec.shuffleOptions ? shuffled(item.options.map((_, i) => i), r) : item.options.map((_, i) => i);
      const multi = (item.correctIndex || []).length > 1;
      const sel = new Set();
      const group = h('div', { class: 'stack-8', role: multi ? 'group' : 'radiogroup', 'aria-label': 'Opciones' });
      const buttons = order.map(i => {
        const b = btn({ class: 'option', role: multi ? 'checkbox' : 'radio', 'aria-checked': 'false', 'data-i': String(i) },
          h('span', { class: 'opt-mark', 'aria-hidden': 'true', text: '⚪' }), h('span', { class: 't-bodyLarge grow', lang: 'es', text: item.options[i] }));
        b.addEventListener('click', () => {
          if (result) return;
          if (multi) { if (sel.has(i)) sel.delete(i); else sel.add(i); } else { sel.clear(); sel.add(i); }
          for (const x of buttons) { const on = sel.has(Number(x.dataset.i)); x.classList.toggle('sel', on); x.setAttribute('aria-checked', String(on)); x.firstChild.textContent = on ? '🔘' : '⚪'; }
          setAnswer(sel.size ? { selected: [...sel] } : null);
        });
        return b;
      });
      if (multi) inputs.append(h('p', { class: 't-bodySmall muted', text: 'Puede haber varias respuestas · Plusieurs réponses possibles' }));
      group.append(...buttons);
      inputs.append(group);
      lockers.push(() => {
        for (const x of buttons) {
          const i = Number(x.dataset.i), right = item.correctIndex.includes(i), picked = sel.has(i);
          x.disabled = true;
          if (right) { x.classList.add('right'); x.firstChild.textContent = '✅'; } else if (picked) { x.classList.add('wrong'); x.firstChild.textContent = '❌'; }
        }
      });
      break;
    }
    case 'fill_blank': {
      const blanks = blanksOf(item.text);
      const shown = item.text.replace(/\{\{(\d+)(?::([^}]*))?\}\}/g, (m, n, inf) => `____(${n})` + (inf ? ` [${inf}]` : ''));
      inputs.append(h('div', { class: 'sentence-box neutral' }, spanishText(shown, { cls: 't-bodyLarge', tappable: false, tag: 'p' })));
      const fields = blanks.map(b => h('input', { class: 'field', name: 'blank-' + b.n, type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'es',
        'aria-label': `Hueco ${b.n}` + (b.infinitive ? ` (${b.infinitive})` : '') }));
      fields.forEach((f, i) => {
        f.addEventListener('input', () => setAnswer(fields.some(x => x.value.trim()) ? { blanks: fields.map(x => x.value) } : null));
        f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (fields[i + 1]) fields[i + 1].focus(); else if (!check.disabled) check.click(); } });
        inputs.append(h('label', { class: 'field-label' }, h('span', { class: 't-labelLarge', text: blanks[i].infinitive ? `${blanks[i].n} · ${blanks[i].infinitive}` : blanks[i].n }), f));
      });
      lockers.push(() => fields.forEach(f => { f.disabled = true; }));
      break;
    }
    case 'transform':
    case 'error_correction':
    case 'free_response':
    case 'listen_and_type':
    case 'speak_and_check': {
      if (item.format === 'transform') {
        inputs.append(h('div', { class: 'sentence-box acc', style: acc(accent) }, spanishText(item.sourceSentence, { cls: 't-bodyLarge medium', tag: 'p' })));
        if (item.instruction) inputs.append(loc(item.instruction, { cls: 't-bodyMedium', tappable: false }));
      }
      if (item.format === 'error_correction') {
        inputs.append(h('div', { class: 'sentence-box acc', style: acc(Palette.Wrong) }, spanishText(item.sentence, { cls: 't-bodyLarge medium', tag: 'p', tappable: false })),
          h('p', { class: 't-bodySmall muted', text: 'Reescribe la frase corregida · Réécris la phrase corrigée' }));
      }
      if (item.format === 'speak_and_check') {
        inputs.append(h('div', { class: 'sentence-box acc row', style: acc(accent) }, spanishText(item.targetSentence, { cls: 't-bodyLarge grow', tag: 'p' }), speakButton(item.targetSentence)),
          h('p', { class: 't-bodySmall', text: 'Léela en voz alta y luego escríbela de memoria. · Lis-la à voix haute, puis écris-la de mémoire.' }));
      }
      if (item.format === 'listen_and_type') {
        inputs.append(h('div', { class: 'row' }, speakButton(item.transcript), h('p', { class: 't-bodyMedium', text: 'Escucha y escribe. · Écoute et écris.' })));
      }
      const long = item.format === 'free_response' || item.format === 'error_correction';
      const ta = h(long ? 'textarea' : 'input', { class: 'field', name: 'answer', lang: 'es', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Tu respuesta', placeholder: 'Escribe aquí… · Écris ici…',
        ...(long ? { rows: item.format === 'free_response' ? '5' : '3' } : { type: 'text' }) });
      const count = item.format === 'free_response' ? h('p', { class: 't-labelMedium', 'aria-live': 'polite' }) : null;
      const sync = () => {
        setAnswer(ta.value.trim() ? { text: ta.value } : null);
        if (count) count.textContent = `${AnswerNormalizer.wordCount(ta.value)} palabras` + (item.minWords ? ` (mín. ${item.minWords})` : '');
      };
      ta.addEventListener('input', sync);
      if (!long) ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !check.disabled) { e.preventDefault(); check.click(); } });
      if (item.format === 'error_correction') ta.value = item.sentence;
      inputs.append(ta, count);
      sync();
      lockers.push(() => { ta.disabled = true; });
      break;
    }
    case 'matching': {
      const chosen = {};
      const rows = item.left.map((leftText, l) => {
        const chips = item.right.map((rt, r) => {
          const c = btn({ class: 'choice-chip', role: 'radio', 'aria-checked': 'false', lang: 'es' }, rt);
          c.addEventListener('click', () => {
            if (result) return;
            chosen[l] = r;
            for (const [k, x] of chips.entries()) { x.classList.toggle('sel', k === r); x.setAttribute('aria-checked', String(k === r)); }
            setAnswer(Object.keys(chosen).length ? { pairs: { ...chosen } } : null);
          });
          return c;
        });
        lockers.push(() => chips.forEach(c => { c.disabled = true; }));
        return h('div', { class: 'stack-6' }, h('p', { class: 't-bodyLarge semibold', id: `m-${item.id}-${l}`, text: `${l + 1}. ${leftText}` }),
          h('div', { class: 'chips wrap', role: 'radiogroup', 'aria-labelledby': `m-${item.id}-${l}` }, chips));
      });
      inputs.append(...rows);
      break;
    }
    case 'ordering': {
      const pool = shuffled(item.segments.map((_, i) => i), rng(seed + hashStr(item.id)));
      const picked = [];
      const line = h('p', { class: 't-bodyLarge', 'aria-live': 'polite' });
      const box = h('div', { class: 'sentence-box acc', style: acc(accent) }, line);
      const chipsBox = h('div', { class: 'chips wrap' });
      const restart = btn({ class: 'text-btn t-labelLarge', hidden: true }, '↺ Empezar de nuevo');
      const redraw = () => {
        line.textContent = picked.map(i => item.segments[i]).join(' ') || 'Toca los fragmentos en orden… · Touche les morceaux dans l\'ordre…';
        clear(chipsBox);
        for (const i of pool.filter(x => !picked.includes(x))) {
          chipsBox.append(btn({ class: 'choice-chip', lang: 'es', disabled: !!result, on: { click: () => { picked.push(i); setAnswer(picked.length === item.segments.length ? { order: [...picked] } : null); redraw(); } } }, item.segments[i]));
        }
        restart.hidden = !picked.length || !!result;
      };
      restart.addEventListener('click', () => { picked.length = 0; setAnswer(null); redraw(); });
      inputs.append(box, chipsBox, restart);
      redraw();
      lockers.push(() => { restart.hidden = true; for (const c of chipsBox.querySelectorAll('button')) c.disabled = true; });
      break;
    }
    default:
      inputs.append(h('p', { text: 'Formato no disponible en la demo.' }));
  }

  const feedbackHost = h('div', { 'aria-live': 'polite' });
  check.addEventListener('click', () => {
    if (!answer || result) return;
    result = grade(item, answer);
    lockers.forEach(fn => fn());
    check.remove();
    opts.onItemGraded && opts.onItemGraded(item, result);
    const tone = result.needsTutor ? Palette.Gold : result.correct ? Palette.Success : result.score > 0 ? Palette.Tests : Palette.Wrong;
    const [es, fr] = result.needsTutor ? ['📝 Respuesta abierta: comprobación orientativa', 'Réponse libre : vérification indicative']
      : result.correct ? ['✅ ¡Correcto!', 'Bravo !'] : result.score > 0 ? [`🟠 Casi: ${Math.round(result.score * 100)} %`, 'Presque !'] : ['❌ No es correcto', 'Pas tout à fait'];
    const mode = spec.showExplanationOn || 'wrong_only';
    const showExp = item.explanation && (mode === 'always' || (mode === 'wrong_only' && !result.correct));
    const next = btn({ class: 'solid-btn t-titleMedium', 'data-next': '' }, number === total ? 'Ver resultado 🏁' : 'Siguiente  →');
    next.addEventListener('click', () => onNext(result.score));
    const text = answer.text || '';
    feedbackHost.append(h('div', { class: 'feedback acc', style: acc(tone), 'data-correct': String(result.correct) },
      h('p', { class: 't-titleMedium read' }, es, App.fr(fr) ? h('span', { class: 't-bodyMedium it ink', text: '  · ' + fr }) : null),
      result.details.map(d => h('p', { class: 't-bodyMedium', text: d })),
      !result.correct && result.expected ? [h('p', { class: 't-labelLarge', text: result.needsTutor ? 'Modelo · Modèle :' : 'Solución · Solution :' }),
        spanishText(result.expected, { cls: 't-bodyLarge semibold', tag: 'p' })] : null,
      showExp ? bilingual(item.explanation.es, frOf(item.explanation), { cls: 't-bodyMedium', frCls: 't-bodySmall' }) : null),
    h('div', { class: 'row end gap' },
      result.needsTutor && opts.onAskTutor ? btn({ class: 'text-btn t-titleSmall', on: { click: () => opts.onAskTutor(`Corrige mi respuesta a esta tarea: «${item.prompt.es}»\n\n${text}`) } }, '💬 Corregir con el tutor') : null,
      next));
    next.focus({ preventScroll: true });
    reveal(next, 24);
  });
  card.append(check, feedbackHost);
  return card;
}
