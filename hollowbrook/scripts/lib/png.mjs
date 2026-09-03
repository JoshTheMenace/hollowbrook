/* A minimal PNG decoder for gate pixel assertions: 8-bit RGB / RGBA,
 * non-interlaced, which is what puppeteer's page.screenshot writes.
 * Returns { width, height, data: Uint8Array RGBA }.  No dependency, so a
 * gate that reads its own evidence stays in-tree. */
import zlib from 'node:zlib';

export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0; let height = 0; let depth = 0; let ctype = 0; let interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (ctype !== 2 && ctype !== 6) || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${ctype}, interlace ${interlace})`);
  const bpp = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const k = (y * width + x) * 4; const j = x * bpp;
      out[k] = cur[j]; out[k + 1] = cur[j + 1]; out[k + 2] = cur[j + 2]; out[k + 3] = bpp === 4 ? cur[j + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

/** Fraction of pixels in a rect that satisfy `pred([r, g, b])`. */
export function fractionIn(png, { x, y, w, h }, pred) {
  let n = 0; let hit = 0;
  const x0 = Math.max(0, Math.floor(x)); const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(png.width, Math.ceil(x + w)); const y1 = Math.min(png.height, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) { const k = (yy * png.width + xx) * 4; n += 1; if (pred([png.data[k], png.data[k + 1], png.data[k + 2]])) hit += 1; }
  return n ? hit / n : 0;
}

/** Count pixels in a rect satisfying pred. */
export function countIn(png, rect, pred) {
  const w = Math.min(png.width, Math.ceil(rect.x + rect.w)) - Math.max(0, Math.floor(rect.x));
  const h = Math.min(png.height, Math.ceil(rect.y + rect.h)) - Math.max(0, Math.floor(rect.y));
  return Math.round(fractionIn(png, rect, pred) * Math.max(0, w) * Math.max(0, h));
}
