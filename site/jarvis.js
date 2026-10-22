/* Talk to Jarvis: text or voice in, streamed answer out, optionally spoken aloud ("the voice" below).
   /api/chat streams server-sent events (sources, token, done, error); /api/transcribe takes a recording.
   The orb shows the state: breathing when idle, the microphone level when listening, a turning ring
   while thinking, and the voice's loudness while speaking. */
import { chunker, planVoice, pickVoice, anyVoice } from './jarvis-voice-core.js';
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
  if (analyser && !synthTalking && (state === 'listening' || state === 'speaking')) {
    analyser.getByteTimeDomainData(levelData);
    let peak = 0; for (let i = 0; i < levelData.length; i++) peak = Math.max(peak, Math.abs(levelData[i] - 128));
    level += (Math.min(1, peak / 60) - level) * 0.3;
  } else if (synthTalking) level += (0.3 + 0.2 * Math.sin(t / 90) - level) * 0.2;   // a device voice gives no signal to measure
  else level *= 0.9;
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

// ---------- the voice ----------
// Three voices, best first, chosen per answer (decision 11):
//   daniel   Kokoro's "Daniel" in a Web Worker, only on computers that run it faster than real time (planVoice)
//   device   the device's own British male voice (Apple's Daniel on iPhones and Macs), instant and offline
//   server   MeloTTS on Workers AI through /api/speak, about a second a sentence, on any device
// Each piece of an answer has a time limit; if its voice misses it, the next voice in line speaks that piece, and
// any English voice on the device is the last resort. The status line always says what the voice is doing.
const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const saveData = !!(navigator.connection && navigator.connection.saveData);
const plan = planVoice({ isolated: self.crossOriginIsolated, cores: navigator.hardwareConcurrency, coarse, memory: navigator.deviceMemory,
  saveData, mobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) });
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const LIMIT = { daniel: 8000, server: 10000 };                   // ms to make one piece before the next voice takes over
const FAST = 0.8;                                                // Daniel only if a sentence takes under 0.8x its own length to make
let voiceOn = false, round = 0, browserMale = null, browserAny = null, note = '';
let kokoro = null, kokoroReady = false, kokoroSlow = false, kokoroId = 0;
const kokoroJobs = new Map();
let queue = Promise.resolve(), making = Promise.resolve(), pending = 0, speaking = 0, synthTalking = false, current = null, answerVoice = null;

function voiceLabel(t) { voiceBtn.textContent = t; }
function loadVoices() { if (!synth) return; const list = synth.getVoices(); browserMale = pickVoice(list); browserAny = anyVoice(list); }
if (synth) { loadVoices(); synth.addEventListener('voiceschanged', loadVoices); }
function settle() {                                              // one place decides the orb and the status line
  if (speaking) setState('speaking', 'Speaking');
  else if (busy) setState('thinking', 'Thinking');
  else if (pending) setState('thinking', 'Preparing voice…');
  else { setState('idle', note || 'Ready'); note = ''; }
}
function describe() {
  if (!voiceOn) return 'Voice off';
  if (kokoroReady && !kokoroSlow) return 'Voice on · Daniel';
  const quick = 'Voice on · ' + (browserMale ? 'device voice' : 'quick voice');
  return plan === 'daniel' && !kokoroSlow ? quick + ' · Daniel loading' : quick;
}

