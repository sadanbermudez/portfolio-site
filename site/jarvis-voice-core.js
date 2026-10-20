/* Pure logic for Jarvis's voice, shared by jarvis.js and site/tests/jarvis-voice.test.mjs (decision 11).
   - chunker(): cuts the streamed answer into pieces to speak, the first one short so speech starts early
   - planVoice(): runs the in-browser Daniel voice only where it is faster than real time
   - pickVoice(): the browser's own British male voice, if it has one */

export const CHUNK = { first: 70, min: 25, max: 220 };
const ABBREV = /\b(?:Dr|Mr|Mrs|Ms|Prof|St|No|vs|e\.g|i\.e|approx|ca)\.$/i;

export function cleanSpeech(text) {
  return text.replace(/\s*\[\d+\]/g, '').replace(/[*`~]+/g, '').replace(/[_#>|]+/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

// Split one overlong piece at the last clause break, or failing that the last space, before max.
function split(text, max) {
  const out = [];
  while (text.length > max) {
    const head = text.slice(0, max);
    let cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '), head.lastIndexOf(' - '));
    if (cut < max / 3) cut = head.lastIndexOf(' ');
    if (cut < 1) cut = max;
    out.push(text.slice(0, cut + 1).trim()); text = text.slice(cut + 1).trim();
  }
  if (text) out.push(text);
  return out;
}

// Feed it the whole answer so far, as often as it grows; it returns only the new pieces ready to speak.
// A sentence ends at . ! ? or a line break followed by more text, not after "Dr." and the like.
// The first piece is cut at a comma when the first sentence is long, so the voice can start sooner.
// Very short sentences wait to join the next one, so the voice does not stop and start on "Yes."
export function chunker(opts = CHUNK) {
  let used = 0, first = true, held = '';
  function take(text, final) {
    const out = [], rest = text.slice(used);
    const ends = [], re = /[.!?…]+["')\]]*(?=\s)|\n+/g;
    let m;
    while ((m = re.exec(rest))) {
      const end = m.index + m[0].length;
      if (m[0][0] !== '\n' && ABBREV.test(rest.slice(0, end))) continue;
      ends.push(end);
    }
    let from = 0;
    const emit = (piece) => {
      piece = cleanSpeech(held ? held + ' ' + piece : piece); held = '';
      if (!piece) return;
      if (first && piece.length > opts.first) {
        const head = piece.slice(0, opts.first + 40), m = /[,;:](?=\s)/g;
        let cut = -1, hit;
        while ((hit = m.exec(head)) && cut < opts.min) cut = hit.index;       // the first clause break that is not too short
        if (cut >= opts.min) { out.push(piece.slice(0, cut + 1).trim()); piece = piece.slice(cut + 1).trim(); first = false; }
      }
      if (!final && piece.length < opts.min && !first) { held = piece; return; }
      out.push(...split(piece, opts.max)); first = false;
    };
    for (const end of ends) { emit(rest.slice(from, end)); from = end; }
    used += from;
    if (final) { emit(text.slice(used)); used = text.length; if (held) { out.push(...split(held, opts.max)); held = ''; } }
    return out.filter(p => /[\p{L}\p{N}]/u.test(p));
  }
  return { push: (text) => take(text, false), end: (text) => take(text, true) };
}

// Kokoro is worth its 92 MB download only on a computer that runs it faster than real time: cross-origin isolated
// (several threads), at least four cores, not a phone or tablet, not on data saver, and not short of memory.
export function planVoice(d) {
  const strong = d.isolated && (d.cores || 0) >= 4 && !d.coarse && !d.mobile && !d.saveData && (d.memory === undefined || d.memory >= 4);
  return strong ? 'daniel' : 'quick';
}

// The browser's British male voice: Apple's "Daniel" or "Arthur", Microsoft's "George", "Ryan" or "Thomas",
// Google's "UK English Male". Returns null when there is none, so the server voice speaks instead.
const MALE = /\b(daniel|arthur|oliver|george|ryan|thomas|alfie|elliot|noah|uk english male)\b/i;
export function pickVoice(voices) {
  const gb = (voices || []).filter(v => /^en[-_]GB/i.test(v.lang) && MALE.test(v.name) && !/female/i.test(v.name));
  gb.sort((a, b) => score(b) - score(a));
  return gb[0] || null;
}
function score(v) { return (/natural|online|enhanced|premium/i.test(v.name) ? 2 : 0) + (/daniel/i.test(v.name) ? 1 : 0) + (v.localService ? 0.5 : 0); }

// Any English voice at all: the last resort when the server voice cannot be reached.
export function anyVoice(voices) {
  const list = voices || [];
  return list.find(v => /^en[-_]GB/i.test(v.lang)) || list.find(v => /^en/i.test(v.lang)) || null;
}
