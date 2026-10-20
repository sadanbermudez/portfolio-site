// Splits a tutor reply into an optional correction and the conversational part: a port of the app's
// TutorResponseParser.kt. Streaming-safe: call it on the accumulated text at every token; the correction box
// appears as soon as the first line starts with «Corrección:». DOM-free.

export const CORRECTION_PREFIX = 'Corrección:';
export const NO_CORRECTION_MARK = '✔';
const DASHES = [' — ', ' – ', ' - '];
const CORRECTION = /^\s*(?:\*\*)?Correcci[oó]n:(?:\*\*)?\s*(.+?)\s*(?:\(([^)]{1,200})\)\.?)?\s*$/i;   // web: a full stop after the bracket is allowed (seen from Qwen 30B)

const trimChars = (s, chars) => {
  let a = 0, b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
};

// One «Corrección:» line → { corrected, explanation }, or null if the line is not a correction.
function correctionOf(line) {
  const m = CORRECTION.exec(line);
  if (!m) return null;
  let corrected = m[1].trim();
  let why = m[2] && m[2].trim() ? m[2].trim() : null;
  if (m[2] && /\)\.\s*$/.test(line) && !/[.!?…]$/.test(corrected)) corrected += '.';   // "… cansada (estado)." keeps its full stop
  // Web: Gemma 4 sometimes puts a reason in brackets inside the sentence ("Clara es ingeniera (profesión: ser) y está
  // muy cansada (estado: estar)."): lift every complete bracket into the reason, in order.
  if (/\([^)]*\)/.test(corrected)) {
    const reasons = [];
    corrected = corrected.replace(/\s*\(([^)]*)\)/g, (_, r) => { if (r.trim()) reasons.push(r.trim()); return ''; })
      .replace(/\s+([.,;:!?])/g, '$1').replace(/([.!?])\1+/g, '$1').replace(/\s{2,}/g, ' ').trim();
    why = [...reasons, ...(why ? [why] : [])].join(' · ');
  }
  // While streaming, the bracket with the reason is still open: show what there is of it as the reason.
  if (why === null) {
    const open = corrected.indexOf(' (');
    if (open > 0 && corrected.indexOf(')', open) < 0) {
      why = corrected.slice(open + 2).trim() || null;
      corrected = corrected.slice(0, open).trim();
    }
  }
  // Small models often write the reason after a dash instead of in brackets.
  if (why === null) {
    for (const d of DASHES) {
      const at = corrected.indexOf(d);
      if (at > 0) {
        why = corrected.slice(at).replace(/^[ —–-]+/, '').trim() || null;
        corrected = corrected.slice(0, at).trim();
        break;
      }
    }
  }
  return { corrected: trimChars(corrected.trim(), '"“”'), explanation: why };
}

/** → { correction: { corrected, explanation } | null, more: [further corrections], reply, firstLineComplete } */
export function parseTutorReply(raw) {
  const text = String(raw).replace(/^\s+/, '');
  const nl = text.indexOf('\n');
  const firstLine = nl >= 0 ? text.slice(0, nl) : text;
  const rest = nl >= 0 ? text.slice(nl + 1) : '';
  const complete = nl >= 0;
  const correction = correctionOf(firstLine);
  if (correction) {
    // Qwen 30B sometimes breaks the one-line rule: a repeated line, a second correction, or a stray ✔ after them.
    // Keep each distinct correction, drop repeats and the mark, and leave the conversation as the reply.
    const more = [];
    let reply = rest.replace(/^\s+/, '');
    for (;;) {
      const cut = reply.indexOf('\n'), line = cut >= 0 ? reply.slice(0, cut) : reply;
      const next = correctionOf(line);
      if (next) { if (next.corrected !== correction.corrected && !more.some(c => c.corrected === next.corrected)) more.push(next); }
      else if (line.trim() !== NO_CORRECTION_MARK) break;
      reply = cut >= 0 ? reply.slice(cut + 1).replace(/^\s+/, '') : '';
      if (!reply) break;
    }
    return { correction, more, reply: reply.trim(), firstLineComplete: complete };
  }
  if (firstLine.trim().startsWith(NO_CORRECTION_MARK)) return { correction: null, more: [], reply: rest.trim(), firstLineComplete: complete };
  // The model ignored the protocol: show everything as the reply.
  return { correction: null, more: [], reply: text.trim(), firstLineComplete: complete };
}

const plain = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Web addition: drop "corrections" that only repeat what she wrote. Qwen3 30B sometimes marks a correct sentence as
 * «Corrección: <her own words> (uso correcto…)»; a corrected text found word for word in her message corrects nothing.
 * Applied once the first line is complete, so a half-streamed correction is not judged early.
 */
export function withoutEchoes(parsed, learnerText) {
  const said = ' ' + plain(learnerText) + ' ';
  if (!parsed.correction || !parsed.firstLineComplete || !plain(learnerText)) return parsed;
  const real = [parsed.correction, ...parsed.more].filter(c => !plain(c.corrected) || !said.includes(' ' + plain(c.corrected) + ' '));
  return { ...parsed, correction: real[0] || null, more: real.slice(1) };
}
