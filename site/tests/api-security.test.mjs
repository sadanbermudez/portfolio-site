// Security checks for the /api routes and the generated headers: node site/tests/api-security.test.mjs
// (run after python site/build.py, which writes site/dist/_headers)
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { checkRequest, readCapped, readJson, BODY_LIMITS, API_ROUTES, API_HEADERS } from '../server/jarvis-core.js';

const ok = name => console.log('ok  ' + name);
const here = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://sergioadan.dev';
const req = (path, { method = 'POST', headers = {}, body } = {}) =>
  new Request(SITE + path, { method, headers, body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) });
const json = { 'Content-Type': 'application/json' };

// ---------- method, origin, content type, declared size ----------
{
  const r = checkRequest(req('/api/chat', { method: 'GET' }), 'json');
  assert.equal(r.status, 405); assert.equal(r.headers.Allow, 'POST'); ok('only POST, with Allow on a 405');
}
assert.equal(checkRequest(req('/api/chat', { headers: { ...json, Origin: 'https://evil.example' } }), 'json').status, 403);
assert.equal(checkRequest(req('/api/chat', { headers: { ...json, Origin: 'https://sergioadan.dev.evil.example' } }), 'json').status, 403);
assert.equal(checkRequest(req('/api/chat', { headers: { ...json, Origin: 'null' } }), 'json').status, 403); ok('a page on another site (or a sandboxed one) is refused');
assert.equal(checkRequest(req('/api/chat', { headers: { ...json, Origin: SITE } }), 'json'), null);
assert.equal(checkRequest(req('/api/chat', { headers: json }), 'json'), null); ok('the site itself, and clients without Origin, may call');
for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp', '']) {
  assert.equal(checkRequest(req('/api/speak', { headers: { 'Content-Type': type } }), 'json').status, 415, type);
}
assert.equal(checkRequest(req('/api/speak', { headers: { 'Content-Type': 'application/json; charset=utf-8' } }), 'json'), null);
ok('JSON routes take only application/json, so a cross-site browser request needs a preflight that is never granted');
assert.equal(checkRequest(req('/api/transcribe', { headers: { 'Content-Type': 'audio/webm;codecs=opus' } }), 'audio'), null);
assert.equal(checkRequest(req('/api/transcribe', { headers: { 'Content-Type': 'audio/mp4' } }), 'audio'), null);
assert.equal(checkRequest(req('/api/transcribe', { headers: json }), 'audio').status, 415);
assert.equal(checkRequest(req('/api/transcribe', { headers: { 'Content-Type': 'text/plain' } }), 'audio').status, 415); ok('the recording route takes only audio types');
assert.equal(checkRequest(req('/api/chat', { headers: { ...json, 'Content-Length': String(BODY_LIMITS.json + 1) } }), 'json').status, 413);
assert.equal(checkRequest(req('/api/chat', { headers: { ...json, 'Content-Length': 'lots' } }), 'json').status, 413);
assert.equal(checkRequest(req('/api/transcribe', { headers: { 'Content-Type': 'audio/webm', 'Content-Length': String(BODY_LIMITS.audio + 1) } }), 'audio').status, 413);
ok('a declared body over the limit is refused before it is read');

// ---------- reading bodies with a cap ----------
function chunks(n, size) {                     // a body sent in n chunks, counting how many were pulled
  const stream = new ReadableStream({ pull(ctrl) { stream.pulled++; if (stream.pulled > n) ctrl.close(); else ctrl.enqueue(new Uint8Array(size).fill(97)); } });
  stream.pulled = 0;
  return stream;
}
{
  const body = chunks(1000, 10_000);         // 10 MB without a Content-Length
  assert.equal(await readCapped(req('/api/transcribe', { body }), 50_000), null);
  assert.ok(body.pulled < 10, 'stopped after ' + body.pulled + ' chunks'); ok('an oversized chunked body is abandoned at the limit, not buffered');
  const small = await readCapped(req('/api/transcribe', { body: chunks(3, 100) }), 50_000);
  assert.equal(small.length, 300); ok('a body under the limit is read whole');
}
assert.deepEqual(await readJson(req('/api/chat', { headers: json, body: '{"messages":[]}' })), { messages: [] });
assert.equal(await readJson(req('/api/chat', { headers: json, body: '{bad' })), undefined);
assert.equal(await readJson(req('/api/chat', { headers: json, body: '[1,2]' })), undefined);
assert.equal(await readJson(req('/api/chat', { headers: json, body: 'null' })), undefined);
assert.equal(await readJson(req('/api/chat', { headers: json, body: JSON.stringify({ x: 'a'.repeat(BODY_LIMITS.json) }) })), undefined);
ok('JSON bodies: only an object under the size limit is accepted');

