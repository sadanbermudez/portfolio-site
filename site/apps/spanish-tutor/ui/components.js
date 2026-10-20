// Shared building blocks, each mirroring a composable of the app (Components.kt, Blocks.kt, Bilingual.kt).
import { h, btn, acc, percent, levelColor, Palette } from './dom.js';
import { App, sheet } from './core.js';
import { segmentWords } from '../logic/progress.js';
import { frOf } from '../logic/search.js';

export { frOf };

// ── speech (🔊): the browser's own Spanish voice ──
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
let speakingBtn = null;
export function speak(text, button) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  if (speakingBtn === button && synth.speaking) { synth.cancel(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#>]/g, ''));
  u.lang = 'es-ES';
  const voices = synth.getVoices();
  const v = voices.find(x => /^es[-_]ES/i.test(x.lang)) || voices.find(x => /^es\b/i.test(x.lang));
  if (v) u.voice = v;
  u.rate = 0.95;
  speakingBtn = button || null;
  if (button) { button.classList.add('on'); u.onend = u.onerror = () => button.classList.remove('on'); }
  synth.speak(u);
}
export function speakButton(text, color) {
  if (!canSpeak()) return null;
  const b = btn({ class: 'icon-btn speak', 'aria-label': 'Escuchar en voz alta', title: 'Escuchar', style: color ? { color } : null }, '🔊');
  b.addEventListener('click', e => { e.stopPropagation(); speak(text, b); });
  return b;
}

// ── tap a word → its French (vocabulary lesson only) ──
export function wordSheet(entry) {
  const ex = (entry.contextSentences || [])[0];
  sheet('La palabra · Le mot', h('div', { class: 'stack' },
    h('div', { class: 'row gap' }, h('p', { class: 't-headlineSmall', text: entry.term }), speakButton(entry.term, null)),
    h('p', { class: 't-titleMedium fr-ink', text: '🇫🇷 ' + (frOf(entry) || '—') }),
    entry.definitionEs ? h('p', { class: 't-bodyLarge', text: entry.definitionEs }) : null,
    ex ? h('p', { class: 't-bodyMedium muted', text: '«' + ex.es + '»' }) : null,
    entry.falseFriend ? h('p', { class: 't-bodyMedium', text: `⚠️ « ${entry.falseFriend.l1Term} » ≠ ${entry.term}: ${entry.falseFriend.note}` }) : null,
    h('p', { class: 't-bodySmall muted', text: 'En la demo solo están las palabras de la lección de vocabulario; la app trae un diccionario completo sin conexión.' })),
  { label: 'Traducción de ' + entry.term });
}

/**
 * Spanish text: highlighted parts (a lesson's «highlight» list) and, inside it, the vocabulary words as buttons that
 * open their French.
 */
export function spanishText(text, { highlights = [], cls = '', tappable = true, tag = 'span', spans = null } = {}) {
  const el = h(tag, { class: ('es ' + cls).trim(), lang: 'es' });
  const marks = [];
  for (const hl of highlights || []) {
    if (!hl) continue;
    let i = text.indexOf(hl);
    while (i >= 0) { marks.push([i, i + hl.length, 'hl']); i = text.indexOf(hl, i + hl.length); }
  }
  if (spans) marks.push(...spans.map(([a, b]) => [a, b, 'b']));
  marks.sort((a, b) => a[0] - b[0]);
  const runs = [];
  let pos = 0;
  for (const [a, b, kind] of marks) { if (a < pos) continue; if (a > pos) runs.push([text.slice(pos, a), null]); runs.push([text.slice(a, b), kind]); pos = b; }
  if (pos < text.length) runs.push([text.slice(pos), null]);
  for (const [run, hl] of runs) {
    const target = hl === 'hl' ? h('mark', { class: 'hl' }) : hl === 'b' ? h('strong', {}) : el;
    const lex = tappable && App.data.lexicon;
    for (const part of lex ? segmentWords(run, App.data.lexicon) : [{ text: run }]) {
      if (part.entry) target.append(btn({ class: 'w', 'aria-label': `${part.text}: ver en francés`, on: { click: e => { e.stopPropagation(); wordSheet(part.entry); } } }, part.text));
      else target.append(part.text);
    }
    if (hl) el.append(target);
  }
  return el;
}

export const frenchLine = (fr, cls = 't-bodyMedium') => h('p', { class: 'fr ' + cls, lang: 'fr', text: fr });

/** Spanish, then the French on tap (🇫🇷), always, or never, per Ajustes. */
export function bilingual(es, fr, { cls = 't-bodyLarge', frCls = 't-bodyMedium', highlights, tappable = true, strong = false } = {}) {
  const french = App.fr(fr);
  const box = h('div', { class: 'bi' + (strong ? ' strong' : '') });
  const line = h('div', { class: 'bi-line' }, spanishText(es, { highlights, cls, tappable, tag: 'p' }));
  box.append(line);
  if (!french) return box;
  const frEl = frenchLine(french, frCls);
  if (App.settings.french === 'always') { box.append(frEl); return box; }
  frEl.hidden = true;
  const t = btn({ class: 'fr-toggle', 'aria-pressed': 'false', 'aria-label': 'Ver en francés', title: 'Ver en francés' }, '🇫🇷');
  t.addEventListener('click', e => {
    e.stopPropagation();
    frEl.hidden = !frEl.hidden;
    t.setAttribute('aria-pressed', String(!frEl.hidden));
    t.setAttribute('aria-label', frEl.hidden ? 'Ver en francés' : 'Ocultar el francés');
  });
  line.append(t);
  box.append(frEl);
  return box;
}
export const loc = (t, opts) => (t ? bilingual(t.es, frOf(t), opts) : null);

export function labelEsFr(es, fr, { big = false, color = null, tag = 'div' } = {}) {
  return h(tag, { class: 'label-esfr' },
    h('span', { class: (big ? 't-titleLarge' : 't-titleMedium') + ' bold', style: color ? { color } : null, text: es }),
    App.fr(fr) ? h('span', { class: 't-labelMedium fr-sub', style: color ? { color } : null, text: fr }) : null);
}

export function sectionTitle(text, { emoji, fr, trailing } = {}) {
  return h('div', { class: 'section-title' },
    emoji ? h('span', { class: 'emoji-26', 'aria-hidden': 'true', text: emoji }) : null,
    h('div', { class: 'grow' }, h('h3', { class: 't-titleMedium', text }), App.fr(fr) ? h('p', { class: 't-bodySmall muted it', text: fr }) : null),
    trailing ? h('span', { class: 't-labelLarge muted', text: trailing }) : null);
}

export const softCard = (accent, ...children) => h('div', { class: 'soft-card acc', style: acc(accent) }, ...children);

export function cardHead(emoji, es, fr) {
  return h('div', { class: 'row' }, h('span', { class: 'emoji-24', 'aria-hidden': 'true', text: emoji }), labelEsFr(es, fr));
}

export function tag(text, { bg, fg, cls = '' } = {}) {
  return h('span', { class: 'st-tag t-labelMedium ' + cls, style: { ...(bg ? { background: bg } : {}), ...(fg ? { color: fg } : {}) }, text });
}
export const levelChip = label => h('span', { class: 'level-chip t-labelLarge', style: { background: levelColor(label) }, text: label });

export function progressBar(fraction, { color = 'var(--read)', track = null, height = 10, label } = {}) {
  const f = Math.max(0, Math.min(1, fraction));
  return h('div', { class: 'pbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(f * 100)),
    'aria-label': label || 'Progreso', style: { height: height + 'px', ...(track ? { background: track } : {}) } },
  h('div', { class: 'pbar-fill', style: { width: (f * 100) + '%', background: color } }));
}
export function progressRow(fraction, opts = {}) {
  return h('div', { class: 'prow' }, opts.label ? h('p', { class: 't-labelLarge', style: opts.textColor ? { color: opts.textColor } : null, text: opts.label }) : null,
    h('div', { class: 'row' }, progressBar(fraction, opts),
      h('span', { class: 't-labelLarge bold prow-pct', style: opts.textColor ? { color: opts.textColor } : null, text: fraction >= 0.999 ? '✓' : percent(fraction) })));
}

export function stars(count, size = 20) {
  return h('span', { class: 'stars', style: { 'font-size': size + 'px' }, role: 'img', 'aria-label': `${count} de 3 estrellas` },
    [0, 1, 2].map(i => h('span', { class: i < count ? 'star on' : 'star', text: i < count ? '⭐' : '☆' })));
}

export const emojiCircle = (emoji, color, size = 52, font = 26) =>
  h('span', { class: 'emoji-circle', 'aria-hidden': 'true', style: { background: color, width: size + 'px', height: size + 'px', 'font-size': font + 'px' }, text: emoji });

/** «▼ Ver más · Voir plus» around content built on first open. */
export function expandable(label, labelFr, build, { open = false } = {}) {
  const body = h('div', { class: 'exp-body' });
  let built = false;
  const b = btn({ class: 'exp-btn t-labelLarge', 'aria-expanded': 'false' });
  const set = o => {
    if (o && !built) { body.append(build()); built = true; }
    body.hidden = !o;
    b.setAttribute('aria-expanded', String(o));
    b.textContent = o ? '▲ Ver menos' + (App.fr('Voir moins') ? ' · Voir moins' : '') : '▼ ' + label + (App.fr(labelFr) ? ' · ' + labelFr : '');
  };
  b.addEventListener('click', () => set(body.hidden));
  set(open);
  return h('div', { class: 'expandable' }, body, b);
}

export function bigRow({ emoji, title, subtitle, level, accent = Palette.Questions, trailing, done, onClick, cls = '' }) {
  return btn({ class: 'big-row acc ' + cls, style: acc(accent), on: { click: onClick } },
    h('span', { class: 'br-emoji', 'aria-hidden': 'true', text: emoji }),
    h('span', { class: 'br-text' }, h('span', { class: 't-titleMedium br-title', text: title }),
      subtitle ? h('span', { class: 't-bodyMedium muted br-sub', text: subtitle }) : null,
      level ? levelChip(level) : null),
    trailing ? h('span', { class: 't-titleMedium ' + (done ? 'ok-ink' : 'muted'), text: trailing }) : null,
    h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }));
}

