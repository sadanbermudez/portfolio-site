// Tests for the voice logic of the Jarvis page and the /api/speak text filter: node site/tests/jarvis-voice.test.mjs
import assert from 'node:assert/strict';
import { chunker, cleanSpeech, planVoice, pickVoice, anyVoice, CHUNK } from '../jarvis-voice-core.js';
import { speakable, halveWav, fromBase64, SPEAK_CHARS } from '../server/jarvis-core.js';

const ok = name => console.log('ok  ' + name);

// Feed an answer to the chunker a few characters at a time, as the stream does.
function stream(answer, step = 3) {
  const c = chunker(), out = [];
  for (let i = step; i < answer.length; i += step) out.push(...c.push(answer.slice(0, i)));
  out.push(...c.end(answer));
  return out;
}

const answer = 'Sergio did his PhD at the University of Edinburgh, on singlet oxygen in hollow-core fibres [1]. He is also a FIDE Master. Yes. He teaches chess on Superprof [2].';
const parts = stream(answer);
assert.equal(parts[0], 'Sergio did his PhD at the University of Edinburgh,'); ok('a long first sentence starts at its first clause');
assert.ok(parts.every(p => !/\[\d+\]/.test(p))); ok('citation marks are never spoken');
assert.ok(parts.includes('He is also a FIDE Master.')); ok('later sentences are spoken whole');
assert.equal(stream('The PhD detected singlet oxygen, a molecule that kills cells in photodynamic therapy, using two-photon excitation. Done.')[0],
  'The PhD detected singlet oxygen,'); ok('the first piece ends at the first clause break, for the quickest start');
assert.equal(stream('Yes, he did a PhD in Edinburgh on singlet oxygen in hollow-core fibres, over four years. Done.')[0],
  'Yes, he did a PhD in Edinburgh on singlet oxygen in hollow-core fibres,'); ok('a first clause too short to stand alone is not cut off');
assert.ok(parts.some(p => p === 'Yes. He teaches chess on Superprof.')); ok('a very short sentence joins the next one');
assert.equal(cleanSpeech(parts.join(' ')), cleanSpeech(answer)); ok('every word is spoken once, in order');

{
  const c = chunker();
  assert.deepEqual(c.push('Good day.'), []); ok('a sentence is not spoken before the text after it shows it has ended');
  assert.deepEqual(c.push('Good day. I'), ['Good day.']); ok('a short first sentence goes at once');
  assert.deepEqual(c.end('Good day. I know his website'), ['I know his website']); ok('the end of the answer flushes the rest');
}
assert.deepEqual(stream('Dr. Adan Bermudez is a physicist. He plays chess.'), ['Dr. Adan Bermudez is a physicist.', 'He plays chess.']); ok('"Dr." does not end a sentence');
assert.deepEqual(stream('The fit gives 3.5 µs here. Done now.'), ['The fit gives 3.5 µs here.', 'Done now.']); ok('decimals do not end a sentence');
assert.deepEqual(stream('Three things:\n- the lab agent and its optics bench\n- the chess viewer with its engine'), ['Three things:', '- the lab agent and its optics bench', '- the chess viewer with its engine']); ok('line breaks end a piece');

const long = 'word '.repeat(120).trim() + '.';
const longParts = stream(long);
assert.ok(longParts.every(p => p.length <= CHUNK.max)); assert.equal(longParts.join(' '), long); ok('an overlong sentence is cut under the limit, losing nothing');
assert.deepEqual(stream('[1] [2]'), []); ok('nothing pronounceable, nothing spoken');

