import { CFG } from '../config.js';

const { gravity: G, jumpVy: V, lateralVx: LX } = CFG.physics;
const { halfW } = CFG.player;

// Highest point a jump reaches above its launch height.
export const APEX = (V * V) / (2 * G);

// Time for a jump launched from feet-level A to come DOWN through feet-level B.
// h = A.y - B.y (positive when B is higher). Returns null if B is above the apex.
export function flightTime(h) {
  const d = V * V - 2 * G * h;
  if (d <= 0) return null;
  return (V + Math.sqrt(d)) / G;
}

export function clampX(x) {
  return Math.min(CFG.W - halfW, Math.max(halfW, x));
}

// Horizontal position t seconds into a jump (stops at the side walls, same as the integrator).
export function arcX(x0, dir, t) {
  return clampX(x0 + dir * LX * t);
}

// Vertical offset (world y, +down) of the body t seconds into a jump.
export function arcYOffset(t) {
  return -V * t + 0.5 * G * t * t;
}

// Distance from a point to a horizontal segment [x1,x2] at height y.
export function segDist(px, py, x1, x2, y) {
  const cx = Math.min(x2, Math.max(x1, px));
  return Math.hypot(px - cx, py - y);
}

export function ptRectDist(px, py, rx0, ry0, rx1, ry1) {
  const dx = Math.max(rx0 - px, 0, px - rx1);
  const dy = Math.max(ry0 - py, 0, py - ry1);
  return Math.hypot(dx, dy);
}

// Which input zone a viewport-relative x (0..1) falls in: -1 left, 0 centre, +1 right.
export function zoneOf(nx) {
  const [a, b] = CFG.input.zones;
  return nx < a ? -1 : nx > b ? 1 : 0;
}
