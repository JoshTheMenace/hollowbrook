#!/usr/bin/env node
// Contract-constants drift gate (campaign rule, juicebox review r1): every
// number a loop contract declares in its ```constants block is diffed
// against the code's exported value. A contract the code has drifted from
// is fiction with a gate suite — this exits 1 on any mismatch.
//
// Block syntax (inside LOOP-CONTRACT.md):
//   ```constants
//   DASH.recover = 0.45
//   ```
// Keys are export paths into the entry's rules module.

import { readFileSync } from 'node:fs';

const ENTRIES = [
  { name: 'juicebox', contract: '../src/juicebox/LOOP-CONTRACT.md', rules: '../src/juicebox/rules.js' },
  { name: 'errand', contract: '../src/errand/LOOP-CONTRACT.md', rules: '../src/errand/rules.js' },
  { name: 'ride', contract: '../src/ride/LOOP-CONTRACT.md', rules: '../src/ride/curve.js' },
];

let failures = 0, total = 0;
for (const e of ENTRIES) {
  const md = readFileSync(new URL(e.contract, import.meta.url), 'utf8');
  const block = md.match(/```constants\n([\s\S]*?)```/);
  if (!block) { console.log(`FAIL  ${e.name}: contract has no \`\`\`constants block`); failures++; continue; }
  const mod = await import(new URL(e.rules, import.meta.url));
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(\S+)\s*$/);
    if (!m) continue;
    total++;
    const [, path, declared] = m;
    const actual = path.split('.').reduce((o, k) => o?.[k], mod);
    const ok = actual !== undefined && String(actual) === declared;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${e.name}: ${path} contract=${declared} code=${actual}`);
    if (!ok) failures++;
  }
}
// A7 (B1 r2): the gate reads the WHOLE contract. Numbers with units in the
// prose must equal a value the block carries — prose may not carry numbers
// the block doesn't. (Table windows, times-of-day and percentages are not
// checked; units checked: m, s, ms.)
for (const e of ENTRIES) {
  const md = readFileSync(new URL(e.contract, import.meta.url), 'utf8');
  const block = md.match(/```constants\n([\s\S]*?)```/)?.[1] ?? '';
  const blockVals = new Set([...block.matchAll(/=\s*(\S+)/g)].map((m) => Number(m[1])).filter(Number.isFinite));
  const body = md.replace(/```constants[\s\S]*?```/g, '').replace(/\*\*A\d[\s\S]*?(?=\n\*\*A\d|\n## |$)/g, '');   // amendment log records history, not the design
  const orphans = [];
  for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s?(m|s|ms)\b/g)) {
    const v = Number(m[1]) * (m[2] === 'ms' ? 0.001 : 1);
    if (![...blockVals].some((b) => Math.abs(b - v) < 1e-9)) orphans.push(`${m[1]} ${m[2]}`);
  }
  const uniq = [...new Set(orphans)];
  const ok = uniq.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${e.name}: prose numbers with units all carried by the block${ok ? '' : ` — orphans: ${uniq.join(', ')}`}`);
  if (!ok) failures++;
}
console.log(failures ? `\n${failures} DRIFT(S) in ${total} constants` : `\nALL PASS — ${total} constants match`);
process.exit(failures ? 1 : 0);
