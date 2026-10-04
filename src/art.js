import { makeAllHd } from './art_hd.js';
// Placeholder pixel art, generated in code from the character sheet's palette and proportions.
// Each "art pixel" is PX x PX texture pixels. Swap these for real sprite sheets later; keys stay the same.

const PX = 2;

export const SKINS = {
  default: { body: '#6ee7b7', shade: '#34b58a', light: '#b9f7da', foot: '#1f6f5c', pack: '#2b3340', packLight: '#ff8a1f', iris: '#2a6bff', orb: '#3ee0ff' },
  blue: { body: '#6aa8ff', shade: '#3a6fd1', light: '#b8d4ff', foot: '#27468a', pack: '#2b3340', packLight: '#ff8a1f', iris: '#16c1a0', orb: '#3ee0ff' },
  purple: { body: '#b58cff', shade: '#7d52d1', light: '#dcc8ff', foot: '#4b2f8a', pack: '#2b3340', packLight: '#ff8a1f', iris: '#2a6bff', orb: '#ff7ad9' },
  pink: { body: '#ff9ccf', shade: '#d1639b', light: '#ffd0e8', foot: '#8a3a66', pack: '#2b3340', packLight: '#ff8a1f', iris: '#2a6bff', orb: '#ff7ad9' },
  yellow: { body: '#ffe27a', shade: '#d1ac3a', light: '#fff2b8', foot: '#8a6f27', pack: '#2b3340', packLight: '#ff8a1f', iris: '#2a6bff', orb: '#fff27a' },
  red: { body: '#ff6b6b', shade: '#c93c3c', light: '#ffb0b0', foot: '#7a2020', pack: '#2b3340', packLight: '#ffd23f', iris: '#2a6bff', orb: '#ffd23f' },
  black: { body: '#4a4f5c', shade: '#2d313b', light: '#7b8294', foot: '#1a1d24', pack: '#6b7280', packLight: '#ff8a1f', iris: '#2a6bff', orb: '#3ee0ff' },
};

const OUT = '#0c2a3a';

function grid(w, h) {
  return Array.from({ length: h }, () => Array(w).fill(null));
}
function put(g, x, y, c) {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
}
function rect(g, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c);
}
function ell(g, cx, cy, rx, ry, c, only = null) {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (only === null || g[y][x] === only)) g[y][x] = c;
    }
  }
}
function outline(g, col = OUT) {
  const h = g.length;
  const w = g[0].length;
  const add = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y][x]) continue;
      if ((x > 0 && g[y][x - 1]) || (x < w - 1 && g[y][x + 1]) || (y > 0 && g[y - 1][x]) || (y < h - 1 && g[y + 1][x])) add.push([x, y]);
    }
  }
  for (const [x, y] of add) g[y][x] = col;
}
function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, w, h);
  const c = t.getContext();
  c.imageSmoothingEnabled = false;
  draw(c, w, h);
  t.refresh();
  t.setFilter(1); // NEAREST
  return t;
}
function render(scene, key, g) {
  const h = g.length;
  const w = g[0].length;
  canvasTex(scene, key, w * PX, h * PX, (c) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (g[y][x]) {
          c.fillStyle = g[y][x];
          c.fillRect(x * PX, y * PX, PX, PX);
        }
      }
    }
  });
}
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- the alien: one eye, antenna, little arms/feet, backpack (per the character sheet) ----------
export function makeAlien(scene, key, pal, expr = 'idle', look = 0) {
  const g = grid(18, 22);
  // backpack pokes out on both sides
  rect(g, 0, 11, 2, 5, pal.pack);
  rect(g, 16, 11, 2, 5, pal.pack);
  put(g, 0, 13, pal.packLight);
  put(g, 17, 13, pal.packLight);
  // body
  ell(g, 9, 12, 7.5, 7.5, pal.body);
  for (let y = 0; y < 22; y++) for (let x = 0; x < 18; x++) if (g[y][x] === pal.body && (x - 9) * 0.8 + (y - 12) > 5.4) g[y][x] = pal.shade;
  ell(g, 6.2, 8, 1.6, 1.1, pal.light, pal.body);
  // feet
  rect(g, 5, 19, 4, 3, pal.foot);
  rect(g, 10, 19, 4, 3, pal.foot);
  // little arms
  ell(g, 2.4, 14.6, 1.8, 1.8, pal.body);
  ell(g, 15.6, 14.6, 1.8, 1.8, pal.body);
  // antenna
  put(g, 9, 4, pal.shade);
  put(g, 9, 3, pal.shade);
  put(g, 10, 2, pal.shade);
  ell(g, 12, 1.6, 1.8, 1.8, pal.orb);
  put(g, 11, 1, '#ffffff');
  // the eye
  ell(g, 9, 11, 5, 5, '#ffffff');
  if (expr === 'hurt' || expr === 'dead') {
    for (let i = 0; i < 5; i++) {
      put(g, 7 + i, 9 + i, OUT);
      put(g, 11 - i, 9 + i, OUT);
    }
    rect(g, 7, 16, 4, 1, OUT);
  } else {
    const big = expr === 'fall';
    ell(g, 9 + look, 11.4, big ? 2.6 : 3.1, big ? 2.8 : 3.3, pal.iris);
    ell(g, 9 + look, 11.5, big ? 1.1 : 1.6, big ? 1.2 : 1.8, '#0a1030');
    put(g, 8 + look, 10, '#ffffff');
    put(g, 10 + look, 12, '#cfe0ff');
    if (expr === 'jump') rect(g, 8, 16, 2, 2, OUT);
    else if (expr === 'fall') rect(g, 8, 16, 2, 2, OUT);
    else {
      put(g, 8, 16, OUT);
      put(g, 9, 17, OUT);
      put(g, 10, 17, OUT);
      put(g, 11, 16, OUT);
    }
  }
  outline(g);
  render(scene, key, g);
}

