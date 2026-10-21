/* sergioadan.dev on Cloudflare: static files, plus small endpoints for the site's live AI demos.
   POST /api/chat        public Jarvis: retrieval over the site's own pages, then Qwen3 30B (Workers AI), streamed
   POST /api/tutor       Spanish Tutor demo: the app's tutor prompt (tutor-prompt.js), same model, streamed
   POST /api/transcribe  Whisper large-v3-turbo (Workers AI) turns a short recording into text
   POST /api/speak       MeloTTS (Workers AI) reads a sentence of Jarvis's answer aloud, for devices too slow for the in-browser voice
   Everything else is served from dist/ by the assets binding. No access to anything outside this site. */
import KNOWLEDGE from './knowledge.json';                     // written by build.py from the built pages
import { buildIndex, hybrid, hashText, cleanMessages, buildMessages, thinkFilter, tokenOf, speakable, fromBase64, halveWav, LIMITS,
  API_HEADERS, API_ROUTES, BODY_LIMITS, checkRequest, readCapped, readJson } from './jarvis-core.js';
import { tutorSystemPrompt } from './tutor-prompt.js';

const CHAT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
// The tutor runs Gemma 4: on site/tests/tutor-eval.mjs (20 turns each) it gave the right verdict and correction 20/20
// and never showed wrong Spanish, where Qwen3 30B showed a wrong form as a correction in 6 of 20 ("Está morena").
const TUTOR_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const STT_MODEL = '@cf/openai/whisper-large-v3-turbo';
// About 19 neurons per minute of speech. Deepgram Aura has British male voices but costs about 1,400 neurons per 1,000 characters.
const SPEAK_MODEL = '@cf/myshell-ai/melotts';
const EMBED_MODEL = '@cf/baai/bge-m3';                // multilingual, so questions in Spanish find English pages
const MAX_AUDIO = BODY_LIMITS.audio;                  // bytes, about a minute of compressed speech
let INDEX = null, VECS = null;

const SECURE = API_HEADERS;                          // nosniff, no-store, CSP default-src 'none', CORP same-origin, no CORS (jarvis-core.js)
function json(body, status = 200, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { ...SECURE, 'Content-Type': 'application/json', ...extra } }); }
const isQuota = (err) => /limit|quota|neuron|capacity|429/i.test(String(err && err.message));

async function limited(env, binding, request, route) {
  if (!env[binding]) return false;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const { success } = await env[binding].limit({ key: route + ':' + ip });
  return !success;
}

// Embeddings of every chunk: computed once (about 10 neurons), kept in memory and in Cloudflare's cache,
// named after a hash of the knowledge so a rebuilt site gets fresh vectors.
async function chunkVectors(env, ctx) {
  if (VECS) return VECS;
  const key = new Request('https://jarvis.cache/vectors-' + hashText(JSON.stringify(KNOWLEDGE)));
  const hit = await caches.default.match(key);
  if (hit) return (VECS = await hit.json());
  const texts = KNOWLEDGE.map(c => c.title + '. ' + c.text), out = [];
  for (let i = 0; i < texts.length; i += 40) out.push(...(await env.AI.run(EMBED_MODEL, { text: texts.slice(i, i + 40) })).data);
  VECS = out;
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'public, max-age=2592000' } })));
  return VECS;
}

// Workers AI occasionally never answers (2 of 20 tutor requests in testing): give up on a silent call instead of hanging.
const START_MS = 25000, IDLE_MS = 30000;
function within(ms, promise) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), ms); })]).finally(() => clearTimeout(timer));
}

// Start a streamed completion, with one retry for a transient error or a silent start. Returns the stream or an error Response.
async function startModel(env, messages, temperature, quotaMessage, model = CHAT_MODEL) {
  // Qwen3 is switched off thinking by "/no_think" in the message. Gemma 4 thinks by default and takes this flag instead
  // (without it, the whole token budget went to reasoning and the answer was empty); Mistral rejects the flag.
  const extra = /gemma-4/.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {};
  const run = () => within(START_MS, env.AI.run(model, { messages, stream: true, max_tokens: LIMITS.maxTokens, temperature, ...extra }));
  try {
    try { return await run(); }
    catch (first) { if (isQuota(first)) throw first; return await run(); }
  } catch (err) {
    return json({ error: isQuota(err) ? quotaMessage : 'The model is unavailable just now. Please try again shortly.' }, isQuota(err) ? 429 : 502);
  }
}

