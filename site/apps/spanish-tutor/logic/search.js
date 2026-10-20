// Offline bilingual search: a JavaScript port of the Android app's Kotlin search (domain/search/SearchIndex.kt,
// SearchText.kt, QueryExpansions.kt and domain/lexicon/Fold.kt). BM25 per field, accent and case folding, a light
// final-«s» stem, prefix matching on the last word, typo tolerance (edit distance 1, or 2 for long words),
// French to Spanish query expansion and phrase bonuses on questions, aliases and titles. DOM-free.

// ── Fold.es: lower-case, drop every diacritic except ñ ──
const BASE = { 'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ú': 'u', 'ù': 'u', 'û': 'u',
  'ü': 'u', 'ç': 'c', 'ý': 'y', 'ÿ': 'y' };

export function foldEs(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const lower = s[i].toLowerCase();
    const c = lower.length === 1 ? lower : s[i];
    if (c.charCodeAt(0) < 0x80 || c === 'ñ') { out += c; continue; }
    const b = BASE[c];
    out += b !== undefined ? b : c.normalize('NFD').replace(/\p{Mn}/gu, '');
  }
  return out;
}

// ── SearchText: the pipeline shared by the index and the query ──
const LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;

export const SearchText = {
  normalize(s) {
    const folded = foldEs(String(s).replace(/[œŒ]/g, 'oe').replace(/[æÆ]/g, 'ae'));
    let out = '';
    for (let i = 0; i < folded.length; i++) out += LETTER_OR_DIGIT.test(folded[i]) ? folded[i] : ' ';
    return out;
  },
  /** Normalised tokens, not stemmed. */
  tokens(s) { return SearchText.normalize(s).split(' ').filter(t => t.length > 0); },
  stem(t) { return t.length >= 4 && t.endsWith('s') ? t.slice(0, -1) : t; },
  /** Normalised and stemmed tokens: what the index stores and what a query is matched with. */
  terms(s) { return SearchText.tokens(s).map(SearchText.stem); },
  /** ñ → n, for words typed on a keyboard without ñ. */
  nfold(t) { return t.indexOf('ñ') < 0 ? t : t.replace(/ñ/g, 'n'); },
  /** Optimal-string-alignment distance, or max + 1 as soon as it must exceed max. */
  distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    if (a === b) return 0;
    const n = a.length, m = b.length;
    let prev2 = new Array(m + 1).fill(0), prev = Array.from({ length: m + 1 }, (_, i) => i), cur = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      cur[0] = i;
      let rowMin = cur[0];
      for (let j = 1; j <= m; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      const t = prev2; prev2 = prev; prev = cur; cur = t;
    }
    return prev[m] > max ? max + 1 : prev[m];
  },
};

