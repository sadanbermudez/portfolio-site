// The five sections of a topic (ListenSection.kt, GrammarSection.kt, VocabSection.kt, SpeakSection.kt, the Tests
// list and the topic exam), with the same order, colours and progress hooks as the app.
import { h, btn, acc, clear, formatMs, Palette, SECTIONS, reducedMotion } from './dom.js';
import { App, TOPIC_ID, FINAL_KEY, reveal } from './core.js';
import {
  frOf, loc, bilingual, spanishText, labelEsFr, sectionTitle, softCard, cardHead, tag, emojiCircle, expandable, accentHeader,
  keyIdeasCard, exampleRow, accentButton, headerPill, speakButton, stars, frenchLine, emptyNote,
} from './components.js';
import { quizRunner } from './quiz.js';
import { setPlace } from './screens-main.js';
import { TranscriptIndex, starsFor, completeSection, answer, finishQuiz, markCard, visit } from '../logic/progress.js';

const today = () => new Date();
const ORDER = ['listen', 'grammar', 'vocab', 'speak'];

function labelsFor(lesson) {
  const g = App.data.lessons.g_verbos_ser_estar_contraste, v = App.data.lessons.v_verbos_ser_estar_adjetivos;
  const map = {};
  for (const r of g.rules) map[r.id] = r.title.es;
  for (const e of v.entries) map[e.id] = e.term;
  return map;
}

export function lessonHeader(lesson, section) {
  const st = SECTIONS[section];
  return accentHeader({ accent: st.color, title: lesson.title.es, emoji: lesson.emoji || st.emoji,
    overline: `${st.emoji} ${st.es}` + (App.fr(st.fr) && st.fr !== st.es ? ' · ' + st.fr : ''), subtitleFr: App.fr(frOf(lesson.title)),
    actions: [headerPill('Tutor', '💬', () => openTutorFor(lesson))] });
}

export function openTutorFor(lesson, prefill) {
  if (lesson && lesson.type === 'speaking') App.emit('chat-lesson', { id: lesson.id, prefill });
  else App.emit('chat-free', { prefill });
  App.tab('tutor', true);
}

const intro = (lesson, accent) => h('div', { class: 'pad stack-12 top-16' }, lesson.summary ? loc(lesson.summary, { cls: 't-bodyLarge' }) : null, keyIdeasCard(lesson.keyIdeas, accent));

function lessonQuiz(lesson, spec, title, titleFr, section, emoji = '✅', { finalExam = false, key = lesson && lesson.id } = {}) {
  const labels = labelsFor(lesson);
  return h('div', { class: 'pad' }, sectionTitle(title, { emoji, fr: titleFr }),
    quizRunner(spec, {
      accent: SECTIONS[section].color, startTitle: title,
      bestScorePct: () => (App.progress.lessons[key] || {}).bestScorePct ?? null,
      onItemGraded: (item, r) => {
        if (r.needsTutor) return;
        let targets = (item.targets || []).map(t => [t, labels[t] || (lesson ? lesson.title.es : 'Examen del tema')]);
        if (!targets.length && lesson && lesson.type === 'listening') targets = [['comprension', 'Comprensión: ' + lesson.title.es]];
        App.update(s => answer(s, key, targets, r.correct, today()));
      },
      onFinished: pct => App.update(s => finishQuiz(s, key, pct, section === 'tests' ? [] : [section], finalExam, today())),
      onAskTutor: text => openTutorFor(null, text),
    }));
}

function nextStep(section) {
  const i = ORDER.indexOf(section);
  if (i < 0) return null;
  for (const k of ORDER.slice(i + 1)) {
    const id = App.sectionKeys(k)[0];
    if (!id) continue;
    const st = SECTIONS[k];
    return h('div', { class: 'pad top-16' }, btn({ class: 'next-card acc', style: acc(st.color), on: { click: () => App.replace('lesson', { id, section: k }) } },
      emojiCircle(st.emoji, 'var(--ch)'),
      h('span', { class: 'grow' }, h('span', { class: 't-labelLarge muted db', text: 'Siguiente' + (App.fr('x') ? ' · Suivant' : '') }), labelEsFr(st.es, st.fr, { tag: 'span' }),
        h('span', { class: 't-bodyMedium db', text: App.data.lessons[id].title.es })),
      h('span', { class: 'arrow read', 'aria-hidden': 'true', text: '→' })));
  }
  return null;
}

