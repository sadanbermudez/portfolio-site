/* Counts one page view (server/stats.js): the page, the referring site and a ?r= tag from a link I sent. No cookies,
   nothing stored about the visitor; skipped when the browser asks not to be tracked (Do Not Track or Global Privacy
   Control). The tag is kept for the rest of the visit in sessionStorage, and removed from the address bar so a
   shared link does not carry it on. Details: /privacy. */
(function () {
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    var url = new URL(location.href), tag = url.searchParams.get('r');
    if (tag && /^[a-z0-9-]{1,40}$/i.test(tag)) {
      try { sessionStorage.setItem('ref-tag', tag); } catch (e) { /* storage blocked: the tag counts on this page only */ }
      url.searchParams.delete('r');
      history.replaceState(history.state, '', url.pathname + (url.search ? url.search : '') + url.hash);
    } else {
      try { tag = sessionStorage.getItem('ref-tag'); } catch (e) { tag = null; }
    }
    fetch('/api/hit', {
      method: 'POST', keepalive: true, credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname, ref: document.referrer || '', tag: tag || '' })
    }).catch(function () {});
  } catch (e) { /* counting must never break a page */ }
})();
