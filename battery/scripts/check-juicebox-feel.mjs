#!/usr/bin/env node
// Feel lint for JUICE BOX: every JUICE_EVENTS type has a feel.wire consumer.
import { readFileSync } from 'node:fs';
import { JUICE_EVENTS } from '../src/juicebox/rules.js';

const main = readFileSync(new URL('../src/juicebox/main.js', import.meta.url), 'utf8');
const wired = new Set([...main.matchAll(/feel\.wire\('([\w-]+)'/g)].map((m) => m[1]));
const problems = JUICE_EVENTS.filter((e) => !wired.has(e)).map((e) => `event "${e}" has NO consumer`);
console.log(`feel lint: ${JUICE_EVENTS.length} declared, ${wired.size} wired`);
for (const p of problems) console.log(`FAIL ${p}`);
if (!problems.length) console.log('PASS — every event type has a consumer');
process.exit(problems.length ? 1 : 0);
