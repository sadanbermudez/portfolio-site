// Entry point of the Spanish Tutor web demo: loads the real curriculum files, mounts the phone and the tour.
import { h } from './ui/dom.js';
import { App, mountShell, closeSheet } from './ui/core.js';
import './ui/screens-main.js';
import './ui/lessons.js';
import './ui/search-ui.js';
import './ui/chat.js';
import { mountTour } from './tour.js';
import { buildIndex } from './logic/search.js';
import { buildLexicon } from './logic/progress.js';

const LESSON_IDS = ['l_verbos_ser_estar_dialogo_piso', 'g_verbos_ser_estar_contraste', 'v_verbos_ser_estar_adjetivos', 's_verbos_ser_estar_clara_atocha'];
const FAQ_FILES = ['dudas_basico_comunicacion', 'dudas_basico_nombres', 'dudas_basico_palabras', 'dudas_basico_pasados', 'dudas_basico_verbos',
  'dudas_como_se_dice', 'dudas_dele', 'dudas_discurso', 'dudas_espana_america', 'dudas_falsos_amigos_1', 'dudas_falsos_amigos_2', 'dudas_norma',
  'dudas_parecidas', 'dudas_preposiciones', 'dudas_pronombres', 'dudas_pronunciacion', 'dudas_si_condicional', 'dudas_signos', 'dudas_subjuntivo',
  'dudas_tildes', 'dudas_vida_cotidiana'];

const getJson = async path => { const r = await fetch(path); if (!r.ok) throw new Error(path + ': ' + r.status); return r.json(); };

let faqPromise = null;
App.loadFaqs = () => faqPromise || (faqPromise = Promise.all(FAQ_FILES.map(f => getJson(`data/faq/${f}.json`))).then(docs => {
  docs.sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  App.data.faqs = docs.filter(d => (d.status || 'published') === 'published');
  const lessons = LESSON_IDS.map(id => App.data.lessons[id]).map(l => ({ id: l.id, type: l.type, title: l.title.es, cefr: l.cefr, status: l.status }));
  App.data.index = buildIndex(App.data.faqs, [App.data.topic], lessons);
  App.emit('faqs');
  return App.data.index;
}).catch(err => { faqPromise = null; throw err; }));

async function start() {
  const root = document.getElementById('st-app');
  if (!root) return;
  try {
    const [topic, transcript, ...lessons] = await Promise.all([getJson('data/topics/tp_verbos_ser_estar.json'), getJson('data/transcripts/t14.json'),
      ...LESSON_IDS.map(id => getJson(`data/lessons/${id}.json`))]);
    App.data.topic = topic;
    App.data.transcript = transcript;
    for (const l of lessons) App.data.lessons[l.id] = l;
    App.data.lexicon = buildLexicon(App.data.lessons.v_verbos_ser_estar_adjetivos.entries);
  } catch (err) {
    root.append(h('p', { class: 'load-error', text: 'The demo could not load its lesson files: ' + (err.message || err) }));
    return;
  }
  root.textContent = '';
  mountShell(root);
  App.render();
  root.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
  idle(() => App.loadFaqs().catch(() => {}));
  mountTour(document.getElementById('st-tour'));
  wireOutsideControls();
}

/** The text-size and theme switches beside the phone mirror Ajustes inside it. */
function wireOutsideControls() {
  const box = document.getElementById('st-controls');
  if (!box) return;
  const sync = () => {
    for (const b of box.querySelectorAll('[data-scale]')) b.setAttribute('aria-pressed', String(Number(b.dataset.scale) === Number(App.settings.scale)));
    const d = box.querySelector('[data-dark]');
    if (d) { d.setAttribute('aria-pressed', String(!!App.settings.dark)); d.textContent = App.settings.dark ? '☀️ Light' : '🌙 Dark'; }
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.scale) App.setSetting('scale', Number(b.dataset.scale));
    if (b.hasAttribute('data-dark')) App.setSetting('dark', !App.settings.dark);
  });
  App.on(type => { if (type === 'settings') sync(); });
  sync();
}

start();
