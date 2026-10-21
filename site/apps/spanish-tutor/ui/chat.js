// 💬 Tutor (ChatScreen.kt + ChatViewModel.kt). On the phone the reply comes from Qwen3.5 2B through llama.cpp,
// offline; here it streams from the site's own /api/tutor (Gemma 4 26B on Cloudflare Workers AI), which builds the same
// hidden prompt (site/server/tutor-prompt.js). The correction box, the goal chips and the hidden note are the app's.
import { h, btn, acc, clear, Palette } from './dom.js';
import { App, reveal, toast } from './core.js';
import { frOf, spanishText, labelEsFr, bigRow, speakButton, canSpeak, outlineButton } from './components.js';
import { triggerChips } from './lessons.js';
import { parseTutorReply, withoutEchoes } from '../logic/parser.js';
import { KeywordMatcher, pendingExpressionsNote, withHiddenNote } from '../logic/keywords.js';
import { chatTurn, completeSection } from '../logic/progress.js';

const STARTERS = [
  ['👋', '¡Hola! ¿Charlamos un rato? Pregúntame por mi día.', "Bonjour ! On discute ? Demande-moi comment s'est passée ma journée.", true],
  ['🤔', '¿Me explicas cuándo se dice «ser» y cuándo «estar»?', "Tu m'expliques quand on dit « ser » et quand « estar » ?", true],
  ['✍️', 'Corrige mi texto, por favor: ', 'Corrige mon texte : écris-le après les deux-points', false],
  ['🎯', 'Hazme preguntas para practicar el examen DELE B1.', "Pose-moi des questions pour m'entraîner au DELE B1.", true],
];

let seq = 0;
const C = App.chat = { lessonId: 'free', messages: [], busy: false, abort: null, draft: '', learnerTurns: 0, hits: new Set(), coverage: null, speakDone: false, view: null };

const lesson = () => (C.lessonId === 'free' ? null : App.data.lessons[C.lessonId]);
const matcher = () => { const l = lesson(); return l ? (C.km && C.km.lesson === l ? C.km : (C.km = new KeywordMatcher(l))) : null; };
App.chatHits = id => (C.lessonId === id ? C.hits : new Set());

function reset(lessonId) {
  if (C.abort) C.abort.abort();
  C.lessonId = lessonId; C.messages = []; C.busy = false; C.learnerTurns = 0; C.hits = new Set(); C.coverage = null;
  const l = lesson();
  C.speakDone = !!(l && (App.progress.lessons[l.id] || { completed: [] }).completed.includes('speak'));
  if (l && l.aiPersona && l.aiPersona.openingLine) C.messages.push({ id: ++seq, role: 'assistant', text: '✔\n' + l.aiPersona.openingLine });
}

App.on((type, d) => {
  if (type === 'chat-free') { if (C.lessonId !== 'free') reset('free'); if (d && d.prefill) C.draft = d.prefill; }
  if (type === 'chat-lesson') { if (C.lessonId !== d.id) reset(d.id); if (d.prefill) C.draft = d.prefill; }
});

const goal = () => { const l = lesson(); return l ? Math.max(2, Math.min(4, (l.turnPlan && l.turnPlan.minLearnerTurns) || 4)) : null; };

/** Live goal chips: what she has sent plus what she is typing now. */
function refreshHits(extra = '') {
  const km = matcher();
  if (!km) return;
  const turns = C.messages.filter(m => m.role === 'user' && !m.report).map(m => m.text);
  if (extra.trim()) turns.push(extra);
  const report = km.analyse(turns);
  const before = C.hits;
  C.hits = new Set(report.triggers.filter(r => r.satisfied).map(r => r.trigger.id));
  C.coverage = report.coverage;
  if (C.view) C.view.updateChips(before);
}

