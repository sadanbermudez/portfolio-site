// Tests for the Spanish Tutor web demo's ports of the Android app's logic: node site/tests/spanish-tutor.test.mjs
// Expectations come from the app's own JVM tests (SearchIndexTest, QuizGraderTest, TutorResponseParserTest,
// TutorPromptBuilderTest) where they exist.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SearchIndex, SearchText, buildIndex, foldEs } from '../apps/spanish-tutor/logic/search.js';
import { grade, fillSolution, AnswerNormalizer, FORMATS } from '../apps/spanish-tutor/logic/grader.js';
import { KeywordMatcher, normalise, withHiddenNote, pendingExpressionsNote, NOTE_PREFIX } from '../apps/spanish-tutor/logic/keywords.js';
import { parseTutorReply, withoutEchoes } from '../apps/spanish-tutor/logic/parser.js';
import { starsFor, levelFor, streak, emptyProgress, finishQuiz, answer, weakPoints, TranscriptIndex, buildLexicon, segmentWords } from '../apps/spanish-tutor/logic/progress.js';
import { icuRegex } from '../apps/spanish-tutor/logic/regex.js';
import { tutorSystemPrompt, TUTOR_LESSONS, openingLine } from '../server/tutor-prompt.js';

const ok = name => console.log('ok  ' + name);
const DATA = fileURLToPath(new URL('../apps/spanish-tutor/data/', import.meta.url));
const json = p => JSON.parse(readFileSync(DATA + p, 'utf8'));

// ── search: the pipeline (SearchIndexTest.textPipeline) ──
assert.deepEqual(SearchText.terms('¿Qué tal, Ñandú?'), ['que', 'tal', 'ñandu']);
assert.deepEqual(SearchText.terms('Qu\'est-ce que c’est ?'), ['qu', 'est', 'ce', 'que', 'c', 'est']);
assert.deepEqual(SearchText.terms('«subjonctif»'), ['subjonctif']);
assert.deepEqual(SearchText.terms('Cœur naïf'), ['coeur', 'naif']);
assert.deepEqual(SearchText.terms('tildes PRONOMS más dos unos'), ['tilde', 'pronom', 'mas', 'dos', 'uno']);
assert.equal(SearchText.nfold('español'), 'espanol');
assert.equal(SearchText.distance('subjuntibo', 'subjuntivo', 2), 1);
assert.equal(SearchText.distance('subjunitvo', 'subjuntivo', 2), 1);
assert.equal(SearchText.distance('pretrito', 'preterito', 1), 1);
assert.equal(SearchText.distance('pretrto', 'preterito', 1), 2);
assert.equal(foldEs('Pretérito ESPAÑA'), 'preterito españa');
ok('search text pipeline matches the app (accents, ñ, apostrophes, stem, typo distance)');

