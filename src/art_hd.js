// High-resolution, smooth art for the world, background and UI. Everything is drawn in code
// (gradients, glows, soft lighting) in LOGICAL units and rasterised at CFG.Z x for a crisp, premium look.
// The pixel-art alien stays in art.js (character sheet is the visual truth).
import { CFG } from './config.js';

const Z = CFG.Z;
const TAU = Math.PI * 2;

export const FONT = 'Fredoka, "Baloo 2", Nunito, "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

export const SKY = [
  ['#06031a', '#190b3d', '#4a1d6a'], // amber / violet-warm
  ['#030c1c', '#0a2145', '#145a8c'], // ice
  ['#0a0320', '#2a0f5e', '#8a2a8f'], // violet
];
export const NEBULA_TINT = [
  [0xff7ac8, 0x6a7bff],
  [0x4fd8ff, 0x7a8cff],
  [0xc07bff, 0xff7ab0],
];

export const THEME_HD = {
  amber: { top: '#ffe2b0', edge: '#ffb347', rock: '#7a5240', dark: '#2b1a24', glow: '#ff9a3c', fleck: '#ffd27a' },
  ice: { top: '#e2f9ff', edge: '#7fe3ff', rock: '#44729a', dark: '#14243e', glow: '#5fd0ff', fleck: '#bff3ff' },
  violet: { top: '#f1d9ff', edge: '#c58cff', rock: '#6a449f', dark: '#1f1040', glow: '#b46bff', fleck: '#e6c4ff' },
};

const hash = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// canvas texture authored in logical units
function hdTex(scene, key, w, h, draw, filter = 0, zs = Z) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, Math.ceil(w * zs), Math.ceil(h * zs));
  const c = t.getContext();
  c.scale(zs, zs);
  draw(c, w, h);
  t.refresh();
  t.setFilter(filter);
  return t;
}