async function send(text, { countAsTurn = true, report = false } = {}) {
  text = text.trim();
  if (!text || C.busy) return;
  const km = matcher();
  let note = null;
  const userMsg = { id: ++seq, role: 'user', text, report };
  const history = C.messages.filter(m => !m.error && m.text.trim());
  C.messages.push(userMsg);
  if (km && !report) {
    const r = km.analyse([...history, userMsg].filter(m => m.role === 'user' && !m.report).map(m => m.text));
    C.hits = new Set(r.triggers.filter(x => x.satisfied).map(x => x.trigger.id));
    C.coverage = r.coverage;
    const hint = km.pendingHint(r);
    if (hint) note = pendingExpressionsNote(hint);
  }
  userMsg.hidden = note;
  const bot = { id: ++seq, role: 'assistant', text: '', streaming: true, replyTo: text };
  C.messages.push(bot);
  C.busy = true;
  if (countAsTurn) {
    App.update(s => chatTurn(s, new Date()));
    C.learnerTurns++;
    const l = lesson(), g = goal();
    if (l && g && !C.speakDone && C.learnerTurns >= g) { C.speakDone = true; App.update(s => completeSection(s, l.id, 'speak', new Date())); }
  }
  C.view && C.view.redraw();
  const payload = [...history, userMsg].map(m => ({ role: m.role, content: m.role === 'user' ? withHiddenNote(m.text, m.hidden) : m.text }));
  const ctrl = new AbortController();
  C.abort = ctrl;
  try {
    const res = await fetch('/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload.slice(-6), lesson: C.lessonId === 'free' ? 'free' : C.lessonId }), signal: ctrl.signal });
    if ([404, 405, 501].includes(res.status)) throw Object.assign(new Error('offline'), { offline: true });
    if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const evt = buf.slice(0, cut); buf = buf.slice(cut + 2);
        const type = (evt.match(/^event: (.*)$/m) || [])[1];
        const raw = (evt.match(/^data: (.*)$/m) || [])[1];
        const data = raw ? JSON.parse(raw) : null;
        if (type === 'token' && typeof data === 'string') { bot.text += data; C.view && C.view.updateMessage(bot); }
        else if (type === 'error') throw new Error((data && data.error) || 'Error');
      }
    }
    if (!bot.text.trim()) throw new Error('El tutor no ha contestado. Inténtalo otra vez.');
  } catch (err) {
    if (err.name === 'AbortError') { if (!bot.text.trim()) bot.error = 'Parado. · Arrêté.'; }
    else if (err.offline) { bot.error = 'offline'; }
    else bot.error = err.message || String(err);
  } finally {
    bot.streaming = false;
    C.busy = false;
    C.abort = null;
    C.view && C.view.redraw();
  }
}

function bubble(m, i) {
  const user = m.role === 'user';
  const box = h('div', { class: 'bubble ' + (user ? 'me' : 'bot'), 'data-msg': String(m.id) });
  const row = h('div', { class: 'msg-row ' + (user ? 'me' : 'bot') },
    user ? null : h('span', { class: 'avatar', 'aria-hidden': 'true', text: '🤖' }), box);
  fill(box, m);
  return row;
}

