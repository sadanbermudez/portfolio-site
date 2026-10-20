// The app shell of the web recreation: state, persistence (this browser only), navigation between screens, the
// four tabs, celebration overlays and bottom sheets. Screens register themselves in App.screens.
import { h, btn, clear, reducedMotion, Palette, SECTION_ORDER } from './dom.js';
import { emptyProgress, sectionStatus, streak } from '../logic/progress.js';

const PROGRESS_KEY = 'st-demo-progress-v1';
const SETTINGS_KEY = 'st-demo-settings-v1';
const load = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: progress lives for this visit */ } };

export const TOPIC_ID = 'tp_verbos_ser_estar';
export const FINAL_KEY = TOPIC_ID + '#final';
export const TABS = [
  { id: 'home', emoji: '🏠', es: 'Inicio', fr: 'Accueil' },
  { id: 'search', emoji: '🔎', es: 'Buscar', fr: 'Chercher' },
  { id: 'tutor', emoji: '💬', es: 'Tutor', fr: 'Tuteur' },
  { id: 'progress', emoji: '⭐', es: 'Progreso', fr: 'Progrès' },
];

export const App = {
  data: { topic: null, lessons: {}, transcript: null, faqs: null, index: null, lexicon: null },
  settings: load(SETTINGS_KEY, { scale: 1, dark: false, french: 'tap' }),
  progress: load(PROGRESS_KEY, emptyProgress()),
  nav: { tab: 'home', stacks: { home: [], search: [], tutor: [], progress: [] } },
  screens: {},
  listeners: new Set(),
  root: null, host: null, bar: null, layer: null,
  cleanup: [],

  // ── navigation ──
  current() { const s = this.nav.stacks[this.nav.tab]; return s.length ? s[s.length - 1] : { name: this.nav.tab, root: true }; },
  remember() { const c = this.current(); if (this.host) c.scroll = this.host.scrollTop; },
  go(name, params = {}) { this.remember(); this.nav.stacks[this.nav.tab].push({ name, params }); this.render(); },
  replace(name, params = {}) { const s = this.nav.stacks[this.nav.tab]; s.pop(); s.push({ name, params }); this.render(); },
  back() { this.remember(); this.nav.stacks[this.nav.tab].pop(); this.render(true); },
  tab(id, reset = false) {
    this.remember();
    if (reset || this.nav.tab === id) this.nav.stacks[id] = [];
    this.nav.tab = id;
    this.render(true);
  },
  /** Opens a screen on top of a tab's root (used by the tour). */
  openOn(tabId, stack) { this.remember(); this.nav.tab = tabId; this.nav.stacks[tabId] = stack.map(([name, params]) => ({ name, params: params || {} })); this.render(); },

  render(restore = false) {
    for (const fn of this.cleanup.splice(0)) { try { fn(); } catch { /* ignore */ } }
    const entry = this.current();
    const make = this.screens[entry.name];
    clear(this.host);
    this.host.scrollTop = 0;
    const el = make ? make(entry.params || {}, entry) : h('p', { text: 'Pantalla no encontrada' });
    this.host.append(el);
    this.bar.hidden = !entry.root;
    for (const b of this.bar.querySelectorAll('button')) {
      const on = b.dataset.tab === this.nav.tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    if (restore && entry.scroll) this.host.scrollTop = entry.scroll;
    const title = el.querySelector('[data-title]');
    if (title && document.activeElement && this.root.contains(document.activeElement)) { title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); }
    this.emit('render', entry);
  },
  onCleanup(fn) { this.cleanup.push(fn); },

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(type, detail) { for (const fn of this.listeners) fn(type, detail); },

  // ── settings ──
  setSetting(k, v) {
    this.settings = { ...this.settings, [k]: v };
    save(SETTINGS_KEY, this.settings);
    this.applySettings();
    this.emit('settings', this.settings);
  },
  applySettings() {
    if (!this.root) return;
    this.root.classList.toggle('dark', !!this.settings.dark);
    this.root.style.setProperty('--ts', String(this.settings.scale || 1));
  },
  fr(text) { return this.settings.french === 'never' || !text || !String(text).trim() ? null : text; },

  // ── progress ──
  apply(result) {
    const before = this.topicFraction();
    this.progress = result.state;
    save(PROGRESS_KEY, this.progress);
    celebrate(result.events || []);
    const after = this.topicFraction();
    if (before < 1 && after >= 1) banner({ emoji: '🏅', es: '¡Tema completado!', fr: 'Thème terminé, bravo !', color: Palette.Vocab, big: true });
    this.emit('progress', this.progress);
  },
  update(fn) { this.apply(fn(this.progress)); },
  resetProgress() { this.progress = emptyProgress(); save(PROGRESS_KEY, this.progress); this.emit('progress', this.progress); this.render(); },

  sectionKeys(section) {
    const t = this.data.topic;
    if (!t) return [];
    if (section === 'tests') return [...(t.sections.tests.lessons || []).filter(id => this.data.lessons[id]), FINAL_KEY];
    return (t.sections[section] || []).map(i => i.lesson).filter(id => this.data.lessons[id]);
  },
  topicStatus() { return Object.fromEntries(SECTION_ORDER.map(k => [k, sectionStatus(this.progress, k, this.sectionKeys(k))])); },
  topicFraction() {
    const st = Object.values(this.topicStatus()).filter(s => s.state !== 'UNAVAILABLE');
    return st.length ? st.filter(s => s.state === 'DONE').length / st.length : 0;
  },
  streak() { return streak(this.progress.dayXp, new Date()); },
};