function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}
function rad(c, x, y, r0, r1, stops, x1 = x, y1 = y) {
  const g = c.createRadialGradient(x, y, r0, x1, y1, r1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}
function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---------------------------------------------------------------- background
function makeSky(scene, W, H) {
  SKY.forEach((s, i) =>
    hdTex(scene, `sky_${i}`, W, H, (c) => {
      c.fillStyle = lin(c, 0, 0, 0, H, [[0, s[0]], [0.55, s[1]], [1, s[2]]]);
      c.fillRect(0, 0, W, H);
      // soft horizon bloom at the bottom
      c.fillStyle = rad(c, W * 0.5, H * 1.05, 10, H * 0.7, [[0, rgba(s[2], 0.55)], [1, rgba(s[2], 0)]]);
      c.fillRect(0, 0, W, H);
    }, 0, 1)
  );
}

function makeNebula(scene, W, H) {
  const mk = (key, seed, count, rMin, rMax, alpha) =>
    hdTex(scene, key, W, H, (c) => {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < count; i++) {
        const x = hash(i, seed) * W;
        const y = hash(i, seed + 1) * H;
        const r = rMin + hash(i, seed + 2) * (rMax - rMin);
        const a = alpha * (0.5 + hash(i, seed + 3) * 0.5);
        for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
          const g = rad(c, x + ox, y + oy, 0, r, [[0, `rgba(255,255,255,${a})`], [0.5, `rgba(255,255,255,${a * 0.35})`], [1, 'rgba(255,255,255,0)']]);
          c.fillStyle = g;
          c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }, 0, 1);
  mk('nebula_a', 3, 7, 110, 230, 0.34);
  mk('nebula_b', 17, 6, 90, 190, 0.3);
}

function makeStars(scene, W, H) {
  const mk = (key, seed, n, rMin, rMax, glintChance, tint) =>
    hdTex(scene, key, W, H, (c) => {
      for (let i = 0; i < n; i++) {
        const x = hash(i, seed) * W;
        const y = hash(i, seed + 1) * H;
        const r = rMin + hash(i, seed + 2) * (rMax - rMin);
        const col = tint[Math.floor(hash(i, seed + 3) * tint.length)];
        const a = 0.55 + hash(i, seed + 4) * 0.45;
        c.fillStyle = rad(c, x, y, 0, r * 3, [[0, rgba(col, a)], [0.25, rgba(col, a * 0.55)], [1, rgba(col, 0)]]);
        c.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
        c.fillStyle = '#ffffff';
        c.globalAlpha = a;
        c.beginPath();
        c.arc(x, y, r * 0.55, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
        if (hash(i, seed + 5) < glintChance) {
          c.strokeStyle = rgba(col, 0.55);
          c.lineWidth = 0.6;
          c.beginPath();
          c.moveTo(x - r * 3.6, y);
          c.lineTo(x + r * 3.6, y);
          c.moveTo(x, y - r * 3.6);
          c.lineTo(x, y + r * 3.6);
          c.stroke();
        }
      }
    });
  mk('stars_far', 11, 120, 0.5, 0.9, 0, ['#8d86ff', '#a6a0ff', '#7fa0ff']);
  mk('stars_mid', 29, 46, 0.8, 1.4, 0.06, ['#ffffff', '#cfe6ff', '#ffe9c4']);
  mk('stars_near', 47, 16, 1.2, 2.1, 0.5, ['#ffffff', '#bfeaff', '#ffe2a8']);
}

function drawPlanet(c, cx, cy, r, o) {
  // atmosphere
  c.fillStyle = rad(c, cx, cy, r * 0.9, r * 1.45, [[0, rgba(o.rim, 0.5)], [1, rgba(o.rim, 0)]]);
  c.beginPath();
  c.arc(cx, cy, r * 1.45, 0, TAU);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.clip();
  // lit sphere
  c.fillStyle = rad(c, cx - r * 0.38, cy - r * 0.42, r * 0.05, r * 1.6, [[0, o.light], [0.38, o.base], [1, o.dark]]);
  c.fillRect(cx - r, cy - r, r * 2, r * 2);
  // cloud bands
  if (o.bands) {
    for (let k = 0; k < 7; k++) {
      const y = cy - r + ((k + 0.5) * 2 * r) / 7 + (hash(k, 5) - 0.5) * 6;
      const th = r * (0.06 + hash(k, 9) * 0.1);
      c.fillStyle = k % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(10,0,40,0.16)';
      c.beginPath();
      c.ellipse(cx, y, r * 1.1, th, 0, 0, TAU);
      c.fill();
    }
  }
  // terminator shadow
  c.fillStyle = rad(c, cx - r * 0.45, cy - r * 0.5, r * 0.6, r * 1.55, [[0, 'rgba(5,0,30,0)'], [0.65, 'rgba(5,0,30,0.1)'], [1, 'rgba(5,0,30,0.78)']]);
  c.fillRect(cx - r, cy - r, r * 2, r * 2);
  // soft specular
  c.fillStyle = rad(c, cx - r * 0.45, cy - r * 0.5, 0, r * 0.45, [[0, 'rgba(255,255,255,0.28)'], [1, 'rgba(255,255,255,0)']]);
  c.fillRect(cx - r, cy - r, r * 2, r * 2);
  c.restore();
  // thin rim light on the lit edge
  c.strokeStyle = rgba(o.rim, 0.5);
  c.lineWidth = 1;
  c.beginPath();
  c.arc(cx, cy, r - 0.5, Math.PI * 0.95, Math.PI * 1.65);
  c.stroke();
}

function ringHalf(c, cx, cy, rx, ry, front) {
  const bands = [
    [1.0, 0.1, 0.5],
    [0.9, 0.16, 0.32],
    [0.8, 0.07, 0.55],
  ];
  for (const [k, w, a] of bands) {
    c.strokeStyle = `rgba(236,208,255,${a})`;
    c.lineWidth = w * rx * 0.5;
    c.beginPath();
    c.ellipse(cx, cy, rx * k, ry * k, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    c.stroke();
  }
}

function makePlanets(scene) {
  hdTex(scene, 'planet_a', 170, 170, (c) => drawPlanet(c, 85, 85, 52, { base: '#6a46d0', light: '#c9a8ff', dark: '#1c0f55', rim: '#b995ff', bands: true }));
  hdTex(scene, 'planet_b', 190, 150, (c) => {
    c.save();
    c.translate(95, 75);
    c.rotate(-0.32);
    ringHalf(c, 0, 0, 82, 18, false);
    c.restore();
    drawPlanet(c, 95, 75, 34, { base: '#2f86d6', light: '#a8e4ff', dark: '#0c2a66', rim: '#7fd0ff', bands: true });
    c.save();
    c.translate(95, 75);
    c.rotate(-0.32);
    ringHalf(c, 0, 0, 82, 18, true);
    c.restore();
  });
  hdTex(scene, 'planet_c', 70, 70, (c) => drawPlanet(c, 35, 35, 17, { base: '#e07a9a', light: '#ffd0dc', dark: '#4a1445', rim: '#ffb0c8', bands: false }));
}

function makeForeground(scene) {
  const rock = (key, w, h, seed) =>
    hdTex(scene, key, w, h, (c) => {
      const cx = w / 2, cy = h / 2, n = 11;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = 0.72 + hash(i, seed) * 0.28;
        pts.push([cx + Math.cos(a) * (w / 2 - 3) * rr, cy + Math.sin(a) * (h / 2 - 3) * rr]);
      }
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fillStyle = lin(c, 0, 0, w, h, [[0, '#3a3466'], [0.45, '#1a1535'], [1, '#07041a']]);
      c.fill();
      c.strokeStyle = 'rgba(160,140,255,0.45)';
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = 'rgba(0,0,10,0.35)';
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(cx + (hash(i, seed + 3) - 0.5) * w * 0.4, cy + (hash(i, seed + 4) - 0.5) * h * 0.4, 5 + i * 2, 3 + i, 0.4, 0, TAU);
        c.fill();
      }
    });
  rock('fg_rock_a', 84, 70, 5);
  rock('fg_rock_b', 56, 48, 23);
}

function makeGlows(scene) {
  hdTex(scene, 'glow', 64, 64, (c) => {
    c.fillStyle = rad(c, 32, 32, 0, 32, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, 64, 64);
  });
  hdTex(scene, 'dot', 12, 12, (c) => {
    c.fillStyle = rad(c, 6, 6, 0, 6, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, 12, 12);
  });
  hdTex(scene, 'vignette', CFG.W, CFG.H, (c, w, h) => {
    c.fillStyle = rad(c, w / 2, h * 0.5, h * 0.28, h * 0.78, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(2,0,14,0.62)']]);
    c.fillRect(0, 0, w, h);
  }, 0, 1);
  hdTex(scene, 'scrim_top', CFG.W, 130, (c, w, h) => {
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, 'rgba(4,2,16,0.72)'], [0.6, 'rgba(4,2,16,0.28)'], [1, 'rgba(4,2,16,0)']]);
    c.fillRect(0, 0, w, h);
  });
  hdTex(scene, 'scrim_bottom', CFG.W, 150, (c, w, h) => {
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, 'rgba(4,2,16,0)'], [1, 'rgba(4,2,16,0.6)']]);
    c.fillRect(0, 0, w, h);
  });
}

