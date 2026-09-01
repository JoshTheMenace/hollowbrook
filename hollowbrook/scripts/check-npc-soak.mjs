#!/usr/bin/env node
/**
 * NPC soak gate.  The errand review found an integrator in the Performer
 * (a spine winding -7.2 rad/s) that a single-step gesture gate could not
 * see; charforge's Performer is stateless now and battery's soak gate
 * proves it on one actor.  THIS gate soaks the NPC LAYER: every cast member
 * (src/game/cast.js) through 60 s of its real behaviour cycle — post → wave
 * sounds → walk the nav grid to shelter → shelter → breather → walk back →
 * talk (dialogue plans through the Performer) — with the mixer running.
 * Every joint stays under π rad and returns to within 0.02 rad of a control
 * actor at the end.  A single-step gate cannot see an integrator; a soak can.
 */
import fs from 'node:fs';
import { notBuilt } from './lib/headless.mjs';
if (!fs.existsSync(new URL('../src/game/cast.js', import.meta.url))) {
  notBuilt('check-npc-soak', 'src/game/cast.js', 'No NPC layer exists yet to soak.');
}
const { soakCast } = await import('../src/game/cast.js');
process.exit(await soakCast({ seconds: 60 }) ? 0 : 1);