export function exampleRow(ex, accent, { wrong = false } = {}) {
  return h('div', { class: 'example acc', style: acc(accent || Palette.Questions) },
    h('span', { class: 'ex-mark', 'aria-hidden': 'true', text: wrong ? '❌' : '▸' }),
    h('div', { class: 'grow' }, bilingual(ex.es, frOf(ex), { highlights: ex.highlight }),
      ex.note ? bilingual('💡 ' + ex.note, ex.noteTranslations && ex.noteTranslations.fr ? '💡 ' + ex.noteTranslations.fr : null, { cls: 't-bodyMedium muted', tappable: false }) : null),
    speakButton(ex.es, 'var(--read)'));
}

export function accentButton(text, accent, onClick, fr) {
  return btn({ class: 'accent-btn acc', style: acc(accent), on: { click: onClick } },
    h('span', { class: 't-titleMedium', text }), App.fr(fr) ? h('span', { class: 't-labelMedium it', text: fr }) : null);
}
export function outlineButton(text, onClick, cls = '') {
  return btn({ class: 'outline-btn t-titleSmall ' + cls, on: { click: onClick } }, text);
}

export function emptyNote(emoji, es, fr, isError = false) {
  return h('div', { class: 'empty-note' }, h('span', { class: 'emoji-44', 'aria-hidden': 'true', text: emoji }),
    h('p', { class: 't-bodyLarge' + (isError ? ' err-ink' : ''), text: es }), App.fr(fr) ? h('p', { class: 't-bodyMedium muted it', text: fr }) : null);
}