function startKokoro() {                                         // strong computers only: download and warm up in the background
  if (kokoro || kokoroSlow || plan !== 'daniel') return;
  try { kokoro = new Worker('tts-worker.js', { type: 'module' }); } catch { kokoroSlow = true; return; }
  kokoro.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress' && m.total) { if (voiceOn && !kokoroReady) voiceLabel(describe() + ' ' + Math.round(100 * m.loaded / m.total) + '%'); }
    else if (m.type === 'ready') {                               // time one sentence before trusting it with an answer
      const t0 = performance.now();
      kokoroJobs.set(-1, (a) => {
        const fast = a && (performance.now() - t0) / 1000 < FAST * (a.samples.length / a.rate);
        if (fast) { kokoroReady = true; if (voiceOn) voiceLabel(describe()); } else dropKokoro();
      });
      kokoro.postMessage({ type: 'speak', id: -1, text: 'Good day, I am Jarvis.' });
    }
    else if (m.type === 'audio' || m.type === 'error') {
      const job = kokoroJobs.get(m.id); kokoroJobs.delete(m.id);
      if (job) job(m.type === 'audio' ? m : null);
      if (m.type === 'error' && !kokoroReady) dropKokoro();
    }
  };
  kokoro.onerror = () => dropKokoro();
  kokoro.postMessage({ type: 'load' });
}
function dropKokoro() {                                          // failed or too slow here: the other voices carry on
  if (!kokoroSlow && voiceOn) { note = 'Daniel is too slow on this device, so a quicker voice speaks.'; if (!busy && !speaking && !pending) settle(); }
  kokoroSlow = true; kokoroReady = false;
  if (kokoro) { kokoro.terminate(); kokoro = null; }
  kokoroJobs.forEach(job => job(null)); kokoroJobs.clear();
  if (voiceOn) voiceLabel(describe());
}

function timeout(ms, promise, onLate) {
  let timer;
  const late = new Promise(res => { timer = setTimeout(() => { if (onLate) onLate(); res(null); }, ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}
async function fromDaniel(text) {
  if (!kokoro || !kokoroReady) return null;
  const id = kokoroId++, t0 = performance.now();
  const m = await timeout(LIMIT.daniel, new Promise(res => { kokoroJobs.set(id, res); kokoro.postMessage({ type: 'speak', id, text }); }), () => kokoroJobs.delete(id));
  if (!m) { dropKokoro(); return null; }
  const seconds = m.samples.length / m.rate;
  if ((performance.now() - t0) / 1000 > FAST * seconds) kokoroSlow = true;   // fell behind: later answers use the other voices
  const ctx = audio(), buf = ctx.createBuffer(1, m.samples.length, m.rate);
  buf.copyToChannel(m.samples, 0);
  return { buffer: buf };
}
function fromServer(text) {
  const ctl = new AbortController();
  const job = (async () => {
    const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: ctl.signal });
    if (!res.ok) return null;
    return { buffer: await audio().decodeAudioData(await res.arrayBuffer()) };
  })().catch(() => null);
  return timeout(LIMIT.server, job, () => ctl.abort());
}
const fromDevice = (voice) => (text) => (synth && voice ? { text, voice } : null);

// The voices to try for one piece, in order. A voice that fails once is skipped for the rest of that answer,
// so a server that is down costs one time limit, not one per sentence.
function lineUp(first) {
  const line = first === 'daniel' ? [['daniel', fromDaniel]] : [];
  if (browserMale) line.push(['device', fromDevice(browserMale)]);
  line.push(['server', fromServer]);
  if (browserAny && browserAny !== browserMale) line.push(['any', fromDevice(browserAny)]);
  return line;
}
async function produce(text, line, broken) {
  for (const [name, make] of line) {
    if (broken.has(name)) continue;
    const clip = await make(text);
    if (clip) return clip;
    broken.add(name);
  }
  return null;
}
function play(clip, mine) {
  return new Promise(done => {
    if (!clip || mine !== round || !voiceOn) { done(false); return; }
    let ended = false, guard = 0;
    const end = () => { if (ended) return; ended = true; clearTimeout(guard); current = null; speaking--; synthTalking = false; settle(); done(true); };
    speaking++; settle();
    if (clip.buffer) {
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch { /* older iOS */ } }   // iOS: play with the silent switch on
      const ctx = audio(), src = ctx.createBufferSource();
      src.buffer = clip.buffer; src.connect(analyser); src.onended = end;
      guard = setTimeout(end, clip.buffer.duration * 1000 + 3000);
      current = () => { try { src.stop(); } catch { /* already stopped */ } end(); };
      src.start();
    } else {
      const u = new SpeechSynthesisUtterance(clip.text);
      u.voice = clip.voice; u.lang = clip.voice.lang; u.onend = end; u.onerror = end;
      guard = setTimeout(() => { synth.cancel(); end(); }, 4000 + clip.text.length * 110);   // some engines never report the end
      current = () => { synth.cancel(); end(); };
      synthTalking = true; synth.speak(u);
    }
  });
}

