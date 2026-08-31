import { cached } from './texkit.js';

/* ------------------------------------------------------------------ *
 * Surface micro-texture for the shared material pool.
 *
 * The reference scene's surfaces are never one flat value: lime render
 * carries a 2-3 % value mottle at the half-metre scale, rubble carries
 * its joints, tarred boarding its planks.  These are MULTIPLY maps
 * (values at and just under white) attached to the pooled materials in
 * mats.js, so every building in the city inherits them at zero extra
 * draw calls — the pool stays a pool.
 *
 * Art-direction cautions honoured here:
 *   - LOW-frequency, low-contrast, readable as painted.  No photographic
 *     noise; everything is soft blobs, streaks and hairlines.
 *   - Tileable: every feature is drawn at its position AND at the eight
 *     wrap offsets, so a repeat never shows a seam.
 *   - The kit's geometry has per-face 0..1 UVs (BoxGeometry), so a map
 *     lands at a different physical scale on a big wall than on a
 *     plinth.  For aperiodic mottle that variation is invisible; it is
 *     why these maps carry no measured features (no brick courses at a
 *     stated gauge), only texture.
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Draw `fn(x, y)` wrapped: at its spot and the 8 tile offsets. */
function wrapped(c, w, h, x, y, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(x + dx, y + dy);
}

function mottle(c, w, h, r, { n, rMin, rMax, dark, light, aDark, aLight }) {
  for (let i = 0; i < n; i += 1) {
    const x = r() * w;
    const y = r() * h;
    const R = rMin + r() * (rMax - rMin);
    const isDark = r() < 0.6;
    const col = isDark ? dark : light;
    const a = (isDark ? aDark : aLight) * (0.6 + r() * 0.8);
    wrapped(c, w, h, x, y, (px, py) => {
      const grad = c.createRadialGradient(px, py, R * 0.15, px, py, R);
      grad.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = grad;
      c.beginPath();
      c.arc(px, py, R, 0, TAU);
      c.fill();
    });
  }
}

const REPEAT = { repeat: [2, 2] };

/** Lime render / limestone: soft value mottle plus faint weather streaks
 *  running down from the top of the face. */
