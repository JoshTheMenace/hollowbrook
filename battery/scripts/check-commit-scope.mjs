#!/usr/bin/env node
// Commit-scope guard (campaign rule: a commit contains only what its
// message describes; cross-entry changes get their own commit). Run before
// committing:  node scripts/check-commit-scope.mjs "<message first line>"
// The message prefix names the entry; every STAGED path must be under it.
import { execSync } from 'node:child_process';

const PREFIX = {
  'B1': ['battery/src/juicebox/', 'battery/juicebox.html', 'battery/scripts/check-juicebox', 'battery/scripts/capture-juicebox'],
  'B2': ['battery/src/celbridge/', 'battery/celbridge.html', 'battery/scripts/check-celbridge', 'battery/scripts/capture-celbridge'],
  'B3': ['battery/src/errand/', 'battery/errand.html', 'battery/scripts/check-errand', 'battery/scripts/check-performer'],
  'B4': ['battery/src/ride/', 'battery/ride.html', 'battery/scripts/check-ride', 'battery/scripts/capture-ride'],
  'shared': ['charforge/', 'nightbloom/src/', 'battery/src/shared/', 'battery/scripts/lib/', 'battery/scripts/check-contract-drift', 'battery/scripts/check-commit-scope', 'battery/vite.config.js', 'battery/package'],
  'TRAPS': ['nightbloom/TRAPS.md'],
  'gates': ['nightbloom/'],
};
const msg = process.argv[2] ?? '';
const key = Object.keys(PREFIX).find((k) => msg.startsWith(k));
if (!key) { console.log(`no scope prefix in "${msg}" — allowed: ${Object.keys(PREFIX).join(', ')}`); process.exit(2); }
const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).split('\n').filter(Boolean);
const bad = staged.filter((p) => !PREFIX[key].some((pre) => p.startsWith(pre)));
for (const p of staged) console.log(`${bad.includes(p) ? 'OUT ' : 'ok  '} ${p}`);
console.log(bad.length ? `\n${bad.length} staged path(s) outside "${key}" — split the commit` : `\nALL IN SCOPE (${key})`);
process.exit(bad.length ? 1 : 0);
