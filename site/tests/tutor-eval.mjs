// Evaluation of the live Spanish tutor against a running site: node site/tests/tutor-eval.mjs [base URL]
// Correct sentences must not get a correction; sentences with errors must, with the right forms, and no reply may
// show wrong Spanish as a correction. Each reply is judged twice: the model's own verdict, and what the page shows
// (the app's parser plus the web echo filter).
import { parseTutorReply, withoutEchoes } from '../apps/spanish-tutor/logic/parser.js';
import { withHiddenNote, pendingExpressionsNote } from '../apps/spanish-tutor/logic/keywords.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8815';
const RUNS = +(process.env.RUNS || 4);
const CLARA = 's_verbos_ser_estar_clara_atocha';
const OPEN = '¡Hola! Estoy en la estación de Atocha, pero no conozco a Clara. ¿Cómo es? ¿Y dónde nos encontramos?';
const NOTE = pendingExpressionsNote('Está + estado o lugar; La cena es en…');
// fix: right forms, at least one of which the shown correction must contain; NEVER: wrong Spanish the page must
// never show as a correction (this is what catches a correction that keeps one of her errors).
const NEVER = [/est[áa] (alta|morena|ingeniera)/i, /\bera muy cansada/i, /\bes (muy )?cansada/i, /\b(es|soy) de buen humor/i];
const CASES = [
  { name: 'role-play, correct', lesson: CLARA, text: 'Clara es alta y muy simpática, pero hoy está cansada. La cena es en casa de Marta.', wrong: false },
  { name: 'role-play, correct, short', lesson: CLARA, text: 'Es morena y es de Sevilla. Nos vemos en la cafetería.', wrong: false },
  { name: 'role-play, ser/estar errors', lesson: CLARA, text: 'Clara está ingeniera y es de Sevilla. Hoy es muy cansada.', wrong: true, fix: [/es ingeniera/i, /est[áa] muy cansada/i] },
  { name: 'free talk, correct', lesson: 'free', text: 'Hoy estoy contenta porque he terminado el trabajo.', wrong: false },
  { name: 'free talk, errors', lesson: 'free', text: 'Ayer yo era muy cansada y hoy es de buen humor.', wrong: true, fix: [/estaba muy cansada/i, /estoy de buen humor/i] },
];

async function ask(c) {
  const messages = c.lesson === 'free' ? [] : [{ role: 'assistant', content: '✔\n' + OPEN }];
  messages.push({ role: 'user', content: c.lesson === 'free' ? c.text : withHiddenNote(c.text, NOTE) });
  const res = await fetch(BASE + '/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson: c.lesson, messages }), signal: AbortSignal.timeout(120000) });
  if (!res.ok) return 'HTTP ' + res.status;
  let text = '';
  for (const evt of (await res.text()).split('\n\n')) { const m = evt.match(/^event: token\ndata: (.*)$/m); if (m) text += JSON.parse(m[1]); }
  return text.trim();
}

let rawOk = 0, shownOk = 0, n = 0;
for (const c of CASES) {
  for (let k = 0; k < RUNS; k++) {
    let reply; try { reply = await ask(c); } catch (err) { reply = 'ERROR ' + err.name; }
    const parsed = parseTutorReply(reply), shown = withoutEchoes(parsed, c.text);
    const answered = reply && !/^(HTTP|ERROR) /.test(reply);   // silence or an error is never a right verdict
    const raw = answered && !!parsed.correction === c.wrong;
    const fixes = [shown.correction, ...(shown.correction ? shown.more : [])].filter(Boolean).map(x => x.corrected).join(' | ');
    // The prompt allows "at most 2" corrections per turn, so one right fix is enough; a wrong form shown is never allowed.
    const missing = c.fix && !c.fix.some(re => re.test(fixes)) ? c.fix : [], taught = NEVER.filter(re => re.test(fixes));
    const view = answered && !!shown.correction === c.wrong && !missing.length && !taught.length;
    rawOk += raw; shownOk += view; n++;
    const why = [...missing.map(re => 'missed ' + re), ...taught.map(re => 'TAUGHT WRONG ' + re)].join('; ');
    console.log(`${view ? 'ok  ' : 'FAIL'} ${raw ? '' : '(model verdict wrong) '}${c.name}: ${reply.replace(/\s+/g, ' ').slice(0, 140)}${why ? '\n     ' + why : ''}`);
    await new Promise(r => setTimeout(r, 9000));             // stay under the 8-per-minute rate limit (fast models hit it at 7.6 s)
  }
}
console.log(`\nmodel verdict right ${rawOk}/${n} · page shows the right verdict and correction ${shownOk}/${n}`);
process.exit(shownOk === n ? 0 : 1);
