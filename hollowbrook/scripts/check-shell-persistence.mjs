#!/usr/bin/env node
/**
 * Shell-path persistence gate (headless Chrome via puppeteer-core, the
 * battery harness pattern).  The errand review's lesson: an 18-fork gate
 * that calls run.serialize() ITSELF never reads what the shell wrote, and
 * the one state the shell failed to persist was invisible by construction.
 * This gate drives game.html with real key events, reads the ACTUAL
 * localStorage the shell wrote, and asserts at four checkpoints (wave 1
 * start, objective 1 done, wave 2 start, a death) that continuous play ==
 * post-reload — the game is never more correct after F5 — and that a
 * corrupt save yields a fresh run and a live shell.
 */
import fs from 'node:fs';
import { notBuilt } from './lib/headless.mjs';
if (!fs.existsSync(new URL('../game.html', import.meta.url))) {
  notBuilt('check-shell-persistence', 'game.html + src/game/main.js + src/game/save.js', 'No shell exists yet; nothing writes a save to read back.');
}
const { withPage } = await import('./lib/browser-harness.mjs');
const { runPersistenceChecks } = await import('./lib/persistence-checks.mjs');
process.exit(await runPersistenceChecks(withPage) ? 0 : 1);
