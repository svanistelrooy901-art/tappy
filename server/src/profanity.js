// Nickname screening for Bahasa Malaysia and English. Best effort by design: the admin rename is the safety net.
// Names are normalised first (lowercase, look-alike digits and symbols folded to letters, separators removed,
// repeated letters collapsed), so "f.u.c.k", "fuuuck" and "5h1t" are caught as well.

const FOLD = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

export function normalise(s) {
  let out = '';
  for (const ch of String(s).toLowerCase().normalize('NFKD')) {
    if (/[̀-ͯ]/.test(ch)) continue; // accents
    out += FOLD[ch] ?? ch;
  }
  return out.replace(/[^a-z]/g, ''); // drops digits that were not folded, separators, spaces
}

// uniqueness key: look-alikes folded, separators removed, other digits kept (so Mamu and Mamu2 stay different people)
export function skeleton(s) {
  let out = '';
  for (const ch of String(s).toLowerCase()) out += FOLD[ch] ?? ch;
  return out.replace(/[._-]/g, '');
}

// A word matches even with letters stretched ("fuuuck"), but doubled letters in the word must really be doubled,
// so "nigg" does not catch "Nigel" and "kkk" does not catch every name with a k.
const stretch = (w) => w.split('').map((c) => `${c}+`).join('');

// blocked anywhere inside the name (long enough not to hit innocent words)
const CONTAINS = [
  // English
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'bastard', 'asshole', 'nigg', 'fagg', 'retard',
  'rapist', 'nazi', 'hitler', 'porn', 'penis', 'vagina', 'cumshot', 'blowjob', 'handjob', 'jerkoff', 'wank', 'twat', 'molest',
  'pedo', 'paedo', 'kkk', 'terroris', 'isis',
  // Bahasa Malaysia / Indonesian
  'babi', 'sial', 'bodoh', 'puki', 'pantat', 'pukimak', 'lancau', 'lancap', 'cibai', 'kimak', 'bangsat', 'anjing', 'celaka',
  'haramjadah', 'jubur', 'sundal', 'pelacur', 'lonte', 'kontol', 'memek', 'jancuk', 'ngentot', 'pepek', 'butoh', 'burit',
  'bohsia', 'gampang', 'keparat', 'tolol', 'bongok', 'dungu', 'setan', 'syaitan', 'najis', 'laknat', 'bedebah', 'perempuanjalang',
  'sohai', 'kanjing', 'pundek', 'puntek', 'kunyit', 'bapokau', 'mampus',
].map((w) => new RegExp(stretch(w)));

// short words only blocked as the WHOLE name (so "class" and "assist" stay legal)
const EXACT = ['ass', 'sex', 'cum', 'tit', 'tits', 'fag', 'gay', 'dik', 'anus', 'rape', 'jew', 'kafir', 'cina', 'india', 'melayu', 'mati', 'bunuh'].map((w) => new RegExp(`^${stretch(w)}$`));

export const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'support', 'tappy', 'digitalsambal', 'sambal', 'official', 'staff', 'system', 'null', 'undefined', 'root', 'claude', 'anthropic', 'google', 'admob'].map((w) => new RegExp(`^${stretch(w)}$`));

export function isBlocked(nick) {
  const n = normalise(nick);
  if (!n) return true; // nothing but symbols
  return EXACT.some((re) => re.test(n)) || CONTAINS.some((re) => re.test(n));
}

export function isReserved(nick) {
  const n = normalise(nick);
  return RESERVED.some((re) => re.test(n));
}
