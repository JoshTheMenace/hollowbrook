#!/usr/bin/env node
/**
 * The feel lint — every event type the game can emit must have a consumer.
 * nightbloom measured 197 of 199 combat events discarded unheard; this gate
 * makes that state unshippable.  Static, exit-coded; the runtime twin is
 * window.__feelCheck() on the game page.
 *
 * Conventions this gate reads (the game layer honours them or is red):
 *   src/game/events.js    exports GAME_EVENTS — the declared vocabulary
 *   src/game/feeltable.js exports FEEL — { event: { sfx, burst, shake, hitstop, text, call } }
 *                         (DATA, not calls: the ladder gate needs to compute
 *                         magnitudes from it in Node, so it cannot be a
 *                         sequence of feel.wire(...) calls buried in main.js)
 *   src/game/*.js         every emit site: feel.emit('name' ...) or onEvent('name' ...)
 */
import fs from 'node:fs';
import { notBuilt } from './lib/headless.mjs';

const root = new URL('../src/game/', import.meta.url);
const exists = (f) => fs.existsSync(new URL(f, root));
if (!exists('events.js') || !exists('feeltable.js')) {
  notBuilt('check-feel', 'src/game/events.js + src/game/feeltable.js', 'The game layer is not built; the vocabulary and its consumer table do not exist to lint.');
}
const { GAME_EVENTS } = await import(new URL('events.js', root));
const { FEEL } = await import(new URL('feeltable.js', root));
const emitted = new Set();
for (const f of fs.readdirSync(root)) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(new URL(f, root), 'utf8');
  for (const m of [...src.matchAll(/\bemit\(([^;]*?)[,)]/g), ...src.matchAll(/onEvent\(([^;]*?)[,)]/g)]) {   // rules.js emits through `this.emit(` (the run logs, then forwards to the bus)
    for (const q of m[1].matchAll(/'([\w-]+)'/g)) emitted.add(q[1]);
  }
}
const wired = new Set(Object.keys(FEEL));
const problems = [];
for (const e of emitted) if (!wired.has(e)) problems.push(`emitted event "${e}" has NO consumer in FEEL`);
for (const e of GAME_EVENTS) if (!emitted.has(e)) problems.push(`declared event "${e}" is never emitted (stale vocabulary)`);
for (const e of GAME_EVENTS) if (!wired.has(e)) problems.push(`declared event "${e}" has no consumer`);
for (const [e, fx] of Object.entries(FEEL)) if (!fx.sfx && !fx.burst && !fx.shake && !fx.text && !fx.hitstop && !fx.call) problems.push(`event "${e}" wired but empty`);
console.log(`feel lint: ${emitted.size} emitted types, ${wired.size} wired consumers, ${GAME_EVENTS.length} declared`);
for (const p of problems) console.log(`FAIL ${p}`);
if (!problems.length) console.log('PASS — every emitted event type has a consumer');
process.exit(problems.length ? 1 : 0);