// ---------- platforms ----------
const THEMES = {
  amber: { hi: '#ffd27a', top: '#f2a93b', topShade: '#c97a1a', rock: '#7a5240', dark: '#4a3328', glow: '#ffb85a' },
  ice: { hi: '#e6fbff', top: '#a8e8ff', topShade: '#6bc0e8', rock: '#5b7fb0', dark: '#34507a', glow: '#bff3ff' },
  violet: { hi: '#e0b8ff', top: '#b26bff', topShade: '#7a3fd1', rock: '#5a4880', dark: '#32264d', glow: '#d9a8ff' },
};

export function platformKey(scene, theme, w) {
  const name = typeof theme === 'number' ? ['amber', 'ice', 'violet'][theme % 3] : theme;
  const gw = Math.round(w / 2);
  const key = `plat_${name}_${gw}`;
  if (scene.textures.exists(key)) return key;
  const T = THEMES[name];
  const gh = 13;
  const g = grid(gw, gh);
  for (let y = 0; y < gh; y++) {
    const inset = y < 2 ? 0 : Math.floor((y - 1) * 0.5 + hash(y, 7) * 1.4);
    const insetR = y < 2 ? 0 : Math.floor((y - 1) * 0.5 + hash(y, 13) * 1.4);
    for (let x = inset; x < gw - insetR; x++) {
      if (y >= 10 && hash(x, y) < 0.3) continue; // ragged underside
      let c;
      if (y === 0) c = T.hi;
      else if (y === 1) c = T.top;
      else if (y === 2) c = hash(x, 99) < 0.5 ? T.topShade : T.rock;
      else c = (x * 5 + y * 3) % 7 === 0 || x > gw - 4 - y * 0.3 ? T.dark : T.rock;
      g[y][x] = c;
    }
  }
  outline(g);
  render(scene, key, g);
  return key;
}

// ---------- hazards, coins, hearts ----------
function discTex(scene, key, size, pal, spikes = false) {
  const g = grid(size, size);
  const c = size / 2;
  const R = spikes ? size * 0.32 : size / 2 - 0.5;
  ell(g, c, c, R, R, pal.base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (g[y][x] === pal.base) {
      const n = hash(x, y + size);
      if (n < 0.18) g[y][x] = pal.dark;
      else if ((x - c) + (y - c) < -R * 0.7 && n < 0.7) g[y][x] = pal.light;
    }
  }
  if (spikes) {
    const L = size / 2 - 0.5;
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      for (let r = R; r <= L; r += 0.5) put(g, Math.floor(c + Math.cos(ang) * r), Math.floor(c + Math.sin(ang) * r), pal.dark);
    }
    ell(g, c, c, 1.8, 1.8, pal.glow);
  } else if (pal.glow) {
    for (let i = 0; i < 4; i++) put(g, Math.floor(c - 3 + hash(i, 3) * 6), Math.floor(c - 3 + hash(i, 5) * 6), pal.glow);
  }
  outline(g);
  render(scene, key, g);
}

export function makeHazards(scene) {
  discTex(scene, 'haz_rock', 14, { base: '#8a8fa3', dark: '#5a5f73', light: '#c4c9dc' });
  discTex(scene, 'haz_lava', 14, { base: '#d9532b', dark: '#7a1f10', light: '#ff9a3c', glow: '#ffd23f' });
  discTex(scene, 'haz_mine', 16, { base: '#5b6075', dark: '#2b2f3e', light: '#9aa0b8', glow: '#ff5a3c' }, true);
}

