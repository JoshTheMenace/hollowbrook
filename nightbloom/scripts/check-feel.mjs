#!/usr/bin/env node
/**
 * The feel lint — every event type the game can emit must have a consumer.
 * The audit measured 197 of 199 combat events discarded unheard; this gate
 * makes that state unshippable. Static check (fast, exit-coded); the runtime
 * twin is window.__feelCheck() in game.html.
 */
import { readFileSync } from 'node:fs';

const night = readFileSync(new URL('../src/game/night.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/game/main.js', import.meta.url), 'utf8');

// declared vocabulary
const decl = night.match(/NIGHT_EVENTS = \[([\s\S]*?)\]/)?.[1].match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
// every emit site in the game layer (night bridge + main). The first
// argument expression may be a ternary — collect EVERY quoted token in it.
const emitted = new Set();
for (const m of [...night.matchAll(/onEvent\(([^;]*?)[,)]/g), ...main.matchAll(/feel\.emit\(([^;]*?)[,)]/g)]) {
  for (const q of m[1].matchAll(/'([\w-]+)'/g)) emitted.add(q[1]);
}
// every wired consumer
const wired = new Set([...main.matchAll(/feel\.wire\('([\w-]+)'/g)].map((m) => m[1]));

const problems = [];
for (const e of emitted) if (!wired.has(e)) problems.push(`emitted event "${e}" has NO feel.wire consumer`);
for (const e of decl) if (!emitted.has(e)) problems.push(`declared event "${e}" is never emitted (stale vocabulary)`);
for (const e of decl) if (!wired.has(e)) problems.push(`declared event "${e}" has no consumer`);

console.log(`feel lint: ${emitted.size} emitted types, ${wired.size} wired consumers, ${decl.length} declared`);
for (const p of problems) console.log(`FAIL ${p}`);
if (!problems.length) console.log('PASS — every emitted event type has a consumer');
process.exit(problems.length ? 1 : 0);