// ── QueryExpansions: what a French speaker types → the Spanish words the curriculum uses ──
const RAW = [
  ['subjonctif', 'subjuntivo'], ['conditionnel', 'condicional'], ['imparfait', 'imperfecto'], ['passé composé', 'perfecto'],
  ['passé simple', 'indefinido'], ['plus-que-parfait', 'pluscuamperfecto'], ['futur', 'futuro'], ['futur proche', 'ir a'],
  ['présent', 'presente'], ['passé', 'pasado'], ['impératif', 'imperativo'], ['infinitif', 'infinitivo'], ['gérondif', 'gerundio'],
  ['participe', 'participio'], ['auxiliaire', 'auxiliar|haber'], ['conjugaison', 'conjugación'], ['conjuguer', 'conjugar'],
  ['irrégulier', 'irregular'], ['verbe', 'verbo'], ['pronominal', 'reflexivo|pronominal'], ['réfléchi', 'reflexivo'],
  ['pronom', 'pronombre'], ['relatif', 'relativo'], ['complément', 'objeto'], ['article', 'artículo'], ['genre', 'género'],
  ['masculin', 'masculino'], ['féminin', 'femenino'], ['pluriel', 'plural'], ['singulier', 'singular'], ['adjectif', 'adjetivo'],
  ['adverbe', 'adverbio'], ['possessif', 'posesivo'], ['démonstratif', 'demostrativo'], ['comparatif', 'comparativo|comparar'],
  ['comparaison', 'comparar|comparativo'], ['superlatif', 'superlativo'], ['négation', 'negación'], ['préposition', 'preposición'],
  ['concordance', 'concordancia'], ['accord', 'concordancia'], ['discours indirect', 'estilo indirecto'],
  ['style indirect', 'estilo indirecto'], ['passif', 'pasiva'], ['voix passive', 'pasiva'], ['hypothèse', 'hipótesis'],
  ['condition', 'condición'], ['être', 'ser|estar'], ['avoir', 'tener|haber'], ['il y a', 'hay|hace'], ['il faut', 'hay que|tener que'],
  ['aller', 'ir'], ['faire', 'hacer'], ['savoir', 'saber'], ['connaître', 'conocer'], ['devoir', 'deber|tener que'], ['pouvoir', 'poder'],
  ['vouloir', 'querer'], ['aimer', 'gustar|querer'], ['plaire', 'gustar'], ['penser', 'pensar'], ['croire', 'creer'],
  ['demander', 'pedir|preguntar'], ['apporter', 'traer|llevar'], ['emmener', 'llevar'], ['devenir', 'ponerse|volverse|hacerse'],
  ['en train de', 'estar|gerundio'], ['venir de', 'acabar de'], ['habitude', 'soler'],
  ['accent', 'tilde|acento'], ['accent écrit', 'tilde'], ['accent tonique', 'acento|tónica'], ['acento', 'tilde'],
  ['orthographe', 'ortografía'], ['majuscule', 'mayúscula'], ['minuscule', 'minúscula'], ['ponctuation', 'puntuación'],
  ["point d'interrogation", 'interrogación'], ['virgule', 'coma'], ['guillemets', 'comillas'], ["trait d'union", 'guion'],
  ['tiret', 'guion'], ['prononciation', 'pronunciación'], ['prononcer', 'pronunciar'], ['alphabet', 'alfabeto|abecedario'],
  ['alfabeto', 'abecedario|letra'], ['lettre', 'letra'], ['syllabe', 'sílaba'],
  ['faux amis', 'falsos amigos'], ['faux ami', 'falso amigo'], ['vocabulaire', 'vocabulario'], ['grammaire', 'gramática'],
  ['mot', 'palabra'], ['phrase', 'frase'], ['expression', 'expresión'], ['traduire', 'traducir'], ['traduction', 'traducción'],
  ['dire', 'decir'], ['comment dire', 'cómo se dice'], ['comment on dit', 'cómo se dice'], ['différence', 'diferencia'],
  ['utiliser', 'usar|uso'], ['quand', 'cuándo'], ['pourquoi', 'por qué'], ['tutoyer', 'tutear|tú'], ['tutoiement', 'tutear|tú'],
  ['vouvoyer', 'usted'], ['vouvoiement', 'usted'], ['vous', 'usted|vosotros'], ['saluer', 'saludar|saludo'], ['salutation', 'saludo'],
  ['bonjour', 'hola|buenos días'], ['au revoir', 'adiós|despedirse'], ['merci', 'gracias'], ["s'il vous plaît", 'por favor'],
  ["s'il te plaît", 'por favor'], ['pardon', 'perdón'], ['excusez-moi', 'perdón|disculpe'], ['heure', 'hora'], ['date', 'fecha'],
  ['chiffre', 'número'], ['jour', 'día'], ['mois', 'mes'], ['âge', 'edad'], ['anniversaire', 'cumpleaños'], ['pourboire', 'propina'],
  ['addition', 'cuenta'], ['bisous', 'besos'], ['bise', 'besos'], ['enrhumé', 'resfriado|constipado'], ['rhume', 'resfriado|constipado'],
  ['constipé', 'estreñido|constipado'], ['enceinte', 'embarazada'], ['embarrassé', 'avergonzado|embarazada'], ['gêné', 'avergonzado'],
  ['vêtements', 'ropa'], ['succès', 'éxito'], ['ordinateur', 'ordenador|computadora'], ['voiture', 'coche|carro'],
  ['portable', 'móvil|celular'], ['jus', 'zumo|jugo'], ['espagnol', 'español'], ['espagne', 'españa'], ['amérique', 'américa'],
  ['amérique latine', 'hispanoamérica|latinoamérica'], ['mexique', 'méxico'], ['argentine', 'argentina'],
  ['examen', 'dele'], ['diplôme', 'dele|diploma'], ['niveau', 'nivel'], ['épreuve', 'prueba'], ['écrit', 'escrito'],
  ['compréhension', 'comprensión'], ['lecture', 'lectura'], ['écoute', 'audición|escuchar'], ['inscription', 'inscripción'],
  ['perfecto simple', 'indefinido'], ['perfecto compuesto', 'perfecto'],
];

