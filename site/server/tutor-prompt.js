/* The hidden system prompt of the Spanish Tutor web demo (/api/tutor): a faithful port of the Android app's
   TutorPromptBuilder.systemPrompt (domain/tutor/TutorPromptBuilder.kt). The lesson context it needs is embedded
   below as plain objects (copied from the curriculum JSON, author "Claude"), because the Worker cannot import JSON
   files without a bundler. The learner profile is the app's default one: no names.

   Usage:  import { tutorSystemPrompt } from './tutor-prompt.js';
           const system = tutorSystemPrompt(body.lesson);           // "free" | "s_verbos_ser_estar_clara_atocha" | ...
   Unknown or missing ids fall back to "free". */

export const CORRECTION_PREFIX = 'Corrección:';
export const NO_CORRECTION_MARK = '✔';
export const NOTE_PREFIX = '[Nota para el tutor:';

/** LearnerProfile() defaults from ChatMessage.kt. */
export const TUTOR_PROFILE = { name: 'la alumna', l1: 'fr', level: 'B2', targetLevel: 'C1', preferredVariety: 'español de España', weakPoints: [] };

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'B2.1', 'B2.2', 'C1', 'C2'];
const L1_NAMES = { fr: 'francés', en: 'inglés', de: 'alemán', it: 'italiano', pt: 'portugués' };

const TOPIC_SER_ESTAR = {
  id: 'tp_verbos_ser_estar',
  kind: 'grammar',
  cefr: 'B2',
  title: 'Ser o estar',
  summary: 'Todo sobre el duelo ser / estar: lugar, estado, eventos, participios y adjetivos con doble sentido.',
  keyIdeas: [
    'Ser = qué es · Estar = cómo está y dónde.',
    'Eventos y valoraciones: ser (La boda es en Sevilla).',
    'Listo, rico, aburrido…: ser y estar cambian el sentido.',
    'Cuidado con el francés: Soy yo · Estoy de acuerdo · Estamos a 9.',
  ],
  tutorContext: {
    focusPoints: [
      'Ser: qué es (identidad, origen, profesión, hora, eventos)',
      'Estar: dónde y cómo está (lugar, estado, gerundio, resultado)',
      'Adjetivos con doble sentido: listo, rico, aburrido, atento…',
      'Trampas del francés: Soy yo · Estoy de acuerdo · Estamos a 9',
    ],
    mustElicit: ['Es + adjetivo o profesión', 'Está + estado o lugar', 'La fiesta es en…'],
    extraInstructions: 'Conversación libre: pídele que describa a un amigo y su casa, y que cuente cómo está hoy y dónde es su próxima fiesta. Corrige sobre todo ser y estar.',
  },
};

const LESSON_CLARA_ATOCHA = {
  id: 's_verbos_ser_estar_clara_atocha',
  type: 'speaking',
  cefr: 'B2',
  mode: 'role_play',
  prompt: 'Describe a Clara a Diego (cómo es, de dónde es, cómo está hoy) y dile dónde está el punto de encuentro.',
  scenario: 'Tu amiga Clara llega en tren a la estación de Atocha, en Madrid, pero tú no puedes ir a buscarla. Diego, un amigo, va a recogerla, aunque nunca la ha visto.',
  aiPersona: {
    name: 'Diego',
    role: 'amigo que va a recoger a Clara en la estación',
    personality: 'simpático y un poco despistado; hace preguntas cortas',
    openingLine: '¡Hola! Estoy en la estación de Atocha, pero no conozco a Clara. ¿Cómo es? ¿Y dónde nos encontramos?',
    counterArguments: [
      'En la estación hay muchísima gente. ¿Cómo la reconozco?',
      'No encuentro la cafetería. ¿Está cerca de la salida?',
    ],
    escalationQuestions: [
      '¿De dónde es Clara y a qué se dedica?',
      '¿Cómo está hoy? ¿Ha tenido un viaje largo?',
      '¿Dónde está la cafetería? ¿Y dónde es la cena de esta noche?',
    ],
  },
  turnPlan: { correctionMode: 'inline_brief', maxCorrectionsPerTurn: 2 },
  tutorContext: {
    focusPoints: ['Ser para cómo es (aspecto, carácter, origen, profesión)', 'Estar para cómo está hoy y dónde está', 'La cena o la fiesta es en… (evento con ser)'],
    mustElicit: ['Es + adjetivo / de + ciudad', 'Está + estado o lugar', 'La cena es en…'],
    avoid: ['No hablar francés salvo que ella lo pida.'],
    sampleCorrections: [
      { learner: 'Ella está ingeniera.', corrected: 'Ella es ingeniera.', why: 'profesión = ser' },
      { learner: 'La cena está en casa de Marta.', corrected: 'La cena es en casa de Marta.', why: 'evento = ser' },
    ],
  },
};