const desktop = { isolated: true, cores: 8, coarse: false, mobile: false, saveData: false, memory: 8 };
assert.equal(planVoice(desktop), 'daniel');
assert.equal(planVoice({ ...desktop, isolated: false }), 'quick');                      // Safari: no COEP credentialless, one thread
assert.equal(planVoice({ ...desktop, coarse: true, mobile: true }), 'quick');           // phones and tablets
assert.equal(planVoice({ ...desktop, saveData: true }), 'quick');
assert.equal(planVoice({ ...desktop, memory: 2 }), 'quick');
assert.equal(planVoice({ ...desktop, cores: 2 }), 'quick');
assert.equal(planVoice({ ...desktop, memory: undefined }), 'daniel');                   // Firefox and Safari do not report memory
ok('the in-browser voice runs only on strong, isolated computers');

const v = (name, lang, localService = true) => ({ name, lang, localService });
assert.equal(pickVoice([v('Samantha', 'en-US'), v('Daniel', 'en-GB')]).name, 'Daniel');
assert.equal(pickVoice([v('Google UK English Female', 'en-GB'), v('Google UK English Male', 'en-GB', false)]).name, 'Google UK English Male');
assert.equal(pickVoice([v('Microsoft George - English (United Kingdom)', 'en-GB'), v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB', false)]).name, 'Microsoft Ryan Online (Natural) - English (United Kingdom)');
assert.equal(pickVoice([v('English United Kingdom', 'en-GB'), v('Daniel', 'fr-FR')]), null);
assert.equal(pickVoice([]), null);
ok('the browser voice is a British male one, or none');
assert.equal(anyVoice([v('Samantha', 'en-US'), v('Kate', 'en_GB')]).name, 'Kate');
assert.equal(anyVoice([v('Amelie', 'fr-FR')]), null); ok('the last-resort voice is English');

assert.equal(speakable('He plays chess [1]. **Really**.'), 'He plays chess. Really.');
assert.equal(speakable('[1] ** [2]'), null); assert.equal(speakable(42), null);
assert.ok(speakable('a'.repeat(1000)).length <= SPEAK_CHARS); ok('the speak route cleans and caps its text');

// halveWav: a 44.1 kHz clip becomes a valid 22.05 kHz clip with half the samples, and a steady tone keeps its level.
{
  const n = 4410, src = new Uint8Array(44 + n * 2), w = new DataView(src.buffer);
  const put = (at, s) => { for (let k = 0; k < 4; k++) src[at + k] = s.charCodeAt(k); };
  put(0, 'RIFF'); put(8, 'WAVE'); put(12, 'fmt '); put(36, 'data');
  w.setUint32(4, 36 + n * 2, true); w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 1, true);
  w.setUint32(24, 44100, true); w.setUint32(28, 88200, true); w.setUint16(32, 2, true); w.setUint16(34, 16, true); w.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) w.setInt16(44 + 2 * i, Math.round(10000 * Math.sin(2 * Math.PI * 200 * i / 44100)), true);
  const out = halveWav(src), r = new DataView(out.buffer);
  assert.equal(String.fromCharCode(...out.subarray(0, 4)) + String.fromCharCode(...out.subarray(8, 12)), 'RIFFWAVE');
  assert.equal(r.getUint32(24, true), 22050); assert.equal(r.getUint32(28, true), 44100); assert.equal(r.getUint32(40, true), (n >> 1) * 2);
  assert.equal(out.length, 44 + (n >> 1) * 2); assert.equal(r.getUint32(4, true), out.length - 8);
  let peak = 0; for (let i = 0; i < n >> 1; i++) peak = Math.max(peak, Math.abs(r.getInt16(44 + 2 * i, true)));
  assert.ok(peak > 9800 && peak <= 10000, 'peak ' + peak); ok('a 44.1 kHz clip is halved to a valid 22.05 kHz WAV');
  const odd = new Uint8Array([1, 2, 3]); assert.equal(halveWav(odd), odd);
  w.setUint16(22, 2, true); assert.equal(halveWav(src), src); ok('any other format is passed through');
  assert.deepEqual([...fromBase64(Buffer.from([0, 1, 254, 255]).toString('base64'))], [0, 1, 254, 255]); ok('base64 decoding');
}