App.screens.lesson = ({ id, section }) => {
  const lesson = App.data.lessons[id];
  if (!lesson) return emptyNote('😕', 'Lección no encontrada', 'Leçon introuvable.', true);
  App.update(s => ({ state: visit(s, id, section), events: [] }));
  const st = SECTIONS[section];
  setPlace({ title: lesson.title.es, titleFr: frOf(lesson.title), emoji: lesson.emoji || st.emoji, section, lessonId: id });
  if (section === 'tests') return testsLesson(lesson);
  if (lesson.type === 'listening') return listenScreen(lesson);
  if (lesson.type === 'grammar') return grammarScreen(lesson);
  if (lesson.type === 'vocabulary') return vocabScreen(lesson);
  if (lesson.type === 'speaking') return speakScreen(lesson);
  return emptyNote('😕', 'Tipo de lección no disponible', null, true);
};

// ── 🎧 Escuchar ──
function listenScreen(lesson) {
  const accent = Palette.Listen;
  const index = new TranscriptIndex(App.data.transcript.segments);
  const audio = h('audio', { preload: 'metadata', src: 'data/audio/t14.ogg' });
  App.onCleanup(() => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
  let revealed = (App.progress.lessons[lesson.id] || { completed: [] }).completed.includes('listen');
  let plays = 0, activeLine = -1;
  const lineEls = [];
  const transcriptHost = h('div', { class: 'transcript', 'data-tour': 'transcript' });

  const playBtn = btn({ class: 'play-big acc', style: acc(accent), 'aria-label': 'Reproducir', 'data-play': '' }, '▶︎');
  const seek = h('input', { class: 'seek', name: 'position', type: 'range', min: '0', max: '1000', value: '0', step: '1', 'aria-label': 'Posición del audio' });
  const tNow = h('span', { class: 't-labelMedium', text: '0:00' }), tEnd = h('span', { class: 't-labelMedium', text: formatMs(60000) });
  const speeds = [1, 0.75, 1.25];
  let speedI = 0;
  const speedBtn = btn({ class: 'chip-btn t-labelLarge', 'aria-label': 'Velocidad' }, '🐢 ×1');
  speedBtn.addEventListener('click', () => { speedI = (speedI + 1) % speeds.length; audio.playbackRate = speeds[speedI]; speedBtn.textContent = '🐢 ×' + String(speeds[speedI]).replace('0.', '0,').replace(/\.0+$/, ''); });
  // duration: the file's own, or the track length from the app's audio manifest (some servers do not send it)
  const durMs = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : 59939);
  const seekTo = ms => { audio.currentTime = ms / 1000; update(); };
  const prevBtn = btn({ class: 'icon-btn', 'aria-label': 'Frase anterior' }, '⏮︎');
  const backBtn = btn({ class: 'icon-btn', 'aria-label': 'Atrás 5 segundos' }, '↺5');
  const fwdBtn = btn({ class: 'icon-btn', 'aria-label': 'Adelante 5 segundos' }, '5↻');
  const nextBtn = btn({ class: 'icon-btn', 'aria-label': 'Frase siguiente' }, '⏭︎');
  prevBtn.addEventListener('click', () => { const s = index.previousStart(audio.currentTime * 1000); seekTo(s ?? 0); });
  nextBtn.addEventListener('click', () => { const s = index.nextStart(audio.currentTime * 1000); if (s != null) seekTo(s); });
  backBtn.addEventListener('click', () => seekTo(Math.max(0, audio.currentTime * 1000 - 5000)));
  fwdBtn.addEventListener('click', () => seekTo(Math.min(durMs(), audio.currentTime * 1000 + 5000)));
  playBtn.addEventListener('click', () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
  seek.addEventListener('input', () => { audio.currentTime = seek.value / 1000 * durMs() / 1000; });

  function update() {
    const ms = audio.currentTime * 1000, dur = durMs();
    tNow.textContent = formatMs(ms);
    if (dur) { tEnd.textContent = formatMs(dur); seek.value = String(Math.round(ms / dur * 1000)); }
    seek.setAttribute('aria-valuetext', formatMs(ms));
    const i = index.indexAt(ms);
    if (i !== activeLine) {
      if (lineEls[activeLine]) lineEls[activeLine].classList.remove('active');
      activeLine = i;
      if (lineEls[i]) {
        lineEls[i].classList.add('active');
        if (!audio.paused) reveal(lineEls[i], 80, true);
      }
    }
  }
  audio.addEventListener('timeupdate', update);
  audio.addEventListener('loadedmetadata', update);
  audio.addEventListener('play', () => { playBtn.textContent = '⏸︎'; playBtn.setAttribute('aria-label', 'Pausa'); });
  audio.addEventListener('pause', () => { playBtn.textContent = '▶︎'; playBtn.setAttribute('aria-label', 'Reproducir'); });
  audio.addEventListener('ended', () => {
    plays++;
    App.update(s => completeSection(s, lesson.id, 'listen', today()));
    if (!revealed) { revealed = true; drawTranscript(); }
  });

  function drawTranscript() {
    clear(transcriptHost);
    lineEls.length = 0;
    if (!revealed) {
      transcriptHost.append(softCard(accent, h('span', { class: 'emoji-34', 'aria-hidden': 'true', text: '🙈' }),
        labelEsFr('Primero escucha sin leer', "D'abord, écoute sans lire"),
        h('p', { class: 't-bodyMedium', text: `El texto aparece cuando termines de escuchar (${plays} / 1).` }),
        btn({ class: 'text-btn t-labelLarge read', 'data-show-text': '', on: { click: () => { revealed = true; drawTranscript(); } } }, '👀 Mostrar el texto ya' + (App.fr('x') ? ' · Afficher le texte' : ''))));
      return;
    }
    for (const line of index.lines) {
      const el = h('div', { class: 'tline acc', style: acc(accent) },
        btn({ class: 'tl-time t-labelLarge', 'aria-label': `Ir a ${formatMs(line.startMs)}`, on: { click: () => { seekTo(line.startMs); audio.play().catch(() => {}); } } }, '▶︎ ' + formatMs(line.startMs)),
        h('div', { class: 'grow' }, line.speaker ? h('p', { class: 't-labelLarge bold read', text: line.speaker }) : null, bilingual(line.text, line.fr)));
      lineEls.push(el);
      transcriptHost.append(el);
    }
    transcriptHost.append(h('p', { class: 't-bodySmall muted', text: '▶ = ir a la frase · ▶ = aller à la phrase' }));
    update();
  }
  drawTranscript();

  const player = h('div', { class: 'player acc', style: acc(accent), role: 'group', 'aria-label': 'Reproductor' },
    h('div', { class: 'row' }, tNow, seek, tEnd),
    h('div', { class: 'row center gap' }, prevBtn, backBtn, playBtn, fwdBtn, nextBtn, speedBtn));
  const screen = h('div', { class: 'screen listen' }, audio,
    lessonHeader(lesson, 'listen'), intro(lesson, accent),
    lesson.preListening && lesson.preListening.length ? h('div', { class: 'pad' }, softCard(accent, cardHead('🤔', 'Antes de escuchar', "Avant d'écouter"), lesson.preListening.map(p => loc(p)))) : null,
    h('div', { class: 'pad' }, sectionTitle('Transcripción', { emoji: '📜', fr: 'Transcription' }), transcriptHost),
    lesson.languageFocus && lesson.languageFocus.length ? h('div', { class: 'pad' }, sectionTitle('Fíjate en…', { emoji: '🔍', fr: 'Remarque…' }), lesson.languageFocus.map(e => exampleRow(e, accent))) : null,
    lessonQuiz(lesson, lesson.comprehension, 'Comprensión', 'Compréhension', 'listen', '❓'),
    lesson.discussion && lesson.discussion.length ? h('div', { class: 'pad top-16' }, softCard(accent, cardHead('💬', 'Para comentar', 'Pour en parler'), lesson.discussion.map(d => loc(d)),
      accentButton('💬  Comentarlo con el tutor', accent, () => openTutorFor(null), 'En parler avec le tuteur'))) : null,
    nextStep('listen'), h('div', { class: 'end-space' }), player);
  screen.audio = audio;
  screen.reveal = () => { revealed = true; drawTranscript(); };
  return screen;
}

// ── 📘 Gramática ──
function grammarScreen(lesson) {
  const accent = Palette.Grammar;
  const rules = lesson.rules;
  const track = h('div', { class: 'pager', tabindex: '0', role: 'region', 'aria-roledescription': 'carrusel', 'aria-label': 'Reglas' });
  const cards = rules.map((r, i) => {
    const more = r.explanation || (r.contrastWith || []).length || (r.exceptions || []).length || r.examples.length > 3;
    return h('article', { class: 'rule-card acc', style: acc(accent), 'aria-label': `Regla ${i + 1} de ${rules.length}` },
      h('div', { class: 'row' }, tag(`Regla ${i + 1} de ${rules.length}`, { bg: 'var(--ch)', fg: 'var(--con)' }), h('span', { class: 'grow' }),
        r.difficulty ? h('span', { class: 'dots read', 'aria-label': `Dificultad ${r.difficulty}`, text: '●'.repeat(r.difficulty) }) : null),
      labelEsFr(r.title.es, frOf(r.title), { big: true }),
      r.formula ? h('p', { class: 'formula t-titleMedium bold read', text: r.formula }) : null,
      loc(r.statement),
      h('div', {}, r.examples.slice(0, 3).map(e => exampleRow(e, accent))),
      more ? expandable('💡 Truco y detalles', 'Astuce et détails', () => h('div', { class: 'stack-8' },
        r.explanation ? loc(r.explanation, { cls: 't-bodyMedium' }) : null,
        r.examples.slice(3).map(e => exampleRow(e, accent)),
        (r.contrastWith || []).map(c => h('div', { class: 'contrast' }, h('p', { class: 't-titleSmall bold', text: '≠ ' + c.construction }),
          loc(c.difference, { cls: 't-bodyMedium' }), c.example ? exampleRow(c.example, accent) : null)),
        (r.exceptions || []).map(e => bilingual('⚠️ ' + e.es, frOf(e) ? '⚠️ ' + frOf(e) : null, { cls: 't-bodyMedium' })))) : null);
  });
  track.append(...cards);
  const dots = h('div', { class: 'dots-row', 'aria-hidden': 'true' }, rules.map(() => h('span', { class: 'dot' })));
  const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  const prev = btn({ class: 'text-btn t-titleSmall read' }, '◀ Anterior'), next = btn({ class: 'text-btn t-titleSmall read' }, 'Siguiente ▶');
  let page = 0;
  const setPage = p => {
    page = Math.max(0, Math.min(rules.length - 1, p));
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === page));
    prev.disabled = page === 0; next.disabled = page === rules.length - 1;
    live.textContent = `Regla ${page + 1} de ${rules.length}`;
    hint.hidden = page !== 0;
    if (page === rules.length - 1) App.update(s => completeSection(s, lesson.id, 'grammar', today()));
  };
  const go = p => { const card = cards[Math.max(0, Math.min(rules.length - 1, p))]; track.scrollTo({ left: card.offsetLeft - track.offsetLeft - 16, behavior: reducedMotion() ? 'auto' : 'smooth' }); setPage(p); };
  prev.addEventListener('click', () => go(page - 1));
  next.addEventListener('click', () => go(page + 1));
  track.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); go(page + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(page - 1); } });
  let t = 0;
  track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const w = cards[0].offsetWidth + 12; const p = Math.round(track.scrollLeft / w); if (p !== page) setPage(p); }, 80); });
  const hint = h('p', { class: 't-bodySmall muted center', text: 'Desliza para ver la siguiente regla →' + (App.fr('x') ? ' · Glisse pour la règle suivante' : '') });
  setTimeout(() => setPage(0));

  const tables = h('div', { class: 'hscroll', role: 'region', 'aria-label': 'Tablas de conjugación', tabindex: '0' }, lesson.conjugationTables.map(tb =>
    h('div', { class: 'table-card acc', style: acc(accent) },
      h('div', { class: 'row' }, h('p', { class: 't-titleLarge bold grow', lang: 'es', text: tb.verb }), speakButton(tb.verb, 'var(--read)')),
      h('p', { class: 't-labelLarge muted', text: tb.tense }),
      tb.irregular ? tag('irregular' + (tb.stem ? ' · ' + tb.stem : ''), { bg: 'color-mix(in srgb, #b34700 20%, transparent)' }) : null,
      h('dl', { class: 'conj' }, Object.entries({ yo: 'yo', tu: 'tú', el: 'él / ella / usted', nosotros: 'nosotros', vosotros: 'vosotros', ellos: 'ellos / ustedes' })
        .map(([k, label]) => h('div', { class: 'conj-row' }, h('dt', { class: 't-bodyMedium muted', text: label }), h('dd', { class: 't-bodyLarge semibold read', lang: 'es', text: tb.forms[k] })))),
      tb.note ? h('p', { class: 't-bodySmall it', text: '💡 ' + tb.note }) : null)));

  return h('div', { class: 'screen grammar' },
    lessonHeader(lesson, 'grammar'), intro(lesson, accent),
    h('div', { class: 'pad' }, sectionTitle('Las reglas', { emoji: '📏', fr: 'Les règles', trailing: `${rules.length} tarjetas` })),
    h('div', { 'data-tour': 'rules' }, track, h('div', { class: 'pager-nav row' }, prev, dots, next), hint, live),
    h('div', { class: 'pad' }, sectionTitle('Conjugación', { emoji: '🔁', fr: 'Conjugaison' })), tables,
    h('div', { class: 'pad' }, sectionTitle('Errores típicos', { emoji: '🚧', fr: 'Erreurs fréquentes' }),
      h('div', { class: 'stack-12' }, lesson.commonErrors.map(e => h('div', { class: 'error-card' },
        e.l1Interference ? tag('🇫🇷 Piège pour les francophones', { bg: 'color-mix(in srgb, #1565c0 16%, transparent)' }) : null,
        h('p', { class: 'wrong-line t-bodyLarge' }, h('span', { 'aria-hidden': 'true', text: '❌ ' }), h('s', { lang: 'es', text: e.wrong })),
        h('div', { class: 'right-line row' }, h('span', { 'aria-hidden': 'true', text: '✅ ' }), spanishText(e.right, { cls: 't-bodyLarge semibold grow', tag: 'p' }), speakButton(e.right)),
        loc(e.why, { cls: 't-bodyMedium' }))))),
    h('div', { class: 'pad' }, sectionTitle('Más ejemplos', { emoji: '🗒️', fr: "Plus d'exemples" }),
      expandable(`Ver ${lesson.practiceSentences.length} frases`, 'Voir les phrases', () => h('div', {}, lesson.practiceSentences.map(e => exampleRow(e, accent))))),
    lessonQuiz(lesson, lesson.quiz, 'Practica', 'Entraîne-toi', 'grammar', '✏️'),
    nextStep('grammar'), h('div', { class: 'end-space' }));
}

