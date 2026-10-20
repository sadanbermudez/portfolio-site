/* DOM helpers for the demo: elements, inline SVG, icons, chips and small charts. */
import { fmt, pct, priceDigits, VERDICT_LABEL, REGIME_LABEL } from './engine.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

const PATHS = {
  market: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  wallet: 'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  school: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  grid: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  cross: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  play: 'M8 5v14l11-7z',
  next: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  prev: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  flask: 'M7 2v2h1v6.17L3.5 18.5A2 2 0 0 0 5.2 21.5h13.6a2 2 0 0 0 1.7-3L16 10.17V4h1V2H7zm3 2h4v6.7l1.6 2.8H8.4l1.6-2.8V4z',
  replay: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',
  pulse: 'M3 13h4l3-8 4 14 3-6h4v-2h-5.2L14 15.3 10.1 1.7 6.2 11H3z',
  calendar: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11zM7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z',
  block: 'M6 6h4v12H6zm8 0h4v12h-4z',
  dash: 'M5 11h14v2H5z',
};
export function icon(name, size = 24, label = null) {
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': label ? null : 'true', role: label ? 'img' : null, 'aria-label': label, focusable: 'false' },
    svg('path', { d: PATHS[name], fill: 'currentColor' }));
}

export const VERDICT_CLASS = { APPROVED: 'v-ok', WATCH: 'v-watch', REJECTED: 'v-bad' };
export function verdictChip(v, big = false) {
  return h('span', { class: `a-chip ${VERDICT_CLASS[v]}${big ? ' big' : ''}` }, VERDICT_LABEL[v]);
}
export const REGIME_CLASS = { CONFIRMED: 'v-ok', PRESSURE: 'v-watch', RALLY_ATTEMPT: 'v-watch', CORRECTION: 'v-bad' };
export function regimeChip(state) { return h('span', { class: `a-chip ${REGIME_CLASS[state]}` }, REGIME_LABEL[state]); }

export const px = (x) => fmt(x, priceDigits(x));
export const signed = (x, digits = 1) => (x >= 0 ? '+' : '−') + fmt(Math.abs(x) * 100, digits) + ' %';
export const rText = (r) => (r >= 0 ? '+' : '−') + fmt(Math.abs(r), 1) + ' R';
export const money = (x, digits = 2) => fmt(x, digits) + ' €';
export const signedMoney = (x) => (x >= 0 ? '+' : '−') + fmt(Math.abs(x), 0) + ' €';
export { pct };

/** A small flag drawn with CSS gradients (emoji flags do not render everywhere). */
export function flag(code) { return h('span', { class: `a-flag f-${code}`, 'aria-hidden': 'true' }); }
export const MARKET_FLAG = { US: 'us', SPAIN: 'es', GERMANY: 'de', FRANCE: 'fr' };

/** Sparkline of the last [n] closes, with the pivot as a dashed line when it is in range. */
export function sparkline(bars, pivot, n = 60, w = 92, hgt = 40) {
  const s = bars.slice(-n).map((b) => b.close);
  let lo = Math.min(...s), hi = Math.max(...s);
  if (pivot != null && pivot <= hi * 1.08 && pivot >= lo * 0.92) { lo = Math.min(lo, pivot); hi = Math.max(hi, pivot); }
  const y = (v) => (hi === lo ? hgt / 2 : 2 + (hgt - 4) * (1 - (v - lo) / (hi - lo)));
  const pts = s.map((v, i) => `${(i * (w / (s.length - 1))).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = s[s.length - 1] >= s[0];
  return svg('svg', { class: 'a-spark', viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, 'aria-hidden': 'true' },
    pivot != null && pivot <= hi && pivot >= lo ? svg('line', { x1: 0, x2: w, y1: y(pivot), y2: y(pivot), stroke: '#3DD68C', 'stroke-width': 1, 'stroke-dasharray': '3 3' }) : null,
    svg('polyline', { points: pts, fill: 'none', stroke: up ? '#26A69A' : '#EF5350', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
}

/** A card with a title, as the app's Section. */
export function section(title, ...kids) {
  return h('section', { class: 'a-card' }, title ? h('h3', { class: 'a-card-title' }, title) : null, ...kids);
}
export const note = (text) => h('p', { class: 'a-note' }, text);

export function topBar(title, subtitle, actions = [], back = null) {
  return h('header', { class: 'a-top' },
    back ? h('button', { class: 'a-icon-btn', type: 'button', 'aria-label': 'Volver', onclick: back }, icon('back')) : null,
    h('div', { class: 'a-top-title' }, h('h2', null, title), subtitle ? h('p', null, subtitle) : null),
    h('div', { class: 'a-top-actions' }, actions));
}

export function disclaimer() {
  return h('div', { class: 'a-disclaimer' }, icon('info', 20),
    h('p', null, 'Herramienta educativa. No es asesoramiento financiero: decide y asume tú el riesgo.'),
    h('span', { class: 'a-sim' }, 'Datos simulados'));
}

/** A score bar row of the "Puntuación por bloques" card. */
export function scoreBar(label, value, max) {
  const share = max ? Math.max(0, Math.min(1, value / max)) : 0;
  return h('div', { class: 'a-score-row' },
    h('div', { class: 'a-score-head' }, h('span', null, label), h('b', null, `${Math.round(value)} / ${max}`)),
    h('div', { class: 'a-score-track', role: 'img', 'aria-label': `${label}: ${Math.round(value)} de ${max}` },
      h('span', { class: 'a-score-fill', style: `width:${(share * 100).toFixed(1)}%` })));
}
