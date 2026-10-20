// Buscar, the FAQ answer card and the FAQ lists (SearchScreen.kt, FaqScreen.kt, FaqDocScreen.kt). Results are live:
// every keystroke runs the ported BM25 search over the 223 FAQ answers, the topic and its lessons.
import { h, btn, acc, clear, Palette, SECTIONS } from './dom.js';
import { App, TOPIC_ID } from './core.js';
import {
  frOf, loc, bilingual, spanishText, labelEsFr, sectionTitle, bigRow, exampleRow, accentHeader, levelChip, emptyNote, accentButton, outlineButton,
} from './components.js';
import { openTutorFor } from './lessons.js';
import { CATEGORY_LABELS } from '../logic/search.js';

const QUICK = ['¿Ser o estar?', '¿Por o para?', '¿Cuándo lleva tilde?', '¿Subjuntivo?', 'Falsos amigos', 'DELE B1'];
const COLORS = { Answer: Palette.Questions, Topic: Palette.Listen, Lesson: Palette.Grammar };
const CATEGORY_STYLE = { grammar: ['🧩', Palette.Grammar], spelling: ['✍️', Palette.Tests], pronunciation: ['🗣️', Palette.Speak], vocabulary: ['🔤', Palette.Vocab],
  false_friends: ['🎭', Palette.Questions], usage: ['💬', Palette.Listen], culture: ['🌎', Palette.Dictionary], exam: ['🎓', '#7a4f00'] };
const COMPARE_COLORS = [Palette.Listen, Palette.Tests, Palette.Vocab, Palette.Grammar];
const LESSON_SECTION = { listening: 'listen', grammar: 'grammar', vocabulary: 'vocab', speaking: 'speak' };

App.searchQuery = '';

function openHit(hit) {
  if (hit.kind === 'ANSWER') App.go('faq', { id: hit.id });
  else if (hit.kind === 'TOPIC') App.openOn('home', [['topic']]);
  else { const l = App.data.lessons[hit.id]; if (l) App.openOn('home', [['topic'], ['lesson', { id: l.id, section: LESSON_SECTION[l.type] }]]); }
}

const groupTitle = (emoji, es, fr, color) => h('div', { class: 'group-title acc', style: acc(color) },
  h('span', { class: 'emoji-24', 'aria-hidden': 'true', text: emoji }), labelEsFr(es, fr, { color: 'var(--read)' }));

