// Browser smoke test: load every built page in real Chromium, on a laptop and on a phone, under the
// site's own response headers (so the Content-Security-Policy is enforced), and fail on what a visitor
// would see go wrong: a script error, a console error, a CSP violation, a missing local file, or a page
// wider than a phone screen. Run after `python site/build.py`:  node site/tests/smoke.mjs
// Needs the playwright package and its Chromium (CI installs both; see .github/workflows/site.yml).
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.vtt': 'text/vtt', '.onnx': 'application/octet-stream', '.txt': 'text/plain' };

// The _headers file the build writes: "/*" applies everywhere, other blocks to their path.
const rules = [];
for (const line of (await readFile(join(dist, '_headers'), 'utf8')).split('\n')) {
  if (!line.trim()) continue;
  if (!line.startsWith(' ')) rules.push({ path: line.trim(), headers: {} });
  else { const i = line.indexOf(':'); rules.at(-1).headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
}
const headersFor = path => Object.assign({}, ...rules.filter(r => r.path === '/*' || r.path === path ||
  (r.path.endsWith('/*') && path.startsWith(r.path.slice(0, -1)))).map(r => r.headers));

async function resolve(url) {
  let p = decodeURIComponent(url.split('?')[0]);
  for (const c of [p, p + '.html', p.replace(/\/?$/, '/index.html')]) {
    try { return { file: join(dist, c), body: await readFile(join(dist, c)) }; } catch { /* next */ }
  }
  return null;
}
const server = http.createServer(async (req, res) => {
  // No Worker here: /api answers as the Worker does when a live feature is off, and pages must cope with that.
  // The API itself is tested by api-security.test.mjs, lab-agent.test.mjs and the live checks.
  if (req.url.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"error":"off in the smoke test","fallback":true}'); }
  const hit = await resolve(req.url);
  if (!hit) { res.writeHead(404, headersFor(req.url)); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(hit.file)] || 'application/octet-stream', ...headersFor(req.url.split('?')[0]) });
  res.end(hit.body);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

async function pages(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await pages(p));
    else if (e.name.endsWith('.html') && e.name !== '404.html') out.push('/' + relative(dist, p).split(sep).join('/'));
  }
  return out;
}
const list = (await pages(dist)).sort();
const VIEWS = { laptop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };

const browser = await chromium.launch();
const failures = [];
for (const [view, opts] of Object.entries(VIEWS)) {
  const context = await browser.newContext(opts);
  for (const path of list) {
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', e => problems.push(`script error: ${e.message}`));
    page.on('console', m => {
      // a third-party host being unreachable from CI is not a site bug; everything else is
      if (m.type() === 'error' && (m.location().url || '').includes('/api/')) return;      // the 503 above, handled by the page
      if (m.type() === 'error' && !/lichess|chess\.com|huggingface|hf\.co|fonts\.g|cdnjs|ERR_(NAME|INTERNET|CONNECTION)/i.test(m.text())) problems.push(`console: ${m.text()}`);
    });
    page.on('response', r => { if (r.url().startsWith(origin) && !r.url().startsWith(origin + '/api/') && r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().slice(origin.length)}`); });
    await page.goto(origin + path, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));      // wake scroll-driven scripts
    await page.waitForTimeout(400);
    if (view === 'phone') {
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (wide > 1) problems.push(`page is ${wide}px wider than the phone screen`);
    }
    for (const p of problems) failures.push(`${view} ${path}: ${p}`);
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${view.padEnd(6)} ${path}`);
    await page.close();
  }
  await context.close();
}
await browser.close();
server.close();
if (failures.length) { console.error('\n' + failures.join('\n')); process.exit(1); }
console.log(`\n${list.length} pages, laptop and phone: no errors`);
