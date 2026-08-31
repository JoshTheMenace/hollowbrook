#!/usr/bin/env node
// B2 gate v3: the Cel Bridge, headless and exit-coded. Albedo-space
// STRUCTURAL checks only — coverage, forbidden bands, authoring-vs-guard
// budget, backstops. The authoritative saturation judgement lives in the
// judging space: check-celbridge-rendered.mjs (rendered char pixels vs the
// world's rendered band). Review r2: a census that tests what the guard
// writes is a tautology at any number — so here the guard is a budgeted
// safety net and the gate fails authoring that leans on it, and the teeth
// bite a SYNTHETIC violator (they cannot rot as the ronin improves).

import * as THREE from 'three';
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
const QUANT = 0.02;   // grading writes through 8-bit hex; band-edge rounding
const CORRECTION_BUDGET = { share: 0.02, maxSatDelta: 0.06 };

check('world shadow tint active', shadowTintActive());
console.log(`world band (measured): base sat ${BRIDGE.worldSatCap.toFixed(3)}, accent max ${BRIDGE.worldAccentMax.toFixed(3)}`);

// ---- gate teeth: a synthetic violator must FAIL, loudly --------------------
{
  const bad = new THREE.Group();
  const mesh = (color, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color }));
    m.name = name;
    bad.add(m);
    return m;
  };
  mesh('#1a24e8', 'violator-owned-band-sat09');    // indigo, sat ~0.9 — inside the owned band
  mesh('#10e838', 'violator-green-sat093');        // green, sat ~0.93 — un-owned band
  mesh('#e89010', 'violator-amber-sat093');        // lantern-amber band
  bad.children.forEach((m, i) => m.position.set((i - 1) * 0.6, 0, 0));
  const rawPix = pixelCensus(bad, { satThreshold: BRIDGE.worldSatCap + QUANT, ownedAccent: BRIDGE.ownedAccent });
  const ownedTooHot = pixelCensus(bad, { satThreshold: BRIDGE.ownedAccent.satCap + QUANT, ownedAccent: null });
  check('teeth: violator fails the world band', rawPix.overBands.length > 0,
    rawPix.overBands.map((b) => `${b.hue}°=${pct(b.share)}`).join(' '));
  check('teeth: owned-band violator exceeds the owned satCap too', ownedTooHot.overBands.some((b) => b.hue >= 200 && b.hue <= 260));
  const report = celify(bad, cel, { accentGuard: BRIDGE.accentGuard, worldSatCap: BRIDGE.worldSatCap, ownedAccent: BRIDGE.ownedAccent });
  const share = report.corrections.count / report.corrections.total;
  check('teeth: guard corrections on the violator EXCEED the budget (gate would fail it)',
    share > CORRECTION_BUDGET.share && report.corrections.maxSatDelta > CORRECTION_BUDGET.maxSatDelta,
    `corrected ${pct(share)}, max Δsat ${report.corrections.maxSatDelta.toFixed(2)}`);
}

// ---- the character: authored conformance, guard as no-op -------------------
const built = await (await characters['ronin']()).build();
const report = celify(built.root, cel, {
  accentGuard: BRIDGE.accentGuard,
  worldSatCap: BRIDGE.worldSatCap,
  ownedAccent: BRIDGE.ownedAccent,
});
check('all meshes celified', report.converted === report.meshes, `${report.converted}/${report.meshes}`);
const corrShare = report.corrections.count / (report.corrections.total || 1);
check(`authoring conforms without the guard (corrections ≤ ${pct(CORRECTION_BUDGET.share)}, Δsat ≤ ${CORRECTION_BUDGET.maxSatDelta})`,
  corrShare <= CORRECTION_BUDGET.share && report.corrections.maxSatDelta <= CORRECTION_BUDGET.maxSatDelta,
  `corrected ${pct(corrShare)} of ${report.corrections.total} samples, max Δsat ${report.corrections.maxSatDelta.toFixed(3)}`);

const census = celCensus(built.root, {
  satThreshold: BRIDGE.worldSatCap + QUANT,
  maxAccents: 1,
  forbiddenHues: BRIDGE.forbiddenHues,
  ownedAccent: BRIDGE.ownedAccent,
});
check('material census clean (effective colors)', census.problems.length === 0,
  census.problems[0] ?? `${census.meshes} meshes`);

const pix = pixelCensus(built.root, { satThreshold: BRIDGE.worldSatCap + QUANT, ownedAccent: BRIDGE.ownedAccent });
console.log(`albedo pixels: satP50 ${pix.satP50.toFixed(3)}, satP90 ${pix.satP90.toFixed(3)}, non-accent P90 ${pix.nonAccentP90.toFixed(3)}, owned-band share over world base ${pct(pix.ownedShare)}`);
check('no un-owned hue band louder than the world (>1% pixels)',
  pix.overBands.filter((b) => b.share > 0.01).length === 0,
  pix.overBands.map((b) => `${b.hue}°=${pct(b.share)}`).join(' ') || 'over-bands all <1%');
check('owned band under its albedo backstop (structural; rendered gate is authoritative)',
  pix.satP90 <= BRIDGE.ownedAccent.satCap + QUANT, `p90 ${pix.satP90.toFixed(3)} vs backstop ${BRIDGE.ownedAccent.satCap.toFixed(3)}`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