// ── search: the app's hand-made index (SearchIndexTest.small) ──
const doc = (kind, id, title, ...rest) => {
  const last = rest[rest.length - 1];
  const cefr = last && typeof last === 'object' && !Array.isArray(last) ? rest.pop().cefr : null;
  return { kind, id, title, subtitle: null, emoji: null, cefr, fields: [[title, kind === 'ANSWER' ? 3 : kind === 'TOPIC' ? 2 : 1.5], ...rest] };
};
const small = new SearchIndex([
  doc('ANSWER', 'd_ser_estar', '¿Cuál es la diferencia entre ser y estar?', ['ser o estar', 3], ['différence entre ser et estar', 3], ['Quelle est la différence entre ser et estar ?', 3], ['Ser dice qué es algo; estar dice dónde o cómo está.', 1], { cefr: 'A1' }),
  doc('ANSWER', 'd_hay_esta', '¿Hay o está?', ['hay o está', 3], ['il y a', 3], ['Hay para existir, está para situar con el, la.', 1], { cefr: 'A1' }),
  doc('ANSWER', 'd_estar_gerundio', '¿Como o estoy comiendo?', ['estar + gerundio', 3], ['être en train de', 3], ['Estar + gerundio para lo que pasa ahora.', 1], { cefr: 'A2' }),
  doc('ANSWER', 'd_por_para', '¿Por o para?', ['por o para', 3], ['por ou para', 3], ['Por mira hacia atrás (causa); para mira hacia delante (finalidad).', 1], { cefr: 'B1' }),
  doc('ANSWER', 'd_por_que', '¿Por qué país lleva tilde?', ['tilde en país', 3], ['Por el hiato.', 1], { cefr: 'A2' }),
  doc('ANSWER', 'd_subj', '¿Cuándo se usa el subjuntivo?', ['usos del subjuntivo', 3], ['Deseo, emoción, duda: subjuntivo.', 1], { cefr: 'B1' }),
  doc('ANSWER', 'd_manana', '¿Mañana o la mañana?', ['mañana', 3], ['demain ou le matin', 3], { cefr: 'A1' }),
  doc('ANSWER', 'd_b_v', '¿Se pronuncian igual la b y la v?', ['b y v', 3], ['b et v', 3], ['Sí: la b y la v suenan igual.', 1], { cefr: 'A1' }),
  doc('ANSWER', 'd_hola', '¿Cómo se saluda?', ['comment on dit bonjour', 3], ['Hola, buenos días.', 1], { cefr: 'A1' }),
  doc('ANSWER', 'd_correo', '¿Cómo empiezo un correo?', ['Querida Ana: gracias por tu carta.', 0.25], { cefr: 'A2' }),
  doc('TOPIC', 'tp_cartas', 'Cartas y correos', ['escribir una carta formal', 1], { cefr: 'B1' }),
  doc('TOPIC', 'tp_subj', 'Subjuntivo: deseos y emociones', ['subjuntivo presente', 1], { cefr: 'B2' }),
  doc('TOPIC', 'tp_ser_estar_b2', 'Ser o estar', ['ser estar adjetivos', 1], { cefr: 'B2' }),
  doc('TOPIC', 'tp_ser_estar_a1', 'Ser o estar', ['ser estar adjetivos', 1], { cefr: 'A1' }),
  doc('TOPIC', 'tp_pasado', 'Pretérito perfecto e indefinido', ['pasado perfecto indefinido', 1], { cefr: 'B2' }),
  doc('TOPIC', 'tp_falsos', 'Falsos amigos del francés', ['palabras trampa', 1], { cefr: 'B1' }),
  doc('TOPIC', 'tp_amigo', 'Escribir a un amigo', ['carta a un amigo', 1], { cefr: 'B1' }),
  doc('LESSON', 'g_subj', 'Imperfecto de subjuntivo: formas', ['Gramática Grammaire', 0.5], { cefr: 'B2' }),
  doc('LESSON', 'v_espanol', 'El español de la calle', ['Vocabulario Vocabulaire', 0.5], { cefr: 'B2' }),
]);
const ids = r => [...r.answers, ...r.topics, ...r.lessons].map(h => h.id);
let r = small.search('ser o estar');
assert.equal(r.answers[0].id, 'd_ser_estar');
assert.deepEqual(r.topics.slice(0, 2).map(h => h.id), ['tp_ser_estar_a1', 'tp_ser_estar_b2']);   // equal topics: lower level first
assert.equal(small.search('por o para').answers[0].id, 'd_por_para');
assert.equal(small.search('Différence entre SER et ESTAR').answers[0].id, 'd_ser_estar');
ok('exact alias first, groups separate, lower CEFR breaks ties');
assert.ok(ids(small.search('subj')).includes('d_subj'));
assert.equal(small.search('ser o est').answers[0].id, 'd_ser_estar');
assert.deepEqual(ids(small.search('subj')), ids(small.search('subj ')));
assert.ok(small.search('subj?').isEmpty);
assert.ok(ids(small.search('ami')).includes('tp_amigo'));
assert.ok(small.search('amis').isEmpty);
assert.ok(small.search('su').isEmpty);
ok('search as you type: prefix on the unfinished last word only');
assert.ok(ids(small.search('subjuntibo')).includes('d_subj'));
assert.ok(ids(small.search('subjunitvo')).includes('d_subj'));
assert.ok(ids(small.search('pretérito indefinodo')).includes('tp_pasado'));
assert.ok(small.search('sirr').isEmpty);
assert.equal(small.search('manana').answers[0].id, 'd_manana');
assert.ok(ids(small.search('espanol')).includes('v_espanol'));
ok('typos (distance 1 or 2) and words typed without ñ');
const subj = ids(small.search('subjonctif'));
assert.ok(subj.includes('tp_subj') && subj.includes('g_subj') && subj.includes('d_subj'));
assert.ok(small.search('être').answers.map(h => h.id).includes('d_ser_estar'));
assert.equal(small.search('il y a').answers[0].id, 'd_hay_esta');
assert.ok(ids(small.search('passé composé')).includes('tp_pasado'));
const faux = ids(small.search('faux amis'));
assert.ok(faux.includes('tp_falsos') && !faux.includes('tp_amigo'));
assert.equal(small.search('comment on dit mañana').answers[0].id, 'd_manana');
assert.equal(small.search('comment on dit').answers[0].id, 'd_hola');
ok('French queries expand to Spanish; French filler words weigh little');
r = small.search('cartas');
assert.equal(r.topics[0].id, 'tp_cartas');
assert.ok(r.answers.every(h => h.id !== 'd_correo'));
assert.equal(small.search('correo').answers[0].id, 'd_correo');
assert.deepEqual(ids(small.search('b y v')), ['d_b_v']);
assert.deepEqual(ids(small.search('v o b')), ['d_b_v']);
assert.equal(small.search('B et V ?').answers[0].id, 'd_b_v');
assert.ok(small.search('b y z').isEmpty);
for (const q of ['', 'e', '¡¿!?', 'a o', 'zzzzqqqq']) assert.ok(small.search(q).isEmpty, q);
assert.equal(small.search('   ').query, '');
assert.equal(small.lookup('tp_subj').title, 'Subjuntivo: deseos y emociones');
assert.equal(small.lookup('nope'), null);
ok('cross-group cut, single letters, empty queries, lookup');