// ── overlays: «+12 XP», the banner, confetti, sheets, toasts ──
let xpTotal = 0, xpTimer = 0, bannerTimer = 0;

function celebrate(events) {
  const xp = events.filter(e => e.type === 'xp').reduce((s, e) => s + e.amount, 0);
  if (xp > 0) {
    const pill = App.layer.querySelector('.xp-pill');
    if (!pill.classList.contains('show')) xpTotal = 0;
    xpTotal += xp;
    pill.textContent = `⭐ +${xpTotal} XP`;
    pill.classList.add('show');
    clearTimeout(xpTimer);
    xpTimer = setTimeout(() => pill.classList.remove('show'), 1800);
  }
  for (const e of events) {
    if (e.type === 'quiz' && e.passed) {
      const perfect = e.score >= 100;
      banner({ emoji: perfect ? '💯' : '🎉', es: (perfect ? '¡Perfecto! ' : '¡Aprobado! ') + `${e.score} %` + (e.newBest ? ' · ¡Nuevo récord!' : ''),
        fr: (perfect ? 'Parfait !' : 'Réussi !') + (e.newBest ? ' Nouveau record !' : ''), stars: e.stars, color: Palette.Tests });
    }
  }
}

export function banner({ emoji, es, fr, stars = 0, color, big = false }) {
  const b = App.layer.querySelector('.banner');
  clear(b);
  b.style.setProperty('--c', color);
  b.append(h('span', { class: 'b-emoji', 'aria-hidden': 'true', text: emoji }),
    h('span', { class: 'b-text' }, h('strong', { text: es }), App.fr(fr) ? h('em', { text: fr }) : null,
      stars ? h('span', { class: 'b-stars', 'aria-label': `${stars} de 3 estrellas`, text: '⭐'.repeat(stars) + '☆'.repeat(3 - stars) }) : null));
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 3500);
  confetti(big ? 150 : 90);
}