/** French words that only frame a question («c'est quoi», «comment on dit»…): they weigh little. */
export const FILLER = new Set(('ce est qu quoi quel quelle quels quelles comment pourquoi on dit veut dire ca je il elle ou et une des du ' +
  'espagnol francais utiliser utilise sert signifie mot').split(' ').flatMap(SearchText.terms));

/** [key terms, alternatives → their terms], everything through SearchText.terms. */
export const EXPANSIONS = RAW
  .map(([k, v]) => [SearchText.terms(k), v.split('|').map(SearchText.terms).filter(a => a.length > 0)])
  .filter(([k, alts]) => k.length > 0 && alts.length > 0);

// ── constants (same values as the Kotlin companion object) ──
export const K = {
  K1: 1.2, B: 0.75, PHRASE_MIN_WEIGHT: 1.5,
  W_QUESTION: 3, W_TOPIC_TITLE: 2, W_LESSON_TITLE: 1.5, W_BODY: 1, W_EXTRA: 0.5, W_EXAMPLES: 0.25,
  ENYE: 0.9, PREFIX: 0.8, TYPO1: 0.7, TYPO2: 0.5, EXPANSION: 0.6,
  CONTAINED: 3, REVERSE: 3, ALL_WORDS: 1.5,
  MIN_COVERAGE: 0.4, RELATIVE_CUT: 0.1, CROSS_CUT: 0.2, PREFIX_MIN: 3, EXPANSION_PREFIX_MIN: 4, TYPO_MIN: 5, TYPO2_MIN: 8,
  PREFIX_LIMIT: 60, TYPO_LIMIT: 12, MAX_QUERY_TOKENS: 16, MAX_PHRASES: 6, UNKNOWN_MASS: 0.5, ONE_LETTER_MASS: 0.25,
  FILLER_MASS: 0.25, FILLER_SCORE: 0.3, COMMON_DF: 0.25,
};
const LINK_LETTERS = new Set(['y', 'o', 'e', 'u', 'a']);
export const KINDS = ['ANSWER', 'TOPIC', 'LESSON'];
export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'B2.1', 'B2.2', 'C1', 'C2'];

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * One searchable document: { kind: 'ANSWER'|'TOPIC'|'LESSON', id, title, subtitle, emoji, cefr, fields: [[text, weight]] }.
 */
