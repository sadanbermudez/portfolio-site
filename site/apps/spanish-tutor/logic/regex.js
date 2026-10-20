// Curriculum regexes are written for Android's ICU engine, where \w and \b know accented letters («está» is one
// word). JavaScript's \w and \b are ASCII-only even with the u flag, so «\best[aá]\b» would miss «está». This
// rewrites \w, \W, \b, \B and \d into Unicode classes before compiling, so a pattern behaves as it does on the phone.
const W = '\\p{L}\\p{M}\\p{N}_';
const B = `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`;
const NB = `(?:(?<=[${W}])(?=[${W}])|(?<![${W}])(?![${W}]))`;

export function icuRegex(source, flags = '') {
  let out = '', inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\' && i + 1 < source.length) {
      const n = source[i + 1];
      i++;
      if (n === 'w') out += inClass ? W : `[${W}]`;
      else if (n === 'W') out += inClass ? '' : `[^${W}]`;   // never used inside a class by the curriculum
      else if (n === 'd') out += inClass ? '\\p{Nd}' : '\\p{Nd}';
      else if (n === 'b' && !inClass) out += B;
      else if (n === 'B' && !inClass) out += NB;
      else out += '\\' + n;
      continue;
    }
    if (c === '[' && !inClass) inClass = true;
    else if (c === ']' && inClass) inClass = false;
    out += c;
  }
  return new RegExp(out, flags.includes('u') ? flags : flags + 'u');
}

/** Same as Kotlin's Regex.escape for a literal inside a pattern. */
export const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
