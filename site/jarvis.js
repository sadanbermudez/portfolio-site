/* Talk to Jarvis: text or voice in, streamed answer out, optionally spoken in Kokoro's "Daniel" voice.
   /api/chat streams server-sent events (sources, token, done, error); /api/transcribe takes a recording.
   The orb shows the state: breathing when idle, the microphone level when listening, a turning ring
   while thinking, and the voice's loudness while speaking. */
const $ = (s) => document.querySelector(s);
const log = $('#chat-log'), form = $('#chat-form'), input = $('#chat-input'), micBtn = $('#mic'), voiceBtn = $('#voice'), statusEl = $('#j-status');
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const history = [];
let state = 'idle', busy = false, level = 0, actx = null, analyser = null, levelData = null;

function setState(s, text) { state = s; statusEl.textContent = text; document.body.dataset.jarvis = s; }
function esc(t) { return t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- the orb ----------
const orb = $('#orb'), octx = orb.getContext('2d');
function drawOrb(t) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = orb.clientWidth, h = orb.clientHeight;
  if (orb.width !== Math.round(w * dpr)) { orb.width = Math.round(w * dpr); orb.height = Math.round(h * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, w, h);
  if (analyser && (state === 'listening' || state === 'speaking')) {
    analyser.getByteTimeDomainData(levelData);
    let peak = 0; for (let i = 0; i < levelData.length; i++) peak = Math.max(peak, Math.abs(levelData[i] - 128));
    level += (Math.min(1, peak / 60) - level) * 0.3;
  } else level *= 0.9;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.28, time = reduce ? 0 : t / 1000;
  const hue = state === 'listening' ? [127, 182, 255] : state === 'thinking' ? [255, 174, 74] : state === 'speaking' ? [255, 120, 80] : [255, 174, 74];
  const breathe = 1 + 0.03 * Math.sin(time * 1.6) + level * 0.35;
  const g = octx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.2 * breathe);
  g.addColorStop(0, `rgba(${hue},0.55)`); g.addColorStop(0.35, `rgba(${hue},0.16)`); g.addColorStop(1, `rgba(${hue},0)`);
  octx.fillStyle = g; octx.beginPath(); octx.arc(cx, cy, R * 2.2 * breathe, 0, 7); octx.fill();
  for (let ring = 0; ring < 3; ring++) {                       // wobbling rings, louder voice means bigger waves
    octx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = i / 120 * Math.PI * 2, wob = Math.sin(a * (3 + ring) + time * (1.2 + ring * 0.5)) * (4 + level * 26) + Math.sin(a * 7 - time * 2) * level * 10;
      const r = R * (0.78 + ring * 0.16) * breathe + wob;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i) octx.lineTo(x, y); else octx.moveTo(x, y);
    }
    octx.strokeStyle = `rgba(${hue},${0.75 - ring * 0.2})`; octx.lineWidth = 1.6; octx.stroke();
  }
  if (state === 'thinking') {                                  // a turning arc while the model works
    octx.beginPath(); octx.arc(cx, cy, R * 1.35, time * 3, time * 3 + 1.4); octx.strokeStyle = 'rgba(255,174,74,0.9)'; octx.lineWidth = 3; octx.stroke();
  }
  const core = octx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55 * breathe);
  core.addColorStop(0, 'rgba(255,240,220,0.95)'); core.addColorStop(1, `rgba(${hue},0)`);
  octx.fillStyle = core; octx.beginPath(); octx.arc(cx, cy, R * 0.55 * breathe, 0, 7); octx.fill();
  if (!reduce) requestAnimationFrame(drawOrb);
}
requestAnimationFrame(drawOrb);
if (reduce) setInterval(() => drawOrb(0), 400);