App.screens.search = () => {
  const input = h('input', { class: 'search-input', name: 'q', type: 'search', lang: 'es', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
    placeholder: '¿Qué quieres saber?', 'aria-label': 'Buscar: ¿qué quieres saber?', 'data-search': '', value: App.searchQuery });
  const clearBtn = btn({ class: 'icon-btn clear', 'aria-label': 'Borrar', hidden: !App.searchQuery }, '✕');
  const results = h('div', { class: 'results', 'aria-live': 'polite', 'aria-busy': 'false' });
  const header = h('header', { class: 'search-header acc', style: acc(Palette.Questions) },
    h('div', { class: 'row' }, h('span', { class: 'emoji-28', 'aria-hidden': 'true', text: '🔎' }),
      h('div', { class: 'grow' }, h('h2', { class: 't-headlineSmall', 'data-title': '', text: 'Buscar' }),
        App.fr('x') ? h('p', { class: 't-bodyMedium it', text: 'Chercher : questions, thèmes, mots' }) : null)),
    h('div', { class: 'search-field' }, h('span', { 'aria-hidden': 'true', class: 'mag', text: '⌕' }), input, clearBtn),
    h('p', { class: 't-bodySmall', text: 'Escribe en español o en francés.' + (App.fr('x') ? ' · Écris en espagnol ou en français.' : '') }));

  let timer = 0;
  const run = () => {
    const q = input.value;
    App.searchQuery = q;
    clearBtn.hidden = !q;
    clear(results);
    if (!q.trim()) return drawEmpty();
    if (!App.data.index) { results.append(h('p', { class: 'pad t-bodyMedium muted', text: 'Buscando… · Je cherche…' })); App.loadFaqs().then(run); return; }
    const r = App.data.index.search(q);
    App.lastResults = r;
    if (r.answers.length) results.append(groupTitle('💡', 'Respuestas', 'Réponses', COLORS.Answer), h('div', { class: 'stack-8 pad' }, r.answers.map(x => hitRow(x, '💡', COLORS.Answer))));
    if (r.topics.length) results.append(groupTitle('📘', 'Temas', 'Thèmes', COLORS.Topic), h('div', { class: 'stack-8 pad' }, r.topics.map(x => hitRow(x, '📘', COLORS.Topic))));
    if (r.lessons.length) results.append(groupTitle('📄', 'Lecciones', 'Leçons', COLORS.Lesson), h('div', { class: 'stack-8 pad' }, r.lessons.map(x => hitRow(x, '📄', COLORS.Lesson))));
    if (r.isEmpty) {
      results.append(h('div', { class: 'pad' }, emptyNote('🤔', `No he encontrado nada para «${q}».`, `Je n'ai rien trouvé pour « ${q} ».`),
        h('p', { class: 't-bodyLarge center', text: 'Prueba con otras palabras, o pregúntaselo al tutor:' }),
        accentButton('💬 Preguntar al tutor', Palette.Speak, () => openTutorFor(null, q), 'Demander au tuteur')));
    } else {
      results.append(h('div', { class: 'pad top-16 stack-8' }, h('p', { class: 't-bodyMedium muted center', text: '¿No es lo que buscabas?' + (App.fr('x') ? ' · Ce n’est pas ce que tu cherchais ?' : '') }),
        outlineButton('💬 Preguntar al tutor', () => openTutorFor(null, q))));
    }
  };
  const hitRow = (hit, fallback, color) => bigRow({ emoji: hit.emoji || fallback, title: hit.title,
    subtitle: App.fr('x') ? hit.subtitle : hit.kind === 'LESSON' ? (hit.subtitle || '').split(' · ')[0] : null,
    level: hit.cefr, accent: color, onClick: () => openHit(hit), cls: 'hit' });
  function drawEmpty() {
    results.append(groupTitle('💬', 'Preguntas frecuentes', 'Questions fréquentes', COLORS.Answer),
      h('div', { class: 'chips wrap pad' }, QUICK.map(q => btn({ class: 'query-chip t-titleSmall acc', style: acc(COLORS.Answer), on: { click: () => { input.value = q; run(); input.focus({ preventScroll: true }); } } }, q))));
    const docs = App.data.faqs;
    if (!docs) { results.append(h('p', { class: 'pad t-bodyMedium muted', text: 'Cargando las preguntas… · Chargement…' })); App.loadFaqs().then(() => { if (!input.value.trim() && results.isConnected) { clear(results); drawEmpty(); } }); return; }
    results.append(groupTitle('❓', 'Todas las preguntas', 'Toutes les questions', COLORS.Answer),
      h('div', { class: 'stack-8 pad' }, docs.map(d => bigRow({ emoji: d.emoji, title: d.title.es,
        subtitle: `${d.entries.length} preguntas` + (App.fr(frOf(d.title)) ? ' · ' + frOf(d.title) : ''), accent: COLORS.Answer, onClick: () => App.go('faqDoc', { id: d.id }) }))));
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 15); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); run(); } });
  clearBtn.addEventListener('click', () => { input.value = ''; run(); input.focus(); });
  run();
  const screen = h('div', { class: 'screen search' }, header, results, h('div', { class: 'end-space' }));
  screen.setQuery = q => { input.value = q; run(); };
  screen.input = input;
  return screen;
};

function findEntry(id) {
  for (const d of App.data.faqs || []) for (const e of d.entries) if (e.id === id) return [d, e];
  return [null, null];
}