// ── search: the real 223 FAQ answers (the app's everyFaqEntryIsFoundByItsQuestionAndAliases) ──
const faqs = readdirSync(DATA + 'faq').map(f => json('faq/' + f)).sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1));
assert.ok(faqs.every(d => d.author === 'Claude'), 'every FAQ file used by the demo is authored by Claude');
const topic = json('topics/tp_verbos_ser_estar.json');
const lessonFiles = readdirSync(DATA + 'lessons').map(f => json('lessons/' + f));
assert.ok([topic, ...lessonFiles].every(d => d.author === 'Claude'));
const real = buildIndex(faqs, [topic], lessonFiles.map(l => ({ id: l.id, type: l.type, title: l.title.es, cefr: l.cefr, status: l.status })));
assert.equal(real.search('ser o estar').answers[0].id, 'd_ser_estar');
assert.ok(real.search('différence entre ser et estar').answers.slice(0, 2).some(h => h.id === 'd_ser_estar'));
assert.equal(real.search('por o para').answers[0].id, 'd_por_para');
assert.ok(real.search('solo tilde').answers.slice(0, 2).some(h => h.id === 'd_solo_tilde'));
assert.equal(real.search('constipado').answers[0].id, 'd_constipado');
assert.ok(real.search('subjuntibo').answers.some(h => SearchText.normalize(h.title).includes('subjuntivo')));
assert.equal(real.search('ser o estar').topics[0].id, 'tp_verbos_ser_estar');
let entries = 0, first = 0, aliases = 0, top3 = 0;
for (const d of faqs) for (const e of d.entries) {
  entries++;
  if (real.search(e.question.es).answers[0]?.id === e.id) first++;
  for (const a of e.aliases || []) { aliases++; if (real.search(a).answers.slice(0, 3).some(h => h.id === e.id)) top3++; }
}
assert.equal(entries, 223);
assert.equal(first, 223);
assert.equal(top3, aliases);
ok(`real answers: ${first}/${entries} questions first, ${top3}/${aliases} aliases in the top 3 (same as the JVM run)`);

