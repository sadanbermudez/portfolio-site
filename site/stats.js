/* Private visitor statistics: asks /api/stats with the key typed in (kept only for this tab, in sessionStorage) and
   draws the report as tables. Nothing here is public: without the key the API returns nothing. */
(function () {
  var form = document.getElementById('st-form'), keyIn = document.getElementById('st-key'), daysIn = document.getElementById('st-days');
  var out = document.getElementById('st-out'), msg = document.getElementById('st-msg');
  if (!form) return;
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function table(title, rows, cols) {
    if (!rows || !rows.length) return '<h2>' + esc(title) + '</h2><p class="mono">none yet</p>';
    return '<h2>' + esc(title) + '</h2><div class="table-scroll" tabindex="0"><table class="stack cols"><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + cols.map(function (c, i) {
        return '<td' + (i ? ' class="n" data-label="' + esc(c[1]) + '"' : '') + '>' + esc(r[c[0]]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function load(key) {
    msg.textContent = 'Loading…';
    fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key, days: +daysIn.value || 30 }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { msg.textContent = res.j.error || 'Refused.'; out.innerHTML = ''; return; }
        try { sessionStorage.setItem('stats-key', key); } catch (e) { /* this tab only, if allowed */ }
        var s = res.j, by = [['k', ''], ['visitors', 'Visitors'], ['views', 'Views']];
        (s.recentTags || []).forEach(function (r) { r.at = String(r.at).replace('T', ' ').slice(0, 16); });   // UTC, to the minute
        msg.textContent = 'Since ' + s.since + ': ' + s.total.visitors + ' visitors, ' + s.total.views + ' page views.';
        out.innerHTML = table('Tagged visits (links I sent)', s.recentTags, [['at', 'When (UTC)'], ['tag', 'Tag'], ['path', 'Page'], ['country', 'Country'], ['network', 'Network'], ['device', 'Device']]) +
          table('By tag', s.tags, by) + table('By day', s.daily, [['k', 'Day'], ['visitors', 'Visitors'], ['views', 'Views']]) +
          table('Pages', s.pages, by) + table('Referring sites', s.refs, by) + table('Countries', s.countries, by) +
          table('Networks', s.networks, by) + table('Devices', s.devices, by);
      })
      .catch(function () { msg.textContent = 'The statistics are unavailable just now.'; });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); load(keyIn.value.trim()); });
  try { var k = sessionStorage.getItem('stats-key'); if (k) { keyIn.value = k; load(k); } } catch (e) { /* no storage */ }
})();
