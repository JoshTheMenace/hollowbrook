#!/usr/bin/env node
/**
 * Music gate.  Two halves: (1) the soundforge loop spec for Hollowbrook
 * passes charforge's own audio gates (stem alignment, seam click relative to
 * the stem's own transient, intensity coverage, energy climbs) — run
 * headlessly through @forge's compose/features; (2) the intent curve in
 * LOOP-CONTRACT.md is reached by the game's pressure->intensity mapping
 * (src/game/music.js `intensityFor`) at each wave's designed peak, ±tol,
 * and the mapping is monotone in `alive` and in missing HP.
 */
import fs from 'node:fs';
import { notBuilt } from './lib/headless.mjs';
if (!fs.existsSync(new URL('../src/audio/loop-hollowbrook.js', import.meta.url)) || !fs.existsSync(new URL('../src/game/music.js', import.meta.url))) {
  notBuilt('check-music', 'src/audio/loop-hollowbrook.js + src/game/music.js', 'No loop spec and no pressure mapping exist yet.');
}
const { checkMusic } = await import('../src/game/music.js');
process.exit(await checkMusic() ? 0 : 1);
