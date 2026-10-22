/* Fit check on the Jarvis page: the pasted job description goes to /api/fit, which streams the same events as
   the chat (sources, then the requirements it found, then tokens). Each answer line is shown as it arrives;
   lines the site cannot support ("not shown on the site") are marked as gaps rather than hidden. */
(function () {
  const form = document.getElementById('fit-form'), jd = document.getElementById('fit-jd');
  const out = document.getElementById('fit-out'), count = document.getElementById('fit-count');
  const button = form.querySelector('button');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let busy = false;

  jd.addEventListener('input', () => { count.textContent = jd.value.length + ' / 4000'; });

  function render(text, sources) {
    const byN = new Map(sources.map(s => [s.n, s]));
    const cite = line => esc(line).replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (m, list) => list.split(',').map(n => { const s = byN.get(+n); return s ? `<a class="cite" href="${esc(s.url)}" title="${esc(s.title)}">${+n}</a>` : ''; }).join(''));
    return text.split('\n').filter(l => l.trim()).map(l => {
      const item = /^\s*[-*•]\s+/.test(l), body = l.replace(/^\s*[-*•]\s+/, '');
      if (!item) return `<p class="fit-end">${cite(body)}</p>`;
      const gap = /not shown on the site/i.test(body);
      return `<p class="fit-line${gap ? ' gap' : ''}"><span class="fit-mark" aria-hidden="true">${gap ? '○' : '●'}</span><span>${cite(body)}</span></p>`;
    }).join('');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = jd.value.trim();
    if (busy) return;
    out.hidden = false;
    if (text.length < 80) { out.innerHTML = '<p class="fit-end">Please paste the job description: a few lines at least.</p>'; return; }
    busy = true; button.disabled = true; button.textContent = 'Checking…';
    out.innerHTML = '<p class="mono">Reading the requirements…</p>';
    let answer = '', sources = [], reqs = [];
    try {
      const res = await fetch('/api/fit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jd: text }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'The fit check is unavailable just now.'); }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const evt = buf.slice(0, cut); buf = buf.slice(cut + 2);
          const type = (evt.match(/^event: (.*)$/m) || [])[1], data = JSON.parse((evt.match(/^data: (.*)$/m) || [, 'null'])[1]);
          if (type === 'sources') sources = data;
          else if (type === 'requirements') { reqs = data; out.innerHTML = `<p class="mono">${reqs.length} requirements found. Checking each against the site…</p>`; }
          else if (type === 'token') { answer += data; out.innerHTML = render(answer, sources); }
          else if (type === 'error') throw new Error(data.error);
        }
      }
      const used = sources.filter(s => new RegExp('\\[[\\d,\\s]*\\b' + s.n + '\\b[\\d,\\s]*\\]').test(answer));
      out.innerHTML = render(answer.trim() || 'No answer came back. Please try again.', sources) +
        (used.length ? '<div class="j-src">' + used.map(s => `<a href="${esc(s.url)}">${s.n} · ${esc(s.title)}</a>`).join('') + '</div>' : '') +
        '<p class="mono fit-note">Written by a language model from this site\'s pages only. It can be wrong: follow the links.</p>';
    } catch (err) {
      out.innerHTML = `<p class="fit-end err">${esc(err.message || String(err))}</p>`;
    } finally {
      busy = false; button.disabled = false; button.textContent = 'Check the fit';
    }
  });
})();