// ---------- the Worker: every route is rate-limited, responses carry no CORS and their own headers ----------
const worker = readFileSync(join(here, 'server', 'worker.js'), 'utf8');
const handler = { '/api/chat': 'chat', '/api/tutor': 'tutor', '/api/transcribe': 'transcribe', '/api/speak': 'speak', '/api/fit': 'fit' };
assert.deepEqual(Object.keys(API_ROUTES).sort(), Object.keys(handler).sort());
for (const [route, fn] of Object.entries(handler)) {
  const body = worker.slice(worker.indexOf('async function ' + fn + '('));
  const first = body.split('\n').slice(1, 3).join('\n');
  assert.match(first, /await limited\(env, '[A-Z_]+', request/, route + ' must check its rate limit first');
}
ok('every API route checks its rate limit before reading the body or calling a model');
assert.doesNotMatch(worker, /Access-Control-Allow/i);
assert.ok(!Object.keys(API_HEADERS).some(k => /^access-control/i.test(k))); ok('no CORS headers: the API is same-origin only');
assert.equal(API_HEADERS['X-Content-Type-Options'], 'nosniff');
assert.equal(API_HEADERS['Cross-Origin-Resource-Policy'], 'same-origin');
assert.match(API_HEADERS['Content-Security-Policy'], /default-src 'none'/);
assert.match(API_HEADERS['Content-Security-Policy'], /frame-ancestors 'none'/);
assert.equal(API_HEADERS['Cache-Control'], 'no-store'); ok('API responses carry nosniff, no-store, CORP and a deny-all CSP');
assert.match(worker, /checkRequest\(request, kind\)/);
assert.doesNotMatch(worker, /request\.(json|arrayBuffer|text)\(\)/); ok('the Worker reads bodies only through the capped readers');
assert.match(worker, /catch \(err\) \{[^\n]*\n\s*console\.log\('api error'/); ok('unexpected errors become a plain 500, never a stack trace');

// ---------- the generated _headers (decision 2) ----------
const headersFile = join(here, 'dist', '_headers');
assert.ok(existsSync(headersFile), 'run python site/build.py first');
const H = readFileSync(headersFile, 'utf8');
const csp = (H.match(/Content-Security-Policy: (.*)/) || [])[1] || '';
const directive = name => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '');
const scriptSrc = directive('script-src');
assert.doesNotMatch(scriptSrc, /'unsafe-inline'|'unsafe-eval'|\*|data:|https:\/\/cdnjs\.cloudflare\.com(\s|$)/);
assert.match(scriptSrc, /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/); ok('script-src names one CDN file, never a whole host, inline code or eval');
for (const d of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'", "default-src 'self'"]) assert.ok(csp.includes(d), d);
for (const h of ['Strict-Transport-Security: max-age=31536000; includeSubDomains', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY',
  'Cross-Origin-Opener-Policy: same-origin', 'Referrer-Policy: strict-origin-when-cross-origin', 'Permissions-Policy: camera=(), microphone=(self), geolocation=()']) assert.ok(H.includes(h), h);
ok('every page gets the CSP, HSTS, nosniff, frame denial, COOP, referrer and permissions policies');
const coep = H.split(/\r?\n/).map((l, i, all) => /Cross-Origin-Embedder-Policy/.test(l) ? all[i - 1] : null).filter(Boolean);
assert.deepEqual(coep, ['/jarvis', '/jarvis.html', '/tts-worker.js', '/vendor/kokoro/*']); ok('cross-origin isolation only on the Jarvis page and its voice files');

const pages = [];
(function walk(dir) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.html')) pages.push(p); } })(join(here, 'dist'));
for (const p of pages) {
  for (const tag of readFileSync(p, 'utf8').match(/<script\b[^>]*\bsrc="(?:https?:)?\/\/[^>]*>/gi) || []) {
    assert.match(tag, /\bintegrity="sha(256|384|512)-/, p); assert.match(tag, /crossorigin="anonymous"/, p);
  }
}
ok('every script from another site in ' + pages.length + ' built pages carries an integrity hash');