/** What each conversation id of the demo brings: an active lesson and/or the topic hub it was opened from. */
export const TUTOR_LESSONS = {
  free: { lesson: null, topic: null },
  tp_verbos_ser_estar: { lesson: null, topic: TOPIC_SER_ESTAR },
  s_verbos_ser_estar_clara_atocha: { lesson: LESSON_CLARA_ATOCHA, topic: TOPIC_SER_ESTAR },
};

function appendTutorContext(out, tc) {
  if (!tc) return;
  if (tc.focusPoints && tc.focusPoints.length) out.push('Vigila: ' + tc.focusPoints.slice(0, 4).join('; ') + '.');
  if (tc.mustElicit && tc.mustElicit.length) out.push('Consigue que produzca: ' + tc.mustElicit.slice(0, 3).join('; ') + '.');
  if (tc.avoid && tc.avoid.length) out.push('Evita: ' + tc.avoid.slice(0, 3).join('; ') + '.');
  if (tc.sampleCorrections && tc.sampleCorrections.length) {
    // Web change: the app writes these in the reply format ("Corrección: … ← …"), and Qwen3 30B copied them as if they
    // were her errors (10 of 10 correct sentences "corrected" in testing). Here they are marked as other learners' errors.
    out.push('Errores típicos de otras alumnas (solo como referencia; no los atribuyas a ella):');
    for (const s of tc.sampleCorrections.slice(0, 2)) out.push(`«${s.learner}» → «${s.corrected}» (${s.why})`);
  }
  if (tc.extraInstructions) out.push(tc.extraInstructions);
}

function appendTopicBlock(out, topic, lessonActive) {
  out.push('');
  out.push(`TEMA: ${topic.title}` + (topic.summary ? ' — ' + topic.summary.slice(0, 240) : '') + '.');
  if (topic.keyIdeas && topic.keyIdeas.length) out.push('Ideas clave: ' + topic.keyIdeas.slice(0, 4).join('; ') + '.');
  if (!lessonActive) {
    if (topic.kind === 'culture') out.push('Conversa con ella sobre este tema cultural: pregúntale qué sabe, qué opina y cómo es en Francia. Aporta datos concretos.');
    else out.push('Haz que use lo que ha estudiado en este tema con preguntas abiertas sobre su vida y sus opiniones.');
    appendTutorContext(out, topic.tutorContext);
  }
}

function appendSpeakingBlock(out, lesson) {
  out.push('');
  const p = lesson.aiPersona;
  out.push(`TAREA ORAL (${lesson.mode}): ${lesson.prompt}`);
  if (lesson.scenario) out.push(`Situación: ${lesson.scenario}`);
  out.push(`INTERPRETAS A: ${p.name || 'un interlocutor'}, ${p.role}.${p.stance ? ' Postura: ' + p.stance : ''}`);
  if (p.personality) out.push(`Estilo: ${p.personality}`);
  if (p.counterArguments && p.counterArguments.length) out.push('Argumentos que puedes usar: ' + p.counterArguments.slice(0, 4).join(' | '));
  if (p.escalationQuestions && p.escalationQuestions.length) out.push('Si responde poco, pregunta: ' + p.escalationQuestions.slice(0, 3).join(' | '));
  const mode = lesson.turnPlan && lesson.turnPlan.correctionMode;
  if (mode === 'end_of_task' || mode === 'recast_only') {
    out.push(`En esta tarea NO uses la línea "${CORRECTION_PREFIX}": mantente en el personaje; reformula correctamente lo que ella dijo mal dentro de tu respuesta. Guarda las correcciones para el informe final.`);
  } else {
    out.push(`Corrige como máximo ${(lesson.turnPlan && lesson.turnPlan.maxCorrectionsPerTurn) || 1} error por turno y sigue en el personaje.`);
  }
  appendTutorContext(out, lesson.tutorContext);
}

