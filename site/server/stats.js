/* First-party visitor statistics for sergioadan.dev (POST /api/hit, POST /api/stats; the table is in D1, STATS_DB).
   No cookies, and no IP address is stored. A visitor is counted per day by a hash of the IP, the browser and the date
   with a secret salt, so the same person on two days cannot be linked and the hash cannot be reversed by trying
   addresses. Kept: the page, the referring site (host only), a ?r= tag from a link I sent, country, the network
   operator's name, and phone or desktop. Pure logic here, tested in site/tests/stats.test.mjs. */

export const HITS_TABLE = `CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, day TEXT NOT NULL,
  path TEXT NOT NULL, ref TEXT, tag TEXT, country TEXT, network TEXT, device TEXT, visitor TEXT NOT NULL)`;

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|curl|wget|python|httpclient|monitor/i;

// One page view from the beacon's body and the request, or null when it should not be counted.
export async function cleanHit(body, request, salt, now = new Date()) {
  const ua = request.headers.get('user-agent') || '';
  if (!body || typeof body !== 'object' || BOT.test(ua)) return null;
  const path = typeof body.path === 'string' && /^\/[\w\-./]{0,120}$/.test(body.path) ? body.path.replace(/\.html$/, '').replace(/\/index$/, '/') : null;
  if (!path) return null;
  let ref = null;
  try {
    const host = new URL(String(body.ref || '')).hostname.replace(/^www\./, '');
    if (host && host !== new URL(request.url).hostname.replace(/^www\./, '')) ref = host.slice(0, 80);   // other sites only
  } catch { /* no referrer, or not a URL */ }
  const tag = typeof body.tag === 'string' && /^[a-z0-9-]{1,40}$/i.test(body.tag) ? body.tag.toLowerCase() : null;
  const cf = request.cf || {};
  const day = now.toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || '';
  return {
    at: now.toISOString(), day, path, ref, tag,
    country: typeof cf.country === 'string' ? cf.country.slice(0, 2) : null,
    network: typeof cf.asOrganization === 'string' ? cf.asOrganization.slice(0, 80) : null,
    device: /mobi|android|iphone|ipad/i.test(ua) ? 'phone' : 'desktop',
    visitor: await visitorHash(ip, ua, day, salt)
  };
}

export async function visitorHash(ip, ua, day, salt) {
  const data = new TextEncoder().encode([salt, day, ip, ua].join('|'));
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(h.slice(0, 8), b => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time comparison of the stats key, so the time to refuse does not reveal how much of a guess was right.
export function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// The private report: totals, then breakdowns over the last `days` days.
export async function statsReport(db, days = 30) {
  const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const q = (sql, ...args) => db.prepare(sql).bind(since, ...args).all().then(r => r.results);
  const by = col => q(`SELECT ${col} AS k, COUNT(*) AS views, COUNT(DISTINCT visitor || day) AS visitors FROM hits
    WHERE day >= ? AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY visitors DESC, views DESC LIMIT 25`);
  const [daily, pages, refs, tags, countries, networks, devices] = await Promise.all([
    q(`SELECT day AS k, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM hits WHERE day >= ? GROUP BY day ORDER BY day`),
    by('path'), by('ref'), by('tag'), by('country'), by('network'), by('device')
  ]);
  const recentTags = await q(`SELECT at, tag, path, country, network, device FROM hits WHERE day >= ? AND tag IS NOT NULL ORDER BY id DESC LIMIT 50`);
  const total = await db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT visitor || day) AS visitors FROM hits WHERE day >= ?`).bind(since).first();
  return { since, days, total, daily, pages, refs, tags, recentTags, countries, networks, devices };
}
