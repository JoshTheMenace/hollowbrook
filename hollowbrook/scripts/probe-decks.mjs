#!/usr/bin/env node
/**
 * The gate decks, walked.  wardrow shipped a 30 mm SLOT in the east
 * gatehouse deck (x 49.98..50.02, the whole length of the walk) because two
 * height-blind gates could not be satisfied by a deck over a passage; the
 * flood fill strides 0.35 m and stepped over it, so nothing in the suite
 * could see a hole a walker's centre drops through.  This probe walks BOTH
 * decks at 5 mm along the walk and across it, carrying the feet height the
 * way the player does (`groundAt(x, z, feetY)`), and fails on any sample
 * that is not within a step of the walk height — plus the passage under
 * each deck at the same resolution, which must read the street.
 *
 *   node scripts/probe-decks.mjs        # exit 0 pass · 1 a hole · 2 crashed
 */
import { bootCity, makeChecker } from './lib/headless.mjs';

const { check, finish } = makeChecker();
const STEP = 0.38;
const RES = 0.005;
const r3 = (v) => v.toFixed(3);

try {
  const { vignette, plan } = await bootCity();
  const { colliderBlocks } = await import('../src/builders.js');
  const walkY = plan.siege.wall_walk_y;
  const blocked = (x, z, y) => vignette.colliders.some((c) => colliderBlocks(c, x, z, y, 0.34));
  for (const [id, g] of Object.entries(plan.siege.gates)) {
    const p = g.passage;
    const along = g.gap.x1 - g.gap.x0 > g.gap.z1 - g.gap.z0 ? 'x' : 'z';   // the walk runs along the gap's long axis
    // DECK: every 5 mm along the walk over the whole passage, at three cross stations
    let holes = []; let samples = 0; let worst = 0;
    const cross = along === 'x' ? [g.gap.z0 + 0.4, (g.gap.z0 + g.gap.z1) / 2, g.gap.z1 - 0.4] : [g.gap.x0 + 0.4, (g.gap.x0 + g.gap.x1) / 2, g.gap.x1 - 0.4];
    const lo = (along === 'x' ? p.x0 : p.z0) - 1.0; const hi = (along === 'x' ? p.x1 : p.z1) + 1.0;
    for (const c of cross) {
      let feet = walkY;
      for (let t = lo; t <= hi; t += RES) {
        const x = along === 'x' ? t : c; const z = along === 'x' ? c : t;
        const y = vignette.groundAt(x, z, feet);
        samples += 1;
        worst = Math.max(worst, Math.abs(y - walkY));
        if (Math.abs(y - walkY) > STEP) holes.push(`(${r3(x)}, ${r3(z)}) reads ${r3(y)}`);
        else feet = y;
      }
    }
    check(`deck:${id}:continuous`, holes.length === 0, holes.length ? `${holes.length}/${samples} samples fall off the deck: ${holes.slice(0, 3).join('; ')}${holes.length > 3 ? ' …' : ''}` : `${samples} samples at ${RES * 1000} mm along the walk over the passage, worst deviation ${r3(worst)} m from ${walkY}`);
    // ACROSS the deck at the passage's mid-line, 5 mm, from parapet to parapet
    let across = 0; let off = [];
    const mid = along === 'x' ? (p.x0 + p.x1) / 2 : (p.z0 + p.z1) / 2;
    for (let t = (along === 'x' ? g.gap.z0 : g.gap.x0) + 0.35; t <= (along === 'x' ? g.gap.z1 : g.gap.x1) - 0.35; t += RES) {
      const x = along === 'x' ? mid : t; const z = along === 'x' ? t : mid;
      const y = vignette.groundAt(x, z, walkY);
      across += 1;
      if (Math.abs(y - walkY) > STEP) off.push(`(${r3(x)}, ${r3(z)}) reads ${r3(y)}`);
    }
    check(`deck:${id}:across`, off.length === 0, off.length ? `${off.length}/${across} cross samples fall off: ${off.slice(0, 3).join('; ')}` : `${across} samples across the deck at the passage mid-line all read ${walkY}`);
    // PASSAGE: under the deck, every 5 mm along the passage axis, the street
    let street = 0; let notStreet = []; let sealed = [];
    const level = plan.terrain.levels.find((l) => l.id === g.district).y;
    const axisLo = along === 'x' ? p.z0 : p.x0; const axisHi = along === 'x' ? p.z1 : p.x1;
    const c = along === 'x' ? (p.x0 + p.x1) / 2 : (p.z0 + p.z1) / 2;
    for (let t = axisLo; t <= axisHi; t += RES) {
      const x = along === 'x' ? c : t; const z = along === 'x' ? t : c;
      const y = vignette.groundAt(x, z, level);
      street += 1;
      if (Math.abs(y - level) > STEP) notStreet.push(`(${r3(x)}, ${r3(z)}) reads ${r3(y)}`);
      else if (blocked(x, z, y)) sealed.push(`(${r3(x)}, ${r3(z)})`);
    }
    check(`passage:${id}:street`, notStreet.length === 0 && sealed.length === 0, notStreet.length ? `${notStreet.length}/${street} samples under the deck do not read the street: ${notStreet.slice(0, 3).join('; ')}` : sealed.length ? `${sealed.length}/${street} samples sealed at feet height: ${sealed.slice(0, 3).join(' ')}` : `${street} samples through the passage at ${RES * 1000} mm all read the street (${level}) and none is sealed`);
    // the anchor pair at the gate point: both levels at one (x, z)
    const y0 = vignette.groundAt(g.gap.x0 + (g.gap.x1 - g.gap.x0) / 2, g.gap.z0 + (g.gap.z1 - g.gap.z0) / 2, level);
    const y5 = vignette.groundAt(g.gap.x0 + (g.gap.x1 - g.gap.x0) / 2, g.gap.z0 + (g.gap.z1 - g.gap.z0) / 2, walkY);
    check(`levels:${id}`, Math.abs(y0 - level) < 0.05 && Math.abs(y5 - walkY) < 0.05, `gap centre reads ${r3(y0)} from the street and ${r3(y5)} from the walk`);
  }
  finish('RESULT');
} catch (e) { console.error('[probe-decks] crashed:', e); process.exit(2); }