// Relay Workers AI's stream as our own server-sent events: optional leading events, then token, done or error.
function relay(upstream, leading = [], headers = {}) {
  const enc = new TextEncoder(), dec = new TextDecoder(), visible = thinkFilter();
  const send = (ctrl, event, data) => ctrl.enqueue(enc.encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'));
  const stream = new ReadableStream({
    async start(ctrl) {
      for (const [event, data] of leading) send(ctrl, event, data);
      const reader = upstream.getReader(); let buf = '';
      try {
        for (;;) {
          const { value, done } = await within(IDLE_MS, reader.read());
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let cut;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const evt = buf.slice(0, cut); buf = buf.slice(cut + 2);
            const data = evt.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
            if (!data || data === '[DONE]') continue;
            const text = visible(tokenOf(data));
            if (text) send(ctrl, 'token', text);
          }
        }
        const tail = visible('', true); if (tail) send(ctrl, 'token', tail);
        send(ctrl, 'done', {});
      } catch {
        send(ctrl, 'error', { error: 'The answer was cut off. Please ask again.' });
        reader.cancel().catch(() => {});
      }
      ctrl.close();
    }
  });
  return new Response(stream, { headers: { ...SECURE, 'Content-Type': 'text/event-stream; charset=utf-8', ...headers } });
}

async function chat(request, env, ctx) {
  if (await limited(env, 'CHAT_LIMIT', request, 'chat')) return json({ error: 'One moment, please: too many questions in the last minute.' }, 429);
  const body = await readJson(request); if (!body) return json({ error: 'Bad request.' }, 400);
  const msgs = cleanMessages(body && body.messages);
  if (!msgs) return json({ error: 'Bad request.' }, 400);
  INDEX = INDEX || buildIndex(KNOWLEDGE);
  // Search on the newest question; a short follow-up ("and his postdoc?") also borrows the previous one.
  const users = msgs.filter(m => m.role === 'user').map(m => m.content), newest = users[users.length - 1];
  const lastUsers = newest.split(/\s+/).length < 5 && users.length > 1 ? users[users.length - 2] + ' ' + newest : newest;
  let qvec = null, vecs = null;
  try { vecs = await chunkVectors(env, ctx); qvec = (await env.AI.run(EMBED_MODEL, { text: [lastUsers] })).data[0]; }
  catch (err) { console.log('embedding failed, word search only:', String(err && err.message || err)); }
  const hits = hybrid(INDEX, lastUsers, qvec, vecs, LIMITS.topK);
  const upstream = await startModel(env, buildMessages(msgs, hits), 0.2, 'I have used up today\'s free allowance, I am afraid. It resets at midnight UTC.');
  if (upstream instanceof Response) return upstream;
  const sources = hits.map((h, i) => ({ n: i + 1, title: h.title, url: h.url }));
  return relay(upstream, [['sources', sources]], { 'X-Jarvis-Search': qvec ? 'hybrid' : 'words' });
}

// The Spanish Tutor demo: the app's own system prompt and lesson context, the conversation, nothing else.
async function tutor(request, env) {
  if (await limited(env, 'CHAT_LIMIT', request, 'tutor')) return json({ error: 'Un momento, por favor: demasiados mensajes en el último minuto.' }, 429);
  const body = await readJson(request); if (!body) return json({ error: 'Bad request.' }, 400);
  const msgs = cleanMessages(body && body.messages);
  if (!msgs) return json({ error: 'Bad request.' }, 400);
  const lesson = typeof body.lesson === 'string' ? body.lesson.slice(0, 80) : 'free';
  const model = env.TUTOR_MODEL || TUTOR_MODEL;          // TUTOR_MODEL var: only for comparing models locally (wrangler dev --var)
  const messages = [{ role: 'system', content: tutorSystemPrompt(lesson) }, ...msgs];
  if (/qwen3/.test(model)) messages[messages.length - 1] = { role: 'user', content: messages[messages.length - 1].content + '\n\n/no_think' };   // Qwen3's switch
  const upstream = await startModel(env, messages, 0.7, 'El tutor ha agotado la cuota gratuita de hoy. Vuelve después de medianoche (UTC).', model);   // the app samples at 0.7
  if (upstream instanceof Response) return upstream;
  return relay(upstream);
}

