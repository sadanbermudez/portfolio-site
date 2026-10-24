// Visitor statistics (server/stats.js): what a page view keeps, and what it never keeps. node site/tests/stats.test.mjs
import assert from 'node:assert/strict';
import { cleanHit, visitorHash, sameKey, HITS_TABLE } from '../server/stats.js';

const ok = name => console.log('ok  ' + name);
const req = (headers = {}, cf = {}) => {
  const r = new Request('https://sergioadan.dev/api/hit', { method: 'POST', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', 'cf-connecting-ip': '203.0.113.7', ...headers } });
  Object.defineProperty(r, 'cf', { value: { country: 'ES', asOrganization: 'Example Telecom', ...cf } });
  return r;
};
const day = new Date('2026-10-24T10:00:00Z');

const h = await cleanHit({ path: '/work/moe.html', ref: 'https://www.linkedin.com/feed/?x=1', tag: 'Ikigai' }, req(), 'salt', day);
assert.equal(h.path, '/work/moe'); assert.equal(h.ref, 'linkedin.com'); assert.equal(h.tag, 'ikigai');
assert.equal(h.country, 'ES'); assert.equal(h.network, 'Example Telecom'); assert.equal(h.device, 'desktop'); assert.equal(h.day, '2026-10-24');
ok('a page view keeps the page, the referring host only, the tag, country, network and device');

assert.ok(!JSON.stringify(h).includes('203.0.113.7')); assert.ok(!/\bip\b/i.test(HITS_TABLE)); assert.ok(!/user.?agent/i.test(HITS_TABLE));
ok('no IP address and no browser string is stored');

assert.equal(h.visitor, await visitorHash('203.0.113.7', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', '2026-10-24', 'salt'));
assert.notEqual(h.visitor, await visitorHash('203.0.113.7', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', '2026-10-25', 'salt'));
assert.notEqual(h.visitor, await visitorHash('203.0.113.7', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', '2026-10-24', 'other'));
assert.match(h.visitor, /^[0-9a-f]{16}$/); ok('the visitor code changes every day and depends on the secret salt');

assert.equal((await cleanHit({ path: '/', ref: 'https://sergioadan.dev/about' }, req(), 's', day)).ref, null);
assert.equal((await cleanHit({ path: '/', ref: 'not a url' }, req(), 's', day)).ref, null); ok('own-site and malformed referrers are dropped');
assert.equal((await cleanHit({ path: '/index.html' }, req(), 's', day)).path, '/');
assert.equal(await cleanHit({ path: 'https://evil.example/' }, req(), 's', day), null);
assert.equal(await cleanHit({ path: '/<script>' }, req(), 's', day), null);
assert.equal(await cleanHit({ path: '/' + 'a'.repeat(200) }, req(), 's', day), null);
assert.equal(await cleanHit(null, req(), 's', day), null); ok('only a plain site path is counted');
assert.equal((await cleanHit({ path: '/', tag: 'x y' }, req(), 's', day)).tag, null);
assert.equal((await cleanHit({ path: '/', tag: 'a'.repeat(41) }, req(), 's', day)).tag, null); ok('tags are short letters, digits and dashes');
for (const ua of ['Googlebot/2.1', 'curl/8.0', 'HeadlessChrome', 'python-requests/2.31', 'facebookexternalhit/1.1']) assert.equal(await cleanHit({ path: '/' }, req({ 'user-agent': ua }), 's', day), null, ua);
ok('bots, crawlers and link previews are not counted');
assert.equal((await cleanHit({ path: '/' }, req({ 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' }), 's', day)).device, 'phone'); ok('phones are told apart');

assert.equal(sameKey('abc', 'abc'), true); assert.equal(sameKey('abd', 'abc'), false); assert.equal(sameKey('ab', 'abc'), false);
assert.equal(sameKey('', ''), false); assert.equal(sameKey(undefined, 'abc'), false); assert.equal(sameKey('abc', undefined), false);
ok('the stats key must match exactly, and an unset key opens nothing');
