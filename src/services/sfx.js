import { Save } from './save.js';

let ctx = null;

export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}

function tone(f0, f1, dur, type = 'square', vol = 0.05, delay = 0) {
  if (!ctx || !Save.data.settings.sound) return;
  try {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch {}
}

export function vibrate(ms) {
  if (!Save.data.settings.haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

// Synth placeholders. Real audio assets replace these later without touching game code.
export const sfx = {
  jump: () => tone(300, 620, 0.11),
  land: () => tone(150, 90, 0.07, 'triangle', 0.08),
  coin: () => {
    tone(900, 1300, 0.07);
    tone(1300, 1800, 0.09, 'square', 0.04, 0.06);
  },
  hit: () => tone(240, 60, 0.28, 'sawtooth', 0.07),
  die: () => {
    tone(300, 80, 0.45, 'sawtooth', 0.07);
  },
  revive: () => {
    tone(400, 800, 0.12, 'triangle', 0.07);
    tone(600, 1200, 0.18, 'triangle', 0.07, 0.1);
  },
  ui: () => tone(500, 700, 0.06, 'square', 0.04),
  // RED ZONE: two-tone siren over a low thump
  redZone: () => {
    tone(95, 38, 0.55, 'sine', 0.14);
    for (let i = 0; i < 4; i++) tone(i % 2 ? 900 : 480, i % 2 ? 480 : 900, 0.2, 'sawtooth', 0.05, i * 0.2);
    tone(1200, 1200, 0.25, 'square', 0.03, 0.85);
  },
  // BLACK ZONE: lights dying (long falling sweep), two slow heartbeats, then the lantern clicks on
  blackZone: () => {
    tone(1100, 60, 0.95, 'sawtooth', 0.045);
    tone(640, 45, 0.95, 'square', 0.02, 0.05);
    for (const t of [0.7, 0.95, 1.55, 1.8]) tone(80, 38, 0.2, 'sine', 0.2, t);
    tone(1900, 1900, 0.04, 'square', 0.04, 2.2);
  },
  // PHANTOM ZONE: a deep boom under a long swell that collapses, then three slow heartbeats
  phantomZone: () => {
    tone(70, 30, 1.1, 'sine', 0.2);
    tone(220, 900, 0.9, 'sawtooth', 0.035);
    tone(900, 50, 1.1, 'sawtooth', 0.04, 0.9);
    for (const t of [1.3, 1.6, 2.2]) tone(70, 34, 0.2, 'sine', 0.2, t);
  },
  // the black hole is about to pull: a rumble that swells over the warning time
  pullWarn: () => {
    tone(60, 120, 1.15, 'sine', 0.16);
    tone(300, 640, 1.1, 'triangle', 0.025);
  },
  // the pull itself lets go
  pullStart: () => tone(520, 70, 0.5, 'sawtooth', 0.05),
  spitWarn: () => tone(620, 900, 0.14, 'square', 0.025),
  spit: () => tone(520, 160, 0.2, 'sawtooth', 0.045),
};