const STT_MS = 30000;
async function transcribe(request, env) {
  if (await limited(env, 'STT_LIMIT', request, 'stt')) return json({ error: 'Too many recordings in the last minute.' }, 429);
  const audio = await readCapped(request, MAX_AUDIO);
  if (!audio) return json({ error: 'That recording is too long. Please keep it under a minute.' }, 413);
  if (!audio.length) return json({ error: 'No usable audio received.' }, 400);
  let bin = ''; for (let i = 0; i < audio.length; i += 0x8000) bin += String.fromCharCode.apply(null, audio.subarray(i, i + 0x8000));
  try {
    const out = await within(STT_MS, env.AI.run(STT_MODEL, { audio: btoa(bin), vad_filter: true }));
    return json({ text: ((out && out.text) || '').trim().slice(0, 600) });
  } catch (err) {
    return json({ error: isQuota(err) ? 'Today\'s free allowance is used up. Please type instead.' : 'I could not make that out. Please try again or type.' }, isQuota(err) ? 429 : 502);
  }
}

// One sentence or two in, speech out, for devices too slow for the in-browser voice (decision 11).
// MeloTTS returns a base64 WAV; halveWav turns it into a binary WAV a third of the size, for phone connections.
// Answers repeat (the greeting, popular questions), so clips are cached by their text for a week.
const SPEAK_MS = 12000;
async function speak(request, env, ctx) {
  if (await limited(env, 'SPEAK_LIMIT', request, 'speak')) return json({ error: 'Too many sentences in the last minute.' }, 429);
  const body = await readJson(request); if (!body) return json({ error: 'Bad request.' }, 400);
  const text = speakable(body && body.text);
  if (!text) return json({ error: 'Bad request.' }, 400);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SPEAK_MODEL + '|' + text));
  const key = new Request('https://jarvis.cache/speak-' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''));
  const headers = { ...SECURE, 'Content-Type': 'audio/wav' };
  const hit = await caches.default.match(key);
  if (hit) return new Response(hit.body, { headers: { ...headers, 'X-Jarvis-Voice': 'cache' } });
  let clip;
  try {
    const out = await within(SPEAK_MS, env.AI.run(SPEAK_MODEL, { prompt: text, lang: 'en' }));
    clip = halveWav(fromBase64(out && out.audio || ''));
  } catch (err) {
    return json({ error: isQuota(err) ? "The voice has used up today's free allowance." : 'The voice is unavailable just now.' }, isQuota(err) ? 429 : 502);
  }
  if (clip.length < 100) return json({ error: 'The voice is unavailable just now.' }, 502);
  ctx.waitUntil(caches.default.put(key, new Response(clip, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=604800' } })));
  return new Response(clip, { headers: { ...headers, 'X-Jarvis-Voice': 'melotts' } });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const kind = API_ROUTES[pathname];
    if (!kind) return json({ error: 'Not found.' }, 404);
    const refused = checkRequest(request, kind);
    if (refused) return json({ error: refused.error }, refused.status, refused.headers);
    try {
      if (pathname === '/api/chat') return await chat(request, env, ctx);
      if (pathname === '/api/tutor') return await tutor(request, env);
      if (pathname === '/api/transcribe') return await transcribe(request, env);
      return await speak(request, env, ctx);
    } catch (err) {                                  // never a stack trace or a Cloudflare error page to the visitor
      console.log('api error', pathname, String(err && err.message || err));
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  }
};
