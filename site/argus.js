// Argus page: a recreation of the hub (Odysseus underneath, my layer on top) that plays sample
// conversations, plus the guided tour that drives it. Everything here is sample data written for
// this page; no real chats, notes or endpoints. The page is readable without this script: the
// first conversation, the agents, the voice facts and the scorecard are already in the HTML.
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const hub = $('#hub');
  if (!hub) return;

  // ------------------------------------------------------------ the eye follows the pointer
  const iris = $('#ag-iris-g');
  const eye = $('.ag-eye');
  if (iris && eye && !reduce) {
    let px = 0, py = 0, queued = false;
    window.addEventListener('pointermove', e => {
      px = e.clientX; py = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const r = eye.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const dx = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        const dy = Math.max(-1, Math.min(1, (py - (r.top + r.height / 2)) / (window.innerHeight / 2)));
        iris.setAttribute('transform', `translate(${(dx * 18).toFixed(1)} ${(dy * 9).toFixed(1)})`);
      });
    }, { passive: true });
  }
  if (reduce) $$('svg').forEach(s => { if (s.pauseAnimations) s.pauseAnimations(); });

  // ------------------------------------------------------------ helpers
  let token = 0;                                             // a newer action cancels an older replay
  const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // ------------------------------------------------------------ views
  const tabs = $$('.ag-tabs [data-view]');
  function setView(name) {
    tabs.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
    $$('.ag-view', hub).forEach(v => { v.hidden = v.dataset.view !== name; });
  }
  tabs.forEach(b => b.addEventListener('click', () => { token++; setView(b.dataset.view); if (b.dataset.view === 'evals') fillBars(); }));

  // ------------------------------------------------------------ chat replays (sample data)
  const log = $('#ag-log');
  const persona = $('.ag-persona');
  const routes = $$('.ag-route [data-route]');
  const setRoute = r => routes.forEach(s => s.classList.toggle('on', s.dataset.route === r));
  const WHO = { local: 'Jarvis · Qwen3.6-35B-A3B · local', claude: 'Jarvis · relaying Claude Code' };

  const SCRIPTS = {
    persona: [
      { user: 'Explain in two lines why you run on a local model.' },
      { bot: 'Your notes stay on this machine, and routine answers come back in seconds. When a job needs more, I hand it to Claude and tell you I did.' },
    ],
    memory: [
      { user: 'What did we decide about the garden watering timer?' },
      { tool: 'memory_search', args: '"garden watering timer"', via: 'jarvis-memory · MCP', ret: '2 notes: Garden.md, Decisions.md' },
      { tool: 'memory_read', args: '"Garden.md"', via: 'jarvis-memory · MCP', ret: 'Decision: water at 6:00 for 12 minutes; skip on rain days.' },
      { bot: '6:00 for 12 minutes, skipped on rain days. It moved from 7:00 because of the afternoon heat. Sources: Garden.md and Decisions.md.' },
    ],
    claude: [
      { user: 'Review the sample repo\'s tests and list the three weakest.' },
      { bot: 'That is a multi-step job across many files. Handing it to Claude, read-only.' },
      { route: 'claude', tool: 'claude_code_task', args: 'mode="read", task="rank the weakest tests"', via: 'claude-bridge · Claude Code on my subscription', ret: 'read tools only · no shell · one task at a time · 3 findings', cls: 'claude' },
      { bot: 'Claude\'s findings: one test asserts nothing, one waits on the real clock, and two share a temporary folder. Shall I draft the fixes?', who: 'claude' },
    ],
  };

  async function stream(p, text, my) {
    if (reduce) { p.textContent = text; return; }
    const words = text.split(' ');
    p.classList.add('cursor');
    for (let i = 0; i < words.length; i++) {
      if (my !== token) return;
      p.textContent = words.slice(0, i + 1).join(' ');
      log.scrollTop = log.scrollHeight;
      await wait(32);
    }
    p.classList.remove('cursor');
  }

  async function play(name) {
    const my = ++token;
    setView('chat');
    $$('.ag-chats [data-script]').forEach(b => b.setAttribute('aria-current', String(b.dataset.script === name)));
    persona.classList.remove('hermes');
    log.textContent = '';
    setRoute('local');
    for (const m of SCRIPTS[name]) {
      if (my !== token) return;
      if (m.route) setRoute(m.route);
      if (m.user) {
        const b = el('div', 'msg user'); b.append(el('p', null, m.user)); log.append(b);
        log.scrollTop = log.scrollHeight;
        await wait(500);
      } else if (m.tool) {
        const c = el('div', 'msg tool pending' + (m.cls ? ' ' + m.cls : ''));
        const call = el('div', 'call'); call.append(el('b', null, m.tool), document.createTextNode(`(${m.args})`));
        const ret = el('div', 'ret', 'running');
        c.append(call, el('div', 'via', m.via), ret); log.append(c);
        log.scrollTop = log.scrollHeight;
        await wait(m.cls ? 1300 : 750);
        if (my !== token) return;
        c.classList.remove('pending'); ret.textContent = '→ ' + m.ret;
        log.scrollTop = log.scrollHeight;
        await wait(350);
      } else {
        const b = el('div', 'msg bot' + (m.who ? ' ' + m.who : ''));
        const p = el('p');
        b.append(el('span', 'who', WHO[m.who || 'local']), p); log.append(b);
        await wait(250);
        await stream(p, m.bot, my);
        await wait(300);
      }
    }
  }
  $$('[data-script]').forEach(b => b.addEventListener('click', () => play(b.dataset.script)));

  // ------------------------------------------------------------ memory: a made-up vault, searched with BM25
  const NOTES = [
    { name: 'Garden.md', type: 'project', body: 'Watering timer. Decision: water at 6:00 for 12 minutes; skip on rain days. Next: replace the drip line by the fence.' },
    { name: 'Decisions.md', type: 'log', body: 'Sample decision log. The garden watering timer moves from 7:00 to 6:00 because of the afternoon heat.' },
    { name: 'Bike.md', type: 'project', body: 'Rear brake squeals. Tried: cleaned the rotor. Next: new brake pads before the weekend ride.' },
    { name: 'Reading list.md', type: 'list', body: 'Queued: a book on sensors, one on chess endgames, and a novel for the train.' },
    { name: 'Trip.md', type: 'plan', body: 'Two nights away, train both ways. Pack the rain jacket and the charger.' },
  ];
  const words = s => (s.toLowerCase().match(/[a-z0-9:]+/g) || []);
  const docs = NOTES.map(n => words(n.name.replace('.md', '') + ' ' + n.body));
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;
  function bm25(q) {
    const terms = [...new Set(words(q))];
    return NOTES.map((n, i) => {
      let s = 0;
      for (const t of terms) {
        const df = docs.filter(d => d.includes(t)).length;
        if (!df) continue;
        const tf = docs[i].filter(w => w === t).length;
        const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
        s += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * docs[i].length / avg));
      }
      return { n, s };
    });
  }
  const results = $('#ag-mem-results');
  const note = $('#ag-mem-note');
  const q = $('#ag-mem-q');
  function showNote(n, query) {
    note.textContent = '';
    note.append(el('div', 'fm', `---\nstatus: active\ntype: ${n.type}\n---`), el('h4', null, n.name));
    const p = el('p');
    const hits = new Set(words(query || ''));
    n.body.split(/(\s+)/).forEach(part => {
      const w = part.toLowerCase().replace(/[^a-z0-9:]/g, '');
      if (w && hits.has(w)) p.append(el('mark', null, part)); else p.append(document.createTextNode(part));
    });
    note.append(p);
    $$('button', results).forEach(b => b.setAttribute('aria-current', String(b.dataset.name === n.name)));
  }
  function search() {
    const query = q.value.trim();
    const ranked = query ? bm25(query).filter(r => r.s > 0).sort((a, b) => b.s - a.s) : NOTES.map(n => ({ n, s: null }));
    results.textContent = '';
    if (!ranked.length) { results.append(el('li', 'mono', 'No match in the sample vault.')); return; }
    ranked.forEach(({ n, s }) => {
      const b = el('button'); b.type = 'button'; b.dataset.name = n.name;
      b.append(el('span', null, n.name), el('span', 'score', s == null ? n.type : 'BM25 ' + s.toFixed(2)));
      b.addEventListener('click', () => showNote(n, query));
      const li = el('li'); li.append(b); results.append(li);
    });
    showNote(ranked[0].n, query);
  }
  q.addEventListener('input', search);
  search();

  // ------------------------------------------------------------ agents: a sample Hermes job
  const jobLog = $('#ag-job-log');
  const JOB = [
    ['', 'job → ', 'Hermes Agent', ': find the 30th prime and check it with code'],
    ['', '', 'Hermes', ' · thinking on the shared local model'],
    ['', '', 'execute_code', ' → Docker sandbox, no host folders'],
    ['', 'stdout: ', '113', ''],
    ['ok', '✓ ', 'Hermes', ': the 30th prime is 113, checked by running code.'],
  ];
  async function runJob() {
    const my = ++token;
    setView('agents');
    $$('.ag-agents li').forEach(li => li.classList.toggle('lit', li.dataset.agent === 'hermes'));
    jobLog.textContent = '';
    for (const [cls, a, b, c] of JOB) {
      await wait(650);
      if (my !== token) return;
      const li = el('li', cls); li.append(document.createTextNode(a), el('b', null, b), document.createTextNode(c)); jobLog.append(li);
    }
  }
  $('#ag-job-run').addEventListener('click', runJob);
  JOB.forEach(([cls, a, b, c]) => { const li = el('li', cls); li.append(document.createTextNode(a), el('b', null, b), document.createTextNode(c)); jobLog.append(li); });

  // ------------------------------------------------------------ voice: one turn round the loop
  const states = $$('.ag-st');
  const now = $('#ag-st-now'), sub = $('#ag-st-sub'), said = $('#ag-said');
  const TURN = [
    [0, 'listening', 'open mic'],
    [1, 'wake word', '"Jarvis" heard, then dropped', 'you'],
    [2, 'hearing', 'Whisper transcribes'],
    [3, 'thinking', 'local model, streaming'],
    [4, 'speaking', 'Daniel · ≈0.7 s to first word', 'jarvis'],
    [5, 'follow-up', '20 s, no name needed'],
    [0, 'listening', 'open mic'],
  ];
  function setSaid(parts) {
    said.textContent = '';
    said.append(el('span', 'mono', 'sample turn'));
    if (parts.you) { const p = el('span'); p.append(el('b', null, 'You: '), document.createTextNode('"Jarvis, one line on Argus?"')); said.append(p); }
    if (parts.jarvis) { const p = el('span'); p.append(el('b', null, 'Jarvis: '), document.createTextNode('"It is the system I run on: Odysseus underneath, my memory and bridges on top."')); said.append(p); }
  }
  async function runTurn() {
    const my = ++token;
    setView('voice');
    const shown = {};
    for (const [i, a, b, who] of TURN) {
      if (my !== token) return;
      states.forEach(s => s.classList.toggle('on', +s.dataset.st === i));
      now.textContent = a; sub.textContent = b;
      if (who) { shown[who] = true; setSaid(shown); }
      await wait(1150);
    }
  }
  $('#ag-voice-run').addEventListener('click', runTurn);

  // ------------------------------------------------------------ evals: bars from the pass counts
  function fillBars() {
    $$('table.ag-evals td i').forEach(i => {
      const p = +i.dataset.p, n = +i.dataset.n;
      i.classList.toggle('miss', p < n);
      i.style.setProperty('--w', '0');
      requestAnimationFrame(() => requestAnimationFrame(() => i.style.setProperty('--w', String(p / n))));
    });
  }
  fillBars();

  // ------------------------------------------------------------ guided tour
  const STEPS = [
    { title: 'Jarvis, on a local model', text: 'Jarvis is a persona in the hub, running on Qwen3.6-35B-A3B on my laptop\'s GPU. Thinking stays off: 13/13 that way, 2.6 s median.', run: () => play('persona') },
    { title: 'Memory, through MCP', text: 'He searches and reads a plain-text vault through my memory server. This vault is made up; open Memory to search it.', run: () => play('memory') },
    { title: 'Hard jobs go to Claude', text: 'Routine work stays local. A multi-step job goes to Claude Code on my subscription, read-only and with no shell. Free cloud models are the fallback.', run: () => play('claude') },
    { title: 'Agents plugged in', text: 'Hermes, REA, Scrapling, VoiceStudio and Paperclip connect to the hub. Hermes runs code in a Docker sandbox: a code task took 7.9 s.', run: runJob },
    { title: 'Voice', text: 'Say "Jarvis" and talk. Whisper hears, the local model answers, Daniel speaks: about 0.7 s to the first word, mid-conversation.', run: runTurn },
    { title: 'Measured', text: '13 real tasks with deterministic checks. Thinking on lost three and took about eight times longer, so it stays off.', run: () => { token++; setView('evals'); fillBars(); } },
  ];
  const list = $('#tour-steps');
  const cap = $('#tour-caption');
  STEPS.forEach((s, i) => {
    const b = el('button'); b.type = 'button'; b.dataset.step = i; b.setAttribute('aria-current', 'false');
    b.append(el('span', 'n', String(i + 1).padStart(2, '0')), el('span', 't', s.title));
    const li = el('li'); li.append(b); list.append(li);
  });
  let current = -1;
  function go(i, fromList) {
    current = (i + STEPS.length) % STEPS.length;
    $$('button', list).forEach((b, k) => b.setAttribute('aria-current', k === current ? 'step' : 'false'));
    $('.cap-count', cap).textContent = `Step ${current + 1} of ${STEPS.length}`;
    $('.cap-title', cap).textContent = STEPS[current].title;
    $('.cap-text', cap).textContent = STEPS[current].text;
    STEPS[current].run();
    const r = hub.getBoundingClientRect();
    if (fromList && (r.top < 0 || r.top > window.innerHeight * 0.5)) cap.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  list.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) go(+b.dataset.step, true); });
  $('[data-tour="prev"]', cap).addEventListener('click', () => go(current < 0 ? 0 : current - 1));
  $('[data-tour="next"]', cap).addEventListener('click', () => go(current + 1));
})();