export class SearchIndex {
  constructor(input) {
    const seen = new Set();
    this.docs = input.filter(d => { const k = d.kind + '|' + d.id; if (seen.has(k)) return false; seen.add(k); return true; });
    this.byId = new Map();
    for (const d of this.docs) if (!this.byId.has(d.id)) this.byId.set(d.id, d);
    const n = this.docs.length;
    this.termIndex = new Map();
    this.termText = [];
    const docClasses = [], phrases = [];
    for (const doc of this.docs) {
      const byWeight = new Map(), phr = [];
      for (const [text, weight] of doc.fields) {
        if (!(weight > 0) || !text || !String(text).trim()) continue;
        const toks = SearchText.terms(text);
        if (!toks.length) continue;
        if (!byWeight.has(weight)) byWeight.set(weight, []);
        const ids = byWeight.get(weight);
        for (const t of toks) {
          let id = this.termIndex.get(t);
          if (id === undefined) { id = this.termText.length; this.termText.push(t); this.termIndex.set(t, id); }
          ids.push(id);
        }
        if (weight >= K.PHRASE_MIN_WEIGHT) phr.push(toks.map(SearchText.nfold));
      }
      docClasses.push([...byWeight.entries()]);
      phrases.push(phr);
    }
    // average length of each field (same kind, same weight)
    const lenSum = new Map(), lenCount = new Map();
    docClasses.forEach((classes, d) => {
      for (const [w, ids] of classes) {
        const key = this.docs[d].kind + '|' + w;
        lenSum.set(key, (lenSum.get(key) || 0) + ids.length);
        lenCount.set(key, (lenCount.get(key) || 0) + 1);
      }
    });
    const vocab = this.termText.length;
    const dfCount = new Array(vocab).fill(0);
    const builders = new Array(vocab).fill(null);
    this.classWeight = docClasses.map(cl => cl.map(c => c[0]));
    this.classNorm = docClasses.map((cl, d) => cl.map(([w, ids]) => {
      const key = this.docs[d].kind + '|' + w;
      const avg = (lenSum.get(key) || 1) / (lenCount.get(key) || 1);
      return K.K1 * (1 - K.B + K.B * ids.length / Math.max(avg, 1));
    }));
    for (let d = 0; d < n; d++) {
      const seenTerm = new Set();
      docClasses[d].forEach(([, ids], c) => {
        const tf = new Map();
        for (const id of ids) tf.set(id, (tf.get(id) || 0) + 1);
        for (const [id, count] of [...tf.entries()].sort((a, b) => a[0] - b[0])) {
          (builders[id] || (builders[id] = [])).push(d, c, count);
          if (!seenTerm.has(id)) { seenTerm.add(id); dfCount[id]++; }
        }
      });
    }
    this.postings = builders.map(b => b || []);
    this.df = dfCount;
    this.idf = dfCount.map(df => Math.log(1 + (n - df + 0.5) / (df + 0.5)));
    this.maxIdf = Math.log(1 + (n + 0.5) / 0.5);
    const folds = new Map();
    this.termText.forEach((t, id) => {
      const f = SearchText.nfold(t);
      if (!folds.has(f)) folds.set(f, []);
      folds.get(f).push(id);
    });
    this.foldIndex = folds;
    this.sortedFolds = [...folds.keys()].sort(cmpStr);
    this.mainWeight = docClasses.map(cl => (cl.length ? Math.max(...cl.map(c => c[0])) : 1));
    this.phraseFields = phrases;
    this.phraseVocab = phrases.map(p => new Set(p.flat()));
  }

  get size() { return this.docs.length; }

  /** The document with this id as a result row (score 0), or null. */
  lookup(id) { const d = this.byId.get(id); return d ? toHit(d, 0) : null; }

