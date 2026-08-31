#!/usr/bin/env node
// B2 gate: the Cel Bridge, headless and exit-coded (the contract declared
// this file; B2 review r1 found it missing — a transcribed console result is
// not a gate). Builds the ronin, celifies through the WORLD's real cel()
// factory, and judges with thresholds measured from the world's material
// table (never from the guard's own ceiling).

import { characters } from '../../charforge/src/characters/index.js';
import { celify, celCensus } from '../../charforge/src/lib/celify.js';
import { pixelCensus } from '../../charforge/src/lib/pixel-census.js';
import { cel, shadowTintActive } from '../../nightbloom/src/core/toon.js';
import { BRIDGE } from '../src/shared/bridge.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const pct = (x) => (x * 100).toFixed(1) + '%';

check('world shadow tint active', shadowTintActive());
console.log(`world band (measured): base sat ${BRIDGE.worldSatCap.toFixed(3)}, accent max ${BRIDGE.worldAccentMax.toFixed(3)}`);

// ---- gate teeth: the RAW character must FAIL this census -------------------
const rawBuilt = await (await characters['ronin']()).build();
const rawPix = pixelCensus(rawBuilt.root, { satThreshold: BRIDGE.worldSatCap, ownedAccent: BRIDGE.ownedAccent });
check('gate has teeth (raw ronin exceeds world band)', rawPix.overBands.length > 0,
  `raw over-band pixel share: ${rawPix.overBands.map((b) => `${b.hue}°=${pct(b.share)}`).join(' ')}`);

// ---- the bridged character --------------------------------------------------
const built = await (await characters['ronin']()).build();
const report = celify(built.root, cel, {
  accentGuard: BRIDGE.accentGuard,
  worldSatCap: BRIDGE.worldSatCap,
  ownedAccent: BRIDGE.ownedAccent,
});
check('all meshes celified', report.converted === report.meshes, `${report.converted}/${report.meshes}`);

// +QUANT: grading writes through 8-bit hex, so a color capped to exactly the
// band edge can read back a rounding step above it
const QUANT = 0.02;
const census = celCensus(built.root, {
  satThreshold: BRIDGE.worldSatCap + QUANT,
  maxAccents: 1,
  forbiddenHues: BRIDGE.forbiddenHues,
  ownedAccent: BRIDGE.ownedAccent,
});
check('material census clean (effective colors, world-derived threshold)', census.problems.length === 0,
  census.problems[0] ?? `${census.meshes} meshes, ${census.accents} accent hue(s) beyond owned`);

const pix = pixelCensus(built.root, { satThreshold: BRIDGE.worldSatCap + QUANT, ownedAccent: BRIDGE.ownedAccent });
console.log(`bridged pixels: satP50 ${pix.satP50.toFixed(3)}, satP90 ${pix.satP90.toFixed(3)}, non-accent P90 ${pix.nonAccentP90.toFixed(3)}, owned-accent share ${pct(pix.ownedShare)}`);
check('non-accent surfaces sit in the world band (pixel-weighted p90)',
  pix.nonAccentP90 <= BRIDGE.worldSatCap + 0.02, `p90 ${pix.nonAccentP90.toFixed(3)} vs cap ${BRIDGE.worldSatCap.toFixed(3)}`);
const loud = pix.overBands.filter((b) => b.share > 0.01);
check('no un-owned hue band louder than the world (>1% pixels)', loud.length === 0,
  loud.map((b) => `${b.hue}°=${pct(b.share)}`).join(' ') || 'over-bands all <1%');
check('owned accent present but not shouting (0.5%–20% pixel share)',
  pix.ownedShare > 0.005 && pix.ownedShare < 0.2, pct(pix.ownedShare));
check('owned accent within the world accent ceiling',
  pix.satP90 <= BRIDGE.worldAccentMax + 0.02, `p90 ${pix.satP90.toFixed(3)} vs ceiling ${BRIDGE.worldAccentMax.toFixed(3)}`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