export function statusPill(status, color) {
  const map = {
    DONE: ['✓', Palette.Success, '#fff'],
    STARTED: [status.total > 1 ? `${status.done}/${status.total}` : 'En curso', 'var(--med)', 'var(--on)'],
    NEW: ['Nuevo', 'var(--ch)', 'var(--con)'],
    UNAVAILABLE: ['—', 'var(--surfVar)', 'var(--on2)'],
  };
  const [text, bg, fg] = map[status.state];
  return h('span', { class: 'status-pill t-labelLarge acc', style: { ...acc(color), background: bg, color: fg }, text });
}

/** Coloured header of a non-tab screen: «‹ Volver», overline, emoji tile, title, subtitles, extra content. */
export function accentHeader({ accent, title, emoji, overline, subtitle, subtitleFr, actions = [], bottom = [], back = true }) {
  return h('header', { class: 'accent-header acc', style: acc(accent) },
    h('div', { class: 'ah-top' },
      back ? volver() : null,
      h('div', { class: 'grow t-labelLarge ah-over', text: overline || '' }),
      ...actions),
    h('div', { class: 'ah-main' },
      emoji ? h('span', { class: 'ah-emoji', 'aria-hidden': 'true', text: emoji }) : null,
      h('div', { class: 'grow' },
        h('h2', { class: 't-headlineSmall', 'data-title': '', text: title }),
        subtitle ? h('p', { class: 't-bodyLarge', text: subtitle }) : null,
        subtitleFr ? h('p', { class: 't-bodyMedium it', lang: 'fr', text: subtitleFr }) : null)),
    bottom.length ? h('div', { class: 'ah-bottom' }, ...bottom) : null);
}
export const volver = () => btn({ class: 'volver', on: { click: () => App.back() } }, h('span', { 'aria-hidden': 'true', text: '‹' }), ' Volver');
export const headerPill = (text, emoji, onClick) => btn({ class: 'header-pill t-titleSmall', on: { click: onClick } }, emoji ? emoji + ' ' : '', text);

export function keyIdeasCard(ideas, accent) {
  if (!ideas || !ideas.length) return null;
  return softCard(accent, cardHead('💡', 'Lo esencial', "L'essentiel"),
    ideas.map((idea, i) => h('div', { class: 'row at-top' }, h('span', { class: 'idea-num', 'aria-hidden': 'true', text: String(i + 1) }),
      h('div', { class: 'grow' }, loc(idea, { cls: 't-bodyLarge medium' })))));
}

export const statChip = (emoji, value, label) =>
  h('span', { class: 'stat-chip' }, h('span', { 'aria-hidden': 'true', text: emoji }), h('strong', { class: 't-titleSmall', text: ' ' + value }), label ? h('span', { class: 't-labelMedium muted', text: ' ' + label }) : null);
