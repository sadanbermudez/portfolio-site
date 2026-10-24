// "Ask Jarvis": a chess move explained in plain words, from facts the page already has (the engine's line, the
// rule-found tactics and the strategic facts), and checked before it is shown. The model only narrates; every
// sentence that names a move, a square or an evaluation not in the facts is removed, and the reply says how many.

const FEN = /^[pnbrqkPNBRQK1-8]{1,8}(\/[pnbrqkPNBRQK1-8]{1,8}){7} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d{1,3} \d{1,4}$/;
const SAN = /^(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?)[+#]?$/;
const EVAL = /^([+-]?\d{1,2}\.\d{2}|(White|Black) mates in \d{1,2}|checkmate|game over)$/;
export const COACH = { maxFacts: 8, factChars: 320, lineMoves: 10, maxTokens: 220 };

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const list = (v, n, chars) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, n).map(x => x.trim().slice(0, chars)) : []);

// Returns the facts in a fixed shape, or null when the position or a move is malformed.
export function cleanCoachInput(body) {
  if (!body || typeof body !== 'object') return null;
  const fen = str(body.fen, 100), played = str(body.played, 10), best = str(body.best, 10);
  if (!FEN.test(fen) || !SAN.test(played) || (best && !SAN.test(best))) return null;
  const side = body.side === 'Black' ? 'Black' : 'White';
  const line = list(body.line, COACH.lineMoves, 10).filter(m => SAN.test(m.replace(/^\d+\.(\.\.)?/, '')));
  const ev = k => (EVAL.test(str(body[k], 24)) ? str(body[k], 24) : '');
  return { fen, played, best, side, line, evalBefore: ev('evalBefore'), evalAfter: ev('evalAfter'),
    tactics: list(body.tactics, COACH.maxFacts, COACH.factChars), ideas: list(body.ideas, COACH.maxFacts, COACH.factChars),
    note: str(body.note, COACH.factChars), title: str(body.title, 80) };
}

export const COACH_SYSTEM = `You are Jarvis, a chess coach on Dr. Sergio Adan Bermudez's website, explaining one move to a club player.
Write two or three short sentences in plain English: what the move does and the idea behind it.
Use ONLY the facts you are given. Name only moves and squares that appear in the facts, and only the evaluations given.
Do not invent variations, threats or history. If the facts are thin, say less. No lists, no headings.`;

export function buildCoachMessages(f) {
  const lines = [
    f.title ? `Game: ${f.title}.` : '',
    `Position before the move (FEN): ${f.fen}`,
    `${f.side} played ${f.played}.`,
    f.evalBefore && f.evalAfter ? `Engine evaluation (White's point of view): ${f.evalBefore} before, ${f.evalAfter} after.` : '',
    f.best && f.best !== f.played ? `The engine preferred ${f.best}.` : (f.best ? 'This was the engine\'s first choice.' : ''),
    f.line.length ? `Engine line from the position before the move: ${f.line.join(' ')}` : '',
    f.note ? `Key-moment note: ${f.note}` : '',
    ...f.tactics.map(t => `Tactic found by the rules: ${t}`),
    ...f.ideas.map(t => `Strategic fact found by the rules: ${t}`),
  ].filter(Boolean);
  return [{ role: 'system', content: COACH_SYSTEM }, { role: 'user', content: 'Facts:\n' + lines.join('\n') + '\n\nExplain the move.' }];
}

const MOVE_RE = /\b(O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8]=[QRBN])[+#]?/g;
const SQUARE_RE = /\b[a-h][1-8]\b/g;
const EVAL_RE = /[+-]\d{1,2}\.\d{1,2}\b|\bmates? in \d+/gi;

// The checker. A sentence stays only if each move, square and evaluation it names is in the facts.
export function checkCoach(text, f) {
  const facts = [f.fen.split(' ')[0], f.played, f.best, f.line.join(' '), f.evalBefore, f.evalAfter, f.note, ...f.tactics, ...f.ideas].join(' \n ');
  const known = new Set([...(facts.match(MOVE_RE) || []), ...(facts.match(SQUARE_RE) || [])].map(s => s.replace(/[+#]$/, '')));
  const evals = new Set((facts.match(EVAL_RE) || []).map(e => e.toLowerCase().replace(/^\+/, '')));
  for (const m of [f.played, f.best, ...f.line]) {                         // a move's destination counts as named too
    const sq = (m || '').match(/[a-h][1-8]/g); if (sq) known.add(sq[sq.length - 1]);
  }
  const sentences = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, ' ').trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).filter(s => s.length > 2);
  const kept = [], removed = [];
  for (const s of sentences) {
    const named = [...(s.match(MOVE_RE) || []), ...(s.match(SQUARE_RE) || [])].map(x => x.replace(/[+#]$/, ''));
    const evs = (s.match(EVAL_RE) || []).map(e => e.toLowerCase().replace(/^\+/, ''));
    const bad = named.filter(x => !known.has(x)).concat(evs.filter(e => !evals.has(e)));
    (bad.length ? removed : kept).push(bad.length ? { sentence: s, unsupported: [...new Set(bad)] } : s);
  }
  return { kept, removed };
}
