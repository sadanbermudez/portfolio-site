// DOM and colour helpers for the web recreation. Colours follow the app's Palette.kt: soft tints and borders come
// from color-mix in app.css; the contrast-driven shades (headerSafe, readable) are computed here like the app does.

/** h('div', { class, style, on: { click }, ...attributes }, ...children) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'text') el.textContent = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/** A real <button type="button">. */
export const btn = (attrs, ...children) => h('button', { type: 'button', ...attrs }, ...children);

export function formatMs(ms) {
  const s = Math.floor((Math.max(0, ms) + 500) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export const percent = f => `${Math.round(Math.max(0, Math.min(1, f)) * 100)} %`;

// ── colour ──
const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = hex => { const [r, g, b] = hexToRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const lerp = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)); };
function shiftUntil(c, target, against, min) {
  if (contrast(c, against) >= min) return c;
  let t = 0, out = c;
  while (contrast(out, against) < min && t < 1) { t += 0.04; out = lerp(c, target, Math.min(t, 1)); }
  return out;
}
export const INK = '#1a1a1a';
export const headerSafe = c => shiftUntil(c, '#000000', '#ffffff', 4.5);
export const onColor = c => (contrast(c, '#ffffff') >= contrast(c, INK) ? '#ffffff' : INK);
export const readableLight = c => shiftUntil(c, '#000000', '#ffffff', 6.2);
export const readableDark = c => shiftUntil(c, '#ffffff', '#121212', 6.2);

/** CSS variables for an accent colour; pair with class "acc" (app.css derives --soft, --med and --read). */
export function acc(hex) {
  const head = headerSafe(hex);
  return { '--c': hex, '--ch': head, '--con': onColor(head), '--cr': readableLight(hex), '--crd': readableDark(hex) };
}

export const Palette = {
  Listen: '#1565c0', Grammar: '#6a1b9a', Vocab: '#2e7d32', Tests: '#b34700', Speak: '#c2185b',
  Gold: '#ffb300', Flame: '#bf360c', Success: '#2e7d32', Wrong: '#c62828',
  Questions: '#a8173f', Dictionary: '#00695c', Settings: '#455a64', Progress: '#3949ab',
  TopicAccents: ['#c62828', '#1565c0', '#5e35b1', '#00695c', '#ad1457', '#3949ab', '#bf360c', '#2e7d32', '#8e24aa', '#00727d', '#c2185b', '#5d4037'],
};

export const SECTIONS = {
  listen: { emoji: '🎧', es: 'Escuchar', fr: 'Écouter', color: Palette.Listen },
  grammar: { emoji: '📘', es: 'Gramática', fr: 'Grammaire', color: Palette.Grammar },
  vocab: { emoji: '🔤', es: 'Vocabulario', fr: 'Vocabulaire', color: Palette.Vocab },
  tests: { emoji: '✅', es: 'Tests', fr: 'Tests', color: Palette.Tests },
  speak: { emoji: '🗣️', es: 'Hablar con la IA', fr: "Parler avec l'IA", color: Palette.Speak },
};
export const SECTION_ORDER = ['listen', 'grammar', 'vocab', 'tests', 'speak'];

/** Java's String.hashCode, so a topic keeps the accent the phone gives it. */
export function javaHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
export const topicAccent = id => Palette.TopicAccents[((javaHash(id) % 12) + 12) % 12];

export function levelColor(label) {
  if (label.startsWith('A1')) return '#2e7d32';
  if (label.startsWith('A2')) return '#00695c';
  if (label.startsWith('B1')) return '#1565c0';
  if (label.startsWith('B2')) return '#6a1b9a';
  if (label.startsWith('C')) return '#a8173f';
  return Palette.Settings;
}

export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
