#!/usr/bin/env node
/**
 * Vista legibility gate — the page-driven half of the camera contract.
 *
 * `check-cameras.mjs` runs headless because it is pure raycast math.  This
 * one cannot: legibility is measured in PIXELS (subject pixel share, and
 * the subject's luma against the ring around it in the graded frame), and
 * there is no framebuffer in Node.  Rather than pretend, this script
 * validates what it can from the plan and prints the exact recipe to run
 * in the page.
 *
 *   node scripts/check-legibility.mjs           # plan-side checks + recipe
 *
 * Plan-side: every vista camera must declare a `subject` AND an `owner`
 * district.  A vista with no owner is the failure this whole gate exists
 * for — measured across three cities, nobody composes a vista, because a
 * vista camera composed against four parcels is looking across six and
 * every screening element belongs to a district that never knew the sight
 * line existed.
 *
 * Pixel-side, in the dev page's console (or via the browser tool):
 *
 *   const v = window.__vignette;
 *   console.log(v.checkAllVistas({ polish: v.setPolishHaze }).report);
 *
 * exit 0 pass · 1 a vista is unowned or unsubjected · 2 crashed
 */

import fs from 'node:fs';
import path from 'node:path';

const planPath = process.argv[2] ?? path.resolve(process.cwd(), 'city-plan.json');

try {
  if (!fs.existsSync(planPath)) {
    console.error(`[check-legibility] no plan at ${planPath}`);
    process.exit(2);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const vistas = plan.vista_cameras ?? [];
  const ids = new Set((plan.districts ?? []).map((d) => d.id));
  let failed = false;

  console.log(`== vista ownership (${vistas.length} vista camera${vistas.length === 1 ? '' : 's'}) ==`);
  for (const v of vistas) {
    const problems = [];
    if (!v.subject || !String(v.subject).trim()) problems.push('no `subject`');
    if (!v.owner) problems.push('no `owner` — name the district whose agent composes this picture and must pass legibility');
    else if (!ids.has(v.owner)) problems.push(`owner "${v.owner}" is not a district in this plan`);
    if (problems.length) {
      failed = true;
      console.log(`FAIL ${v.name} — ${problems.join('; ')}`);
    } else {
      console.log(`PASS ${v.name} — subject "${v.subject}", owned by "${v.owner}"`);
    }
  }

  console.log('\n== pixel legibility (run in the page — there is no framebuffer here) ==');
  console.log('  const v = window.__vignette;');
  console.log("  console.log(v.checkAllVistas({ polish: v.setPolishHaze }).report);");
  console.log('\nThe gate is SILHOUETTE SEPARATION: the median luma difference, in the graded frame,');
  console.log('along the part of the subject\'s outline that stands against open sky (floor 40).');
  console.log('It also reports the subject\'s pixel share (an absence floor only — measured NOT to');
  console.log('discriminate: the failing vista\'s subject was LARGER than the working one\'s), how');
  console.log('much of the silhouette is occluded and by what class, the frame\'s class histogram,');
  console.log('and whether the polish haze COSTS the subject contrast.');

  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error('[check-legibility] crashed:', error);
  process.exit(2);
}