// ── 🔤 Vocabulario ──
function vocabScreen(lesson) {
  const accent = Palette.Vocab;
  const entries = lesson.entries;
  const body = h('div', {});
  const known = () => (App.progress.lessons[lesson.id] || { known: [] }).known;
  const counter = h('span', { class: 't-labelLarge bold read' });
  const setCount = () => { counter.textContent = `${known().filter(id => entries.some(e => e.id === id)).length} / ${entries.length} ✓`; };
  let listMode = false, deck = entries.map(e => e.id), i = 0, flipped = false, stats = { known: 0, review: 0 };
  const cardsBtn = btn({ class: 'mode-chip acc', style: acc(accent), 'aria-pressed': 'true' }, h('span', { class: 't-labelLarge bold db', text: '🃏 Tarjetas' }), App.fr('Cartes') ? h('span', { class: 't-labelMedium it db', text: 'Cartes' }) : null);
  const listBtn = btn({ class: 'mode-chip acc', style: acc(accent), 'aria-pressed': 'false' }, h('span', { class: 't-labelLarge bold db', text: '📋 Lista' }), App.fr('Liste') ? h('span', { class: 't-labelMedium it db', text: 'Liste' }) : null);
  cardsBtn.addEventListener('click', () => { listMode = false; draw(); });
  listBtn.addEventListener('click', () => { listMode = true; draw(); });
  const article = e => '';
  function draw() {
    cardsBtn.setAttribute('aria-pressed', String(!listMode)); listBtn.setAttribute('aria-pressed', String(listMode));
    setCount();
    clear(body);
    if (listMode) {
      body.append(h('div', { class: 'stack-8' }, entries.map(e => h('div', { class: 'entry-row' },
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('p', { class: 't-titleMedium bold', lang: 'es', text: article(e) + e.term }), h('p', { class: 't-bodyMedium it fr', lang: 'fr', text: frOf(e) || '' })),
          known().includes(e.id) ? h('span', { 'aria-label': 'La sé', text: '✅' }) : null, speakButton(e.term, 'var(--read)')),
        e.definitionEs ? h('p', { class: 't-bodyMedium muted', text: e.definitionEs }) : null))));
      return;
    }
    if (i >= deck.length) {
      body.append(softCard(accent, h('span', { class: 'emoji-44 center', 'aria-hidden': 'true', text: '🎉' }),
        h('p', { class: 't-titleLarge center', text: `¡Has repasado ${deck.length} tarjetas!` }),
        App.fr('x') ? h('p', { class: 't-bodyMedium it center', text: `Tu as revu ${deck.length} cartes !` }) : null,
        h('p', { class: 't-titleSmall center', text: `✓ Lo sé: ${stats.known}   ·   ↺ Repasar: ${stats.review}` }),
        stats.review ? accentButton(`↺ Repasar las difíciles (${stats.review})`, accent, () => { deck = (App.progress.lessons[lesson.id] || { review: [] }).review.slice(); i = 0; stats = { known: 0, review: 0 }; draw(); }) : null,
        btn({ class: 'outline-btn t-titleSmall', on: { click: () => { deck = entries.map(e => e.id); i = 0; stats = { known: 0, review: 0 }; draw(); } } }, 'Empezar de nuevo · Recommencer')));
      App.update(s => completeSection(s, lesson.id, 'vocab', today()));
      return;
    }
    const e = entries.find(x => x.id === deck[i]);
    const ex = (e.contextSentences || [])[0];
    const badges = [];
    if (e.kind === 'idiom') badges.push('💬 expresión'); if (e.kind === 'collocation') badges.push('🔗 combinación');
    if (e.falseFriend) badges.push('⚠️ faux ami'); if (e.register === 'colloquial') badges.push('coloquial');
    const front = h('div', { class: 'face face-front' },
      badges.length ? h('div', { class: 'chips wrap center' }, badges.map(b => tag(b, { bg: b.startsWith('⚠️') ? 'color-mix(in srgb, #c62828 16%, transparent)' : 'color-mix(in srgb, var(--c) 16%, transparent)' }))) : null,
      h('p', { class: 't-headlineMedium center', lang: 'es', text: e.term }),
      ex ? spanishText(ex.es, { cls: 't-bodyLarge muted center', highlights: ex.highlight, tappable: false, tag: 'p' }) : null,
      h('p', { class: 't-bodySmall muted center', text: (known().includes(e.id) ? '✓ Ya la sabías' : '👆 Toca para ver el francés') + (App.fr('x') ? ' · Touche pour voir le français' : '') }));
    const back = h('div', { class: 'face face-back' },
      h('p', { class: 't-titleMedium muted center', lang: 'es', text: e.term }),
      h('p', { class: 't-headlineSmall center fr-ink', lang: 'fr', text: '🇫🇷 ' + (frOf(e) || '—') }),
      e.literalTranslations && e.literalTranslations.fr ? h('p', { class: 't-bodyMedium it center', text: `Mot à mot : « ${e.literalTranslations.fr} »` }) : null,
      e.definitionEs ? h('p', { class: 't-bodyMedium muted center', lang: 'es', text: e.definitionEs }) : null,
      (e.contextSentences || []).slice(1, 2).map(c => h('p', { class: 't-bodyLarge center', lang: 'es', text: c.es })),
      e.falseFriend ? h('p', { class: 't-bodySmall center', text: `⚠️ « ${e.falseFriend.l1Term} » ≠ ${e.term} — ${e.falseFriend.note}` }) : null,
      e.usageNotes ? h('p', { class: 't-bodyMedium center', text: '💡 ' + e.usageNotes.es }) : null);
    const card = btn({ class: 'flip-card acc' + (flipped ? ' flipped' : ''), style: acc(accent), 'aria-pressed': String(flipped), 'aria-label': `Tarjeta ${e.term}: toca para girarla`, 'data-flip': '' },
      h('span', { class: 'flip-inner' }, front, back));
    card.addEventListener('click', () => { flipped = !flipped; card.classList.toggle('flipped', flipped); card.setAttribute('aria-pressed', String(flipped)); });
    const mark = k => { App.update(s => markCard(s, lesson.id, e.id, k, today())); stats[k ? 'known' : 'review']++; flipped = false; i++; draw(); body.querySelector('button')?.focus({ preventScroll: true }); };
    body.append(h('div', { class: 'row' }, h('span', { class: 't-labelLarge bold read', text: `${i + 1} / ${deck.length}` }), h('span', { class: 'grow' }), speakButton(e.term, 'var(--read)')),
      card,
      h('div', { class: 'row gap' },
        btn({ class: 'deck-btn review', on: { click: () => mark(false) } }, h('span', { class: 't-titleMedium db', text: '↺ Repasar' }), App.fr('x') ? h('span', { class: 't-labelMedium it db', text: 'À revoir' }) : null),
        btn({ class: 'deck-btn knowit acc', style: acc(accent), on: { click: () => mark(true) } }, h('span', { class: 't-titleMedium db', text: '✓ Lo sé' }), App.fr('x') ? h('span', { class: 't-labelMedium it db', text: 'Je sais' }) : null)));
  }
  draw();
  return h('div', { class: 'screen vocab' },
    lessonHeader(lesson, 'vocab'), intro(lesson, accent),
    h('div', { class: 'pad row gap top-16', 'data-tour': 'cards' }, cardsBtn, listBtn, h('span', { class: 'grow' }), counter),
    h('div', { class: 'pad top-8' }, body),
    lessonQuiz(lesson, lesson.quiz, 'Test de vocabulario', 'Test de vocabulaire', 'vocab', '🎯'),
    nextStep('vocab'), h('div', { class: 'end-space' }));
}