App.screens.faq = ({ id }) => {
  const [doc, e] = findEntry(id);
  if (!e) return h('div', { class: 'screen' }, accentHeader({ accent: Palette.Questions, title: 'Respuesta', emoji: '💡' }),
    emptyNote('🤷', 'Esta respuesta ya no está en la app.', "Cette réponse n'est plus dans l'application."));
  const [catEmoji, color] = CATEGORY_STYLE[e.category || 'grammar'];
  const [catEs, catFr] = CATEGORY_LABELS[e.category || 'grammar'];
  const seeAlso = (e.seeAlso || []).map(sid => {
    if (sid === TOPIC_ID) return bigRow({ emoji: '📘', title: App.data.topic.title.es, subtitle: 'Tema · ' + (frOf(App.data.topic.title) || ''), level: App.data.topic.cefr, accent: Palette.Listen, onClick: () => App.openOn('home', [['topic']]) });
    if (App.data.lessons[sid]) { const l = App.data.lessons[sid]; return bigRow({ emoji: '📄', title: l.title.es, subtitle: 'Lección', accent: Palette.Grammar, onClick: () => openHit({ kind: 'LESSON', id: sid }) }); }
    const [, other] = findEntry(sid);
    if (other) return bigRow({ emoji: other.emoji || '💡', title: other.question.es, subtitle: 'Respuesta' + (App.fr(frOf(other.question)) ? ' · ' + frOf(other.question) : ''), level: other.cefr, accent: Palette.Questions, onClick: () => App.go('faq', { id: sid }) });
    return null;
  }).filter(Boolean);
  return h('div', { class: 'screen faq', 'data-faq': id },
    accentHeader({ accent: color, title: e.question.es, emoji: e.emoji || doc.emoji, overline: `${catEmoji} ${catEs}` + (App.fr(catFr) && catFr !== catEs ? ' · ' + catFr : ''),
      subtitleFr: App.fr(frOf(e.question)), bottom: e.cefr ? [h('span', { class: 'level-ring' }, levelChip(e.cefr))] : [] }),
    h('div', { class: 'pad top-16' }, h('div', { class: 'answer-card acc', style: acc(color) },
      h('p', { class: 't-labelLarge read' }, h('span', { 'aria-hidden': 'true', text: '💡 ' }), 'La respuesta' + (App.fr('x') ? ' · La réponse' : '')),
      spanishText(e.answer.es, { cls: 't-answer', tag: 'p' }),
      App.fr(frOf(e.answer)) ? h('p', { class: 't-bodyLarge it muted', lang: 'fr', text: frOf(e.answer) }) : null)),
    (e.compare || []).length ? h('div', { class: 'pad top-16 compare', 'data-compare': '' }, e.compare.map((side, i) => compareCard(side, COMPARE_COLORS[i % 4]))) : null,
    (e.points || []).length ? h('div', { class: 'pad' }, sectionTitle('Lo importante', { emoji: '📌', fr: "L'essentiel" }),
      h('div', { class: 'white-card acc', style: acc(color) }, e.points.map(p => h('div', { class: 'row at-top' }, h('span', { class: 'bullet read', 'aria-hidden': 'true', text: '•' }), h('div', { class: 'grow' }, loc(p)))))) : null,
    (e.examples || []).length ? h('div', { class: 'pad' }, sectionTitle('Ejemplos', { emoji: '🗣️', fr: 'Exemples' }),
      h('div', { class: 'white-card' }, e.examples.map(x => exampleRow(x, color)))) : null,
    e.trick ? h('div', { class: 'pad top-16' }, noteCard('💡', 'Truco', 'Astuce', e.trick, Palette.Gold)) : null,
    e.frenchTrap ? h('div', { class: 'pad top-16', 'data-trap': '' }, noteCard('🇫🇷', 'Cuidado, francófonos', 'Attention, francophones', e.frenchTrap, Palette.Listen)) : null,
    seeAlso.length ? h('div', { class: 'pad' }, sectionTitle('Ver también', { emoji: '👉', fr: 'Voir aussi' }), h('div', { class: 'stack-8' }, seeAlso)) : null,
    (e.sources || []).length ? h('div', { class: 'pad' }, sectionTitle('Fuentes', { emoji: '📚', fr: 'Sources' }),
      h('ul', { class: 'sources t-bodyMedium' }, e.sources.map(s => h('li', {}, s.url && /^https:\/\//.test(s.url) ? h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.label }) : s.label)))) : null,
    h('div', { class: 'pad top-16 stack-8' },
      bigRow({ emoji: doc.emoji, title: 'Más preguntas: ' + doc.title.es, subtitle: App.fr(frOf(doc.title)) ? 'Autres questions : ' + frOf(doc.title) : null, accent: Palette.Questions, onClick: () => App.go('faqDoc', { id: doc.id }) }),
      outlineButton('💬 Preguntar al tutor' + (App.fr('x') ? ' · Demander au tuteur' : ''), () => openTutorFor(null, 'Explícame con otros ejemplos: ' + e.question.es))),
    h('div', { class: 'end-space' }));
};

function compareCard(side, color) {
  const items = side.items || [];
  const card = h('div', { class: 'compare-card acc', style: acc(color) },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('p', { class: 't-titleLarge read', text: side.title.es }),
      App.fr(frOf(side.title)) && frOf(side.title) !== side.title.es ? h('p', { class: 't-bodyMedium it muted', text: frOf(side.title) }) : null)));
  const lines = items.map(it => {
    const i = it.es.indexOf(': ');
    const bold = i > 0 && i <= 40 ? [[0, i + 1]] : null;
    const fr = frOf(it) && App.fr(frOf(it)) ? h('p', { class: 'fr t-bodyMedium', lang: 'fr', hidden: App.settings.french !== 'always', text: frOf(it) }) : null;
    return [h('div', { class: 'row at-top' }, h('span', { class: 'bullet read', 'aria-hidden': 'true', text: '•' }),
      h('div', { class: 'grow' }, spanishText(it.es, { cls: 't-bodyLarge', tag: 'p', spans: bold }), fr)), fr];
  });
  const frs = lines.map(l => l[1]).filter(Boolean);
  if (frs.length && App.settings.french === 'tap') {
    const t = btn({ class: 'fr-toggle', 'aria-pressed': 'false', 'aria-label': 'Ver en francés' }, '🇫🇷');
    t.addEventListener('click', () => { const show = frs[0].hidden; frs.forEach(f => { f.hidden = !show; }); t.setAttribute('aria-pressed', String(show)); });
    card.firstChild.append(t);
  }
  card.append(...lines.map(l => l[0]));
  return card;
}

function noteCard(emoji, es, fr, text, color) {
  return h('div', { class: 'note-card acc', style: acc(color) }, h('div', { class: 'row' }, h('span', { class: 'emoji-24', 'aria-hidden': 'true', text: emoji }), labelEsFr(es, fr, { color: 'var(--read)' })), loc(text));
}

App.screens.faqDoc = ({ id }) => {
  const d = (App.data.faqs || []).find(x => x.id === id);
  if (!d) return emptyNote('🤷', 'No encontrado', null, true);
  return h('div', { class: 'screen' },
    accentHeader({ accent: Palette.Questions, title: d.title.es, emoji: d.emoji, overline: '❓ Preguntas y dudas', subtitleFr: App.fr(frOf(d.title)) }),
    h('div', { class: 'pad stack-8 top-16' }, d.entries.map(e => bigRow({ emoji: e.emoji || d.emoji, title: e.question.es,
      subtitle: App.fr(frOf(e.question)), level: e.cefr, accent: Palette.Questions, onClick: () => App.go('faq', { id: e.id }) }))),
    h('div', { class: 'end-space' }));
};
