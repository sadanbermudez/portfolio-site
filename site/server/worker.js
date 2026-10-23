/* sergioadan.dev on Cloudflare: static files, plus small endpoints for the site's live AI demos.
   POST /api/chat        public Jarvis: retrieval over the site's own pages, then Gemma 4 26B (Workers AI), streamed
   POST /api/tutor       Spanish Tutor demo: the app's tutor prompt (tutor-prompt.js), same model, streamed
   POST /api/transcribe  Whisper large-v3-turbo (Workers AI) turns a short recording into text
   POST /api/speak       MeloTTS (Workers AI) reads a sentence of Jarvis's answer aloud, for devices too slow for the in-browser voice
   POST /api/fit         Fit check: a pasted job description, each requirement matched to the site's pages, streamed
   POST /api/lab         The live lab agent: Gemma 4 works the simulated bench, graded against a hidden answer, streamed; and its public score
   Everything else is served from dist/ by the assets binding. No access to anything outside this site. */
import KNOWLEDGE from './knowledge.json';                     // written by build.py from the built pages
import { buildIndex, hybrid, hashText, cleanMessages, buildMessages, thinkFilter, tokenOf, scriptGuard, speakable, fromBase64, halveWav, LIMITS,
  FIT, requirementLines, pickFitPassages, buildFitMessages,
  API_HEADERS, API_ROUTES, BODY_LIMITS, checkRequest, readCapped, readJson } from './jarvis-core.js';
import { tutorSystemPrompt } from './tutor-prompt.js';
import { runAgent, wilson, LAB } from './lab-agent.js';

// Jarvis runs Gemma 4 since 21 October 2026: on the same pages, jarvis-eval dev 16/17 and held-out 2 7/8, against
// 15/17 and 5/8 for Qwen3 30B, which also omitted citations, listed fewer facts and slipped into Chinese.
const CHAT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
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
async function startModel(env, messages, temperature, quotaMessage, model = CHAT_MODEL, maxTokens = LIMITS.maxTokens) {
  // Qwen3 is switched off thinking by "/no_think" in the message. Gemma 4 thinks by default and takes this flag instead
  // (without it, the whole token budget went to reasoning and the answer was empty); Mistral rejects the flag.
  const extra = /gemma-4/.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {};
  const run = () => within(START_MS, env.AI.run(model, { messages, stream: true, max_tokens: maxTokens, temperature, ...extra }));
  try {
    try { return await run(); }
    catch (first) { if (isQuota(first)) throw first; return await run(); }
  } catch (err) {
    return json({ error: isQuota(err) ? quotaMessage : 'The model is unavailable just now. Please try again shortly.' }, isQuota(err) ? 429 : 502);
  }
}

// Relay Workers AI's stream as our own server-sent events: optional leading events, then token, done or error.
function relay(upstream, leading = [], headers = {}, guard = t => t) {
  const enc = new TextEncoder(), dec = new TextDecoder(), filter = thinkFilter(), visible = (t, end) => guard(filter(t, end));
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
  const model = env.CHAT_MODEL || CHAT_MODEL;            // CHAT_MODEL var: only for comparing models locally (wrangler dev --var)
  const messages = buildMessages(msgs, hits);
  if (!/qwen3/.test(model)) {                              // "/no_think" is Qwen3's switch; other models would read it as text
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = { ...last, content: last.content.replace(/\n\n\/no_think$/, '') };
  }
  const upstream = await startModel(env, messages, 0.2, 'I have used up today\'s free allowance, I am afraid. It resets at midnight UTC.', model);
  if (upstream instanceof Response) return upstream;
  const sources = hits.map((h, i) => ({ n: i + 1, title: h.title, url: h.url }));
  return relay(upstream, [['sources', sources]], { 'X-Jarvis-Search': qvec ? 'hybrid' : 'words' }, scriptGuard(newest));
}