// ── 🗣️ Hablar con la IA ──
const TRIGGER_COLORS = { target_grammar: Palette.Grammar, target_vocab: Palette.Vocab, discourse_marker: Palette.Listen, argument_move: Palette.Tests, register: Palette.Speak, pronunciation: Palette.Gold };
export function triggerChips(triggers, hit = new Set()) {
  return h('ul', { class: 'chips wrap trigger-chips', 'aria-label': 'Objetivos' }, triggers.map(t => {
    const done = hit.has(t.id);
    return h('li', { class: 'trigger acc' + (done ? ' done' : ''), style: acc(TRIGGER_COLORS[t.category] || Palette.Grammar), 'data-trigger': t.id },
      h('span', { class: 'ring', 'aria-hidden': 'true', text: done ? '✓' : '' }), h('span', { class: 't-labelLarge', text: t.label }),
      h('span', { class: 'sr-only', text: done ? ' (conseguido)' : ' (pendiente)' }));
  }));
}

function speakScreen(lesson) {
  const accent = Palette.Speak, p = lesson.aiPersona, prep = lesson.preparation || {};
  const start = () => openTutorFor(lesson);
  return h('div', { class: 'screen speak' },
    lessonHeader(lesson, 'speak'), intro(lesson, accent),
    h('div', { class: 'pad stack-12 top-16' },
      lesson.scenario ? softCard(accent, cardHead('🎬', 'La situación · Juego de rol', 'La situation · Jeu de rôle'), loc(lesson.scenario)) : null,
      softCard(Palette.Gold, cardHead('🎯', 'Tu misión', 'Ta mission'), loc(lesson.prompt, { cls: 't-titleMedium' })),
      softCard(accent, h('div', { class: 'row' }, emojiCircle('🤖', 'var(--ch)'), h('div', { class: 'grow' }, labelEsFr(`Hablarás con ${p.name}`, `Tu parleras avec ${p.name}`), h('p', { class: 't-bodyMedium muted', text: p.role }))),
        p.openingLine ? h('div', { class: 'row at-top' }, spanishText('«' + p.openingLine + '»', { cls: 't-bodyLarge it grow', tag: 'p' }), speakButton(p.openingLine)) : null),
      prep.usefulLanguage ? softCard(Palette.Vocab, cardHead('🧰', 'Frases útiles', 'Phrases utiles'), prep.usefulLanguage.map((es, i) => h('div', { class: 'row' },
        h('div', { class: 'grow' }, spanishText(es, { cls: 't-bodyLarge semibold', tag: 'p' }), App.fr((prep.usefulLanguageFr || [])[i]) ? frenchLine(prep.usefulLanguageFr[i]) : null),
        speakButton(es.replace(/[….]+$/, ''))))) : null,
      prep.ideasPrompt ? softCard(accent, cardHead('💭', 'Ideas para empezar', 'Des idées pour commencer'), prep.ideasPrompt.map(q => spanishText('• ' + q, { cls: 't-bodyLarge', tag: 'p' }))) : null,
      softCard(accent, cardHead('🏁', 'Intenta usar…', "Essaie d'utiliser…"), triggerChips(lesson.keywordTriggers, App.chatHits ? App.chatHits(lesson.id) : new Set()),
        h('p', { class: 't-bodySmall muted', text: 'El tutor marca ✓ cada objetivo que consigas. · Le tuteur coche ✓ chaque objectif atteint.' })),
      accentButton('🗣️  Empezar la conversación', accent, start, 'Commencer la conversation'),
      expandable('Ver una respuesta modelo', 'Voir un modèle', () => h('div', { class: 'row at-top' }, spanishText(lesson.modelAnswer, { cls: 't-bodyLarge grow', tag: 'p' }), speakButton(lesson.modelAnswer)))),
    nextStep('speak'), h('div', { class: 'end-space' }));
}