// ── grading (QuizGraderTest plus every format) ──
const fb = { id: 'q', format: 'fill_blank', text: 'Si {{1:tener}} tiempo, {{2:ir}}.', answers: [['tuviera', 'tuviese'], ['iría']] };
let g = grade(fb, { blanks: [' Tuviese ', 'iria'] });
assert.equal(g.score, 0.5); assert.equal(g.correct, false);
assert.equal(fillSolution(fb), 'Si tuviera tiempo, iría.');
assert.ok(grade({ ...fb, accentSensitive: false }, { blanks: ['tuviera', 'iria'] }).correct);
ok('fill_blank: case-insensitive, accent-sensitive, partial credit, {{1:tener}} solution');
const ec = { id: 'q', format: 'error_correction', sentence: 'Estoy sentando en el sofá viendo una serie.', errors: [{ wrong: 'sentando', right: 'sentado' }] };
assert.ok(grade(ec, { text: 'Estoy sentado en el sofá viendo una serie' }).correct);
assert.equal(grade(ec, { text: 'Estoy sentando en el sofá viendo una serie.' }).correct, false);
const dict = { id: 'q', format: 'listen_and_type', transcript: 'El país debe su nombre a Simón Bolívar, que fue el general que logró la independencia.', tolerance: 0.85 };
assert.ok(grade(dict, { text: 'el pais debe su nombre a simon bolivar que fue el general que logro la independencia' }).correct);
const fr = { id: 'q', format: 'free_response', minWords: 5, requiredStructures: ['\\b\\w+(ría|rías)\\b'] };
g = grade(fr, { text: 'Si pudiera, viajaría por todo el mundo sin parar.' });
assert.ok(g.needsTutor); assert.equal(g.score, 1);
ok('error_correction, listen_and_type (Levenshtein), free_response pre-check');
const exam = topic.sections.tests.final.items, byId = id => exam.find(i => i.id === id);
assert.ok(grade(byId('q01'), { selected: [0] }).correct);
assert.equal(grade(byId('q01'), { selected: [1] }).correct, false);
assert.ok(grade(byId('q03'), { pairs: { 0: 2, 1: 3, 2: 0, 3: 1 } }).correct);
assert.equal(grade(byId('q03'), { pairs: { 0: 2, 1: 3, 2: 1, 3: 0 } }).score, 0.5);
assert.ok(grade(byId('q04'), { text: 'La reunión es a las diez, pero la sala está cerrada.' }).correct);
assert.ok(grade(byId('q05'), { order: [0, 1, 2, 3] }).correct);
assert.equal(grade(byId('q05'), { order: [2, 1, 0, 3] }).correct, false);
assert.ok(grade(byId('q06'), { text: 'lucía está de camarera este verano' }).correct);
assert.ok(grade(byId('q09'), { blanks: ['estuvimos', 'fue'] }).correct);
g = grade(byId('q08'), { text: 'Mi madre es alegre y es de Lyon. Hoy está cansada porque está trabajando mucho en casa y en la oficina.' });
assert.ok(g.needsTutor && g.score === 1 && g.details.length === 3);
const sc = { id: 'q', format: 'speak_and_check', targetSentence: 'Ojalá haga buen tiempo mañana.' };
assert.ok(grade(sc, { text: 'ojala haga buen tiempo manana' }).correct);
assert.ok(grade({ id: 'q', format: 'transform', acceptedAnswers: ['Lo hizo'], grading: 'exact' }, { text: 'Lo hizo' }).correct);
assert.equal(grade({ id: 'q', format: 'transform', acceptedAnswers: ['Lo hizo'], grading: 'llm_rubric' }, { text: 'Lo hace' }).needsTutor, true);
assert.equal(FORMATS.length, 9);
assert.equal(AnswerNormalizer.normalize('¡Hola, «Ñandú»!'), 'hola ñandú');
ok('the real topic exam grades in every format it uses; all 9 formats handled');
assert.ok(icuRegex('\\best[aá]\\b', 'i').test('Hoy está cansada'));
assert.ok(!/\best[aá]\b/i.test('Hoy está cansada'), 'plain JS \\b misses «está»: the reason for icuRegex');
ok('curriculum regexes get Unicode word boundaries, as on Android');

