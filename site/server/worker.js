/* sergioadan.dev on Cloudflare: static files, plus two small endpoints for the public Jarvis demo.
   POST /api/chat        retrieval over the site's own pages, then Qwen3 30B (Workers AI), streamed back
   POST /api/transcribe  Whisper large-v3-turbo (Workers AI) turns a short recording into text
   Everything else is served from dist/ by the assets binding. No access to anything outside this site. */
import KNOWLEDGE from './knowledge.json';                     // written by build.py from the built pages
import { buildIndex, hybrid, hashText, cleanMessages, buildMessages, thinkFilter, tokenOf, LIMITS } from './jarvis-core.js';

const CHAT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const STT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const EMBED_MODEL = '@cf/baai/bge-m3';                // multilingual, so questions in Spanish find English pages
const MAX_AUDIO = 1_500_000;                         // bytes, about a minute of compressed speech
let INDEX = null, VECS = null;

const SECURE = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...SECURE, 'Content-Type': 'application/json' } }); }

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

async function chat(request, env, ctx) {
  if (await limited(env, 'CHAT_LIMIT', request, 'chat')) return json({ error: 'One moment, please: too many questions in the last minute.' }, 429);
  let body; try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
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
  let upstream;
  const run = () => env.AI.run(CHAT_MODEL, { messages: buildMessages(msgs, hits), stream: true, max_tokens: LIMITS.maxTokens, temperature: 0.2 });
  try {
    try { upstream = await run(); }
    catch (first) { if (/limit|quota|neuron|429/i.test(String(first && first.message))) throw first; upstream = await run(); }   // one retry for a transient error
  } catch (err) {
    const quota = /limit|quota|neuron|capacity|429/i.test(String(err && err.message));
    return json({ error: quota ? 'I have used up today\'s free allowance, I am afraid. It resets at midnight UTC.' : 'The model is unavailable just now. Please try again shortly.' }, quota ? 429 : 502);
  }
  const sources = hits.map((h, i) => ({ n: i + 1, title: h.title, url: h.url }));
  const enc = new TextEncoder(), dec = new TextDecoder(), visible = thinkFilter();
  const send = (ctrl, event, data) => ctrl.enqueue(enc.encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'));
  const stream = new ReadableStream({
    async start(ctrl) {
      send(ctrl, 'sources', sources);
      const reader = upstream.getReader(); let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
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
      }
      ctrl.close();
    }
  });
  return new Response(stream, { headers: { ...SECURE, 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Jarvis-Search': qvec ? 'hybrid' : 'words' } });
}

async function transcribe(request, env) {
  if (await limited(env, 'STT_LIMIT', request, 'stt')) return json({ error: 'Too many recordings in the last minute.' }, 429);
  const size = +(request.headers.get('content-length') || 0);
  if (size > MAX_AUDIO) return json({ error: 'That recording is too long. Please keep it under a minute.' }, 413);
  const audio = new Uint8Array(await request.arrayBuffer());
  if (!audio.length || audio.length > MAX_AUDIO) return json({ error: 'No usable audio received.' }, 400);
  let bin = ''; for (let i = 0; i < audio.length; i += 0x8000) bin += String.fromCharCode.apply(null, audio.subarray(i, i + 0x8000));
  try {
    const out = await env.AI.run(STT_MODEL, { audio: btoa(bin), vad_filter: true });
    return json({ text: ((out && out.text) || '').trim().slice(0, 600) });
  } catch (err) {
    const quota = /limit|quota|neuron|429/i.test(String(err && err.message));
    return json({ error: quota ? 'Today\'s free allowance is used up. Please type instead.' : 'I could not make that out. Please try again or type.' }, quota ? 429 : 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/chat' && request.method === 'POST') return chat(request, env, ctx);
    if (pathname === '/api/transcribe' && request.method === 'POST') return transcribe(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  }
};
