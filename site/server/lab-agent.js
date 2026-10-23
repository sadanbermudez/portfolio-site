/* The live lab agent (POST /api/lab): a model works the simulated bench in lab-sim.js through its tools, one
   JSON reply per turn, and the Worker grades its answer against the hidden photon order, which the model and
   the visitor never see until the end. Pure logic here, so it is tested without Workers AI
   (site/tests/lab-agent.test.mjs); the route and the score store are in worker.js. */
import { TOOLS, callTool, createBench, WAVELENGTHS } from '../lab-sim.js';

export const LAB = { turns: 7, calls: 48, callsPerTurn: 12, maxTokens: 500, dailyRuns: 40 };

export const LAB_SYSTEM = `You operate a simulated optics bench through tools. An 800 nm femtosecond laser excites a photosensitiser in solution; an InGaAs spectrometer (900 to 1700 nm) looks for singlet-oxygen emission near 1270 nm.

Question: is the emission excited by one-photon or by two-photon absorption? The emitted signal scales as laser power to the power n, where n is the number of photons absorbed. You must measure it.

Work like an experimentalist: check bench_status first; arm_laser and laser_emission(on=true) to measure, off between powers if you like. Keep the detector below saturation (acquire_spectrum warns you; lower the power or the integration time). Weak signals need longer integration. Measure several powers over a wide range, then call fit_power_dependence with their run_ids. Quantify with the fit, not by eye. Finish with safe_state. Safety limits are enforced by the bench and cannot be changed.

Tools:
${Object.entries(TOOLS).map(([k, v]) => '- ' + k + ': ' + v).join('\n')}

Reply with ONE JSON object and nothing else, in one of two forms.
To act (up to ${LAB.callsPerTurn} calls, run in order; you get every result back):
{"note": "one short sentence on what you are doing", "calls": [{"tool": "set_laser_power", "args": {"power_mw": 40}}, {"tool": "acquire_spectrum", "args": {"label": "P40"}}]}
When the fit answers the question:
{"answer": {"photon_order": 1 or 2, "exponent": number, "exponent_err": number, "reason": "one sentence"}}
You have ${LAB.turns} replies and ${LAB.calls} tool calls in all.`;

// The first JSON object in a reply (models sometimes wrap it in a code fence or add words around it).
export function parseReply(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { const v = JSON.parse(s.slice(start, i + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
    }
  }
  return null;
}

// What the visitor sees for a call, on one line.
export function summary(tool, result) {
  if (result.error) return 'refused: ' + result.error;
  switch (tool) {
    case 'acquire_spectrum': return `${result.run_id} · ${result.power_mw} mW · max ${Math.round(result.max_counts).toLocaleString('en')}` + (result.saturated_pixels ? ' · SATURATED' : '');
    case 'analyse_peak': return result.ok ? `area ${Math.round(result.area_counts_nm).toLocaleString('en')} ± ${Math.round(result.area_err_counts_nm).toLocaleString('en')} · SNR ${result.snr}` + (result.saturated ? ' · saturated' : '') : 'fit failed';
    case 'fit_power_dependence': return result.ok ? `n = ${result.exponent} ± ${result.exponent_err} from ${result.points} runs` + (result.excluded_runs.length ? ` · excluded ${result.excluded_runs.join(', ')}` : '') : result.error;
    case 'set_laser_power': return result.power_mw + ' mW';
    case 'laser_emission': return result.emitting ? 'emitting' : 'off';
    case 'arm_laser': return 'armed';
    case 'safe_state': return 'safe';
    case 'configure_spectrometer': return `${result.integration_ms} ms × ${result.averages}`;
    default: return 'ok';
  }
}

// Every 4th pixel of a spectrum, rounded: enough to draw it (128 points).
const thin = counts => counts.filter((_, i) => i % 4 === 0).map(Math.round);
export const THIN_WAVELENGTHS = WAVELENGTHS.filter((_, i) => i % 4 === 0).map(w => Math.round(w));

/* One run. `ask(messages)` returns the model's reply text and its token usage; `emit(event, data)` streams to
   the page. Returns the record that is stored and graded. */
export async function runAgent({ ask, emit, photonOrder, seed }) {
  const lab = createBench({ photonOrder, seed });
  const messages = [{ role: 'system', content: LAB_SYSTEM }, { role: 'user', content: 'The bench is ready. Begin.' }];
  const rec = { truth: photonOrder, answer: null, exponent: null, turns: 0, calls: 0, refused: 0, safe: false, tokensIn: 0, tokensOut: 0, ended: 'budget' };
  for (let turn = 1; turn <= LAB.turns; turn++) {
    rec.turns = turn;
    const { text, usage } = await ask(messages);
    rec.tokensIn += (usage && usage.prompt_tokens) || 0; rec.tokensOut += (usage && usage.completion_tokens) || 0;
    messages.push({ role: 'assistant', content: String(text || '').slice(0, 4000) });
    const reply = parseReply(text);
    if (reply && reply.answer && typeof reply.answer === 'object') {
      const order = Number(reply.answer.photon_order);
      rec.answer = order === 1 || order === 2 ? order : null;
      rec.exponent = Number.isFinite(Number(reply.answer.exponent)) ? Number(reply.answer.exponent) : null;
      emit('answer', { photon_order: rec.answer, exponent: rec.exponent, exponent_err: Number(reply.answer.exponent_err) || null, reason: String(reply.answer.reason || '').slice(0, 300) });
      rec.ended = 'answer';
      break;
    }
    const calls = reply && Array.isArray(reply.calls) ? reply.calls.slice(0, LAB.callsPerTurn) : null;
    if (!calls || !calls.length) {
      emit('note', { turn, text: 'reply was not a valid action; asked again' });
      messages.push({ role: 'user', content: 'That was not one JSON object in the required form. Reply with {"calls": [...]} or {"answer": {...}} only.' });
      continue;
    }
    if (reply.note) emit('note', { turn, text: String(reply.note).slice(0, 200) });
    const results = [];
    for (const c of calls) {
      if (rec.calls >= LAB.calls) { results.push({ tool: c && c.tool, result: { error: 'tool-call budget used up: give your answer' } }); break; }
      rec.calls++;
      const tool = String(c && c.tool || ''), args = c && typeof c.args === 'object' && c.args ? c.args : {};
      const result = callTool(lab, tool, args);
      if (result.error) rec.refused++;
      const event = { i: rec.calls, tool: tool.slice(0, 40), args: JSON.stringify(args).slice(0, 120), summary: summary(tool, result) };
      if (tool === 'acquire_spectrum' && !result.error) event.spectrum = { power_mw: result.power_mw, counts: thin(lab.runs.get(result.run_id).counts) };
      if (tool === 'fit_power_dependence' && result.ok) event.fit = { exponent: result.exponent, exponent_err: result.exponent_err, table: result.table };
      emit('call', event);
      results.push({ tool, result });
    }
    messages.push({ role: 'user', content: 'Results:\n' + JSON.stringify(results) + `\n(${LAB.turns - turn} replies and ${LAB.calls - rec.calls} tool calls left.)` });
  }
  rec.safe = !lab.state.emitting && !lab.state.armed;
  if (!rec.safe) lab.bench.safe_state({ reason: 'end of run' });       // the Worker never leaves the laser on, whatever the agent did
  rec.correct = rec.answer === rec.truth;
  return rec;
}

// Wilson score interval for k successes in n trials (95%).
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