// ── goal chips (KeywordMatcher) ──
const clara = lessonFiles.find(l => l.id === 's_verbos_ser_estar_clara_atocha');
assert.equal(normalise('¿Está CANSADA? Mañana, sí… «ok»'), 'esta cansada? mañana si ok');
const km = new KeywordMatcher(clara);
let rep = km.analyse(['Clara es alta y muy simpática, pero hoy está cansada.']);
const hit = new Set(rep.triggers.filter(t => t.satisfied).map(t => t.trigger.id));
for (const id of ['t_es_aspecto', 't_esta_estado', 't_contraste']) assert.ok(hit.has(id), id);
assert.ok(!hit.has('t_evento') && !hit.has('t_esta_lugar'));
rep = km.analyse(['Clara es de Sevilla y es ingeniera.', 'La cena es en casa de Marta y la cafetería está al lado de la farmacia. Está esperando en el andén.']);
const hit2 = new Set(rep.triggers.filter(t => t.satisfied).map(t => t.trigger.id));
for (const id of ['t_es_origen', 't_evento', 't_esta_lugar', 't_gerundio']) assert.ok(hit2.has(id), id);
const all = km.analyse([clara.modelAnswer]);
assert.equal(all.missed.length, 0);
assert.equal(all.coverage, 1);
assert.equal(km.analyse([]).coverage, 0);
const hint = km.pendingHint(km.analyse(['Hola.']));
assert.equal(hint, 'Prueba: «Es alta y muy simpática». Prueba: «Hoy está cansada».');
assert.equal(km.analyse(['bueno, eh, o sea, es alta']).fillerCount, 3);
ok('role-play goals: per-trigger regexes, coverage, the model answer hits every goal, the two-heaviest hint, fillers');
const c = withHiddenNote('Yo soy cansada', pendingExpressionsNote('«estar + adjetivo».'));
assert.ok(c.startsWith(`Yo soy cansada\n\n${NOTE_PREFIX} aún no ha usado: «estar + adjetivo».`) && c.endsWith(']'));
assert.equal(withHiddenNote('Hola', null), 'Hola');
ok('hidden note format matches TutorPromptBuilder.content');

// ── reply parser (TutorResponseParserTest) ──
let p = parseTutorReply('Corrección: Si tuviera tiempo, iría. (tras «si» va imperfecto de subjuntivo)\n¿Y adónde irías?');
assert.equal(p.correction.corrected, 'Si tuviera tiempo, iría.');
assert.equal(p.correction.explanation, 'tras «si» va imperfecto de subjuntivo');
assert.equal(p.reply, '¿Y adónde irías?'); assert.ok(p.firstLineComplete);
p = parseTutorReply('Corrección: «Hoy estoy muy cansada» — cansada es un estado: estar.\n¡Vaya!');
assert.equal(p.correction.corrected, '«Hoy estoy muy cansada»'); assert.equal(p.correction.explanation, 'cansada es un estado: estar.');
p = parseTutorReply('**Corrección:** Me gustan las tapas - gustar concuerda con «las tapas»\nSí');
assert.equal(p.correction.corrected, 'Me gustan las tapas'); assert.equal(p.correction.explanation, 'gustar concuerda con «las tapas»');
p = parseTutorReply('✔\n¡Qué bien! ¿Qué preparaste?');
assert.equal(p.correction, null); assert.equal(p.reply, '¡Qué bien! ¿Qué preparaste?');
p = parseTutorReply('¡Hola! Me alegro de verte.');
assert.equal(p.correction, null); assert.equal(p.reply, '¡Hola! Me alegro de verte.'); assert.equal(p.firstLineComplete, false);
p = parseTutorReply('Corrección: Me gustan las');
assert.equal(p.correction.corrected, 'Me gustan las'); assert.equal(p.reply, ''); assert.equal(p.firstLineComplete, false);
p = parseTutorReply('Corrección: Me gustan las tapas. (gustar concuerda con «las');
assert.equal(p.correction.corrected, 'Me gustan las tapas.'); assert.equal(p.correction.explanation, 'gustar concuerda con «las');
// seen live from Qwen3 30B: the correction line written twice
p = parseTutorReply('Corrección: Hoy estoy de buen humor. (estado: estar)  \nCorrección: Hoy estoy de buen humor. (estado: estar)\n\n¿Te sientes mejor hoy?');
assert.equal(p.correction.corrected, 'Hoy estoy de buen humor.'); assert.equal(p.reply, '¿Te sientes mejor hoy?');
assert.deepEqual(p.more, []);
// seen live in the Clara role-play: two different corrections, then a stray ✔
p = parseTutorReply('Corrección: La cafetería está al lado de la salida. (lugar = estar)  \nCorrección: Clara es alta y morena. (característica = ser)  \n\n✔  \nEntiendo, pero ¿cómo sé si es ella?');
assert.equal(p.correction.corrected, 'La cafetería está al lado de la salida.'); assert.equal(p.more.length, 1);
assert.equal(p.more[0].corrected, 'Clara es alta y morena.'); assert.equal(p.more[0].explanation, 'característica = ser');
assert.equal(p.reply, 'Entiendo, pero ¿cómo sé si es ella?');
ok('reply parser: brackets, dashes, bold prefix, ✔, no protocol, streaming, repeated and extra corrections');

