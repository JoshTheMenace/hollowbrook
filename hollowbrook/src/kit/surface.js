import { cached, surfaceTex } from '../core/texkit.js';

/* ------------------------------------------------------------------ *
 * SURFACE MICRO-TEXTURE for the shared material pool.
 *
 * This is polish mechanism #1 and it is the single biggest step between a
 * coloured blockout and something that reads as painted. Every map here is
 * a MULTIPLY map (values at and just under white) attached to a POOLED
 * material in mats.js, so every building in the city inherits it at ZERO
 * extra draw calls and zero extra materials — the pool stays a pool.
 *
 * Thistledown needs its own set rather than the reference town's: a village
 * of lime-washed timber frame under deep straw has four surfaces that carry
 * its identity, and three of them did not exist before —
 *
 *   thatchTex   COMBING. A thatched roof is bundles of straw combed DOWN
 *               the pitch and clipped at the eave. The comb lines are the
 *               only thing that separates thatch from a brown gable at
 *               twenty metres, and the ink pass cannot draw them (they are
 *               not silhouettes and not creases). They have to be in a map.
 *   shingleTex  the courses and the moss patches of an oak shingle roof.
 *   limewashTex a village wash is brushed on by hand over daub: broader,
 *               streakier mottle than a town's rendered wall, and a damp
 *               band rising out of the ground at the foot.
 *   oakTex      the frame timbers: grain along the member plus the marks
 *               of an adze, faint enough to read as painted.
 *
 * ART-DIRECTION CAUTIONS, all honoured here:
 *   - LOW-frequency, LOW-contrast, readable as PAINTED. No photographic
 *     noise; soft blobs, streaks and hairlines only.
 *   - TILEABLE: every feature is drawn at its position AND at the eight
 *     wrap offsets, so a repeat never shows a seam.
 *   - The kit's geometry carries per-face 0..1 UVs (BoxGeometry) and the
 *     lofted solids carry none at all, so a map lands at a different
 *     physical scale on a gable than on a sill. That is why nothing here
 *     has a MEASURED feature — no courses at a stated gauge, only texture.
 *     The one exception is thatch's combing, whose direction matters and
 *     whose spacing does not.
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

/* ------------------------------------------------------------------ *
 * TEXEL DENSITY — the faces these maps actually land on, in metres.
 *
 * Every map here was 256x256 (some 128) regardless of what it covered,
 * and that is a prop-sized budget spent on buildings.  Measured off the
 * built town by traversing it and grouping meshes by `material.map`,
 * taking the largest face dimension per map:
 *
 *     thatch    11.5 m  repeat 1  ->  22.3 px/m   <- the town's most-seen
 *     granite   26.3 m  repeat 2  ->  19.4 px/m       surface, and a card
 *     canvas     9.3 m  repeat 2  ->  27.5 px/m       with a smear on it
 *     ground    96.0 m  repeat 2  ->   5.3 px/m
 *     oak       18.9 m  repeat 2  ->  27.0 px/m
 *     limewash  14.4 m  repeat 2  ->  35.6 px/m
 *     shingle   10.0 m  repeat 2  ->  51.5 px/m
 *     daub       7.7 m  repeat 2  ->  66.2 px/m
 *
 * `surfaceTex` sizes the canvas from the number below at TEXELS_PER_M
 * (48 px/m), power-of-two, clamped.  Nothing in the drawing code had to
 * change: it is all gradients, arcs and strokes authored at a nominal 256,
 * and `make`'s `unit` scales the context, so the same code emits the same
 * picture at 1024.
 *
 * TWO OF THE MEASURED NUMBERS ARE NOT THE NUMBER TO SIZE BY, and saying
 * why is the point of writing them down.  A merged pool's bounding box is
 * the whole assembly, not one face — `oak`'s 18.9 m and `limewash`'s 14.4
 * are a strung lantern run and a hollyhock row, whose real members are two
 * or three metres, so both are already over 48 px/m where it counts.  And
 * `granite` and `ground` are each dominated by one large PAVING field
 * (26 m of ground wear, the 96 m terrain plate) whose map is a broad joint
 * network or a soft tone drift with no feature under a metre: density is
 * not what limits either, so granite is sized for a 12 m tower elevation
 * and ground is capped rather than taken to 2304 px.
 * ------------------------------------------------------------------ */
