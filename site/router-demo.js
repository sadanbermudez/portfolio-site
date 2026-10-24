/* "Which brain would Argus use?": the learned router (router-core.js) running in the visitor's browser on what they
   type. Nothing is sent anywhere; the bars are the router's probabilities for each route, updated as they type. */
(function () {
  var box = document.getElementById('rt-text'), out = document.getElementById('rt-out'), verdict = document.getElementById('rt-verdict');
  if (!box || !window.RouterCore || !window.ROUTER_MODEL) return;
  var model = window.RouterCore.load(window.ROUTER_MODEL);
  var INFO = {
    local: ['The local model', 'Qwen3.6 on the laptop answers it: quick, free, and nothing leaves the machine.'],
    free: ['A free cloud model', 'Public text that needs a stronger writer or reasoner goes to a free model, through a bridge that has no tools, files or memory.'],
    claude: ['Claude Code', 'Real work on files, code or the web goes to Claude Code on my subscription, read-only unless I allow edits, never a shell.'],
    private: ['Private: kept local', 'Personal data never goes to a free cloud model. Argus keeps it on the laptop.']
  };
  function render() {
    var text = box.value.trim();
    if (!text) { out.innerHTML = ''; verdict.textContent = 'Type a request, or pick an example.'; return; }
    var r = window.RouterCore.route(model, text);
    out.innerHTML = model.labels.map(function (l, i) {
      var pct = Math.round(r.probs[i] * 100);
      return '<div class="rt-row' + (l === r.route ? ' on' : '') + '"><span class="rt-name">' + INFO[l][0] + '</span>' +
        '<span class="rt-bar"><i style="width:' + pct + '%"></i></span><span class="rt-pct">' + pct + '%</span></div>';
    }).join('');
    verdict.innerHTML = '<strong>' + INFO[r.route][0] + '</strong> · ' + INFO[r.route][1];
  }
  var timer = null;
  box.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(render, 120); });
  document.querySelectorAll('[data-rt]').forEach(function (b) {
    b.addEventListener('click', function () { box.value = b.dataset.rt; render(); });
  });
  render();
})();