function audio() {
  if (!actx) { actx = new AudioContext(); analyser = actx.createAnalyser(); analyser.fftSize = 512; levelData = new Uint8Array(analyser.fftSize); analyser.connect(actx.destination); }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

// ---------- the voice: Kokoro in a worker, sentences played in order ----------
let voiceOn = false, tts = null, ttsReady = false, nextId = 0, playAt = 0, waiting = new Map(), playing = 0, fallback = false;
const pendingText = [];
let pendingVoice = 0;                                          // sentences sent to the voice worker and not yet playing
function voiceLabel(t) { voiceBtn.textContent = t; }
function startVoice() {
  if (tts || fallback) return;
  try { tts = new Worker('tts-worker.js', { type: 'module' }); } catch (err) { useFallback(); return; }
  voiceLabel('Loading voice…');
  tts.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress' && m.total) voiceLabel('Loading voice ' + Math.round(100 * m.loaded / m.total) + '%');
    else if (m.type === 'ready') { ttsReady = true; voiceLabel('Voice on'); pendingText.splice(0).forEach(say); }
    else if (m.type === 'audio') { const done = waiting.get(m.id); waiting.delete(m.id); if (done) done(m); }
    else if (m.type === 'error') { if (!ttsReady) useFallback(); const done = waiting.get(m.id); waiting.delete(m.id); if (done) done(null); }
  };
  tts.onerror = () => useFallback();
  tts.postMessage({ type: 'load' });
}
function useFallback() {                                       // no module workers or the model failed: the browser's own voice
  fallback = true; ttsReady = true; if (tts) { tts.terminate(); tts = null; }
  voiceLabel('Voice on (browser voice)');
  pendingText.splice(0).forEach(say);
}
let chain = Promise.resolve();
function say(text) {
  text = text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
  if (!text || !voiceOn) return;
  if (!ttsReady) { pendingText.push(text); return; }
  if (fallback) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB';
    const v = speechSynthesis.getVoices().find(x => /en-GB/i.test(x.lang) && /male|daniel|george|arthur/i.test(x.name)) || speechSynthesis.getVoices().find(x => /en-GB/i.test(x.lang));
    if (v) u.voice = v;
    playing++; setState('speaking', 'Speaking'); u.onend = () => { if (--playing === 0 && !busy) setState('idle', 'Ready'); };
    speechSynthesis.speak(u); return;
  }
  const id = nextId++, made = new Promise(res => waiting.set(id, res));
  pendingVoice++; if (!playing) setState('thinking', 'Preparing voice…');
  tts.postMessage({ type: 'speak', id, text });
  chain = chain.then(() => made).then(m => {                  // keep sentences in order even if they finish out of order
    pendingVoice--;
    if (!m || !voiceOn) { if (!playing && !busy && !pendingVoice) setState('idle', 'Ready'); return; }
    const ctx = audio(), buf = ctx.createBuffer(1, m.samples.length, m.rate);
    buf.copyToChannel(m.samples, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(analyser);
    playAt = Math.max(playAt, ctx.currentTime + 0.05); src.start(playAt); playAt += buf.duration;
    playing++; setState('speaking', 'Speaking');
    src.onended = () => { if (--playing === 0 && !busy) setState(pendingVoice ? 'thinking' : 'idle', pendingVoice ? 'Preparing voice…' : 'Ready'); };
  });
}
voiceBtn.addEventListener('click', () => {
  voiceOn = !voiceOn; voiceBtn.setAttribute('aria-pressed', String(voiceOn)); audio();
  if (voiceOn) { if (ttsReady) voiceLabel(fallback ? 'Voice on (browser voice)' : 'Voice on'); else startVoice(); }
  else { voiceLabel('Voice off'); if (fallback && 'speechSynthesis' in window) speechSynthesis.cancel(); if (actx) { actx.close(); actx = null; analyser = null; playAt = 0; } }
});

// ---------- the conversation ----------
function bubble(role, html) {
  const el = document.createElement('div'); el.className = 'j-msg ' + role; el.innerHTML = html;
  log.appendChild(el); log.scrollTop = log.scrollHeight; return el;
}
function render(text, sources) {
  const byN = new Map((sources || []).map(s => [s.n, s]));
  return esc(text).replace(/\[(\d+)\]/g, (m, n) => { const s = byN.get(+n); return s ? `<a class="cite" href="${esc(s.url)}" title="${esc(s.title)}">${n}</a>` : ''; }).replace(/\n/g, '<br>');
}
bubble('bot', 'Good day. I am Jarvis, Dr. Adan Bermudez\'s assistant, or rather the public edition: I know his website and nothing private. Ask me about his work, his research or his chess, by typing or with the microphone.');