export function plasterTex() {
  return cached('polish-plaster', 256, 256, (c, w, h) => {
    c.fillStyle = '#fdfcfa';
    c.fillRect(0, 0, w, h);
    const r = rng('plaster');
    mottle(c, w, h, r, { n: 72, rMin: 10, rMax: 32, dark: '141,133,120', light: '255,255,255', aDark: 0.038, aLight: 0.038 });
    /* weather streaks: few, faint, irregular. The first cut used 7 at
     * alpha 0.05 and they read as painted stripes marching across every
     * gable — a streak must be quieter than the mottle it sits on. */
    for (let i = 0; i < 4; i += 1) {
      const x = r() * w;
      const len = h * (0.25 + r() * 0.45);
      const wd = 2 + r() * 9;
      wrapped(c, w, h, x, 0, (px) => {
        const grad = c.createLinearGradient(0, 0, 0, len);
        grad.addColorStop(0, `rgba(120,112,100,${(0.018 + r() * 0.014).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(120,112,100,0)');
        c.fillStyle = grad;
        c.fillRect(px - wd / 2, 0, wd, len);
      });
    }
  }, REPEAT);
}

/** Rubble stone: stronger mottle and a wavering coursed-joint network. */
export function rubbleTex() {
  return cached('polish-rubble', 256, 256, (c, w, h) => {
    c.fillStyle = '#fcfbf9';
    c.fillRect(0, 0, w, h);
    const r = rng('rubble');
    mottle(c, w, h, r, { n: 54, rMin: 8, rMax: 26, dark: '120,112,102', light: '255,255,255', aDark: 0.08, aLight: 0.06 });
    // joints: wavering horizontal courses with offset vertical breaks
    c.strokeStyle = 'rgba(96,90,82,0.10)';
    c.lineWidth = 1.6;
    const rows = 8;
    for (let row = 0; row <= rows; row += 1) {
      const y0 = (h / rows) * row;
      c.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin((x / w) * TAU * 2 + row * 2.7) * 2.4;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      // vertical breaks in this course
      const step = 24 + (row % 3) * 10;
      for (let x = ((row * 13) % step); x < w; x += step) {
        const jig = Math.sin(row * 5.1 + x) * 3;
        c.beginPath();
        c.moveTo(x + jig, y0);
        c.lineTo(x + jig * 0.4, y0 + h / rows);
        c.stroke();
      }
    }
  }, REPEAT);
}

/** Pantile roofs: broad tone drift so a big pitch is not one sheet. */
export function roofTex() {
  return cached('polish-roof', 256, 256, (c, w, h) => {
    c.fillStyle = '#fdfcfb';
    c.fillRect(0, 0, w, h);
    const r = rng('roof');
    mottle(c, w, h, r, { n: 30, rMin: 24, rMax: 70, dark: '128,110,98', light: '255,250,244', aDark: 0.06, aLight: 0.05 });
  }, REPEAT);
}

/** Tarred boarding: vertical plank lines and a dull sheen drift. */
export function tarTex() {
  return cached('polish-tar', 256, 256, (c, w, h) => {
    c.fillStyle = '#fbfbfb';
    c.fillRect(0, 0, w, h);
    const r = rng('tar');
    mottle(c, w, h, r, { n: 24, rMin: 18, rMax: 50, dark: '110,105,120', light: '255,255,255', aDark: 0.06, aLight: 0.05 });
    for (let x = 0; x < w; x += 21) {
      const a = 0.05 + r() * 0.05;
      c.fillStyle = `rgba(70,66,80,${a.toFixed(3)})`;
      c.fillRect(x, 0, 1.6, h);
    }
  }, REPEAT);
}

/** H6 — the lit-glass treatment.  One multiply map that serves both a
 *  lantern's glass block and a window pane on the pooled warm-light
 *  material: bright core low-centre, a shadowed head (a room's ceiling,
 *  a lantern's cap), a faint transom band, vignetted edges.  It turns a
 *  flat orange rectangle into a glow with depth in it. */
export function litGlassTex() {
  return cached('polish-lit', 128, 128, (c, w, h) => {
    c.fillStyle = '#fff6e6';
    c.fillRect(0, 0, w, h);
    // bright core, low centre — where the lamp actually is
    const core = c.createRadialGradient(w * 0.5, h * 0.64, 4, w * 0.5, h * 0.64, w * 0.62);
    core.addColorStop(0, 'rgba(255,255,255,0.85)');
    core.addColorStop(0.5, 'rgba(255,244,220,0.35)');
    core.addColorStop(1, 'rgba(255,244,220,0)');
    c.fillStyle = core;
    c.fillRect(0, 0, w, h);
    // the shadowed head
    const head = c.createLinearGradient(0, 0, 0, h * 0.42);
    head.addColorStop(0, 'rgba(150,96,52,0.42)');
    head.addColorStop(1, 'rgba(150,96,52,0)');
    c.fillStyle = head;
    c.fillRect(0, 0, w, h * 0.42);
    // a faint interior line — a shelf, a transom, a lantern's frame band
    c.fillStyle = 'rgba(140,92,50,0.22)';
    c.fillRect(0, h * 0.46, w, 2.5);
    // vignette so the panel darkens into its own frame
    for (const [x0, y0, x1, y1] of [[0, 0, w * 0.1, h], [w * 0.9, 0, w * 0.1, h]]) {
      const grad = c.createLinearGradient(x0 === 0 ? 0 : w, 0, x0 === 0 ? w * 0.12 : w * 0.88, 0);
      grad.addColorStop(0, 'rgba(150,100,58,0.3)');
      grad.addColorStop(1, 'rgba(150,100,58,0)');
      c.fillStyle = grad;
      c.fillRect(x0, y0, x1, y1);
    }
  });
}

const setMap = (mat, tex) => {
  mat.map = tex;
  mat.needsUpdate = true;
};

/** Called once from mats.js after the pool is built. */
export function applyPolishSurfaces(M) {
  if (true) {
    const plaster = plasterTex();
    for (const m of [M.render, M.renderWarm, M.renderCool, M.limestone, M.limestoneWarm, M.canvas]) setMap(m, plaster);
    const rub = rubbleTex();
    for (const m of [M.rubble, M.rubbleDark]) setMap(m, rub);
    const roof = roofTex();
    for (const m of [M.pantile, M.pantileWorn, M.pantileDark]) setMap(m, roof);
    const tar = tarTex();
    for (const m of [M.tar, M.tarLight]) setMap(m, tar);
  }
  if (true) setMap(M.lit, litGlassTex());
}