const CONFETTI = [Palette.Listen, Palette.Grammar, Palette.Vocab, Palette.Tests, Palette.Speak, Palette.Gold];
export function confetti(count = 90) {
  if (reducedMotion()) return;
  const canvas = App.layer.querySelector('canvas.confetti');
  const box = App.root.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = box.width * dpr; canvas.height = box.height * dpr;
  const ctx = canvas.getContext('2d');
  const parts = Array.from({ length: count }, () => ({
    x: Math.random(), y0: 10 + Math.random() * 160, vx: (Math.random() - 0.5) * 90, vy: 60 + Math.random() * 140,
    sway: 8 + Math.random() * 22, freq: 2 + Math.random() * 4, spin: (Math.random() - 0.5) * 3, size: 6 + Math.random() * 8,
    delay: Math.random() * 0.5, circle: Math.random() < 0.25, color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
  }));
  const start = performance.now();
  const frame = now => {
    const t = (now - start) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    if (t > 2.8 + 0.5) return;
    for (const p of parts) {
      const s = t - p.delay;
      if (s < 0) continue;
      const x = p.x * box.width + p.vx * s + Math.sin(s * p.freq) * p.sway;
      const y = -p.y0 + p.vy * s + 0.5 * 230 * s * s;
      ctx.save(); ctx.translate(x, y); ctx.rotate(s * p.spin * Math.PI * 2);
      ctx.globalAlpha = Math.max(0, Math.min(1, (2.8 - s) / 0.6));
      ctx.fillStyle = p.color;
      if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * Scrolls the phone's screen (never the page) so el is in view. follow: only when el is already near the visible
 * area, so a playing transcript never drags the learner back from the quiz.
 */
export function reveal(el, pad = 16, follow = false) {
  const host = App.host;
  if (!host || !el || !host.contains(el)) return;
  const r = el.getBoundingClientRect(), hr = host.getBoundingClientRect();
  if (follow && (r.top > hr.bottom + hr.height * 0.5 || r.bottom < hr.top - hr.height * 0.5)) return;
  const smooth = reducedMotion() ? 'auto' : 'smooth';
  if (r.top < hr.top + pad) host.scrollBy({ top: r.top - hr.top - pad, behavior: smooth });
  else if (r.bottom > hr.bottom - pad) host.scrollBy({ top: Math.min(r.bottom - hr.bottom + pad, r.top - hr.top - pad), behavior: smooth });
}

let toastTimer = 0;
export function toast(es, fr) {
  const t = App.layer.querySelector('.toast');
  clear(t).append(h('span', { text: es }), App.fr(fr) ? h('em', { text: fr }) : null);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/** A modal bottom sheet inside the phone: title, content, «✕ Cerrar». Esc and the backdrop close it. */
export function sheet(title, content, { label } = {}) {
  closeSheet();
  const opener = document.activeElement;
  const close = btn({ class: 'sheet-close', on: { click: closeSheet } }, '✕ Cerrar');
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', { class: 't-titleLarge', text: title }), close),
    h('div', { class: 'sheet-body' }, content));
  const wrap = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-scrim', on: { click: closeSheet } }), panel);
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); }
    if (e.key === 'Tab') {
      const f = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  wrap.opener = opener;
  App.layer.append(wrap);
  requestAnimationFrame(() => { wrap.classList.add('open'); close.focus({ preventScroll: true }); });
}
export function closeSheet() {
  const w = App.layer && App.layer.querySelector('.sheet-wrap');
  if (!w) return;
  const opener = w.opener;
  w.remove();
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
}

/** Builds the phone: status bar, screen host, bottom bar and the overlay layer. */
export function mountShell(root) {
  App.root = root;
  root.classList.add('st-app');
  const host = h('div', { class: 'screen-host', tabindex: '-1' });
  const bar = h('nav', { class: 'bottombar', 'aria-label': 'Pestañas de la app' },
    TABS.map(t => btn({ class: 'tabbtn', 'data-tab': t.id, on: { click: () => App.tab(t.id) } },
      h('span', { class: 'tab-emoji', 'aria-hidden': 'true', text: t.emoji }), h('span', { class: 'tab-label', text: t.es }))));
  const layer = h('div', { class: 'overlay-layer' },
    h('canvas', { class: 'confetti', 'aria-hidden': 'true' }),
    h('div', { class: 'xp-pill', role: 'status', 'aria-live': 'polite' }),
    h('div', { class: 'banner', role: 'status', 'aria-live': 'polite' }),
    h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }));
  const status = h('div', { class: 'statusbar', 'aria-hidden': 'true' }, h('span', { text: '9:41' }), h('span', { text: '▲ ▮▮▮ 🔋' }));
  root.append(status, host, bar, layer);
  App.host = host; App.bar = bar; App.layer = layer;
  App.applySettings();
}
