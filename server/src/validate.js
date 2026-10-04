import { isBlocked, isReserved, skeleton } from './profanity.js';

export const NICK_MIN = 3;
export const NICK_MAX = 12;

// letters, digits, underscore, dot, dash. No spaces, no emoji. (Easy to read on the board, hard to spoof.)
const NICK_RE = /^[A-Za-z0-9._-]+$/;

// Everything that is not a country (Intl knows these codes as regions)
const NOT_COUNTRIES = new Set(['EU', 'UN', 'ZZ', 'XA', 'XB', 'EZ', 'QO', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA', 'XK_']);

let names = null;
export function isCountry(code) {
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code) || NOT_COUNTRIES.has(code)) return false;
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'region' });
    const n = names.of(code);
    return !!n && n !== code && n !== 'Unknown Region';
  } catch {
    return false;
  }
}

// -> { ok:true, nick, key } | { ok:false, reason }
export function checkNickname(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'nick_format' };
  const nick = raw.trim();
  if (nick.length < NICK_MIN) return { ok: false, reason: 'nick_short' };
  if (nick.length > NICK_MAX) return { ok: false, reason: 'nick_long' };
  if (!NICK_RE.test(nick)) return { ok: false, reason: 'nick_chars' };
  if (!/[A-Za-z]/.test(nick)) return { ok: false, reason: 'nick_chars' }; // at least one letter
  if (isReserved(nick)) return { ok: false, reason: 'nick_reserved' };
  if (isBlocked(nick)) return { ok: false, reason: 'nick_blocked' };
  return { ok: true, nick, key: skeleton(nick) };
}