// ---------------------------------------------------------------- platforms
export const PLAT_TOP = 6;
export const PLAT_H = 50;
export function platformKey(scene, theme, w) {
  const name = typeof theme === 'number' ? ['amber', 'ice', 'violet'][theme % 3] : theme;
  const key = `plat_hd_${name}_${w}`;
  if (scene.textures.exists(key)) return key;
  const T = THEME_HD[name];
  const PAD = 10;
  hdTex(scene, key, w + PAD * 2, PLAT_H, (c) => {
    const x0 = PAD, x1 = PAD + w, top = PLAT_TOP;
    // glow beneath
    c.fillStyle = rad(c, w / 2 + PAD, top + 26, 4, w * 0.6, [[0, rgba(T.glow, 0.22)], [1, rgba(T.glow, 0)]]);
    c.save();
    c.scale(1, 0.55);
    c.fillRect(0, 0, w + PAD * 2, PLAT_H * 2);
    c.restore();
    // rock body: deeper in the middle, ragged
    c.beginPath();
    c.moveTo(x0 + 2, top + 5);
    c.lineTo(x1 - 2, top + 5);
    const seg = Math.max(6, Math.round(w / 14));
    for (let i = 0; i <= seg; i++) {
      const u = 1 - i / seg;
      const depth = 11 + 24 * (1 - Math.pow(Math.abs(2 * u - 1), 1.5)) + (hash(i, w) - 0.5) * 6;
      c.lineTo(x0 + u * w, top + 5 + Math.max(4, depth));
    }
    c.closePath();
    c.fillStyle = lin(c, 0, top, 0, top + 40, [[0, T.rock], [1, T.dark]]);
    c.fill();
    // facets
    c.save();
    c.clip();
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i < seg; i += 2) {
      const fx = x0 + (i / seg) * w;
      c.beginPath();
      c.moveTo(fx, top + 5);
      c.lineTo(fx + w / seg, top + 5);
      c.lineTo(fx + w / seg / 2, top + 40);
      c.closePath();
      c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fillRect(x0, top + 5, w, 3);
    // glowing specks
    for (let i = 0; i < Math.round(w / 40); i++) {
      const fx = x0 + 10 + hash(i, w + 1) * (w - 20);
      const fy = top + 14 + hash(i, w + 2) * 12;
      c.fillStyle = rad(c, fx, fy, 0, 4, [[0, rgba(T.fleck, 0.9)], [1, rgba(T.fleck, 0)]]);
      c.fillRect(fx - 4, fy - 4, 8, 8);
    }
    c.restore();
    // top slab with lit edge
    rrect(c, x0, top, w, 8, 4);
    c.fillStyle = lin(c, 0, top, 0, top + 8, [[0, T.top], [1, T.edge]]);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(x0 + 5, top + 0.8);
    c.lineTo(x1 - 5, top + 0.8);
    c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x0 + 3, top + 8, w - 6, 1.3);
  });
  return key;
}