  search(query, maxAnswers = 8, maxTopics = 6, maxLessons = 6) {
    const q = String(query).trim();
    const none = { query: q, answers: [], topics: [], lessons: [], isEmpty: true };
    const raw = SearchText.tokens(q);
    if (!this.docs.length || raw.reduce((s, t) => s + t.length, 0) < 2) return none;
    let letters = null;
    if (raw.every(t => t.length === 1)) {
      const all = [...new Set(raw.map(SearchText.nfold))];
      const kept = all.filter(l => !LINK_LETTERS.has(l));
      letters = kept.length ? kept : all;
    }
    const typed = raw.slice(0, K.MAX_QUERY_TOKENS);
    const seq = typed.map(SearchText.stem);
    const lastChar = q[q.length - 1];
    const lastFold = SearchText.nfold(typed[typed.length - 1]);
    const lastPrefix = LETTER_OR_DIGIT.test(lastChar) && lastFold.length >= K.PREFIX_MIN ? lastFold : null;
    const lastSeq = seq[seq.length - 1];

    const tokens = [...new Set(seq)];
    const allFiller = tokens.every(t => FILLER.has(t) || t.length === 1);
    const concepts = tokens.map(t => {
      const unfinished = lastPrefix !== null && t === lastSeq;
      return this.#concept(t, t === lastSeq ? lastPrefix : null, !allFiller && !unfinished && FILLER.has(t));
    });
    const conceptOf = new Map(tokens.map((t, i) => [t, i]));

    // French → Spanish expansions: extra terms (score) + alternatives that may stand for the key (coverage)
    const phrases = [{ tokens: seq.map(SearchText.nfold), factor: 1, allowExact: true, lastPrefix }];
    const expansionFactor = new Map();
    const alternatives = [];
    for (const [key, alts] of EXPANSIONS) {
      for (const [start, matchFactor] of this.#occurrences(key, seq, lastPrefix)) {
        let mask = 0;
        for (let i = start; i < start + key.length; i++) mask |= 1 << conceptOf.get(seq[i]);
        const factor = K.EXPANSION * matchFactor;
        for (const alt of alts) {
          const groups = [];
          for (const t of alt) {
            const ids = this.foldIndex.get(SearchText.nfold(t));
            if (!ids) continue;
            groups.push(ids);
            for (const id of ids) {
              const f = this.termText[id] === t ? factor : factor * K.ENYE;
              if (f > (expansionFactor.get(id) || 0)) expansionFactor.set(id, f);
            }
          }
          if (groups.length === alt.length && groups.some(g => g.some(id => this.df[id] <= this.docs.length * K.COMMON_DF))) {
            alternatives.push({ mask, groups });
          }
          if (phrases.length < K.MAX_PHRASES) {
            const subst = [...seq.slice(0, start), ...alt, ...seq.slice(start + key.length)];
            phrases.push({ tokens: subst.map(SearchText.nfold), factor, allowExact: false,
              lastPrefix: start + key.length < seq.length ? lastPrefix : null });
          }
        }
      }
    }

    // BM25: best variant per concept, plus the expansion terms
    const n = this.docs.length;
    const score = new Array(n).fill(0), covered = new Array(n).fill(0), best = new Array(n).fill(0);
    concepts.forEach((c, ci) => {
      best.fill(0);
      for (const [term, f] of c.variants) this.#forEachContribution(term, (d, s) => { if (f * s > best[d]) best[d] = f * s; });
      for (let d = 0; d < n; d++) if (best[d] > 0) { score[d] += best[d] * c.weight; covered[d] |= 1 << ci; }
    });
    for (const [term, f] of expansionFactor) this.#forEachContribution(term, (d, s) => { score[d] += f * s; });
    if (alternatives.length) {
      const count = new Array(n).fill(0), stamp = new Array(n).fill(-1);
      let mark = 0;
      for (const alt of alternatives) {
        count.fill(0);
        for (const group of alt.groups) {
          mark++;
          for (const id of group) this.#forEachDoc(id, d => { if (stamp[d] !== mark) { stamp[d] = mark; count[d]++; } });
        }
        for (let d = 0; d < n; d++) if (count[d] === alt.groups.length) covered[d] |= alt.mask;
      }
    }

    const totalMass = concepts.reduce((s, c) => s + c.mass, 0);
    const bonusScale = Math.max(totalMass, 1);
    const scored = [];
    for (let d = 0; d < n; d++) {
      if (score[d] <= 0) continue;
      let mass = 0;
      concepts.forEach((c, ci) => { if (covered[d] & (1 << ci)) mass += c.mass; });
      const coverage = totalMass > 0 ? mass / totalMass : 0;
      if (coverage < K.MIN_COVERAGE) continue;
      if (letters && !this.phraseFields[d].some(field => letters.every(l => field.includes(l)))) continue;
      let bonus = 0, exact = false;
      for (const p of phrases) {
        const [b, e] = this.#phraseBonus(d, p);
        if (e && p.allowExact) exact = true;
        if (b * p.factor > bonus) bonus = b * p.factor;
      }
      const final = (score[d] + bonus * bonusScale) * coverage;
      scored.push({ doc: this.docs[d], score: final, exact, norm: final / this.mainWeight[d] });
    }
    const groupBest = {};
    for (const k of KINDS) groupBest[k] = scored.filter(s => s.doc.kind === k).reduce((m, s) => Math.max(m, s.norm), 0);
    const others = k => KINDS.filter(x => x !== k).reduce((m, x) => Math.max(m, groupBest[x]), 0);
    const answers = this.#rank(scored, 'ANSWER', maxAnswers, others('ANSWER'));
    const topics = this.#rank(scored, 'TOPIC', maxTopics, others('TOPIC'));
    const lessons = this.#rank(scored, 'LESSON', maxLessons, others('LESSON'));
    return { query: q, answers, topics, lessons, isEmpty: !answers.length && !topics.length && !lessons.length };
  }

