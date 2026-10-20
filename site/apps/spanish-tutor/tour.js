// The guided tour beside the phone: each step drives the app to a real screen. The steps' text lives in
// index.html; this file wires their «Show me» buttons.
import { App, closeSheet, reveal } from './ui/core.js';
import { reducedMotion } from './ui/dom.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const screenEl = () => App.host.firstElementChild;
const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

function glow(selector) {
  const el = App.host.querySelector(selector);
  if (!el) return;
  reveal(el, 12);
  el.classList.remove('tour-glow');
  void el.offsetWidth;
  el.classList.add('tour-glow');
  setTimeout(() => el.classList.remove('tour-glow'), 2600);
}

async function type(input, text) {
  if (reducedMotion()) { input.value = text; input.dispatchEvent(new Event('input')); return; }
  input.value = '';
  for (const ch of text) { input.value += ch; input.dispatchEvent(new Event('input')); await wait(28); }
}

const STEPS = {
  async topic() {
    App.openOn('home', [['topic']]);
    await frame();
    glow('[data-tour="sections"]');
  },
  async listen() {
    App.openOn('home', [['topic'], ['lesson', { id: 'l_verbos_ser_estar_dialogo_piso', section: 'listen' }]]);
    const s = screenEl();
    s.reveal();
    s.audio.play().catch(() => {});
    await frame();
    glow('[data-tour="transcript"]');
  },
  async grammar() {
    App.openOn('home', [['topic'], ['lesson', { id: 'g_verbos_ser_estar_contraste', section: 'grammar' }]]);
    await frame();
    glow('[data-tour="rules"]');
  },
  async exam() {
    App.openOn('home', [['topic'], ['testsList'], ['exam']]);
    await frame();
    const start = App.host.querySelector('[data-start]');
    if (start) start.click();
    glow('[data-tour="exam"]');
  },
  async search() {
    App.openOn('search', []);
    await App.loadFaqs();
    const s = screenEl();
    await type(s.input, 'différence entre ser et estar');
    await wait(reducedMotion() ? 0 : 900);
    App.go('faq', { id: 'd_ser_estar' });
    await frame();
    glow('[data-compare]');
  },
  async tutor() {
    App.emit('chat-lesson', { id: 's_verbos_ser_estar_clara_atocha', prefill: 'Clara es alta y muy simpática, pero hoy está cansada. La cena es en casa de Marta.' });
    App.openOn('tutor', []);
    await frame();
    glow('[data-context]');
  },
  async progress() {
    App.openOn('progress', []);
    await frame();
    App.settingsSheet();
  },
};

export function mountTour(root) {
  if (!root) return;
  const items = [...root.querySelectorAll('[data-step]')];
  const live = root.querySelector('[data-tour-live]');
  let current = -1;
  const select = async i => {
    current = i;
    items.forEach((li, k) => { li.classList.toggle('active', k === i); if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    const li = items[i];
    closeSheet();
    const phone = document.getElementById('st-phone');
    // Bring the phone into view whenever it is not fully on screen (narrow screens, or a desktop window too short to pin it).
    const r = phone && phone.getBoundingClientRect();
    if (r && (r.top < 64 || r.bottom > window.innerHeight)) phone.scrollIntoView({ block: r.height < window.innerHeight - 80 ? 'center' : 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    try { await STEPS[li.dataset.step](); } catch (err) { console.warn('tour step failed', err); }
    if (live) live.textContent = `Step ${i + 1} of ${items.length}: ${li.querySelector('h3').textContent}. The phone now shows it.`;
    const counter = root.querySelector('[data-tour-count]');
    if (counter) counter.textContent = `${i + 1} / ${items.length}`;
  };
  items.forEach((li, i) => li.querySelector('[data-run]').addEventListener('click', () => select(i)));
  const prev = root.querySelector('[data-tour-prev]'), next = root.querySelector('[data-tour-next]');
  if (prev) prev.addEventListener('click', () => select(Math.max(0, current - 1)));
  if (next) next.addEventListener('click', () => select(Math.min(items.length - 1, current + 1)));
  root.hidden = false;
}
