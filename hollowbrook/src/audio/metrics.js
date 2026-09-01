// Measurement for the music gate.  soundforge's `features.js` covers the
// track case; this file adds the two things the SIEGE needs and it does not
// have, plus one honest correction.
//
// THE CORRECTION.  `lufs()` is BS.1770 *integrated*: 400 ms blocks, 100 ms
// hop, and `for (s; s + block <= len; s += hop)` — so a sound shorter than
// 400 ms produces ZERO blocks and the function returns -Infinity.  Most of
// this bank is shorter than 400 ms.  Reaching for LUFS to rank a bolt click
// against a bell returns -Infinity for eight of the thirteen ladder events
// and looks like a bug in the bank rather than a bug in the metric.
//
// So the ladder is ranked on `impactDb`, which is the same K-weighted
// loudness WITHOUT the per-block normalisation: the integral rather than the
// mean.  It is exactly `momentaryLUFS + 10·log10(duration)`, i.e. loudness
// times time, which is what "how big did that feel" actually is — a 3 s bell
// and a 60 ms click at the same peak are not the same event.
//
// `magnitude` adds one term: 4·lowShare, because low-frequency content reads
// as *weight* independently of level (the reason a cinema explosion is felt
// and a hi-hat is not).  4 dB is the whole span of that term, so it can order
// two neighbours but can never overturn a real level difference.

import { SR, biquad, filterBuf } from '../../../charforge/src/soundforge/dsp.js';
import { stft } from '../../../charforge/src/soundforge/fft.js';
import { spectralBands } from '../../../charforge/src/soundforge/features.js';

const kWeightChain = () => {
  const shelf = biquad('highshelf', 1681.97, 0.7071, 3.99);
  const hp = biquad('highpass', 38.13, 0.5);
  return (x) => hp(shelf(x));
};

/** K-weighted energy integral in dB — "loudness x duration". */
export function impactDb([L, R]) {
  const kl = kWeightChain(), kr = kWeightChain();
  let sum = 0;
  for (let i = 0; i < L.length; i++) {
    const a = kl(L[i]), b = kr(R[i]);
    sum += a * a + b * b;
  }
  return +(-0.691 + 10 * Math.log10(sum / SR + 1e-12)).toFixed(2);
}

/** Fraction of unweighted energy under 250 Hz (two cascaded biquads = 24 dB/oct). */
export function lowShare([L, R]) {
  let tot = 0;
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) { const m = (L[i] + R[i]) * 0.5; mono[i] = m; tot += m * m; }
  const lo = Float32Array.from(mono);
  filterBuf(lo, 'lowpass', 250, 0.707);
  filterBuf(lo, 'lowpass', 250, 0.707);
  let e = 0;
  for (let i = 0; i < lo.length; i++) e += lo[i] * lo[i];
  return +(e / (tot + 1e-12)).toFixed(3);
}

/** The one number the ladder is ordered by.  Documented, not eyeballed. */
export function magnitude(audio) {
  return +(impactDb(audio) + 4 * lowShare(audio)).toFixed(2);
}

/** Milliseconds from the start of the buffer to its loudest sample. */
export function attackMs([L, R]) {
  let best = 0, at = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]) + Math.abs(R[i]);
    if (a > best) { best = a; at = i; }
  }
  return +(at / SR * 1000).toFixed(1);
}

/**
 * Spectral flux, and onsets counted against an ABSOLUTE threshold.
 *
 * charforge's `onsetDensity` thresholds each signal at 1.6x ITS OWN mean flux,
 * which is right for comparing sections of one master and wrong for comparing
 * two different mixes: a quiet two-stem pad bed scores 9.4 onsets/s and a full
 * war-drum mix scores 5.7, because the pad's own mean is tiny and every little
 * ripple clears it.  "0.80 is denser than 0.68" has to be measured against one
 * fixed threshold or it is not a comparison at all.
 */
export function meanFlux([L, R]) {
  return fluxOf([L, R]).mean;
}
function fluxOf([L, R]) {
  const N = 1024, HOP = 512;
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const frames = stft(mono, N, HOP);
  const flux = frames.map((f, t) => {
    if (!t) return 0;
    let s = 0;
    for (let b = 0; b < f.length; b++) { const d = f[b] - frames[t - 1][b]; if (d > 0) s += d; }
    return s;
  });
  return { flux, hop: HOP, mean: flux.reduce((a, b) => a + b, 0) / (flux.length || 1) };
}
/** Onsets per second at a fixed absolute flux threshold. */
export function onsetsPerSec(audio, thresh) {
  const { flux, hop } = fluxOf(audio);
  let n = 0;
  for (let t = 2; t < flux.length - 2; t++) {
    if (flux[t] > thresh && flux[t] >= flux[t - 1] && flux[t] > flux[t + 1] && flux[t] > flux[t - 2]) n++;
  }
  return +(n / (flux.length * hop / SR)).toFixed(2);
}

/**
 * How different do two sounds actually sound?  RMS distance between their
 * six-band dB profiles, floored at -50 dB.
 *
 * The obvious tests are both wrong.  Spectral CENTROID is really a
 * tonal-vs-noisy measure at this scale: a knife tick and a chesty growl
 * measured 4244 and 4072 Hz — 1.04x apart — because the growl's broadband
 * noise floor drags a magnitude-weighted mean up.  And a COSINE on the linear
 * band shares reads 0.9975 for the same pair, because both vectors are one
 * spike in `low` and cosine on a peaky vector only compares which band is
 * biggest.  dB space, with a floor so an inaudible difference 50 dB down in
 * `sub` cannot carry the result, says what the ear would.
 */
export function bandProfile(audio, floorDb = -50) {
  const b = spectralBands(audio);
  return Object.values(b).map((d) => Math.max(floorDb, d));
}
export function profileDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return +Math.sqrt(s / a.length).toFixed(2);
}

/** Seam discontinuity at a loop wrap, against the stem's own worst transient. */
export function seamStep([L, R]) {
  let maxStep = 0;
  for (let i = 1; i < L.length; i++) {
    const s = Math.abs(L[i] - L[i - 1]);
    if (s > maxStep) maxStep = s;
  }
  const click = Math.max(Math.abs(L[L.length - 1] - L[0]), Math.abs(R[R.length - 1] - R[0]));
  return { click: +click.toFixed(4), maxStep: +maxStep.toFixed(4), ratio: +(click / (maxStep + 1e-9)).toFixed(3) };
}

export const bytesOf = ([L, R]) => (L.length + R.length) * 4;