async function ask(question) {
  question = question.trim().slice(0, 600);
  if (!question || busy) return;
  busy = true; input.value = ''; setState('thinking', 'Thinking');
  bubble('you', esc(question));
  history.push({ role: 'user', content: question });
  const el = bubble('bot', '<span class="j-dots">…</span>');
  let text = '', sources = [], spoken = 0;
  const speakReady = (final) => {                             // speak each finished sentence as soon as it arrives
    const rest = text.slice(spoken), m = final ? rest : (rest.match(/^[\s\S]*?[.!?](?=\s)/) || [''])[0];
    if (!m || !m.trim()) return;
    const first = spoken === 0 || !text.slice(0, spoken).trim();
    spoken += m.length;
    if (first && m.trim().length > 45) m.split(/(?<=[,;:])\s+/).forEach(part => say(part));   // a long first sentence starts sooner in pieces
    else say(m);
    if (!final) speakReady(false);
  };
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
    if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Jarvis is unavailable just now.'); }
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const evt = buf.slice(0, cut); buf = buf.slice(cut + 2);
        const type = (evt.match(/^event: (.*)$/m) || [])[1], data = JSON.parse((evt.match(/^data: (.*)$/m) || [, 'null'])[1]);
        if (type === 'sources') sources = data;
        else if (type === 'token') { text += data; el.innerHTML = render(text, sources); log.scrollTop = log.scrollHeight; speakReady(false); }
        else if (type === 'error') throw new Error(data.error);
      }
    }
    speakReady(true);                                         // speak the remainder before trimming changes the offsets
    text = text.trim() || 'I am afraid I have no answer to that.';
    const used = sources.filter(s => new RegExp('\\[' + s.n + '\\]').test(text));
    const chips = (list, label) => '<div class="j-src">' + (label ? '<span>' + label + '</span>' : '') + list.map(s => `<a href="${esc(s.url)}">${s.n} · ${esc(s.title)}</a>`).join('') + '</div>';
    el.innerHTML = render(text, sources) + (used.length ? chips(used) : sources.length ? chips(sources.slice(0, 2), 'Pages consulted') : '');
    history.push({ role: 'assistant', content: text });
  } catch (err) {
    el.classList.add('err'); el.textContent = err.message || String(err);
    history.pop();
  } finally {
    busy = false;
    if (playing) setState('speaking', 'Speaking'); else if (pendingVoice || pendingText.length) setState('thinking', 'Preparing voice…'); else setState('idle', 'Ready');
  }
}
form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
$('#suggest').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });

// ---------- the microphone: press to speak, press again to send ----------
let rec = null, chunks = [], stopTimer = 0, micStream = null;
async function startRecording() {
  try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { setState('idle', 'Microphone blocked. You can type instead.'); return; }
  const ctx = audio(), src = ctx.createMediaStreamSource(micStream), tap = ctx.createAnalyser();
  tap.fftSize = 512; src.connect(tap); analyser = tap; levelData = new Uint8Array(512);   // the orb follows the microphone
  chunks = []; rec = new MediaRecorder(micStream);
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = sendRecording;
  rec.start(); micBtn.setAttribute('aria-pressed', 'true'); setState('listening', 'Listening… press again to send');
  stopTimer = setTimeout(stopRecording, 20000);
}
function stopRecording() {
  clearTimeout(stopTimer);
  if (rec && rec.state === 'recording') rec.stop();
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  micBtn.setAttribute('aria-pressed', 'false');
  if (actx) { const out = actx.createAnalyser(); out.fftSize = 512; out.connect(actx.destination); analyser = out; levelData = new Uint8Array(512); }
}
async function sendRecording() {
  const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); rec = null;
  if (blob.size < 2000) { setState('idle', 'I did not catch anything. Try again.'); return; }
  setState('thinking', 'Transcribing');
  try {
    const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Transcription failed.');
    if (!j.text) { setState('idle', 'I did not catch anything. Try again.'); return; }
    ask(j.text);
  } catch (err) { setState('idle', err.message || 'Transcription failed.'); }
}
micBtn.addEventListener('click', () => {
  if (busy) return;
  if (rec && rec.state === 'recording') stopRecording(); else startRecording();
});
if (!navigator.mediaDevices || !window.MediaRecorder) { micBtn.disabled = true; micBtn.title = 'Voice input is not available in this browser'; }
