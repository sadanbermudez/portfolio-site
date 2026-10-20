/* Engine case study: a time-budget panel that redraws at each diagnosis step. Every bar is a
   measured value from 19 to 20 October 2026 (seconds unless noted). */
(function () {
  var STEPS = [
    { scale: 3, unit: 's', rows: [
        { name: 'llama-bench, raw engine, 16 tokens', segs: [[0.11, 'prompt', 'prompt 0.11']] },
        { name: 'llama-server, the same 16 tokens', segs: [[2.5, 'other', 'up to 2.5 s, unexplained']] }],
      verdict: 'The GPU kernels are fast. The time goes somewhere inside the server.' },
    { scale: 3, unit: 's', rows: [
        { name: 'batch size changed', segs: [[2.5, 'other', 'no change']] },
        { name: 'context size changed', segs: [[2.5, 'other', 'no change']] },
        { name: 'slot count changed', segs: [[2.5, 'other', 'no change']] }],
      verdict: 'Settings ruled out on a separate test server.' },
    { scale: 3, unit: 's', rows: [
        { name: 'one voice request, timestamped log', segs: [[0.11, 'prompt', ''], [0.6, 'snap', 'snapshot 0.6'], [0.6, 'snap', 'snapshot 0.6'], [0.2, 'other', '']] }],
      verdict: 'Two snapshot saves of about 0.6 s each make up the delay.' },
    { scale: 25, unit: 's', rows: [
        { name: 'voice, snapshots off', segs: [[0.5, 'good', '']] },
        { name: 'agent turn, snapshots on (default)', segs: [[3.5, 'other', '3.5']] },
        { name: 'agent turn, snapshots off', segs: [[21, 'snap', 'reprocesses its 13,700-token prompt: 21 s']] }],
      verdict: 'Voice 15 times faster, the agent 6 times slower. Reverted after 23 minutes.' },
    { scale: 3, unit: 's', rows: [
        { name: 'newer engine build', segs: [[0.11, 'prompt', ''], [0.6, 'snap', '0.6'], [0.6, 'snap', '0.6'], [0.2, 'other', '']] },
        { name: 'four Vulkan switches', segs: [[0.11, 'prompt', ''], [0.6, 'snap', '0.6'], [0.6, 'snap', '0.6'], [0.2, 'other', '']] }],
      verdict: 'No change: the cost is in the code, not the configuration.' },
    { scale: 0.7, unit: 's', rows: [
        { name: 'one snapshot, stock', segs: [[0.65, 'snap', '0.65 s']] },
        { name: 'one snapshot, skip redundant GPU waits', segs: [[0.61, 'snap', '0.61 s']] }],
      verdict: 'Almost nothing saved. Patch discarded.' },
    { scale: 8, unit: 's', rows: [
        { name: 'reading 880 MB of state: GPU waits', segs: [[0.014, 'wait', '']] },
        { name: 'reading 880 MB of state: CPU copy', segs: [[7.738, 'snap', '7,738 ms · 114 MB/s']] }],
      verdict: 'The waits are 14 ms. The copy is the problem: the CPU reads GPU memory it cannot cache.' },
    { scale: 8, unit: 's', rows: [
        { name: 'reading 880 MB, before', segs: [[7.738, 'snap', '7,738 ms']] },
        { name: 'reading 880 MB, via cached staging buffer', segs: [[0.553, 'good', '553 ms']] },
        { name: 'one snapshot', segs: [[0.03, 'good', '']], note: '0.61 s → 0.03 s' }],
      verdict: 'One added condition. Snapshots 20 times faster, voice 3 s → 0.7 s, identical output.' }
  ];
  var panel = document.getElementById('budget');
  var title = document.getElementById('budget-title');
  if (!panel) return;

  function fmt(v) { return v < 0.1 ? (v * 1000).toFixed(0) + ' ms' : v.toFixed(v < 1 ? 2 : 1) + ' s'; }
  function render(i) {
    var s = STEPS[i];
    title.textContent = 'step ' + (i + 1) + ' of 8 · scale 0 to ' + s.scale + ' s';
    var html = '';
    s.rows.forEach(function (r) {
      var total = r.segs.reduce(function (a, g) { return a + g[0]; }, 0);
      html += '<div class="row"><div class="name"><span>' + r.name + '</span><b>' + (r.note || fmt(total)) + '</b></div><div class="track">';
      r.segs.forEach(function (g) {
        html += '<div class="seg k-' + g[1] + '" data-w="' + Math.max(0.4, 100 * g[0] / s.scale) + '">' + g[2] + '</div>';
      });
      html += '</div></div>';
    });
    html += '<div class="scale"><span>0</span><span>' + s.scale / 2 + ' s</span><span>' + s.scale + ' s</span></div>';
    html += '<p class="verdict">' + s.verdict + '</p>';
    panel.innerHTML = html;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        panel.querySelectorAll('.seg').forEach(function (el) { el.style.width = el.dataset.w + '%'; });
      });
    });
  }
  render(0);
  window.scrollyChapters(document.querySelectorAll('.stepper .st'), function (el, i) { render(i); });
})();