function fill(box, m) {
  clear(box);
  if (m.role === 'user') {
    box.append(h('p', { class: 't-bodyLarge', lang: 'es', text: m.text }));
    return;
  }
  if (m.error === 'offline') {
    box.classList.add('err');
    box.append(h('p', { class: 't-bodyLarge', text: '⚠️ El tutor en línea no está conectado en este servidor.' }),
      App.fr('x') ? h('p', { class: 't-bodyMedium it', lang: 'fr', text: "Le tuteur en ligne n'est pas connecté sur ce serveur." }) : null,
      h('p', { class: 't-bodySmall', lang: 'en', text: 'The live tutor (/api/tutor) is not available on this server. Everything else in the demo works offline in your browser.' }));
    return;
  }
  if (m.error) { box.classList.add('err'); box.append(h('p', { class: 't-bodyLarge', text: m.error })); return; }
  const parsed = withoutEchoes(parseTutorReply(m.text), m.replyTo);
  if (parsed.correction) {
    box.append(h('div', { class: 'correction acc', style: acc(Palette.Wrong), 'data-correction': '' },
      h('p', { class: 't-labelLarge read', text: '✏️ Corrección' }),
      h('div', { class: 'row at-top' }, h('span', { 'aria-hidden': 'true', text: '✅ ' }), spanishText(parsed.correction.corrected, { cls: 't-bodyLarge bold grow', tag: 'p', tappable: !m.streaming })),
      parsed.correction.explanation ? h('p', { class: 't-bodyMedium muted', text: parsed.correction.explanation }) : null,
      ...parsed.more.flatMap(c => [
        h('div', { class: 'row at-top' }, h('span', { 'aria-hidden': 'true', text: '✅ ' }), spanishText(c.corrected, { cls: 't-bodyLarge bold grow', tag: 'p', tappable: !m.streaming })),
        c.explanation ? h('p', { class: 't-bodyMedium muted', text: c.explanation }) : null])));
  }
  if (parsed.reply) box.append(spanishText(parsed.reply, { cls: 't-bodyLarge', tag: 'p', tappable: !m.streaming }));
  if (m.streaming) box.append(h('p', { class: 'typing t-bodySmall muted' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'El tutor está escribiendo…'));
  else if (parsed.reply && canSpeak()) {
    const spoken = (parsed.correction ? 'Se dice: ' + [parsed.correction, ...parsed.more].map(c => c.corrected).join(' ') + ' ' : '') + parsed.reply;
    box.append(h('div', { class: 'row end' }, speakButton(spoken, 'var(--speak-read)')));
  }
}

App.screens.tutor = () => {
  const l = lesson();
  const list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const contextLine = l ? '🗣️ ' + l.title.es : '💬 Charla libre';
  const header = h('header', { class: 'chat-header acc', style: acc(Palette.Speak) },
    h('span', { class: 'emoji-30', 'aria-hidden': 'true', text: '🤖' }),
    h('div', { class: 'grow' }, h('h2', { class: 't-titleLarge', 'data-title': '', text: 'Tutor' }), h('p', { class: 't-bodyMedium', text: contextLine })));
  const model = h('p', { class: 'model-line t-bodySmall muted' }, '🧠 Gemma 4 26B · Cloudflare (demo web). En la app: Qwen3.5 2B en el móvil, sin conexión.');

  const input = h('textarea', { class: 'chat-input t-bodyLarge', name: 'message', rows: '1', lang: 'es', placeholder: 'Escribe en español…', 'aria-label': 'Tu mensaje en español', 'data-chat-input': '' });
  input.value = C.draft;
  const sendBtn = btn({ class: 'send-btn acc', style: acc(Palette.Speak), 'aria-label': 'Enviar', 'data-send': '' }, h('span', { 'aria-hidden': 'true', text: '➤' }));
  const sendLabel = h('span', { class: 't-labelSmall', 'aria-hidden': 'true', text: 'Enviar' });
  // Not yet on the page (first draw): measure on the next frame, or the height collapses to 3px.
  const grow = () => { if (!input.isConnected) { requestAnimationFrame(() => { if (input.isConnected) grow(); }); return; } input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight + 3, 150) + 'px'; input.style.overflowY = input.scrollHeight > 150 ? 'auto' : 'hidden'; };
  const sync = () => {
    C.draft = input.value;
    sendBtn.disabled = !C.busy && !input.value.trim();
    sendBtn.setAttribute('aria-label', C.busy ? 'Parar' : 'Enviar');
    sendBtn.firstChild.textContent = C.busy ? '■' : '➤';
    sendLabel.textContent = C.busy ? 'Parar' : 'Enviar';
    grow();
    refreshHits(input.value);
  };
  const doSend = () => {
    if (C.busy) { if (C.abort) C.abort.abort(); return; }
    const t = input.value;
    if (!t.trim()) return;
    input.value = ''; C.draft = '';
    send(t);
  };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  sendBtn.addEventListener('click', doSend);

  // 🎤 dictation where the browser has it (Chrome, Edge, Safari); hidden elsewhere
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let mic = null;
  if (SR) {
    let rec = null, base = '';
    mic = btn({ class: 'mic-btn', 'aria-label': 'Dictar en español', 'aria-pressed': 'false' }, '🎤');
    mic.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      try {
        rec = new SR();
        rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = false;
        base = input.value ? input.value.replace(/\s*$/, ' ') : '';
        rec.onresult = e => { let t = ''; for (const r of e.results) t += r[0].transcript; input.value = base + t; sync(); };
        rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('El micrófono no está permitido.', "Le micro n'est pas autorisé."); };
        rec.onend = () => { rec = null; mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); };
        rec.start();
        mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true');
      } catch { rec = null; toast('No se pudo usar el micrófono.', "Impossible d'utiliser le micro."); }
    });
    App.onCleanup(() => { if (rec) rec.abort(); });
  }

  let chipsHost = null, turnsLine = null, reportBtn = null;
  function contextCard() {
    const talked = C.messages.some(m => m.role === 'user');
    const card = h('div', { class: 'soft-card acc', style: acc(Palette.Speak), 'data-context': '' });
    if (!l) {
      card.append(labelEsFr('💬 Charla libre', 'Conversation libre', { big: true }),
        h('p', { class: 't-bodyLarge', text: 'Escribe en español: el tutor corrige tus errores (❌ → ✅) y sigue la conversación. Toca cualquier palabra para traducirla.' }),
        App.fr('x') ? h('p', { class: 'fr t-bodyMedium', lang: 'fr', text: 'Écrivez en espagnol : le tuteur corrige vos erreurs et continue. Touchez un mot pour le traduire.' }) : null);
      if (!talked) {
        card.append(labelEsFr('Ideas para empezar (toca una)', 'Idées pour commencer (touchez-en une)'),
          ...STARTERS.map(([emoji, es, fr, direct]) => bigRow({ emoji, title: es.trim(), subtitle: App.fr(fr), accent: Palette.Speak,
            onClick: () => { if (direct) send(es); else { input.value = es; sync(); input.focus(); } } })));
      }
    } else {
      chipsHost = h('div', {}, triggerChips(l.keywordTriggers, C.hits));
      turnsLine = h('p', { class: 't-labelLarge read' });
      reportBtn = outlineButton('📝 Informe final', finalReport);
      card.append(h('p', { class: 't-titleMedium', text: contextLine }),
        h('p', { class: 't-bodyMedium muted', text: `${App.data.topic.emoji} ${App.data.topic.title.es}` }),
        spanishText(l.prompt.es, { cls: 't-bodyLarge', tag: 'p' }),
        labelEsFr('🎯 Intenta usar', 'Essayez d’utiliser'), chipsHost, turnsLine, reportBtn,
        outlineButton('💬 Pasar a charla libre', () => { reset('free'); App.render(); }));
      updateTurns();
    }
    if (talked) card.append(btn({ class: 'text-btn t-labelLarge danger', on: { click: () => { if (window.confirm('¿Empezar de nuevo? Se borrará esta conversación.')) { reset(C.lessonId); App.render(); } } } }, '🗑️ Empezar de nuevo'));
    return card;
  }
  function updateTurns() {
    const g = goal();
    if (turnsLine && g) {
      turnsLine.textContent = C.speakDone ? '✓ Sección «Hablar» completada · Section terminée' : `Mensajes: ${Math.min(C.learnerTurns, g)}/${g} para completar «Hablar»`;
      turnsLine.classList.toggle('ok-ink', C.speakDone);
    }
    if (reportBtn) {
      reportBtn.disabled = C.busy || C.learnerTurns === 0;
      reportBtn.textContent = '📝 Informe final' + (C.coverage != null ? ` · ${Math.round(C.coverage * 100)} %` : '');
    }
  }
  function finalReport() {
    const km = matcher();
    if (!km) return;
    const r = km.analyse(C.messages.filter(m => m.role === 'user' && !m.report).map(m => m.text));
    const summary = `cobertura de objetivos ${Math.trunc(r.coverage * 100)}%; faltan: ` + (r.missed.map(x => x.trigger.label).join(', ') || 'nada') + `; palabras ${r.wordCount}; muletillas ${r.fillerCount}`;
    send('FIN DE LA TAREA. Sal del personaje. Escribe un informe breve en español: 1) dos aciertos concretos citando sus palabras; 2) los errores recurrentes con la forma correcta (máximo 4); ' +
      `3) una expresión nueva de nivel C1 para la próxima vez. Datos objetivos: ${summary}. Sin introducción ni despedida.`, { countAsTurn: false, report: true });
  }

  function redraw() {
    clear(list);
    list.append(contextCard(), ...C.messages.map(bubble));
    sync();
    const last = list.lastElementChild;
    if (last) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
  C.view = {
    redraw,
    updateMessage(m) {
      const b = list.querySelector(`[data-msg="${m.id}"]`);
      if (b) { fill(b, m); list.scrollTop = list.scrollHeight; }
    },
    updateChips(before) {
      if (!chipsHost || !l) return;
      clear(chipsHost).append(triggerChips(l.keywordTriggers, C.hits));
      for (const id of C.hits) if (!before.has(id)) { const el = chipsHost.querySelector(`[data-trigger="${id}"]`); if (el) el.classList.add('pop'); }
      updateTurns();
    },
  };
  App.onCleanup(() => { C.view = null; });
  const screen = h('div', { class: 'screen chat' }, header, model, list,
    h('div', { class: 'input-row' }, input, mic, h('div', { class: 'send-col' }, sendBtn, sendLabel)));
  redraw();
  screen.input = input;
  screen.send = () => doSend();
  return screen;
};