// seen live: a correct sentence "corrected" with her own words; a real correction beside it must survive
const said = 'Clara es alta y muy simpática, pero hoy está cansada. La cena es en casa de Marta.';
p = withoutEchoes(parseTutorReply('Corrección: La cena es en casa de Marta (uso correcto de "ser" para evento).\nCorrección: Clara es alta y muy simpática (uso correcto)\n\n¿De qué ciudad es?'), said);
assert.equal(p.correction, null); assert.deepEqual(p.more, []); assert.equal(p.reply, '¿De qué ciudad es?');
p = withoutEchoes(parseTutorReply('Corrección: Clara es ingeniera. (profesión = ser)\nCorrección: es de Sevilla (origen)\n¿Y hoy?'), 'Clara está ingeniera y es de Sevilla.');
assert.equal(p.correction.corrected, 'Clara es ingeniera.'); assert.deepEqual(p.more, []);
p = withoutEchoes(parseTutorReply('Corrección: La cena es'), said);                 // half-streamed: not judged yet
assert.equal(p.correction.corrected, 'La cena es');
ok('echo filter: a "correction" that repeats her words is dropped, real ones stay');

// seen live from Gemma 4: reasons in brackets inside the corrected sentence
p = parseTutorReply('Corrección: Clara es ingeniera (las profesiones se expresan con ser) y está muy cansada (los estados físicos se expresan con estar).\n¡Madre mía!');
assert.equal(p.correction.corrected, 'Clara es ingeniera y está muy cansada.');
assert.equal(p.correction.explanation, 'las profesiones se expresan con ser · los estados físicos se expresan con estar');
p = parseTutorReply('Corrección: Clara es ingeniera (las profesiones usan el verbo ser). (Hoy está muy cansada) (los estados físicos usan el verbo estar).\n¡Vaya!');
assert.equal(p.correction.corrected, 'Clara es ingeniera.');
assert.equal(p.correction.explanation, 'las profesiones usan el verbo ser · Hoy está muy cansada · los estados físicos usan el verbo estar');
ok('reply parser: reasons in brackets inside the sentence are lifted into the explanation');

// ── the hidden prompt (TutorPromptBuilder.systemPrompt) ──
const free = tutorSystemPrompt('free');
assert.ok(free.startsWith('Eres un tutor de español cercano y paciente, pero riguroso con los errores, para la alumna, una adulta de nivel B2 que quiere llegar a C1.'));
assert.ok(free.includes('empieza tu respuesta con UNA línea que comience exactamente por "Corrección:" seguida de la frase corregida y, entre paréntesis, el motivo en menos de 15 palabras'));
assert.ok(free.includes('Corrige como máximo los 2 errores más graves. Prioriza: subjuntivo'));
assert.ok(free.includes('ser/estar'));
assert.ok(free.includes('2. Si no hay errores, empieza con "✔" y nada más en esa línea.'));
assert.ok(free.includes('Máximo 4 frases.'));
assert.ok(free.includes('si lo pide, traduce al francés, nunca al inglés.'));
assert.ok(free.includes('7. Vigila los calcos del francés'));
assert.ok(free.includes('nivel C1 de forma natural'));
assert.ok(free.includes(NOTE_PREFIX));
assert.ok(!free.includes('TAREA ORAL') && !free.includes('TEMA:'));
assert.equal(tutorSystemPrompt('unknown-id'), free);
assert.equal(tutorSystemPrompt(undefined), free);
ok('free conversation: the correction rule, max 2 fixes, ✔, 4 sentences, Spanish only, French calques');
const role = tutorSystemPrompt('s_verbos_ser_estar_clara_atocha');
assert.ok(role.startsWith(free));
assert.ok(role.includes('\nTEMA: Ser o estar — Todo sobre el duelo ser / estar'));
assert.ok(role.includes('\nTAREA ORAL (role_play): ' + clara.prompt.es));
assert.ok(role.includes('Situación: ' + clara.scenario.es));
assert.ok(role.includes('INTERPRETAS A: Diego, amigo que va a recoger a Clara en la estación.'));
assert.ok(role.includes('Estilo: simpático y un poco despistado; hace preguntas cortas'));
assert.ok(role.includes('Si responde poco, pregunta: ¿De dónde es Clara y a qué se dedica?'));
assert.ok(role.includes('Corrige como máximo 2 error por turno y sigue en el personaje.'));
assert.ok(role.includes('Vigila: ' + clara.tutorContext.focusPoints.join('; ') + '.'));
// web change: samples are marked as other learners' errors, never in the reply format (the 30B model copied them)
assert.ok(role.includes('«La cena está en casa de Marta.» → «La cena es en casa de Marta.» (evento = ser)'));
assert.ok(role.includes('no los atribuyas a ella') && !role.includes('Corrección: La cena'));
assert.ok(!role.includes('Conversación libre: pídele'), 'topic tutorContext is left out while a lesson is active');
assert.ok(role.indexOf('TEMA:') < role.indexOf('TAREA ORAL'));
const topicTalk = tutorSystemPrompt('tp_verbos_ser_estar');
assert.ok(topicTalk.includes('Haz que use lo que ha estudiado en este tema') && topicTalk.includes('Conversación libre: pídele'));
ok('lesson prompt appends the topic, the persona and the lesson tutorContext');
// the embedded context must stay in step with the curriculum files
const L = TUTOR_LESSONS.s_verbos_ser_estar_clara_atocha.lesson;
assert.equal(L.prompt, clara.prompt.es);
assert.equal(L.scenario, clara.scenario.es);
assert.deepEqual(L.aiPersona.escalationQuestions, clara.aiPersona.escalationQuestions);
assert.deepEqual(L.aiPersona.counterArguments, clara.aiPersona.counterArguments);
assert.deepEqual(L.tutorContext, clara.tutorContext);
assert.equal(L.turnPlan.maxCorrectionsPerTurn, clara.turnPlan.maxCorrectionsPerTurn);
assert.deepEqual(TUTOR_LESSONS.tp_verbos_ser_estar.topic.tutorContext, topic.tutorContext);
assert.deepEqual(TUTOR_LESSONS.tp_verbos_ser_estar.topic.keyIdeas, topic.keyIdeas.map(k => k.es));
assert.equal(openingLine('s_verbos_ser_estar_clara_atocha'), clara.aiPersona.openingLine);
ok('embedded lesson context matches the curriculum JSON');