export function makeCoin(scene) {
  const g = grid(10, 10);
  ell(g, 5, 5, 4.6, 4.6, '#ffd23f');
  ell(g, 5, 5, 3.2, 3.2, '#ffb81f');
  put(g, 3, 2, '#fff3a0');
  put(g, 2, 3, '#fff3a0');
  // star
  put(g, 5, 3, '#fff3a0');
  rect(g, 4, 4, 3, 2, '#fff3a0');
  put(g, 5, 6, '#fff3a0');
  outline(g, '#8a4b00');
  render(scene, 'coin', g);
}

export function makeHearts(scene) {
  const shape = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  const mk = (key, fill, hi) => {
    const g = grid(9, 8);
    shape.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && put(g, x + 1, y + 1, fill)));
    if (hi) {
      put(g, 2, 2, hi);
      put(g, 3, 2, hi);
      put(g, 2, 3, hi);
    }
    outline(g, '#2a0d1c');
    canvasTex(scene, key, 9 * 3, 8 * 3, (c) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) if (g[y][x]) {
        c.fillStyle = g[y][x];
        c.fillRect(x * 3, y * 3, 3, 3);
      }
    });
  };
  mk('heart_full', '#ff3b5c', '#ff9aa9');
  mk('heart_empty', '#3a2a4a', null);
}

// ---------- background ----------
export function makeBackground(scene, W, H) {
  canvasTex(scene, 'bg_grad', W, H, (c) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0620');
    g.addColorStop(0.55, '#150c42');
    g.addColorStop(1, '#2a1670');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  });
  const starTile = (key, n, sizeMax, colors, seed) => {
    canvasTex(scene, key, 180, 180, (c) => {
      for (let i = 0; i < n; i++) {
        const x = Math.floor(hash(i, seed) * 90) * 2;
        const y = Math.floor(hash(i, seed + 1) * 90) * 2;
        const s = hash(i, seed + 2) < 0.2 ? sizeMax : 2;
        c.fillStyle = colors[Math.floor(hash(i, seed + 3) * colors.length)];
        c.fillRect(x, y, s, s);
      }
    });
  };
  starTile('stars_far', 44, 2, ['#6a5acd', '#8a7be0', '#5d6fe0'], 11);
  starTile('stars_near', 26, 4, ['#ffffff', '#bfeaff', '#ffe9a8'], 29);
}

export function makePlanet(scene, key, size, base, shade, light, ring = null) {
  const g = grid(size, size);
  const c = size / 2;
  ell(g, c, c, c - 1, c - 1, base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (g[y][x] === base) {
      const d = (x - c) * 0.7 + (y - c) * 0.9;
      if (d > c * 0.35) g[y][x] = shade;
      else if (d < -c * 0.55 && hash(x, y) < 0.8) g[y][x] = light;
      if ((y % 7 === 3 || y % 11 === 5) && g[y][x] === base && hash(x, y) < 0.7) g[y][x] = shade;
    }
  }
  if (ring) {
    for (let x = 0; x < size; x++) {
      const t = (x - c) / c;
      const y = Math.round(c + 0.1 * c + Math.sin(t * 1.3) * -2 + t * c * 0.15);
      for (let k = 0; k < 2; k++) if (Math.abs(t) > 0.45 || y > c) put(g, x, y + k, ring);
    }
  }
  render(scene, key, g);
}

// texture key for one skin + pose, e.g. alien_blue_jump_l
export const alienKey = (skin, pose) => `alien_${skin}_${pose}`;

// Generates every pose of one skin (idempotent). Cheap: six tiny pixel grids.
export function ensureSkin(scene, id) {
  if (scene.textures.exists(alienKey(id, 'idle'))) return;
  const pal = SKINS[id] || SKINS.default;
  makeAlien(scene, alienKey(id, 'idle'), pal, 'idle');
  makeAlien(scene, alienKey(id, 'jump'), pal, 'jump');
  makeAlien(scene, alienKey(id, 'jump_l'), pal, 'jump', -1);
  makeAlien(scene, alienKey(id, 'jump_r'), pal, 'jump', 1);
  makeAlien(scene, alienKey(id, 'fall'), pal, 'fall');
  makeAlien(scene, alienKey(id, 'hurt'), pal, 'hurt');
}

export function makeAllArt(scene, W, H) {
  ensureSkin(scene, 'default');
  makeAllHd(scene, W, H); // smooth hi-res world, background and UI art
}