  #concept(t, prefix, filler) {
    const v = new Map();
    const put = (id, f) => { if (f > (v.get(id) || 0)) v.set(id, f); };
    const exactId = this.termIndex.get(t);
    if (exactId !== undefined) put(exactId, 1);
    const fold = SearchText.nfold(t);
    for (const id of this.foldIndex.get(fold) || []) if (id !== exactId) put(id, K.ENYE);
    if (prefix !== null && prefix.length >= K.PREFIX_MIN) for (const id of this.#prefixTerms(prefix)) put(id, K.PREFIX);
    if (v.size === 0 && t.length >= K.TYPO_MIN) for (const [id, dist] of this.#typoTerms(fold)) put(id, dist <= 1 ? K.TYPO1 : K.TYPO2);
    let mass;
    if (exactId !== undefined) mass = this.idf[exactId];
    else if (v.size) mass = Math.max(...[...v.keys()].map(id => this.idf[id]));
    else mass = K.UNKNOWN_MASS * this.maxIdf;
    mass *= filler ? K.FILLER_MASS : t.length === 1 ? K.ONE_LETTER_MASS : 1;
    return { token: t, variants: v, mass, weight: filler ? K.FILLER_SCORE : 1 };
  }

  #prefixTerms(fold) {
    let i = this.#lowerBound(fold);
    const out = [];
    while (i < this.sortedFolds.length && this.sortedFolds[i].startsWith(fold)) {
      if (this.sortedFolds[i] !== fold) out.push(...this.foldIndex.get(this.sortedFolds[i]));
      i++;
    }
    return out.sort((a, b) => (this.df[b] - this.df[a]) || (this.termText[a].length - this.termText[b].length)).slice(0, K.PREFIX_LIMIT);
  }