// ── progress, listening, tap-a-word ──
assert.deepEqual([95, 90, 89, 70, 69, 40, 39].map(starsFor), [3, 3, 2, 2, 1, 1, 0]);
assert.deepEqual([0, 99, 100, 249, 250, 450].map(x => levelFor(x).number), [1, 1, 2, 2, 3, 4]);
const today = new Date(2026, 9, 20);
assert.equal(streak({ '2026-10-19': 5, '2026-10-18': 3, '2026-10-16': 1 }, today), 2);
assert.equal(streak({ '2026-10-20': 5, '2026-10-19': 5 }, today), 2);
let s = finishQuiz(emptyProgress(), 'g', 100, ['grammar'], false, today);
assert.equal(s.state.xp, 5 + 10 + 10 + 10 + 5);   // daily bonus, grammar + tests sections, passed, perfect
assert.ok(s.events.some(e => e.type === 'quiz' && e.passed && e.stars === 3));
let st = emptyProgress();
for (let i = 0; i < 3; i++) st = answer(st, 'g', [['r_cest', 'Ojo con «c\'est»']], false, today, i).state;
assert.equal(weakPoints(st)[0].label, 'Ojo con «c\'est»');
ok('stars, levels, streak, XP for a finished quiz, «A repasar»');
const ti = new TranscriptIndex(json('transcripts/t14.json').segments);
assert.equal(ti.lines.length, 12);
assert.equal(ti.indexAt(0), -1);
assert.equal(ti.indexAt(6000), 0);
assert.equal(ti.indexAt(30000), 6);
assert.equal(ti.previousStart(30000), ti.lines[5].startMs);
ok('synced transcript: the active line is the last one that started');
const lex = buildLexicon(lessonFiles.find(l => l.type === 'vocabulary').entries);
const parts = segmentWords('Marcos es muy listo, pero la tortilla está riquísima y estoy de acuerdo.', lex);
const words = parts.filter(x => x.entry).map(x => x.text);
assert.deepEqual(words, ['listo', 'riquísima', 'de acuerdo']);
assert.equal(parts.map(x => x.text).join(''), 'Marcos es muy listo, pero la tortilla está riquísima y estoy de acuerdo.');
ok('tap a word: forms and expressions from the vocabulary lesson');

console.log('\nall Spanish Tutor tests passed');
