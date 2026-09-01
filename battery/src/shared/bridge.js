import { M } from '../../../nightbloom/src/kit/common.js';
import { rgbToHsv } from '../../../charforge/src/lib/celify.js';

// The bridge spec: every threshold here is MEASURED from the world's own
// material table at import time — never hand-typed, never derived from the
// guard's output (B2 review r1: a census whose threshold echoes the guard's
// ceiling cannot fail by construction). Relative imports so the same module
// feeds the browser shells and the headless exit-coded gate.

const hsv = (mat) => {
  const hex = mat.color.getHexString();
  return rgbToHsv(...[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
};

const WORLD_ACCENTS = ['amber', 'blossom', 'glow'];   // the scene's owned slots
const base = Math.max(...Object.entries(M)
  .filter(([n, m]) => m.color && !WORLD_ACCENTS.includes(n))
  .map(([, m]) => hsv(m).s));
const accentMax = Math.max(...WORLD_ACCENTS.filter((n) => M[n]?.color).map((n) => hsv(M[n]).s));

export const BRIDGE = Object.freeze({
  // cap for every character surface outside its one owned accent
  worldSatCap: base,
  worldAccentMax: accentMax,
  // scene-owned hue bands a character may not contest (hue measured from M)
  accentGuard: [
    ['lantern-amber', hsv(M.amber).h, 0.04, base],
    ['blossom-pink', hsv(M.blossom).h, 0.04, base],
  ],
  forbiddenHues: [
    ['lantern-amber', hsv(M.amber).h, 0.04],
    ['blossom-pink', hsv(M.blossom).h, 0.04],
  ],
  // the character's ONE owned accent: the ronin's indigo hair — as a HUE.
  // satCap is a coarse albedo-space backstop (closes r2's unlimited-sat
  // hole); the authoritative judgement is the RENDERED gate vs the world's
  // rendered band (check-celbridge-rendered.mjs).
  ownedAccent: { name: 'hair-indigo', hue: 225 / 360, tol: 0.05, satCap: base + 0.1 },
  // A3: the character's bounce fill — the lever on the LIT band's saturation
  // (the world's warm key light on warm skin), declared as a bridge knob
  fill: '#141414',
  facet: true,
  // A3 tone steps: the world's ramp applied to ALBEDO — every painted
  // vertex-colour attribute quantized to 3 value steps / 2 saturation steps
  // (the diagnostic: vertex colours off = soft share 8.3% -> 3.9%)
  toneSteps: 3,
});

// one options object for every shell that bridges a character
export const CELIFY_OPTS = Object.freeze({
  accentGuard: BRIDGE.accentGuard, worldSatCap: BRIDGE.worldSatCap, ownedAccent: BRIDGE.ownedAccent,
  fill: BRIDGE.fill, facet: BRIDGE.facet, toneSteps: BRIDGE.toneSteps,
});