// One answer's speech: pieces are made one after another and played strictly in order.
function beginSpeech() {
  if (!voiceOn) return null;
  stopSpeech();                                                  // a new question silences the last answer
  const mine = round;
  answerVoice = kokoroReady && !kokoroSlow ? 'daniel' : 'quick';
  voiceLabel(describe());
  let missed = 0;
  const broken = new Set();
  return (text) => {
    if (!voiceOn || mine !== round) return;
    const line = lineUp(answerVoice);
    const made = making = making.then(() => (mine === round && voiceOn ? produce(text, line, broken) : null));
    pending++; settle();
    queue = queue.then(() => made).then(clip => {
      if (mine !== round) return false;
      pending--;
      if (!clip && voiceOn && ++missed === 1) note = 'Voice unavailable just now. The text is all there.';
      return play(clip, mine);
    }).catch(() => false).finally(settle);
  };
}
function stopSpeech() {
  round++;
  if (current) current();
  if (synth) synth.cancel();
  pending = 0; speaking = 0; answerVoice = null;
  queue = Promise.resolve(); making = Promise.resolve(); settle();
}
voiceBtn.addEventListener('click', () => {
  voiceOn = !voiceOn; voiceBtn.setAttribute('aria-pressed', String(voiceOn)); audio();
  if (voiceOn) {
    if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); }   // iOS speaks only after a tap: use this one
    startKokoro(); voiceLabel(describe());
  } else { stopSpeech(); voiceLabel('Voice off'); }
});

// ---------- the conversation ----------
function bubble(role, html) {
  const el = document.createElement('div'); el.className = 'j-msg ' + role; el.innerHTML = html;
  log.appendChild(el); log.scrollTop = log.scrollHeight; return el;
}
function render(text, sources) {
  const byN = new Map((sources || []).map(s => [s.n, s]));
  // "[2]" and the grouped form some answers use, "[1, 2]": every number that is a real source becomes a link
  return esc(text).replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (m, list) => list.split(',').map(n => { const s = byN.get(+n); return s ? `<a class="cite" href="${esc(s.url)}" title="${esc(s.title)}">${+n}</a>` : ''; }).join('')).replace(/\n/g, '<br>');
}
bubble('bot', 'Good day. I am Jarvis, Dr. Adan Bermudez\'s assistant, or rather the public edition: I know his website and nothing private. Ask me about his work, his research or his chess, by typing or with the microphone.');

async function ask(question) {
  question = question.trim().slice(0, 600);
  if (!question || busy) return;
  busy = true; input.value = ''; setState('thinking', 'Thinking');
  bubble('you', esc(question));
  history.push({ role: 'user', content: question });
  const el = bubble('bot', '<span class="j-dots">…</span>');
  let text = '', sources = [];
  const speakPiece = beginSpeech(), pieces = chunker();          // speak each finished sentence as soon as it arrives
  const speakReady = (final) => { if (speakPiece) (final ? pieces.end(text) : pieces.push(text)).forEach(speakPiece); };
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-6) }) });   // the server reads the newest 6 turns only
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
    const used = sources.filter(s => new RegExp('\\[[\\d,\\s]*\\b' + s.n + '\\b[\\d,\\s]*\\]').test(text));
    const chips = (list, label) => '<div class="j-src">' + (label ? '<span>' + label + '</span>' : '') + list.map(s => `<a href="${esc(s.url)}">${s.n} · ${esc(s.title)}</a>`).join('') + '</div>';
    el.innerHTML = render(text, sources) + (used.length ? chips(used) : sources.length ? chips(sources.slice(0, 2), 'Pages consulted') : '');
    history.push({ role: 'assistant', content: text });
  } catch (err) {
    el.classList.add('err'); el.textContent = err.message || String(err);
    history.pop();
  } finally {
    busy = false; settle();
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