// Fit check (FIT in jarvis-core.js): one search per requirement, so a long job description does not drown its
// rarer requirements, then one answer that goes through them line by line. Shares the chat rate limit.
async function fit(request, env, ctx) {
  if (await limited(env, 'CHAT_LIMIT', request, 'fit')) return json({ error: 'One moment, please: too many requests in the last minute.' }, 429);
  const body = await readJson(request); if (!body) return json({ error: 'Bad request.' }, 400);
  const jd = typeof body.jd === 'string' ? body.jd.trim() : '';
  if (jd.length < FIT.minChars) return json({ error: 'Please paste the job description: a few lines at least.' }, 400);
  const reqs = requirementLines(jd);
  if (!reqs.length) return json({ error: 'I could not find any requirements in that text.' }, 400);
  INDEX = INDEX || buildIndex(KNOWLEDGE);
  let qvecs = null, vecs = null;
  try { vecs = await chunkVectors(env, ctx); qvecs = (await env.AI.run(EMBED_MODEL, { text: reqs })).data; }
  catch (err) { console.log('embedding failed, word search only:', String(err && err.message || err)); }
  const hits = pickFitPassages(reqs.map((r, k) => hybrid(INDEX, r, qvecs ? qvecs[k] : null, vecs, FIT.perLine)));
  const upstream = await startModel(env, buildFitMessages(reqs, hits), 0.1, 'I have used up today\'s free allowance, I am afraid. It resets at midnight UTC.', CHAT_MODEL, FIT.maxTokens);
  if (upstream instanceof Response) return upstream;
  const sources = hits.map((h, i) => ({ n: i + 1, title: h.title, url: h.url }));
  return relay(upstream, [['sources', sources], ['requirements', reqs]], { 'X-Jarvis-Search': qvecs ? 'hybrid' : 'words' }, scriptGuard(jd));
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
  return relay(upstream, [], {}, scriptGuard(msgs[msgs.length - 1].content));
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

// The live lab agent (lab-agent.js): Gemma 4 works the simulated bench, the Worker picks the hidden photon order
// and grades the answer, and every run goes into D1 (LAB_DB) so the public score counts only graded runs.
// A run costs a few hundred neurons, so live runs are capped per day (LAB.dailyRuns) and per visitor (LAB_LIMIT);
// past the cap the page shows the recorded run instead. The row is written before the run starts, so the cap holds
// when several visitors start at once, and the run finishes and is recorded even if the visitor leaves.
const LAB_TABLE = `CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, day TEXT NOT NULL,
  model TEXT, truth INTEGER, answer INTEGER, exponent REAL, correct INTEGER, safe INTEGER, turns INTEGER, calls INTEGER,
  refused INTEGER, tokens_in INTEGER, tokens_out INTEGER, ended TEXT NOT NULL)`;
let labReady = false;
async function labScore(db, day) {
  const all = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS k, COALESCE(SUM(safe), 0) AS s,
    COALESCE(AVG(tokens_in), 0) AS tin, COALESCE(AVG(tokens_out), 0) AS tout FROM runs WHERE ended IN ('answer', 'budget')`).first();
  const today = await db.prepare('SELECT COUNT(*) AS n FROM runs WHERE day = ?').bind(day).first();
  const [lo, hi] = wilson(all.k, all.n);
  return { runs: all.n, correct: all.k, safe: all.s, wilson: [lo, hi], neurons: Math.round(all.tin * 0.009091 + all.tout * 0.027273),
    today: today.n, daily: LAB.dailyRuns };
}
async function lab(request, env, ctx) {
  if (await limited(env, 'LAB_LIMIT', request, 'lab')) return json({ error: 'One run at a time, please: try again in a minute.' }, 429);
  const body = await readJson(request); if (!body) return json({ error: 'Bad request.' }, 400);
  if (!env.LAB_DB) return json({ error: 'Live runs are off just now; here is the recorded run.', fallback: true }, 503);
  const db = env.LAB_DB, day = new Date().toISOString().slice(0, 10);
  if (!labReady) { await db.prepare(LAB_TABLE).run(); labReady = true; }
  if (body.action === 'score') return json(await labScore(db, day));
  if (body.action !== 'run') return json({ error: 'Bad request.' }, 400);
  const score = await labScore(db, day);
  if (score.today >= LAB.dailyRuns) return json({ error: `Today's ${LAB.dailyRuns} live runs are used up (they share a free allowance with Jarvis). Here is the recorded run; live runs reset at midnight UTC.`, fallback: true, score }, 429);
  const rnd = crypto.getRandomValues(new Uint32Array(2)), photonOrder = 1 + (rnd[0] & 1), seed = rnd[1];
  const model = CHAT_MODEL;
  const row = await db.prepare("INSERT INTO runs (at, day, model, truth, ended) VALUES (?, ?, ?, ?, 'running') RETURNING id")
    .bind(new Date().toISOString(), day, model, photonOrder).first();

  const enc = new TextEncoder(), { readable, writable } = new TransformStream(), writer = writable.getWriter();
  let open = true;
  const emit = (event, data) => { if (open) writer.write(enc.encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n')).catch(() => { open = false; }); };
  const ask = async messages => {
    const call = () => within(START_MS, env.AI.run(model, { messages, max_tokens: LAB.maxTokens, temperature: 0.2, chat_template_kwargs: { enable_thinking: false } }));
    let out;
    try { out = await call(); } catch (first) { if (isQuota(first)) throw first; out = await call(); }
    const text = typeof out?.response === 'string' ? out.response : out?.choices?.[0]?.message?.content || '';
    return { text, usage: out?.usage };
  };
  ctx.waitUntil((async () => {
    emit('start', { model: 'Gemma 4 26B (Workers AI)', turns: LAB.turns, calls: LAB.calls });
    let rec;
    try {
      rec = await runAgent({ ask, emit, photonOrder, seed });
    } catch (err) {
      console.log('lab run failed', String(err && err.message || err));
      rec = { truth: photonOrder, answer: null, exponent: null, correct: false, safe: true, turns: 0, calls: 0, refused: 0, tokensIn: 0, tokensOut: 0, ended: 'error' };
      emit('error', { error: isQuota(err) ? "Today's free allowance is used up. Here is the recorded run." : 'The model stopped answering. This run is not counted in the score.', fallback: true });
    }
    await db.prepare(`UPDATE runs SET answer = ?, exponent = ?, correct = ?, safe = ?, turns = ?, calls = ?, refused = ?, tokens_in = ?, tokens_out = ?, ended = ? WHERE id = ?`)
      .bind(rec.answer, rec.exponent, rec.correct ? 1 : 0, rec.safe ? 1 : 0, rec.turns, rec.calls, rec.refused, rec.tokensIn, rec.tokensOut, rec.ended, row.id).run();
    if (rec.ended !== 'error') emit('verdict', { truth: rec.truth, answer: rec.answer, correct: rec.correct, safe: rec.safe, ended: rec.ended, turns: rec.turns, calls: rec.calls, score: await labScore(db, day) });
    if (open) writer.close().catch(() => {});
  })());
  return new Response(readable, { headers: { ...SECURE, 'Content-Type': 'text/event-stream; charset=utf-8' } });
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
      if (pathname === '/api/fit') return await fit(request, env, ctx);
      if (pathname === '/api/lab') return await lab(request, env, ctx);
      return await speak(request, env, ctx);
    } catch (err) {                                  // never a stack trace or a Cloudflare error page to the visitor
      console.log('api error', pathname, String(err && err.message || err));
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  }
};
