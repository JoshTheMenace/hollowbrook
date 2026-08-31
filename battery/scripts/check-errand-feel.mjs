#!/usr/bin/env node
// Feel lint for ONE NPC, ONE ERRAND: every ERRAND_EVENTS type has a
// feel.wire consumer in the shell (the runtime check is window.__feelCheck).
import { readFileSync } from 'node:fs';
import { ERRAND_EVENTS } from '../src/errand/rules.js';

const main = readFileSync(new URL('../src/errand/main.js', import.meta.url), 'utf8');
const wired = new Set([...main.matchAll(/feel\.wire\('([\w-]+)'/g)].map((m) => m[1]));
const problems = ERRAND_EVENTS.filter((e) => !wired.has(e)).map((e) => `event "${e}" has NO consumer`);
console.log(`feel lint: ${ERRAND_EVENTS.length} declared, ${wired.size} wired`);
for (const p of problems) console.log(`FAIL ${p}`);
if (!problems.length) console.log('PASS — every event type has a consumer');
process.exit(problems.length ? 1 : 0);