// ---------------------------------------------------------------- hazards, coin, hearts
function makeHazardsHd(scene) {
  hdTex(scene, 'haz_rock', 44, 44, (c) => {
    const cx = 22, cy = 22, n = 13;
    c.fillStyle = rad(c, cx, cy, 6, 22, [[0, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, 0, 44, 44);
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = 13 * (0.88 + hash(i, 3) * 0.2);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    c.fillStyle = rad(c, cx - 5, cy - 6, 1, 20, [[0, '#d6d9ec'], [0.4, '#8a8fa8'], [1, '#2a2d40']]);
    c.fill();
    c.strokeStyle = '#161826';
    c.lineWidth = 1.3;
    c.stroke();
    [[-4, 3, 3.5], [5, -3, 2.6], [3, 6, 2.2]].forEach(([dx, dy, r]) => {
      c.fillStyle = 'rgba(30,32,50,0.55)';
      c.beginPath();
      c.ellipse(cx + dx, cy + dy, r, r * 0.8, 0.4, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.22)';
      c.lineWidth = 0.7;
      c.beginPath();
      c.ellipse(cx + dx, cy + dy + 0.6, r, r * 0.8, 0.4, 0.2, Math.PI - 0.2);
      c.stroke();
    });
  });
  hdTex(scene, 'haz_lava', 44, 44, (c) => {
    const cx = 22, cy = 22;
    c.fillStyle = rad(c, cx, cy, 8, 22, [[0, 'rgba(255,120,40,0.6)'], [1, 'rgba(255,90,20,0)']]);
    c.fillRect(0, 0, 44, 44);
    c.beginPath();
    c.arc(cx, cy, 13, 0, TAU);
    c.fillStyle = rad(c, cx - 3, cy - 3, 1, 14, [[0, '#fff6b0'], [0.35, '#ffb02e'], [0.75, '#e2481a'], [1, '#6a1408']]);
    c.fill();
    c.strokeStyle = '#4a0f06';
    c.lineWidth = 1.4;
    c.stroke();
    c.strokeStyle = 'rgba(255,230,120,0.85)';
    c.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = hash(i, 8) * TAU;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3);
      c.lineTo(cx + Math.cos(a + 0.4) * 9, cy + Math.sin(a + 0.4) * 9);
      c.lineTo(cx + Math.cos(a - 0.1) * 12, cy + Math.sin(a - 0.1) * 12);
      c.stroke();
    }
  });
  hdTex(scene, 'haz_mine', 48, 48, (c) => {
    const cx = 24, cy = 24;
    c.fillStyle = rad(c, cx, cy, 6, 24, [[0, 'rgba(255,60,40,0.35)'], [1, 'rgba(255,60,40,0)']]);
    c.fillRect(0, 0, 48, 48);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const ux = Math.cos(a), uy = Math.sin(a);
      c.beginPath();
      c.moveTo(cx + ux * 9 - uy * 3.4, cy + uy * 9 + ux * 3.4);
      c.lineTo(cx + ux * 19, cy + uy * 19);
      c.lineTo(cx + ux * 9 + uy * 3.4, cy + uy * 9 - ux * 3.4);
      c.closePath();
      c.fillStyle = '#4b5068';
      c.fill();
      c.strokeStyle = '#14172a';
      c.lineWidth = 1;
      c.stroke();
    }
    c.beginPath();
    c.arc(cx, cy, 11, 0, TAU);
    c.fillStyle = rad(c, cx - 4, cy - 4, 1, 14, [[0, '#c4c9de'], [0.45, '#5b6178'], [1, '#161a2b']]);
    c.fill();
    c.strokeStyle = '#0d1020';
    c.lineWidth = 1.3;
    c.stroke();
    c.fillStyle = rad(c, cx, cy, 0, 5.5, [[0, '#ffd2c8'], [0.4, '#ff4a38'], [1, 'rgba(255,60,40,0)']]);
    c.beginPath();
    c.arc(cx, cy, 5.5, 0, TAU);
    c.fill();
  });
}

function makeCoinHd(scene) {
  hdTex(scene, 'coin', 30, 30, (c) => {
    const cx = 15, cy = 15;
    c.fillStyle = rad(c, cx, cy, 6, 15, [[0, 'rgba(255,214,80,0.45)'], [1, 'rgba(255,214,80,0)']]);
    c.fillRect(0, 0, 30, 30);
    c.beginPath();
    c.arc(cx, cy, 10.5, 0, TAU);
    c.fillStyle = lin(c, cx - 8, cy - 9, cx + 8, cy + 9, [[0, '#fff3a6'], [0.5, '#ffc928'], [1, '#e08a12']]);
    c.fill();
    c.strokeStyle = '#a65f08';
    c.lineWidth = 1.4;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 0.9;
    c.beginPath();
    c.arc(cx, cy, 7.6, 0, TAU);
    c.stroke();
    // star
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 2.2 : 5;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    c.fillStyle = '#fff8cc';
    c.fill();
    c.strokeStyle = 'rgba(166,95,8,0.7)';
    c.lineWidth = 0.6;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.ellipse(cx - 4.5, cy - 5, 3, 1.5, -0.7, 0, TAU);
    c.fill();
  });
}

function heartPath(c, x, y, w, h) {
  const sx = w / 24, sy = h / 22;
  const P = (px, py) => [x + px * sx, y + py * sy];
  c.beginPath();
  c.moveTo(...P(12, 21));
  c.bezierCurveTo(...P(2, 14), ...P(0, 8), ...P(3, 4));
  c.bezierCurveTo(...P(6, 0.5), ...P(11, 2), ...P(12, 6.5));
  c.bezierCurveTo(...P(13, 2), ...P(18, 0.5), ...P(21, 4));
  c.bezierCurveTo(...P(24, 8), ...P(22, 14), ...P(12, 21));
  c.closePath();
}
function makeHeartsHd(scene) {
  hdTex(scene, 'heart_full', 30, 28, (c) => {
    c.shadowColor = 'rgba(255,60,100,0.55)';
    c.shadowBlur = 5;
    heartPath(c, 3, 2.5, 24, 22);
    c.fillStyle = lin(c, 0, 2, 0, 25, [[0, '#ff8aa6'], [0.5, '#ff3b66'], [1, '#c71648']]);
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = '#6e0a26';
    c.lineWidth = 1.2;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.ellipse(9, 8, 3.4, 2, -0.7, 0, TAU);
    c.fill();
  });
  hdTex(scene, 'heart_empty', 30, 28, (c) => {
    heartPath(c, 3, 2.5, 24, 22);
    c.fillStyle = 'rgba(40,30,78,0.75)';
    c.fill();
    c.strokeStyle = 'rgba(150,130,230,0.5)';
    c.lineWidth = 1.2;
    c.stroke();
  });
}