  #typoTerms(fold) {
    const max = fold.length >= K.TYPO2_MIN ? 2 : 1;
    const out = [];
    for (const f of this.sortedFolds) {
      if (Math.abs(f.length - fold.length) > max || f.length < K.TYPO_MIN - 1) continue;
      const dist = SearchText.distance(fold, f, max);
      if (dist >= 1 && dist <= max) for (const id of this.foldIndex.get(f)) out.push([id, dist]);
    }
    return out.sort((a, b) => (a[1] - b[1]) || (this.df[b[0]] - this.df[a[0]])).slice(0, K.TYPO_LIMIT);
  }

  #lowerBound(key) {
    let lo = 0, hi = this.sortedFolds.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.sortedFolds[mid] < key) lo = mid + 1; else hi = mid; }
    return lo;
  }

  #occurrences(key, seq, lastPrefix) {
    const out = [];
    const completes = lastPrefix !== null && lastPrefix.length >= K.EXPANSION_PREFIX_MIN;
    if (key.length === 1) {
      const k = key[0];
      seq.forEach((t, i) => {
        let f = 0;
        if (t === k) f = 1;
        else if (SearchText.nfold(t) === SearchText.nfold(k)) f = K.ENYE;
        else if (completes && i === seq.length - 1 && SearchText.nfold(k).startsWith(lastPrefix)) f = K.PREFIX;
        else if (t.length >= K.TYPO_MIN) {
          const max = t.length >= K.TYPO2_MIN ? 2 : 1;
          const dist = SearchText.distance(t, k, max);
          f = dist === 1 ? K.TYPO1 : dist >= 2 && dist <= max ? K.TYPO2 : 0;
        }
        if (f > 0) out.push([i, f]);
      });
    } else {
      for (let i = 0; i <= seq.length - key.length; i++) {
        let f = 1;
        for (let j = 0; j < key.length; j++) {
          const t = SearchText.nfold(seq[i + j]), k = SearchText.nfold(key[j]);
          if (t === k) continue;
          if (completes && j === key.length - 1 && i + j === seq.length - 1 && k.startsWith(lastPrefix)) f *= K.PREFIX;
          else { f = 0; break; }
        }
        if (f > 0) out.push([i, f]);
      }
    }
    return out;
  }

  #forEachContribution(term, block) {
    const p = this.postings[term], w = this.idf[term];
    let i = 0;
    while (i < p.length) {
      const d = p[i];
      let sum = 0;
      while (i < p.length && p[i] === d) {
        const c = p[i + 1], tf = p[i + 2];
        sum += this.classWeight[d][c] * tf * (K.K1 + 1) / (tf + this.classNorm[d][c]);
        i += 3;
      }
      block(d, w * sum);
    }
  }

  #forEachDoc(term, block) {
    const p = this.postings[term];
    let last = -1;
    for (let i = 0; i < p.length; i += 3) if (p[i] !== last) { last = p[i]; block(last); }
  }

  #phraseBonus(d, p) {
    const q = p.tokens;
    if (!q.length) return [0, false];
    let bonus = 0, exact = false;
    for (const field of this.phraseFields[d]) {
      const c = contains(field, q, p.lastPrefix);
      if (c === 2) { exact = true; bonus = Math.max(bonus, K.CONTAINED); }
      else if (c === 1) bonus = Math.max(bonus, K.CONTAINED);
      if (field.length >= 2 && field.length < q.length && contains(q, field, null) > 0) bonus = Math.max(bonus, K.REVERSE * field.length / q.length);
    }
    if (bonus < K.ALL_WORDS && q.length >= 2) {
      const vocab = this.phraseVocab[d], pre = p.lastPrefix;
      const all = q.every((t, i) => vocab.has(t) || (pre !== null && i === q.length - 1 && [...vocab].some(v => v.startsWith(pre))));
      if (all) bonus = K.ALL_WORDS;
    }
    return [bonus, exact];
  }

  #rank(scored, kind, max, reference) {
    if (max <= 0) return [];
    const cefr = s => { const i = CEFR_ORDER.indexOf(s.doc.cefr); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    const ranked = scored.filter(s => s.doc.kind === kind).sort((a, b) =>
      (Number(b.exact) - Number(a.exact)) || (Math.round(b.score * 100) - Math.round(a.score * 100)) ||
      (cefr(a) - cefr(b)) || cmpStr(a.doc.title, b.doc.title) || cmpStr(a.doc.id, b.doc.id));
    if (!ranked.length) return [];
    const top = Math.max(...ranked.map(s => s.score));
    const crossCut = kind === 'LESSON' ? 0 : K.CROSS_CUT * reference;
    return ranked.filter(s => s.exact || (s.score >= K.RELATIVE_CUT * top && s.norm >= crossCut)).slice(0, max).map(s => toHit(s.doc, s.score));
  }
}

/** 2 = q equals field, 1 = q is a contiguous part of field (the last word may be completed), 0 = neither. */
function contains(field, q, lastPrefix) {
  if (q.length > field.length) return 0;
  if (q.length === field.length && q.every((t, i) => field[i] === t)) return 2;
  for (let start = 0; start <= field.length - q.length; start++) {
    let ok = true;
    for (let i = 0; i < q.length; i++) {
      const f = field[start + i], t = q[i];
      if (f !== t && !(lastPrefix !== null && i === q.length - 1 && f.startsWith(lastPrefix))) { ok = false; break; }
    }
    if (ok) return 1;
  }
  return 0;
}

function toHit(doc, score) {
  return { kind: doc.kind, id: doc.id, title: doc.title, subtitle: doc.subtitle, emoji: doc.emoji, cefr: doc.cefr, score };
}

// ── SearchIndex.build: FAQ entries, topic hubs and lessons, with the app's field weights ──
export const CATEGORY_LABELS = {
  grammar: ['Gramática', 'Grammaire'], spelling: ['Ortografía', 'Orthographe'], pronunciation: ['Pronunciación', 'Prononciation'],
  vocabulary: ['Vocabulario', 'Vocabulaire'], false_friends: ['Falsos amigos', 'Faux amis'], usage: ['Uso', 'Usage'],
  culture: ['Cultura', 'Culture'], exam: ['Exámenes', 'Examens'],
};
const LESSON_TYPES = {
  grammar: ['Gramática', 'Grammaire', '📘'], vocabulary: ['Vocabulario', 'Vocabulaire', '🔤'], speaking: ['Hablar', 'Parler', '🗣️'],
  listening: ['Escuchar', 'Écouter', '🎧'],
};