const FACE = {
  limewash: 8,   // a cottage gable
  daub: 8,       // a plaster panel between frame members
  thatch: 11.5,  // the farm barn's roof card — the biggest in the kit
  shingle: 10,   // the temple roof
  oak: 6,        // a frame member run, not the merged pool's bbox
  granite: 12,   // a tower / temple elevation
  canvas: 9.3,   // the mill's sail cloth
  ground: 96,    // the terrain plate — capped, see above
};

/**
 * LIMEWASH over daub. Broad hand-brushed mottle, a few faint weather
 * streaks running down, and a damp band at the foot of the wall — a village
 * wall is always darker where it meets the ground.
 */
export function limewashTex() {
  return surfaceTex('th-limewash', FACE.limewash, (c, w, h) => {
    c.fillStyle = '#fdfcfa';
    c.fillRect(0, 0, w, h);
    const r = rng('limewash');
    mottle(c, w, h, r, { n: 64, rMin: 14, rMax: 42, dark: '146,134,116', light: '255,255,255', aDark: 0.042, aLight: 0.04 });
    /* Brush drag: near-vertical, very faint, WIDER than a weather streak.
     * The first cut used narrow high-contrast strokes and they read as
     * painted stripes marching across every gable. A brush mark must be
     * quieter than the mottle it sits on. */
    for (let i = 0; i < 5; i += 1) {
      const x = r() * w;
      const len = h * (0.3 + r() * 0.5);
      const wd = 6 + r() * 18;
      wrapped(c, w, h, x, 0, (px) => {
        const grad = c.createLinearGradient(0, 0, 0, len);
        grad.addColorStop(0, `rgba(126,116,100,${(0.016 + r() * 0.012).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(126,116,100,0)');
        c.fillStyle = grad;
        c.fillRect(px - wd / 2, 0, wd, len);
      });
    }
  }, { repeat: 2 });
}

/** The same wash, warmer and more worn — for honey and rose limewash and
 *  for the plaster panels between frame members. */
export function daubTex() {
  return surfaceTex('th-daub', FACE.daub, (c, w, h) => {
    c.fillStyle = '#fdfbf8';
    c.fillRect(0, 0, w, h);
    const r = rng('daub');
    mottle(c, w, h, r, { n: 84, rMin: 8, rMax: 30, dark: '138,124,104', light: '255,252,244', aDark: 0.055, aLight: 0.045 });
    // hairline crazing: a daub panel dries in a net of fine cracks
    c.strokeStyle = 'rgba(120,108,92,0.07)';
    c.lineWidth = 1.1;
    for (let i = 0; i < 14; i += 1) {
      const x = r() * w;
      const y = r() * h;
      wrapped(c, w, h, x, y, (px, py) => {
        c.beginPath();
        c.moveTo(px, py);
        let cx = px;
        let cy = py;
        for (let k = 0; k < 3; k += 1) {
          cx += (r() - 0.5) * 34;
          cy += (r() - 0.5) * 34;
          c.lineTo(cx, cy);
        }
        c.stroke();
      });
    }
  }, { repeat: 2 });
}

/**
 * THATCH. Combing down the pitch, in bundles rather than as even lines —
 * the whole point is that a thatcher lays it in handfuls. Plus broad tone
 * drift across the roof (a thatch is patched over decades) and a darker
 * band low down where the eave sits in its own shade.
 *
 * The map is applied with repeat 1x1 on purpose: the comb direction is the
 * one thing here that has to agree with the geometry, and the thatch loft
 * carries a UV whose V runs DOWN THE PITCH. Repeating it in V would put a
 * hard course line halfway up every roof.
 */
export function thatchTex() {
  return surfaceTex('th-thatch', FACE.thatch, (c, w, h) => {
    c.fillStyle = '#fdfbf6';
    c.fillRect(0, 0, w, h);
    const r = rng('thatch');
    // broad drift: patched over decades, never one sheet
    mottle(c, w, h, r, { n: 26, rMin: 30, rMax: 84, dark: '132,108,72', light: '255,250,238', aDark: 0.07, aLight: 0.055 });
    // the combing: bundles of 3-6 lines, then a gap. V runs down the pitch.
    let x = 0;
    while (x < w) {
      const bundle = 3 + Math.floor(r() * 4);
      const a = 0.05 + r() * 0.06;
      for (let k = 0; k < bundle; k += 1) {
        const px = x + k * 1.9;
        const wob = r() * 1.2;
        wrapped(c, w, h, px, 0, (qx) => {
          c.strokeStyle = `rgba(112,90,58,${(a * (0.5 + r() * 0.7)).toFixed(3)})`;
          c.lineWidth = 0.9 + r() * 0.8;
          c.beginPath();
          c.moveTo(qx, 0);
          c.bezierCurveTo(qx + wob, h * 0.34, qx - wob, h * 0.68, qx + wob * 0.4, h);
          c.stroke();
        });
      }
      x += bundle * 1.9 + 2 + r() * 5;
    }
    // the clipped eave course: the bottom of a thatch is cut square and it
    // is the darkest band on the roof
    const eave = c.createLinearGradient(0, h * 0.82, 0, h);
    eave.addColorStop(0, 'rgba(118,94,58,0)');
    eave.addColorStop(1, 'rgba(118,94,58,0.16)');
    c.fillStyle = eave;
    c.fillRect(0, h * 0.82, w, h * 0.18);
  }, { repeat: 1 });
}

/** OAK SHINGLE: courses across, split lines down, and moss holding in the
 *  laps on the shaded side. Repeat 2x2 — a shingle's gauge is small enough
 *  that the scale drift across different roofs reads as different roofs. */
export function shingleTex() {
  return surfaceTex('th-shingle', FACE.shingle, (c, w, h) => {
    c.fillStyle = '#fdfcfa';
    c.fillRect(0, 0, w, h);
    const r = rng('shingle');
    mottle(c, w, h, r, { n: 34, rMin: 16, rMax: 52, dark: '110,116,92', light: '252,252,244', aDark: 0.06, aLight: 0.05 });
    const rows = 9;
    for (let row = 0; row <= rows; row += 1) {
      const y0 = (h / rows) * row;
      // the course shadow: a shingle laps over the one below, so the line is
      // a soft shadow under a hard edge, not a drawn stroke
      const g = c.createLinearGradient(0, y0 - 3, 0, y0 + 2.5);
      g.addColorStop(0, 'rgba(88,92,72,0.14)');
      g.addColorStop(1, 'rgba(88,92,72,0)');
      c.fillStyle = g;
      c.fillRect(0, y0 - 3, w, 5.5);
      // the split lines in this course, offset from the one above
      const step = 13 + (row % 3) * 4;
      c.strokeStyle = 'rgba(94,96,78,0.13)';
      c.lineWidth = 1.2;
      for (let x = (row * 7) % step; x < w; x += step) {
        c.beginPath();
        c.moveTo(x, y0);
        c.lineTo(x + (r() - 0.5) * 1.5, y0 + h / rows);
        c.stroke();
      }
    }
    // moss in the laps
    for (let i = 0; i < 10; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const R = 6 + r() * 16;
      wrapped(c, w, h, x, y, (px, py) => {
        const g = c.createRadialGradient(px, py, 1, px, py, R);
        g.addColorStop(0, 'rgba(96,120,82,0.14)');
        g.addColorStop(1, 'rgba(96,120,82,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(px, py, R, 0, TAU);
        c.fill();
      });
    }
  }, { repeat: 2 });
}

/** SILVERED OAK: grain running along the member, with the shallow scallops
 *  an adze leaves. Faint — a frame timber is a dark line in the elevation
 *  first and a piece of wood second. */
export function oakTex() {
  return surfaceTex('th-oak', FACE.oak, (c, w, h) => {
    c.fillStyle = '#fdfcfb';
    c.fillRect(0, 0, w, h);
    const r = rng('oak');
    mottle(c, w, h, r, { n: 22, rMin: 20, rMax: 60, dark: '108,98,84', light: '255,255,250', aDark: 0.05, aLight: 0.05 });
    for (let i = 0; i < 22; i += 1) {
      const y = r() * h;
      const a = 0.04 + r() * 0.05;
      wrapped(c, w, h, 0, y, (_, py) => {
        c.strokeStyle = `rgba(96,86,70,${a.toFixed(3)})`;
        c.lineWidth = 0.8 + r() * 1.4;
        c.beginPath();
        c.moveTo(0, py);
        c.bezierCurveTo(w * 0.3, py + (r() - 0.5) * 7, w * 0.7, py + (r() - 0.5) * 7, w, py);
        c.stroke();
      });
    }
    // adze scallops: a shallow repeating flat every hand's width
    for (let x = 0; x < w; x += 26) {
      const g = c.createLinearGradient(x, 0, x + 26, 0);
      g.addColorStop(0, 'rgba(104,94,78,0.05)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      g.addColorStop(1, 'rgba(104,94,78,0.05)');
      c.fillStyle = g;
      c.fillRect(x, 0, 26, h);
    }
  }, { repeat: 2 });
}

/** WORN GRANITE: a wavering coursed-joint network with strong block-to-block
 *  tone variation. Used for the towers, the temple, the well and the
 *  revetments. */
export function graniteTex() {
  return surfaceTex('th-granite', FACE.granite, (c, w, h) => {
    c.fillStyle = '#fcfbf9';
    c.fillRect(0, 0, w, h);
    const r = rng('granite');
    mottle(c, w, h, r, { n: 58, rMin: 8, rMax: 28, dark: '116,110,104', light: '255,255,255', aDark: 0.085, aLight: 0.065 });
    c.strokeStyle = 'rgba(92,88,84,0.11)';
    c.lineWidth = 1.7;
    const rows = 7;
    for (let row = 0; row <= rows; row += 1) {
      const y0 = (h / rows) * row;
      c.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin((x / w) * TAU * 2 + row * 2.7) * 2.6;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      const step = 26 + (row % 3) * 12;
      for (let x = (row * 15) % step; x < w; x += step) {
        const jig = Math.sin(row * 5.1 + x) * 3;
        c.beginPath();
        c.moveTo(x + jig, y0);
        c.lineTo(x + jig * 0.4, y0 + h / rows);
        c.stroke();
      }
    }
    // lichen: the pale rosettes on any stone that has stood in a field
    for (let i = 0; i < 12; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const R = 4 + r() * 9;
      wrapped(c, w, h, x, y, (px, py) => {
        const g = c.createRadialGradient(px, py, 0.5, px, py, R);
        g.addColorStop(0, 'rgba(230,232,206,0.20)');
        g.addColorStop(1, 'rgba(230,232,206,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(px, py, R, 0, TAU);
        c.fill();
      });
    }
  }, { repeat: 2 });
}

/** CANVAS: the stalls' awnings and the mill's sail cloth. A woven weave plus
 *  the sag creases a sheet of cloth keeps once it has been folded. */
export function canvasTex() {
  return surfaceTex('th-canvas', FACE.canvas, (c, w, h) => {
    c.fillStyle = '#fdfdfb';
    c.fillRect(0, 0, w, h);
    const r = rng('canvas');
    for (let x = 0; x < w; x += 3) {
      c.fillStyle = `rgba(150,140,120,${(0.03 + r() * 0.02).toFixed(3)})`;
      c.fillRect(x, 0, 1.2, h);
    }
    for (let y = 0; y < h; y += 3) {
      c.fillStyle = `rgba(150,140,120,${(0.03 + r() * 0.02).toFixed(3)})`;
      c.fillRect(0, y, w, 1.2);
    }
    mottle(c, w, h, r, { n: 14, rMin: 16, rMax: 44, dark: '132,124,108', light: '255,255,255', aDark: 0.05, aLight: 0.05 });
  }, { repeat: 2, unit: 128 });
}

/** GROUND: a broad tone break for the walkable surfaces, so a big flat area
 *  in one tone is never one tone. Deliberately the softest map here. */
export function groundTex() {
  return surfaceTex('th-ground', FACE.ground, (c, w, h) => {
    c.fillStyle = '#fdfcfa';
    c.fillRect(0, 0, w, h);
    const r = rng('ground');
    mottle(c, w, h, r, { n: 40, rMin: 26, rMax: 78, dark: '126,120,102', light: '255,255,250', aDark: 0.055, aLight: 0.045 });
  }, { repeat: 2, max: 512 });
}

/**
 * THE LIT-GLASS TREATMENT — polish mechanism #6, and the reason a lit
 * lantern is a glow with depth in it rather than a flat orange rectangle.
 * One multiply map serving a paper lantern's body, a lit window pane and a
 * votive niche on the pooled warm-light material: a bright core low-centre
 * (where the flame actually is), a shadowed head (the cap, or the room's
 * ceiling), a faint frame band, and vignetted edges.
 */
export function litGlassTex() {
  return cached('th-lit', 128, 128, (c, w, h) => {
    c.fillStyle = '#fff6e6';
    c.fillRect(0, 0, w, h);
    const core = c.createRadialGradient(w * 0.5, h * 0.62, 4, w * 0.5, h * 0.62, w * 0.64);
    core.addColorStop(0, 'rgba(255,255,255,0.88)');
    core.addColorStop(0.5, 'rgba(255,244,220,0.36)');
    core.addColorStop(1, 'rgba(255,244,220,0)');
    c.fillStyle = core;
    c.fillRect(0, 0, w, h);
    const head = c.createLinearGradient(0, 0, 0, h * 0.4);
    head.addColorStop(0, 'rgba(150,96,52,0.44)');
    head.addColorStop(1, 'rgba(150,96,52,0)');
    c.fillStyle = head;
    c.fillRect(0, 0, w, h * 0.4);
    // the paper lantern's own bamboo rings — three faint bands
    c.fillStyle = 'rgba(140,92,50,0.18)';
    for (const t of [0.28, 0.5, 0.72]) c.fillRect(0, h * t, w, 2);
    for (const [x0, y0, x1, y1] of [[0, 0, w * 0.11, h], [w * 0.89, 0, w * 0.11, h]]) {
      const grad = c.createLinearGradient(x0 === 0 ? 0 : w, 0, x0 === 0 ? w * 0.13 : w * 0.87, 0);
      grad.addColorStop(0, 'rgba(150,100,58,0.32)');
      grad.addColorStop(1, 'rgba(150,100,58,0)');
      c.fillStyle = grad;
      c.fillRect(x0, y0, x1, y1);
    }
  });
}

/** The UNLIT paper lantern. Same construction, no core: the paper's own
 *  translucency, the bamboo rings, and a shadow inside the cap. An unlit
 *  lantern with no map is a cream cylinder; with this it is paper. */
export function paperLanternTex() {
  return cached('th-paper-lantern', 128, 128, (c, w, h) => {
    c.fillStyle = '#fdfbf5';
    c.fillRect(0, 0, w, h);
    const head = c.createLinearGradient(0, 0, 0, h * 0.34);
    head.addColorStop(0, 'rgba(132,112,84,0.30)');
    head.addColorStop(1, 'rgba(132,112,84,0)');
    c.fillStyle = head;
    c.fillRect(0, 0, w, h * 0.34);
    c.fillStyle = 'rgba(128,110,80,0.16)';
    for (const t of [0.26, 0.48, 0.70, 0.9]) c.fillRect(0, h * t, w, 2.4);
    // one crease and one soft stain: this paper has been in a box since last year
    c.fillStyle = 'rgba(128,110,80,0.10)';
    c.fillRect(w * 0.42, 0, 2, h);
    const g = c.createRadialGradient(w * 0.7, h * 0.6, 2, w * 0.7, h * 0.6, w * 0.3);
    g.addColorStop(0, 'rgba(150,126,86,0.12)');
    g.addColorStop(1, 'rgba(150,126,86,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

const setMap = (mat, tex) => {
  if (!mat) return;
  mat.map = tex;
  mat.needsUpdate = true;
};

/**
 * Called ONCE from mats.js after the pool is built. Every building in
 * Thistledown is born textured because of this call and nothing else — a
 * district never attaches a map, and a generator never makes its own
 * material for a surface that has a pool role.
 */
export function applyKitSurfaces(M) {
  const lime = limewashTex();
  for (const m of [M.limewash, M.limewashHoney, M.limewashPale, M.limewashRose, M.render]) setMap(m, lime);
  const daub = daubTex();
  for (const m of [M.plaster, M.daub]) setMap(m, daub);
  const thatch = thatchTex();
  for (const m of [M.thatch, M.thatchWorn, M.thatchRidge, M.thatchDeep]) setMap(m, thatch);
  const shingle = shingleTex();
  for (const m of [M.shingle, M.shingleMoss, M.shingleDark]) setMap(m, shingle);
  const oak = oakTex();
  for (const m of [M.oak, M.oakDark, M.oakSilver, M.timberFrame, M.timberDark]) setMap(m, oak);
  const granite = graniteTex();
  /* the curtain takes the same masons' joint-and-lichen map: a wall with no
   * micro-texture is 5 x 100 m of ONE flat value, which is precisely the
   * thing this whole layer exists to prevent, and it is the biggest single
   * surface in Hollowbrook. */
  for (const m of [M.granite, M.graniteWarm, M.graniteDark, M.rubble, M.curtain, M.curtainDark, M.coping]) setMap(m, granite);
  const canvas = canvasTex();
  for (const m of [M.canvas, M.canvasWorn, M.hessian, M.canvasCompany]) setMap(m, canvas);
  const ground = groundTex();
  for (const m of [M.ground, M.paving, M.turf, M.earth, M.gravel]) setMap(m, ground);
  setMap(M.lit, litGlassTex());
  setMap(M.lanternPaper, paperLanternTex());
}
