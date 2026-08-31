// Iterative radix-2 complex FFT (in-place on re/im Float32Arrays).
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { // bit-reverse permutation
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
}

const hannCache = new Map();
export function hann(n) {
  if (!hannCache.has(n)) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    hannCache.set(n, w);
  }
  return hannCache.get(n);
}

// STFT magnitudes: mono signal -> frames[t][bin] (n/2 bins).
export function stft(x, n = 2048, hop = 512) {
  const w = hann(n);
  const frames = [];
  const re = new Float32Array(n), im = new Float32Array(n);
  for (let start = 0; start + n <= x.length; start += hop) {
    for (let i = 0; i < n; i++) { re[i] = x[start + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
    frames.push(mag);
  }
  return frames;
}