/**
 * The hidden system prompt for one conversation. lessonId: "free", "tp_verbos_ser_estar" (free talk about the topic)
 * or "s_verbos_ser_estar_clara_atocha" (the role-play, with its topic). lessons: the context table (TUTOR_LESSONS).
 */
export function tutorSystemPrompt(lessonId, lessons = TUTOR_LESSONS, profile = TUTOR_PROFILE) {
  const ctx = (lessons && Object.prototype.hasOwnProperty.call(lessons, lessonId) && lessons[lessonId]) || lessons.free || { lesson: null, topic: null };
  const lesson = ctx.lesson, topic = ctx.topic;
  const l1 = L1_NAMES[profile.l1] || profile.l1;
  const cefr = (lesson && lesson.cefr) || (topic && topic.cefr);
  const review = cefr && CEFR_ORDER.indexOf(cefr) >= 0 && CEFR_ORDER.indexOf(cefr) <= CEFR_ORDER.indexOf('B1') ? cefr : null;
  const out = [];
  out.push(`Eres un tutor de español cercano y paciente, pero riguroso con los errores, para ${profile.name}, una adulta de nivel ${profile.level} que quiere llegar a ${profile.targetLevel}.`);
  out.push(`Hablas siempre en español (${profile.preferredVariety}). Su lengua materna es el ${l1}: no traduces nada salvo que ella lo pida; si lo pide, traduce al ${l1}` + (profile.l1 !== 'en' ? ', nunca al inglés.' : '.'));
  out.push('');
  out.push('REGLAS:');
  out.push(`1. Si su mensaje tiene errores de gramática, léxico o registro, empieza tu respuesta con UNA línea que comience exactamente por "${CORRECTION_PREFIX}" seguida de la frase corregida y, entre paréntesis, el motivo en menos de 15 palabras. Corrige como máximo los 2 errores más graves. Prioriza: subjuntivo (opinión negada, condicionales, relativas con antecedente desconocido), ser/estar, concordancia, preposiciones de régimen, por/para, pronombres.`);
  out.push(`2. Si no hay errores, empieza con "${NO_CORRECTION_MARK}" y nada más en esa línea. Corrige solo palabras que ella escribió de verdad en su último mensaje; si su frase ya es correcta, usa "${NO_CORRECTION_MARK}".`);
  out.push('3. Después, en una línea nueva, continúa la conversación: responde a lo que dijo, discrepa con argumentos, pide ejemplos o lanza una pregunta de seguimiento. Máximo 4 frases.');
  if (review) out.push(`4. Esta sesión repasa un tema de nivel ${review}: habla claro, con frases cortas y vocabulario frecuente, y centra tus preguntas y correcciones en ese tema.`);
  else out.push(`4. Usa estructuras de nivel ${profile.targetLevel} de forma natural (concesivas, condicionales compuestas, relativos cultos) para que las oiga en contexto.`);
  out.push('5. No seas condescendiente, no uses listas, no expliques gramática si no te lo pide; corrige y sigue debatiendo.');
  out.push('6. Cuando dude entre dos formas y pregunte, responde con la regla en una frase y dos ejemplos.');
  if (profile.l1 === 'fr') out.push('7. Vigila los calcos del francés: falsos amigos, preposiciones, artículos, subjuntivo e indicativo, ser/estar.');
  out.push(`8. Si un mensaje suyo termina con "${NOTE_PREFIX} …]", ella no ve esa nota: síguela sin mencionarla.`);
  if (profile.weakPoints && profile.weakPoints.length) {
    out.push('');
    out.push('PUNTOS DÉBILES (vigílalos especialmente): ' + profile.weakPoints.slice(0, 5).join('; ') + '.');
  }
  if (topic) appendTopicBlock(out, topic, !!lesson);
  if (lesson && lesson.type === 'speaking') appendSpeakingBlock(out, lesson);
  return out.join('\n').replace(/\s+$/, '');
}

/** The persona's first line for a role-play (the app shows it as the tutor's first message), or null. */
export function openingLine(lessonId, lessons = TUTOR_LESSONS) {
  const ctx = lessons[lessonId];
  return (ctx && ctx.lesson && ctx.lesson.aiPersona && ctx.lesson.aiPersona.openingLine) || null;
}