// ── ✅ Tests ──
function testsLesson(lesson) {
  const spec = lesson.quiz || lesson.comprehension;
  return h('div', { class: 'screen' }, lessonHeader(lesson, 'tests'),
    spec ? h('div', { class: 'top-8' }, lessonQuiz(lesson, spec, 'Test', 'Test', 'tests', '✅')) : emptyNote('🌱', 'Esta lección no tiene test.', "Cette leçon n'a pas de test."),
    h('div', { class: 'end-space' }));
}

App.screens.testsList = () => {
  const t = App.data.topic, st = SECTIONS.tests;
  const ids = App.sectionKeys('tests').filter(k => k !== FINAL_KEY);
  const exam = t.sections.tests.final;
  const best = (App.progress.lessons[FINAL_KEY] || {}).bestScorePct;
  return h('div', { class: 'screen' },
    accentHeader({ accent: st.color, title: 'Tests', emoji: '✅', overline: `${t.emoji} ${t.title.es}`, subtitleFr: App.fr('Tests') }),
    h('div', { class: 'pad stack-8 top-16' }, ids.map(id => {
      const l = App.data.lessons[id], p = App.progress.lessons[id] || {};
      const typeSt = SECTIONS[{ grammar: 'grammar', vocabulary: 'vocab', listening: 'listen' }[l.type]];
      const n = (l.quiz || l.comprehension).items.length;
      return btn({ class: 'big-row acc', style: acc(typeSt.color), 'data-test': id, on: { click: () => App.go('lesson', { id, section: 'tests' }) } },
        h('span', { class: 'br-emoji', 'aria-hidden': 'true', text: typeSt.emoji }),
        h('span', { class: 'br-text' }, h('span', { class: 't-titleMedium br-title', text: l.title.es }), h('span', { class: 't-bodyMedium muted br-sub', text: `${typeSt.es} · ${n} preguntas` }),
          p.bestScorePct != null ? h('span', { class: 'row t-labelLarge' }, `${p.bestScorePct} %  `, stars(starsFor(p.bestScorePct), 16)) : null),
        h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }));
    })),
    h('div', { class: 'pad top-16' }, btn({ class: 'exam-card acc', style: acc(st.color), 'data-exam': '', on: { click: () => App.go('exam') } },
      h('span', { class: 'emoji-40', 'aria-hidden': 'true', text: '🎓' }),
      h('span', { class: 'grow' }, h('span', { class: 't-titleLarge bold db', text: 'Examen del tema' }), App.fr('x') ? h('span', { class: 't-bodyMedium it db', text: 'Examen du thème' }) : null,
        h('span', { class: 't-bodyMedium db', text: `${exam.items.length} preguntas · aprobado con ${Math.round(exam.passingScore * 100)} %` }),
        best != null ? h('span', { class: 'row t-labelLarge' }, `Mejor: ${best} %  `, stars(starsFor(best), 16)) : null),
      h('span', { class: 'play-disc white', 'aria-hidden': 'true', text: '▶︎' }))),
    h('div', { class: 'end-space' }));
};

App.screens.exam = () => {
  const t = App.data.topic, st = SECTIONS.tests;
  return h('div', { class: 'screen' },
    accentHeader({ accent: st.color, title: 'Examen del tema', emoji: '🎓', overline: `${t.emoji} ${t.title.es}`, subtitleFr: App.fr('Examen du thème') }),
    h('div', { class: 'top-8', 'data-tour': 'exam' }, lessonQuiz(null, t.sections.tests.final, 'Examen del tema', 'Examen du thème', 'tests', '🎓', { finalExam: true, key: FINAL_KEY })),
    h('div', { class: 'end-space' }));
};