// ---------------------------------------------------------------- UI pieces
export function uiPanelKey(scene, w, h, r = 22) {
  const key = `ui_panel_${w}x${h}_${r}`;
  if (scene.textures.exists(key)) return key;
  const P = 18;
  hdTex(scene, key, w + P * 2, h + P * 2, (c) => {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = 20;
    c.shadowOffsetY = 8;
    rrect(c, P, P, w, h, r);
    c.fillStyle = lin(c, 0, P, 0, P + h, [[0, 'rgba(52,38,118,0.94)'], [1, 'rgba(20,12,56,0.96)']]);
    c.fill();
    c.restore();
    rrect(c, P, P, w, h, r);
    c.strokeStyle = lin(c, 0, P, 0, P + h, [[0, 'rgba(200,184,255,0.7)'], [1, 'rgba(120,100,230,0.25)']]);
    c.lineWidth = 1.5;
    c.stroke();
    c.save();
    rrect(c, P + 1, P + 1, w - 2, h - 2, r - 1);
    c.clip();
    c.fillStyle = lin(c, 0, P, 0, P + h * 0.5, [[0, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(P, P, w, h * 0.5);
    c.restore();
  });
  return key;
}

export const BTN = {
  green: ['#6bf5aa', '#16b862', '#0c7a40'],
  blue: ['#7ad0ff', '#2a7de0', '#1a4fa8'],
  pink: ['#ff98b2', '#e03a6c', '#a31f48'],
  amber: ['#ffdc7a', '#f29a2a', '#b3620f'],
  ghost: ['#8c80ee', '#4a3bbd', '#2c2178'],
};
export function uiButtonKey(scene, w, h, tone = 'green') {
  const key = `ui_btn_${w}x${h}_${tone}`;
  if (scene.textures.exists(key)) return key;
  const [c1, c2, c3] = BTN[tone];
  const P = 14, r = Math.min(h / 2, 18);
  hdTex(scene, key, w + P * 2, h + P * 2, (c) => {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 12;
    c.shadowOffsetY = 5;
    rrect(c, P, P, w, h, r);
    c.fillStyle = c3;
    c.fill();
    c.restore();
    rrect(c, P, P, w, h - 3, r);
    c.fillStyle = lin(c, 0, P, 0, P + h, [[0, c1], [1, c2]]);
    c.fill();
    c.save();
    rrect(c, P, P, w, h - 3, r);
    c.clip();
    c.fillStyle = lin(c, 0, P, 0, P + (h - 3) * 0.55, [[0, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(P, P, w, (h - 3) * 0.55);
    c.restore();
    rrect(c, P + 0.5, P + 0.5, w - 1, h - 4, r);
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 1;
    c.stroke();
  });
  return key;
}

function makePauseIcon(scene) {
  hdTex(scene, 'ui_pause', 44, 44, (c) => {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 3;
    c.beginPath();
    c.arc(22, 22, 15, 0, TAU);
    c.fillStyle = lin(c, 0, 7, 0, 37, [[0, 'rgba(70,54,150,0.95)'], [1, 'rgba(28,18,76,0.95)']]);
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(200,184,255,0.6)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.arc(22, 22, 15, 0, TAU);
    c.stroke();
    c.fillStyle = '#eee9ff';
    rrect(c, 16.5, 15.5, 4, 13, 2);
    c.fill();
    rrect(c, 23.5, 15.5, 4, 13, 2);
    c.fill();
  });
}

function makeHintZone(scene) {
  hdTex(scene, 'hint_zone', 112, 100, (c, w, h) => {
    rrect(c, 2, 2, w - 4, h - 4, 22);
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, 'rgba(255,255,255,0.02)'], [1, 'rgba(160,140,255,0.2)']]);
    c.fill();
    c.strokeStyle = 'rgba(200,184,255,0.28)';
    c.lineWidth = 1.2;
    c.stroke();
  });
  const arrow = (key, dir) =>
    hdTex(scene, key, 44, 44, (c) => {
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.fillStyle = 'rgba(255,255,255,0.0)';
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.shadowColor = 'rgba(140,120,255,0.9)';
      c.shadowBlur = 8;
      c.beginPath();
      if (dir === 'l') { c.moveTo(26, 10); c.lineTo(14, 22); c.lineTo(26, 34); }
      else if (dir === 'r') { c.moveTo(18, 10); c.lineTo(30, 22); c.lineTo(18, 34); }
      else { c.moveTo(10, 28); c.lineTo(22, 15); c.lineTo(34, 28); }
      c.stroke();
    });
  arrow('arrow_l', 'l');
  arrow('arrow_r', 'r');
  arrow('arrow_u', 'u');
}


// ---------------------------------------------------------------- menu art
function glassCircle(c, cx, cy, r) {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 4;
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.fillStyle = lin(c, 0, cy - r, 0, cy + r, [[0, 'rgba(84,66,176,0.96)'], [1, 'rgba(30,20,84,0.96)']]);
  c.fill();
  c.restore();
  c.strokeStyle = lin(c, 0, cy - r, 0, cy + r, [[0, 'rgba(214,200,255,0.8)'], [1, 'rgba(120,100,230,0.35)']]);
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.stroke();
  c.save();
  c.beginPath();
  c.arc(cx, cy, r - 1, 0, TAU);
  c.clip();
  c.fillStyle = lin(c, 0, cy - r, 0, cy, [[0, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']]);
  c.fillRect(cx - r, cy - r, r * 2, r);
  c.restore();
}

function iconBtn(scene, key, draw, size = 60) {
  hdTex(scene, key, size, size, (c) => {
    const m = size / 2;
    glassCircle(c, m, m - 1, size / 2 - 6);
    c.save();
    c.translate(m, m - 1);
    c.fillStyle = '#f1ecff';
    c.strokeStyle = '#f1ecff';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    draw(c);
    c.restore();
  });
}

function makeMenuIcons(scene) {
  // wardrobe: t-shirt
  iconBtn(scene, 'ic_wardrobe', (c) => {
    c.beginPath();
    c.moveTo(-6, -11); c.lineTo(-13, -8); c.lineTo(-17, -1); c.lineTo(-11, 2); c.lineTo(-9, -1);
    c.lineTo(-9, 12); c.lineTo(9, 12); c.lineTo(9, -1); c.lineTo(11, 2); c.lineTo(17, -1); c.lineTo(13, -8); c.lineTo(6, -11);
    c.quadraticCurveTo(0, -5, -6, -11);
    c.closePath();
    c.fill();
  });
  // settings: gear
  iconBtn(scene, 'ic_settings', (c) => {
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const r = i % 2 ? 12.5 : 16;
      const a2 = a + (i % 2 ? 0 : 0);
      c.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
    }
    c.closePath();
    c.arc(0, 0, 6, 0, TAU, true);
    c.fill('evenodd');
  });
  // ranks: trophy
  iconBtn(scene, 'ic_ranks', (c) => {
    c.beginPath();
    c.moveTo(-9, -13); c.lineTo(9, -13); c.lineTo(8, -2); c.quadraticCurveTo(7, 5, 0, 6); c.quadraticCurveTo(-7, 5, -8, -2);
    c.closePath();
    c.fill();
    c.lineWidth = 2.4;
    c.beginPath(); c.arc(-9, -8, 5, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(9, -8, 5, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.fillRect(-1.6, 6, 3.2, 5);
    c.fillRect(-7, 11, 14, 3.2);
  });
  // shop: cart
  iconBtn(scene, 'ic_shop', (c) => {
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(-16, -11); c.lineTo(-11, -11); c.lineTo(-7, 6); c.lineTo(10, 6);
    c.stroke();
    c.beginPath();
    c.moveTo(-10, -7); c.lineTo(15, -7); c.lineTo(11, 2); c.lineTo(-8, 2);
    c.closePath();
    c.fill();
    c.beginPath(); c.arc(-5, 12, 2.6, 0, TAU); c.fill();
    c.beginPath(); c.arc(8, 12, 2.6, 0, TAU); c.fill();
  });
  // back arrow
  iconBtn(scene, 'ic_back', (c) => {
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(4, -11); c.lineTo(-7, 0); c.lineTo(4, 11);
    c.stroke();
  }, 54);
  // lock (for locked skins)
  hdTex(scene, 'ic_lock', 18, 20, (c) => {
    c.strokeStyle = '#d6cfff';
    c.lineWidth = 2;
    c.beginPath(); c.arc(9, 7, 4, Math.PI, 0); c.stroke();
    rrect(c, 3, 8, 12, 9, 2.4);
    c.fillStyle = '#d6cfff';
    c.fill();
  });
  hdTex(scene, 'ic_check', 20, 20, (c) => {
    c.strokeStyle = '#7dffb0';
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(4, 10.5); c.lineTo(8.5, 15); c.lineTo(16, 5.5); c.stroke();
  });
}

function makeLogo(scene) {
  hdTex(scene, 'logo', 320, 120, (c, w, h) => {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.font = `700 92px ${FONT}`;
    const x = w / 2, y = h / 2 + 2;
    c.save();
    c.shadowColor = 'rgba(255,120,40,0.55)';
    c.shadowBlur = 22;
    c.lineWidth = 17;
    c.strokeStyle = '#2a0f5e';
    c.strokeText('TAPPY', x, y + 4);
    c.restore();
    c.lineWidth = 13;
    c.strokeStyle = '#2a0f5e';
    c.strokeText('TAPPY', x, y);
    c.lineWidth = 7;
    c.strokeStyle = lin(c, 0, 20, 0, 100, [[0, '#8f6bff'], [1, '#4a2bbd']]);
    c.strokeText('TAPPY', x, y);
    c.fillStyle = lin(c, 0, 24, 0, 98, [[0, '#fff6a0'], [0.45, '#ffc02e'], [1, '#ff6a2e']]);
    c.fillText('TAPPY', x, y);
    // soft top gloss, drawn with the same glyphs so it never spills outside the letters
    c.fillStyle = lin(c, 0, 24, 0, 66, [[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
    c.fillText('TAPPY', x, y);
  });
}

export function uiCardKey(scene, w, h, state) {
  // state: 'idle' | 'selected'
  const key = `ui_card_${w}x${h}_${state}`;
  if (scene.textures.exists(key)) return key;
  const P = 12;
  hdTex(scene, key, w + P * 2, h + P * 2, (c) => {
    c.save();
    if (state === 'selected') {
      c.shadowColor = 'rgba(150,130,255,0.9)';
      c.shadowBlur = 14;
    } else {
      c.shadowColor = 'rgba(0,0,0,0.4)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 3;
    }
    rrect(c, P, P, w, h, 16);
    c.fillStyle = lin(c, 0, P, 0, P + h, state === 'selected' ? [[0, 'rgba(96,78,196,0.97)'], [1, 'rgba(40,28,110,0.97)']] : [[0, 'rgba(52,38,118,0.88)'], [1, 'rgba(22,14,60,0.9)']]);
    c.fill();
    c.restore();
    rrect(c, P, P, w, h, 16);
    c.lineWidth = state === 'selected' ? 2.4 : 1.2;
    c.strokeStyle = state === 'selected' ? '#d9ccff' : 'rgba(160,140,240,0.4)';
    c.stroke();
  });
  return key;
}

// ---------------------------------------------------------------- Red Zone
export const RED_NEBULA = [0xff3b4a, 0xff7a52];
export const RED_STAR_TINT = 0xffc6b4;
export const BLACK_NEBULA = [0x3b2a8f, 0x24449c];
export const BLACK_STAR_TINT = 0x6670a8;

function makeRedZoneArt(scene, W, H) {
  // dark crimson sky: kept dark so bright hazards and coins still pop
  hdTex(scene, 'sky_red', W, H, (c) => {
    c.fillStyle = lin(c, 0, 0, 0, H, [[0, '#0a0106'], [0.55, '#240610'], [1, '#521019']]);
    c.fillRect(0, 0, W, H);
    c.fillStyle = rad(c, W * 0.5, H * 1.05, 10, H * 0.7, [[0, 'rgba(200,48,38,0.34)'], [1, 'rgba(200,48,38,0)']]);
    c.fillRect(0, 0, W, H);
  }, 0, 1);
  // pulsing red edges
  hdTex(scene, 'vig_red', W, H, (c) => {
    c.fillStyle = rad(c, W / 2, H / 2, H * 0.28, H * 0.78, [[0, 'rgba(255,30,30,0)'], [0.6, 'rgba(255,30,30,0.16)'], [1, 'rgba(255,24,24,0.6)']]);
    c.fillRect(0, 0, W, H);
  }, 0, 1);
  // Spitter: dark wall cannon with a glowing red core; faces RIGHT (flipped in code for the right wall)
  hdTex(scene, 'haz_spitter', 44, 44, (c) => {
    const cx = 22, cy = 22;
    c.fillStyle = rad(c, cx, cy, 6, 22, [[0, 'rgba(255,60,40,0.5)'], [1, 'rgba(255,60,40,0)']]);
    c.fillRect(0, 0, 44, 44);
    // barrel
    rrect(c, 24, 16, 17, 12, 4);
    c.fillStyle = lin(c, 0, 16, 0, 28, [[0, '#6b4452'], [0.5, '#35192a'], [1, '#150810']]);
    c.fill();
    c.strokeStyle = '#0a0306';
    c.lineWidth = 1.2;
    c.stroke();
    rrect(c, 36, 18.5, 5, 7, 2.5);
    c.fillStyle = rad(c, 40, 22, 0, 5, [[0, '#fff0d8'], [0.5, '#ff5a3a'], [1, '#b81c14']]);
    c.fill();
    // body
    c.beginPath();
    c.arc(cx - 2, cy, 13, 0, TAU);
    c.fillStyle = rad(c, cx - 6, cy - 6, 1, 17, [[0, '#8a5a68'], [0.5, '#3d1c2c'], [1, '#12060c']]);
    c.fill();
    c.strokeStyle = '#0a0306';
    c.lineWidth = 1.4;
    c.stroke();
    c.strokeStyle = 'rgba(255,120,110,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx - 2, cy, 10.2, 0.5, 2.6);
    c.stroke();
    // glowing eye
    c.fillStyle = rad(c, cx, cy, 0, 7, [[0, '#fff2e0'], [0.35, '#ff6a48'], [1, 'rgba(255,50,40,0)']]);
    c.beginPath();
    c.arc(cx, cy, 7, 0, TAU);
    c.fill();
  });
  // the orb
  hdTex(scene, 'orb', 24, 24, (c) => {
    c.fillStyle = rad(c, 12, 12, 2, 12, [[0, 'rgba(255,90,50,0.7)'], [1, 'rgba(255,60,40,0)']]);
    c.fillRect(0, 0, 24, 24);
    c.beginPath();
    c.arc(12, 12, 6.2, 0, TAU);
    c.fillStyle = rad(c, 10.5, 10.5, 0.5, 7, [[0, '#fff6e2'], [0.45, '#ff8a3c'], [1, '#d6281a']]);
    c.fill();
    c.strokeStyle = 'rgba(120,10,10,0.8)';
    c.lineWidth = 1;
    c.stroke();
  });
  // dotted lane shown while a Spitter charges
  hdTex(scene, 'lane', W, 6, (c) => {
    c.fillStyle = 'rgba(255,130,110,0.95)';
    for (let x = 4; x < W; x += 14) {
      rrect(c, x, 1.8, 8, 2.4, 1.2);
      c.fill();
    }
  });
}


// BLACK ZONE art: near-black sky (not pure black, so outlines always have something to stand out against),
// cold pulsing edges, a generic glowing ring (tinted per hazard, scaled to the hazard's true hit radius),
// a ledge edge light and the alien's lantern.
function makeBlackZoneArt(scene, W, H) {
  hdTex(scene, 'sky_black', W, H, (c) => {
    c.fillStyle = lin(c, 0, 0, 0, H, [[0, '#010003'], [0.6, '#05020b'], [1, '#0b0616']]);
    c.fillRect(0, 0, W, H);
    c.fillStyle = rad(c, W * 0.5, H * 1.05, 10, H * 0.7, [[0, 'rgba(70,44,150,0.13)'], [1, 'rgba(70,44,150,0)']]);
    c.fillRect(0, 0, W, H);
  }, 0, 1);
  hdTex(scene, 'vig_black', W, H, (c) => {
    c.fillStyle = rad(c, W / 2, H / 2, H * 0.28, H * 0.78, [[0, 'rgba(120,90,255,0)'], [0.6, 'rgba(120,90,255,0.12)'], [1, 'rgba(110,80,255,0.5)']]);
    c.fillRect(0, 0, W, H);
  }, 0, 1);
  // ring authored at radius 20 in a 64 box; the game scales it to (hazard r + 1.5) / 20
  hdTex(scene, 'rim', 64, 64, (c) => {
    for (const [lw, a] of [[9, 0.07], [6, 0.14], [3.8, 0.28]]) {
      c.strokeStyle = `rgba(255,255,255,${a})`;
      c.lineWidth = lw;
      c.beginPath();
      c.arc(32, 32, 20, 0, TAU);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,1)';
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(32, 32, 20, 0, TAU);
    c.stroke();
  });
  // thin light along the top of a ledge, stretched to the ledge width
  hdTex(scene, 'edge', 64, 8, (c, w, h) => {
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, w, h);
    c.fillStyle = lin(c, 0, 0, w, 0, [[0, 'rgba(255,255,255,0)'], [0.12, 'rgba(255,255,255,1)'], [0.88, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 3.1, w, 1.8);
  });
  hdTex(scene, 'lantern', 128, 128, (c) => {
    c.fillStyle = rad(c, 64, 64, 0, 64, [[0, 'rgba(255,246,222,0.6)'], [0.35, 'rgba(214,232,255,0.3)'], [0.7, 'rgba(170,200,255,0.1)'], [1, 'rgba(160,190,255,0)']]);
    c.fillRect(0, 0, 128, 128);
  });
}

function makePhantomZoneArt(scene) {
  // the black hole: violet halo, a tilted glowing accretion ring (brighter on one side), a pure black core, a thin photon ring
  hdTex(scene, 'hole', 280, 280, (c) => {
    const cx = 140, cy = 140;
    c.fillStyle = rad(c, cx, cy, 40, 140, [[0, 'rgba(120,70,255,0.42)'], [0.45, 'rgba(90,50,220,0.16)'], [1, 'rgba(70,40,200,0)']]);
    c.fillRect(0, 0, 280, 280);
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.21);
    c.scale(1, 0.3);
    for (const [r, lw, a] of [[96, 26, 0.06], [96, 16, 0.13], [96, 8, 0.3], [96, 3.2, 0.7]]) {
      c.strokeStyle = lin(c, -r, 0, r, 0, [[0, `rgba(255,150,70,${a * 0.5})`], [0.5, `rgba(255,214,150,${a * 0.9})`], [1, `rgba(255,255,255,${a})`]]);
      c.lineWidth = lw;
      c.beginPath();
      c.arc(0, 0, r, 0, TAU);
      c.stroke();
    }
    c.restore();
    // the core hides the back half of the ring, then the front arc is drawn over it
    c.fillStyle = '#000';
    c.beginPath();
    c.arc(cx, cy, 50, 0, TAU);
    c.fill();
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.21);
    c.scale(1, 0.3);
    c.strokeStyle = lin(c, -96, 0, 96, 0, [[0, 'rgba(255,150,70,0.35)'], [0.5, 'rgba(255,214,150,0.7)'], [1, 'rgba(255,255,255,0.95)']]);
    c.lineWidth = 3.4;
    c.beginPath();
    c.arc(0, 0, 96, 0.05, Math.PI - 0.05);
    c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(210,190,255,0.85)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(cx, cy, 51, 0, TAU);
    c.stroke();
  });
  // an infalling ring, scaled in and faded by the game
  hdTex(scene, 'hole_ring', 128, 128, (c) => {
    for (const [lw, a] of [[8, 0.06], [4, 0.14]]) {
      c.strokeStyle = `rgba(190,160,255,${a})`;
      c.lineWidth = lw;
      c.beginPath();
      c.arc(64, 64, 52, 0, TAU);
      c.stroke();
    }
    c.strokeStyle = 'rgba(225,210,255,0.55)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(64, 64, 52, 0, TAU);
    c.stroke();
  });
  // pull-direction arrow (points left; the game flips it)
  hdTex(scene, 'chev', 28, 40, (c) => {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const [lw, a] of [[11, 0.12], [7, 0.25]]) {
      c.strokeStyle = `rgba(190,160,255,${a})`;
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(20, 6);
      c.lineTo(8, 20);
      c.lineTo(20, 34);
      c.stroke();
    }
    c.strokeStyle = '#f2ecff';
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(20, 6);
    c.lineTo(8, 20);
    c.lineTo(20, 34);
    c.stroke();
  });
}

export function makeMenuArt(scene) {
  makeMenuIcons(scene);
  makeLogo(scene);
}

export function makeAllHd(scene, W, H) {
  makeMenuArt(scene);
  makeSky(scene, W, H);
  makeNebula(scene, W, H);
  makeStars(scene, W, H);
  makePlanets(scene);
  makeForeground(scene);
  makeGlows(scene);
  makeHazardsHd(scene);
  makeRedZoneArt(scene, W, H);
  makeBlackZoneArt(scene, W, H);
  makePhantomZoneArt(scene);
  makeCoinHd(scene);
  makeHeartsHd(scene);
  makePauseIcon(scene);
  makeHintZone(scene);
}
