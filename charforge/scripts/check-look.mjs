// LookForge gates — image-statistics checks over the standard evidence set
// captured by look-lab.html's __lookCapture(). Every check is a named,
// measured property of the SHIPPED pixels.
//   1. browser: open /look-lab.html, run __lookCapture()
//   2. node scripts/check-look.mjs
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

// --- minimal PNG decoder (8-bit RGB/RGBA, all 5 filters) -------------------
function decodePng(path) {
  const b = readFileSync(path);
  let off = 8;
  let w = 0, h = 0, bpp = 0, channels = 0;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      const depth = data[8], color = data[9];
      if (depth !== 8 || (color !== 2 && color !== 6)) throw new Error(`unsupported png (depth ${depth} color ${color})`);
      channels = color === 6 ? 4 : 3;
      bpp = channels;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * bpp);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const rb = raw[pos++];
      const a = x >= bpp ? row[x - bpp] : 0;
      const bb = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v;
      if (filter === 0) v = rb;
      else if (filter === 1) v = rb + a;
      else if (filter === 2) v = rb + bb;
      else if (filter === 3) v = rb + ((a + bb) >> 1);
      else { // paeth
        const p = a + bb - c, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c);
        v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c);
      }
      row[x] = v & 0xff;
    }
  }
  return { w, h, channels, data: out };
}

// --- image statistics ------------------------------------------------------
function stats(img) {
  const { w, h, channels: ch, data } = img;
  const n = w * h;
  let sumL = 0, clip = 0, crush = 0, satSum = 0, satN = 0;
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumL += l;
    hist[Math.round(l)]++;
    if (r >= 254 && g >= 254 && b >= 254) clip++;
    if (l < 6) crush++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 30) { satSum += (mx - mn) / mx; satN++; }
  }
  let acc = 0, p5 = 0, p95 = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc / n <= 0.05) p5 = i; if (acc / n <= 0.95) p95 = i; }
  return {
    meanLuma: sumL / n, clipFrac: clip / n, crushFrac: crush / n,
    meanSat: satSum / Math.max(1, satN), spread: p95 - p5,
  };
}
function meanAbsDiff(a, b) {
  const n = Math.min(a.data.length, b.data.length);
  let s = 0;
  for (let i = 0; i < n; i += a.channels) s += Math.abs(a.data[i] - b.data[i]);
  return s / (n / a.channels);
}
// edge density: fraction of pixels with a strong luminance gradient
function edgeFrac(img, thresh = 26) {
  const { w, h, channels: ch, data } = img;
  const L = (x, y) => {
    const i = (y * w + x) * ch;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };
  let edges = 0;
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    if (Math.abs(L(x + 1, y) - L(x - 1, y)) + Math.abs(L(x, y + 1) - L(x, y - 1)) > thresh) edges++;
  }
  return edges / ((w / 2) * (h / 2));
}

// --- gates -----------------------------------------------------------------
const S = '.shots/';
const load = (n) => decodePng(`${S}${n}.png`);
const checks = [];
const check = (id, pass, note) => checks.push({ id, pass, note });

const flat = load('lookgate-flat');
const base = load('lookgate-base');
const nobloom = load('lookgate-nobloom');
const nooutline = load('lookgate-nooutline');

// 1. stack-active: grading must measurably change the image (stale guard)
const dGrade = meanAbsDiff(base, flat);
check('look:stack-active', dGrade > 3, `base vs flat mean|Δ| = ${dGrade.toFixed(1)} (>3)`);

// 2. bloom adds glow without blowing out
const sb = stats(base), snb = stats(nobloom);
check('look:bloom-glows', sb.meanLuma > snb.meanLuma + 0.5, `luma with bloom ${sb.meanLuma.toFixed(1)} vs without ${snb.meanLuma.toFixed(1)}`);
check('look:no-blowout', sb.clipFrac < 0.03, `${(sb.clipFrac * 100).toFixed(2)}% pure-white pixels (<3%)`);

// 3. outlines measurably increase edge density
const eBase = edgeFrac(base), eNo = edgeFrac(nooutline);
check('look:outlines-present', eBase > eNo * 1.1, `edge frac ${eBase.toFixed(4)} vs ${eNo.toFixed(4)} without (x${(eBase / eNo).toFixed(2)}, need >1.1)`);

// 4-7. per-look image health windows
for (const name of ['look-sakura-day', 'look-nightbloom', 'look-emberfall']) {
  const s = stats(load(name));
  const problems = [];
  if (s.meanLuma < 45 || s.meanLuma > 170) problems.push(`meanLuma ${s.meanLuma.toFixed(0)} outside 45-170`);
  if (s.spread < 70) problems.push(`p95-p5 spread ${s.spread} (<70 = flat/murky)`);
  if (s.meanSat < 0.18 || s.meanSat > 0.75) problems.push(`meanSat ${s.meanSat.toFixed(2)} outside 0.18-0.75`);
  if (s.crushFrac > 0.3) problems.push(`${(s.crushFrac * 100).toFixed(0)}% crushed blacks (>30%)`);
  if (s.clipFrac > 0.03) problems.push(`${(s.clipFrac * 100).toFixed(1)}% clipped whites`);
  check(`look:${name}`, problems.length === 0,
    problems.length ? problems.join('; ') : `luma ${s.meanLuma.toFixed(0)}, spread ${s.spread}, sat ${s.meanSat.toFixed(2)}`);
}

for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.id}: ${c.note}`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `FAIL (${failed.length})` : 'ALL PASS');
process.exit(failed.length ? 1 : 0);