/** French of a LocalizedText ({ es, translations: { fr } }), or null. */
export const frOf = t => (t && t.translations && t.translations.fr && t.translations.fr.trim()) || null;
const sameText = (a, b) => SearchText.terms(a).join(' ') === SearchText.terms(b).join(' ');
function addText(list, t, weight) {
  if (!t) return;
  list.push([t.es, weight]);
  const fr = frOf(t);
  if (fr && !sameText(fr, t.es)) list.push([fr, weight]);
}

function faqDoc(doc, e) {
  const fields = [];
  const category = e.category || 'grammar';
  addText(fields, e.question, K.W_QUESTION);
  for (const a of e.aliases || []) fields.push([a, K.W_QUESTION]);
  addText(fields, e.answer, K.W_BODY);
  if ((e.tags || []).length) fields.push([e.tags.join(' '), K.W_BODY]);
  for (const side of e.compare || []) addText(fields, side.title, K.W_BODY);
  addText(fields, doc.title, K.W_EXTRA);
  fields.push([CATEGORY_LABELS[category].join(' '), K.W_EXTRA]);
  for (const p of e.points || []) addText(fields, p, K.W_EXTRA);
  if (e.trick) addText(fields, e.trick, K.W_EXTRA);
  if (e.frenchTrap) addText(fields, e.frenchTrap, K.W_EXTRA);
  for (const side of e.compare || []) for (const it of side.items || []) addText(fields, it, K.W_EXAMPLES);
  for (const ex of e.examples || []) {
    fields.push([ex.es, K.W_EXAMPLES]);
    const fr = frOf(ex);
    if (fr) fields.push([fr, K.W_EXAMPLES]);
  }
  const qfr = frOf(e.question);
  return { kind: 'ANSWER', id: e.id, title: e.question.es, subtitle: qfr && !sameText(qfr, e.question.es) ? qfr : doc.title.es,
    emoji: e.emoji || doc.emoji || '❓', cefr: e.cefr || null, fields };
}

/**
 * faqs: FAQ documents (sorted by order, id, as the manifest lists them); topics: topic files; lessons: manifest-style
 * entries { id, type, title, cefr, status }. Published content only.
 */
export function buildIndex(faqs, topics, lessons) {
  const docs = [], seen = new Set();
  for (const doc of faqs) {
    if ((doc.status || 'published') !== 'published') continue;
    for (const e of doc.entries || []) if (!seen.has(e.id)) { seen.add(e.id); docs.push(faqDoc(doc, e)); }
  }
  for (const t of topics) {
    if ((t.status || 'published') !== 'published' || seen.has(t.id)) continue;
    seen.add(t.id);
    const fields = [];
    addText(fields, t.title, K.W_TOPIC_TITLE);
    if (t.tagline) addText(fields, t.tagline, K.W_BODY);
    if (t.summary) addText(fields, t.summary, K.W_BODY);
    for (const k of t.keyIdeas || []) addText(fields, k, K.W_BODY);
    if ((t.tags || []).length) fields.push([t.tags.join(' '), K.W_BODY]);
    const tfr = frOf(t.title);
    docs.push({ kind: 'TOPIC', id: t.id, title: t.title.es,
      subtitle: tfr && !sameText(tfr, t.title.es) ? tfr : (t.tagline ? t.tagline.es : null), emoji: t.emoji, cefr: t.cefr || null, fields });
  }
  for (const l of lessons) {
    if ((l.status || 'published') !== 'published' || seen.has(l.id)) continue;
    seen.add(l.id);
    const [es, fr, emoji] = LESSON_TYPES[l.type] || ['Lección', 'Leçon', '📄'];
    docs.push({ kind: 'LESSON', id: l.id, title: l.title || l.id, subtitle: es + ' · ' + fr, emoji, cefr: l.cefr || null,
      fields: [[l.title || '', K.W_LESSON_TITLE], [es + ' ' + fr, K.W_EXTRA]] });
  }
  return new SearchIndex(docs);
}
