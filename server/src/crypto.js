// Small helpers on the Web Crypto API (the same code runs in Cloudflare Workers and in Node 22).
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(s) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}

// no 0/O/1/I/L/U: nothing to misread when a player types the code in
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export function randomCode(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let s = '';
  for (const b of a) s += ALPHABET[b % ALPHABET.length];
  return s;
}

// Recovery code: TAPPY-XXXX-XXXX (8 characters, about 39 bits). Stored only as a hash.
export function newRecoveryCode() {
  return `TAPPY-${randomCode(4)}-${randomCode(4)}`;
}
export function normaliseRecovery(code) {
  const s = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^TAPPY([A-Z0-9]{8})$/.exec(s);
  return m ? `TAPPY-${m[1].slice(0, 4)}-${m[1].slice(4)}` : null;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
export async function hmac(secret, msg) {
  return hex(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(msg)));
}

// constant-time string compare
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
