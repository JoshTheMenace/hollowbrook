import * as THREE from 'three';
import { cached, col, rule } from '../core/texkit.js';
import { cel } from '../materials.js';
import { PAL, JOINERY } from '../palette.js';
import { M, painted } from './mats.js';
import { bx, cyl, tubeGeo, parts, tagProp, rng } from './util.js';

/* ------------------------------------------------------------------ *
 * SIGNAGE — the cheapest specificity lever this town has, measured.
 *
 * Thin wrappers over `core/texkit`'s kernel (`cached`, `col`, `rule`) with
 * Thistledown's own typography on top: a village's boards are painted
 * old-style serif capitals with wide letterspacing, a keyline, and a
 * HERALDIC DEVICE — the thing a sign has instead of a logo when half the
 * people reading it cannot read.
 *
 * FOUR RULES, all of which have cost this project turns before:
 *
 * 1. THE ASPECT RULE. A canvas is generated AT THE ASPECT OF THE FACE IT
 *    LANDS ON — `canvasFor(wMetres, hMetres)` does it and every generator
 *    here calls it. A 4:1 plate on a 1:6 post face is a 24-fold crush that
 *    renders as an unreadable smear and throws nothing. YOU NEVER PASS
 *    PIXELS TO ANYTHING IN THIS FILE; YOU PASS METRES.
 *
 * 2. MOUNTING CONVENTION. Every wall-mounted sign has its origin ON THE
 *    WALL FACE and projects toward +Z, and carries `userData.airborne =
 *    true` so the spatial audit does not read a fascia three metres up as a
 *    floating unit. (Three districts in the first city built this way
 *    hand-patched exactly that, independently. It is set here, once, for
 *    all six of you.) Free-standing signs have their origin on the GROUND
 *    at the post centre, so `seatOnGround` works on them.
 *
 * 3. TWO-SIDED PLATES ARE TWO PLANES BACK TO BACK, never one DoubleSide
 *    plane: the back of a double-sided plane is the artwork MIRRORED, which
 *    is how you get an inn sign reading ERAM & NOOM EHT.
 *
 * 4. NO PEOPLE. EVER. Not in a device, not in a silhouette, not on a
 *    notice. The environment carries the narrative here, and that is a hard
 *    constraint rather than an omission. A mare is a horse; a lost familiar
 *    is a cat; the wardens' device is a portcullis. Nobody is drawn.
 * ------------------------------------------------------------------ */

const SERIF = `'Iowan Old Style', Georgia, 'Palatino Linotype', 'Times New Roman', serif`;
const CONDENSED = `'Arial Narrow', 'Helvetica Neue', Arial, sans-serif`;
const HAND = `'Bradley Hand', 'Segoe Script', 'Comic Sans MS', cursive`;

/* ---- text kernel -------------------------------------------------------- */

function text(c, str, x, y, maxW, size, color, { font = SERIF, weight = 'bold', spacing = 0, align = 'center' } = {}) {
  const chars = [...String(str)];
  let s = size;
  const gap = () => (spacing * s) / size;
  const total = () => chars.reduce((a, ch) => a + c.measureText(ch).width + gap(), -gap());
  do {
    c.font = `${weight} ${s}px ${font}`;
    if (total() <= maxW) break;
    s -= 1;
  } while (s > 6);
  c.fillStyle = col(color);
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const width = total();
  let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  for (const ch of chars) {
    c.fillText(ch, cx, y);
    cx += c.measureText(ch).width + gap();
  }
  return s;
}

/** Faint weathering: a few streaks and a darkened bottom edge. A summer of
 *  dust at an opacity that survives the cel ramp without becoming the
 *  photographic texture detail the art direction rules out. */
function weather(c, w, h, r, strength = 0.1) {
  c.save();
  c.globalAlpha = strength;
  c.fillStyle = '#4a4458';
  for (let i = 0; i < 6; i += 1) {
    const y = r.range(0, h);
    c.fillRect(r.range(0, w * 0.5), y, r.range(w * 0.2, w * 0.6), r.range(1, 3));
  }
  c.globalAlpha = strength * 1.5;
  c.fillRect(0, h - Math.max(2, h * 0.03), w, Math.max(2, h * 0.03));
  c.restore();
}

/** Canvas pixel dimensions for a face `wm` x `hm` METRES. This is the whole
 *  defence against the crush trap: the canvas always matches the face. */
export function canvasFor(wm, hm, long = 1024) {
  const a = wm / hm;
  const w = a >= 1 ? long : Math.max(48, Math.round(long * a));
  const h = a >= 1 ? Math.max(48, Math.round(long / a)) : long;
  return [w - (w % 2), h - (h % 2)];
}

/* ---- the heraldic devices ----------------------------------------------
 * A village sign's device is what it has instead of a name for the half of
 * the village that cannot read one. Each is a DRAWN SHAPE in a unit box
 * (0..1, y down), stroked and filled in one ink colour so it survives the
 * cel ramp: no gradients, no half-tones, no photographic detail.
 *
 * AND NO PEOPLE, which is why the inn's device is a moon and a MARE and
 * why the lost-familiar notice is a CAT. See rule 4 above.
 */
function unit(c, x, y, s) {
  c.save();
  c.translate(x - s / 2, y - s / 2);
  c.scale(s, s);
  return () => c.restore();
}

export const DEVICES = {
  /**
   * A crescent moon and a mare's head — THE MOON & MARE.
   *
   * A DEVICE ON AN INN BOARD IS READ AT THREE METRES AND IS ABOUT FORTY
   * PIXELS ACROSS. The first cut drew a delicate bezier head with an eye
   * and a nostril inside a thin crescent, and at that size it came back as
   * a lump with a ring over it. Everything here is a BOLD SILHOUETTE with
   * four or five features and nothing smaller than a twentieth of the box:
   * the crescent is fat and set well clear of the head, and the head is the
   * chess-knight profile, which is the most legible horse shape there is.
   */
  moonAndMare(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    // the crescent, upper left and clear of the head
    c.save();
    c.beginPath();
    c.arc(0.235, 0.235, 0.185, 0, Math.PI * 2);
    c.arc(0.325, 0.185, 0.155, 0, Math.PI * 2, true);
    c.fill('evenodd');
    c.restore();
    // the mare's head in profile, facing left, filling the rest of the box
    c.beginPath();
    c.moveTo(0.76, 0.99);
    c.lineTo(0.795, 0.615);
    c.lineTo(0.735, 0.415);   // the crest
    c.lineTo(0.700, 0.300);
    c.lineTo(0.735, 0.150);   // the far ear
    c.lineTo(0.632, 0.268);
    c.lineTo(0.568, 0.142);   // the near ear
    c.lineTo(0.508, 0.302);
    c.lineTo(0.335, 0.418);   // down the face
    c.lineTo(0.152, 0.508);
    c.lineTo(0.082, 0.556);   // the muzzle
    c.lineTo(0.090, 0.626);
    c.lineTo(0.205, 0.648);   // the lip
    c.lineTo(0.332, 0.638);   // the chin
    c.lineTo(0.438, 0.722);   // the jaw
    c.lineTo(0.462, 0.99);
    c.closePath();
    c.fill();
    // the eye, punched out big enough to survive the ink pass
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(0.432, 0.442, 0.042, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    done();
  },

  /** A mortar with its pestle standing in it — THE GILDED PESTLE. */
  mortarAndPestle(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    c.strokeStyle = col(ink);
    // the pestle, leaning
    c.save();
    c.translate(0.60, 0.30);
    c.rotate(0.42);
    c.beginPath();
    c.moveTo(-0.035, -0.16);
    c.lineTo(0.035, -0.16);
    c.lineTo(0.055, 0.40);
    c.lineTo(-0.055, 0.40);
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(0, -0.17, 0.055, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // the mortar: a bowl with a foot
    c.beginPath();
    c.moveTo(0.22, 0.52);
    c.lineTo(0.78, 0.52);
    c.lineTo(0.68, 0.80);
    c.lineTo(0.32, 0.80);
    c.closePath();
    c.fill();
    c.fillRect(0.18, 0.46, 0.64, 0.075);
    c.fillRect(0.36, 0.80, 0.28, 0.06);
    c.fillRect(0.28, 0.86, 0.44, 0.075);
    done();
  },

  /** A hammer crossed over an anvil — N. EMBERWRIGHT, SMITH. */
  hammerAndAnvil(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    // the anvil
    c.beginPath();
    c.moveTo(0.16, 0.60);
    c.lineTo(0.80, 0.60);
    c.lineTo(0.92, 0.66);
    c.lineTo(0.80, 0.70);
    c.lineTo(0.66, 0.70);
    c.lineTo(0.62, 0.82);
    c.lineTo(0.72, 0.92);
    c.lineTo(0.26, 0.92);
    c.lineTo(0.36, 0.82);
    c.lineTo(0.32, 0.70);
    c.lineTo(0.16, 0.70);
    c.closePath();
    c.fill();
    // the hammer, raised
    c.save();
    c.translate(0.46, 0.30);
    c.rotate(-0.5);
    c.fillRect(-0.035, -0.05, 0.07, 0.44);
    c.fillRect(-0.22, -0.20, 0.44, 0.155);
    c.restore();
    // three sparks
    for (const [sx, sy, sr] of [[0.72, 0.34, 0.032], [0.80, 0.44, 0.022], [0.66, 0.22, 0.019]]) {
      c.beginPath();
      c.arc(sx, sy, sr, 0, Math.PI * 2);
      c.fill();
    }
    done();
  },

  /** A quill across an open book — SCRIVENER & SPELLBINDER. */
  quillAndBook(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    c.strokeStyle = col(ink);
    c.lineWidth = 0.035;
    // the open book: two leaves off a spine
    c.beginPath();
    c.moveTo(0.5, 0.62);
    c.bezierCurveTo(0.36, 0.52, 0.22, 0.50, 0.10, 0.54);
    c.lineTo(0.10, 0.86);
    c.bezierCurveTo(0.24, 0.82, 0.38, 0.84, 0.5, 0.92);
    c.bezierCurveTo(0.62, 0.84, 0.76, 0.82, 0.90, 0.86);
    c.lineTo(0.90, 0.54);
    c.bezierCurveTo(0.78, 0.50, 0.64, 0.52, 0.5, 0.62);
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 0.028;
    c.beginPath();
    c.moveTo(0.5, 0.63);
    c.lineTo(0.5, 0.91);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    // the quill: a shaft with a barbed vane
    c.save();
    c.translate(0.56, 0.30);
    c.rotate(0.6);
    c.beginPath();
    c.moveTo(0, -0.28);
    c.bezierCurveTo(0.10, -0.14, 0.11, 0.06, 0.03, 0.24);
    c.bezierCurveTo(0.0, 0.06, -0.02, -0.12, 0, -0.28);
    c.fill();
    c.lineWidth = 0.022;
    c.beginPath();
    c.moveTo(0.01, 0.16);
    c.lineTo(-0.06, 0.40);
    c.stroke();
    c.restore();
    done();
  },

  /** Four sails on a cross — THISTLEDOWN MILL. */
  millSails(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    c.save();
    c.translate(0.5, 0.5);
    c.rotate(0.28);
    for (let i = 0; i < 4; i += 1) {
      c.save();
      c.rotate((i / 4) * Math.PI * 2);
      c.fillRect(-0.026, -0.44, 0.052, 0.4);         // the whip
      c.fillRect(0.028, -0.42, 0.13, 0.34);          // the cloth
      c.globalCompositeOperation = 'destination-out';
      for (let k = 1; k < 4; k += 1) c.fillRect(0.028, -0.42 + k * 0.085, 0.13, 0.018);
      c.globalCompositeOperation = 'source-over';
      c.restore();
    }
    c.beginPath();
    c.arc(0, 0, 0.07, 0, Math.PI * 2);
    c.fill();
    c.restore();
    done();
  },

  /** A portcullis in a gate arch — WARDENS OF THE GATE. */
  portcullis(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    c.strokeStyle = col(ink);
    c.lineWidth = 0.05;
    c.beginPath();
    c.moveTo(0.16, 0.92);
    c.lineTo(0.16, 0.44);
    c.bezierCurveTo(0.16, 0.16, 0.84, 0.16, 0.84, 0.44);
    c.lineTo(0.84, 0.92);
    c.stroke();
    for (let i = 0; i < 4; i += 1) {
      const px = 0.28 + i * 0.15;
      c.fillRect(px - 0.022, 0.30 + Math.abs(i - 1.5) * 0.04, 0.044, 0.62 - Math.abs(i - 1.5) * 0.04);
    }
    for (let j = 0; j < 3; j += 1) {
      c.fillRect(0.22, 0.42 + j * 0.17, 0.56, 0.04);
    }
    for (let i = 0; i < 4; i += 1) {
      const px = 0.28 + i * 0.15;
      c.beginPath();
      c.moveTo(px - 0.03, 0.92);
      c.lineTo(px + 0.03, 0.92);
      c.lineTo(px, 0.99);
      c.closePath();
      c.fill();
    }
    done();
  },

  /** A sheaf of wheat — HOLLOWAY'S PROVISIONS. */
  sheaf(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.strokeStyle = col(ink);
    c.fillStyle = col(ink);
    c.lineWidth = 0.032;
    for (let i = -3; i <= 3; i += 1) {
      const lean = i * 0.055;
      c.beginPath();
      c.moveTo(0.5 + lean * 0.7, 0.92);
      c.bezierCurveTo(0.5 + lean * 1.4, 0.66, 0.5 + lean * 2.2, 0.42, 0.5 + lean * 2.8, 0.18);
      c.stroke();
      // the ear: three short strokes on each side
      for (let k = 0; k < 3; k += 1) {
        const t = 0.20 + k * 0.075;
        const px = 0.5 + lean * (2.8 - k * 0.18);
        c.beginPath();
        c.moveTo(px, t);
        c.lineTo(px + 0.05 + lean * 0.4, t + 0.05);
        c.stroke();
        c.beginPath();
        c.moveTo(px, t);
        c.lineTo(px - 0.05 + lean * 0.4, t + 0.05);
        c.stroke();
      }
    }
    c.lineWidth = 0.07;
    c.beginPath();
    c.moveTo(0.28, 0.70);
    c.lineTo(0.72, 0.70);
    c.stroke();
    done();
  },

  /** A cottage loaf with three slashes — B. TANSY, BAKER. */
  loaf(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    c.beginPath();
    c.moveTo(0.12, 0.82);
    c.bezierCurveTo(0.10, 0.50, 0.32, 0.36, 0.5, 0.36);
    c.bezierCurveTo(0.68, 0.36, 0.90, 0.50, 0.88, 0.82);
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(0.5, 0.34, 0.19, Math.PI, 0);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 0.035;
    c.strokeStyle = '#000';
    for (let i = 0; i < 3; i += 1) {
      c.beginPath();
      c.moveTo(0.24 + i * 0.19, 0.78);
      c.lineTo(0.34 + i * 0.19, 0.58);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.fillRect(0.06, 0.82, 0.88, 0.08);
    done();
  },

  /** A bell with its rope — the temple's bell-times. */
  bell(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    c.beginPath();
    c.moveTo(0.22, 0.76);
    c.bezierCurveTo(0.24, 0.44, 0.36, 0.24, 0.5, 0.22);
    c.bezierCurveTo(0.64, 0.24, 0.76, 0.44, 0.78, 0.76);
    c.closePath();
    c.fill();
    c.fillRect(0.16, 0.76, 0.68, 0.075);
    c.beginPath();
    c.arc(0.5, 0.885, 0.055, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(0.5, 0.175, 0.055, 0, Math.PI * 2);
    c.fill();
    done();
  },

  /** A paper lantern — the fair bills. */
  lantern(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    c.fillRect(0.44, 0.06, 0.04, 0.14);
    c.fillRect(0.34, 0.18, 0.32, 0.05);
    c.beginPath();
    c.moveTo(0.34, 0.24);
    c.bezierCurveTo(0.14, 0.36, 0.14, 0.66, 0.34, 0.78);
    c.lineTo(0.66, 0.78);
    c.bezierCurveTo(0.86, 0.66, 0.86, 0.36, 0.66, 0.24);
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    for (let i = 1; i < 4; i += 1) c.fillRect(0.12, 0.24 + i * 0.135, 0.76, 0.022);
    c.globalCompositeOperation = 'source-over';
    c.fillRect(0.34, 0.78, 0.32, 0.05);
    c.fillRect(0.47, 0.83, 0.06, 0.11);
    done();
  },

  /** A SITTING CAT — the lost-familiar notice, drawn and not written.
   *  A cat is not a person; this is the only living thing depicted
   *  anywhere in Thistledown and it is deliberate. */
  cat(c, x, y, s, ink) {
    const done = unit(c, x, y, s);
    c.fillStyle = col(ink);
    c.strokeStyle = col(ink);
    // the tail: a thick curl, drawn first so the body covers its root
    c.lineWidth = 0.075;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0.63, 0.90);
    c.bezierCurveTo(0.84, 0.92, 0.92, 0.76, 0.84, 0.60);
    c.stroke();
    // the body: a haunch and a chest
    c.beginPath();
    c.moveTo(0.30, 0.93);
    c.bezierCurveTo(0.26, 0.72, 0.30, 0.56, 0.38, 0.48);
    c.bezierCurveTo(0.50, 0.44, 0.60, 0.52, 0.64, 0.66);
    c.bezierCurveTo(0.68, 0.78, 0.70, 0.88, 0.70, 0.93);
    c.closePath();
    c.fill();
    // the head and the two ears
    c.beginPath();
    c.arc(0.42, 0.36, 0.145, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(0.30, 0.28);
    c.lineTo(0.315, 0.155);
    c.lineTo(0.415, 0.245);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(0.53, 0.26);
    c.lineTo(0.555, 0.14);
    c.lineTo(0.435, 0.225);
    c.closePath();
    c.fill();
    // the front leg, and the eyes punched out
    c.fillRect(0.36, 0.66, 0.075, 0.27);
    c.globalCompositeOperation = 'destination-out';
    for (const ex of [0.375, 0.475]) {
      c.beginPath();
      c.ellipse(ex, 0.345, 0.022, 0.032, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    done();
  },
};

/* ---- the town's tenants -------------------------------------------------
 * The eight named businesses from the plan's `shared_kit.signage_tenants`,
 * each with its board colours, its device and its OWNING DISTRICT. A
 * district asks for one by key and does not use another district's. Invent
 * no others without telling the coordinator: two districts inventing a
 * second baker is how a town stops being one place.
 *
 * Note what is NOT here: NONE of these carries a district accent as its
 * board colour. `pestle` is the sign the plan says wears the alchemical
 * teal, and it is written with a muted plum ground and the accent passed IN
 * by spellward. The kit does not spend anyone's accent for them.
 */
export const TENANTS = Object.freeze({
  moonmare: { title: 'THE MOON & MARE', sub: 'ALE — BEDS — STABLING', device: 'moonAndMare', bg: JOINERY.plumWash, ink: JOINERY.bone, district: 'green' },
  holloway: { title: "HOLLOWAY'S", sub: 'PROVISIONS & DRY GOODS', device: 'sheaf', bg: PAL.oakDark, ink: JOINERY.bone, district: 'green' },
  tansy: { title: 'B. TANSY', sub: 'BAKER', device: 'loaf', bg: JOINERY.barnRust, ink: JOINERY.bone, district: 'green' },
  pestle: { title: 'THE GILDED PESTLE', sub: 'APOTHECARY', device: 'mortarAndPestle', bg: JOINERY.pitch, ink: JOINERY.bone, district: 'spellward' },
  scrivener: { title: 'SCRIVENER & SPELLBINDER', sub: 'INKS — BINDING — CHARMS', device: 'quillAndBook', bg: JOINERY.plumWash, ink: JOINERY.bone, district: 'spellward' },
  emberwright: { title: 'N. EMBERWRIGHT', sub: 'SMITH & FARRIER', device: 'hammerAndAnvil', bg: JOINERY.pitch, ink: JOINERY.bone, district: 'lowrow' },
  mill: { title: 'THISTLEDOWN MILL', sub: 'CORN GROUND DAILY', device: 'millSails', bg: PAL.oakDark, ink: JOINERY.bone, district: 'millward' },
  wardens: { title: 'WARDENS OF THE GATE', sub: 'ALL WAGGONS DECLARE', device: 'portcullis', bg: JOINERY.doveGrey, ink: PAL.ink, district: 'gateward' },
});

/** Resolve `tenant` — a key, or an object of the same shape. */
export function tenant(t) {
  if (!t) return null;
  if (typeof t === 'string') {
    const found = TENANTS[t];
    if (!found) throw new Error(`[signkit] unknown tenant "${t}". Known: ${Object.keys(TENANTS).join(', ')}`);
    return found;
  }
  return t;
}

/* ---- what is written on things -----------------------------------------
 * These ARE the districts' "what is written on things". Use them rather
 * than inventing prose, and ask the kit agent if your district needs one
 * that is not here.
 */
export const NOTICES = Object.freeze({
  fair: {
    head: 'LANTERN FAIR',
    lines: ['THIS EVENING — AT DUSK', 'LIGHTING FROM THE GREAT OAK', 'STALLS ON THE GREEN', 'BRING YOUR OWN LANTERN'],
    device: 'lantern',
    stamp: 'TONIGHT',
  },
  programme: {
    head: 'ORDER OF THE FAIR',
    lines: ['DUSK — THE OAK IS LIT', 'THEN — THE ROW, THE MILL', 'LAST — THE TEMPLE BELL', 'NO LANTERNS ON THE THATCH'],
  },
  familiar: {
    head: 'LOST',
    lines: ['ONE GREY FAMILIAR', 'ANSWERS TO NOTHING', 'LAST SEEN BY THE WELL', 'REWARD — A LOAF'],
    device: 'cat',
    hand: true,
  },
  flour: {
    head: 'MILL PRICES',
    lines: ['WHEATEN   4 d. THE PECK', 'BARLEY    3 d.', 'GRINDING  1 d. IN TWELVE', 'NO CREDIT AT FAIR'],
    hand: true,
  },
  belltimes: {
    head: 'THE BELL',
    lines: ['DAWN — AND AT NOON', 'DUSK — AND FOR THE FAIR', 'THRICE FOR FIRE', 'ONCE FOR A STRANGER'],
    device: 'bell',
  },
  wardens: {
    head: 'BY ORDER',
    lines: ['WAGGONS DECLARE AT THE GATE', 'NO FIRES ON THE VERGE', 'STABLING 2 d. THE NIGHT', 'GATES SHUT AT FULL DARK'],
  },
  toll: {
    head: 'TOLLS',
    lines: ['FOOT       FREE', 'HORSE      1 d.', 'WAGGON     3 d.', 'FAIR DAY — ALL FREE'],
  },
});

/* ---- textures ----------------------------------------------------------- */

const keyOf = (o) => JSON.stringify(o);

/** Split a title into two balanced lines at the space nearest the middle.
 *  A squarish board cannot fit a three-word name on one line without
 *  driving the type down to nothing, and what comes back then is a
 *  coloured rectangle with a smudge on it. */
function wrapTwo(str) {
  const words = String(str).split(/\s+/).filter(Boolean);
  if (words.length < 2) return [str];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/**
 * A PAINTED TRADE BOARD: coloured ground, a keyline, the device, the name
 * in letterspaced capitals and a quieter sub-line. The layout ADAPTS to the
 * board's proportion — a wide fascia sets the device at the left and the
 * title beside it; anything squarer than about 1.7:1 stacks the device over
 * the title, which is what an inn's hanging board actually does.
 */
export function boardTexture({
  title, sub = '', device = null, bg = PAL.paper, ink = PAL.ink, wm = 4, hm = 0.7,
  seed = 'board', keyline = true, accent = null, font = SERIF,
}) {
  const [w, h] = canvasFor(wm, hm);
  return cached(keyOf(['thboard', title, sub, device, bg, ink, w, h, seed, keyline, accent, font]), w, h, (c) => {
    const r = rng(seed);
    const m = Math.min(w, h);
    c.fillStyle = col(bg);
    c.fillRect(0, 0, w, h);
    if (keyline) {
      c.strokeStyle = col(ink);
      c.lineWidth = Math.max(2, m * 0.03);
      c.globalAlpha = 0.7;
      c.strokeRect(m * 0.09, m * 0.09, w - m * 0.18, h - m * 0.18);
      c.globalAlpha = 1;
    }
    const draw = device && DEVICES[device];
    const stacked = w / h < 1.7;
    let x0 = m * 0.15;
    let x1 = w - m * 0.15;
    if (draw && !stacked) {
      draw(c, m * 0.15 + h * 0.32, h * 0.5, h * 0.62, ink);
      x0 = m * 0.15 + h * 0.68;
    }
    if (accent != null) {
      rule(c, x0, h * 0.2, m * 0.14, h * 0.6, accent);
      x0 += m * 0.3;
    }
    const cx = (x0 + x1) / 2;
    const maxW = x1 - x0;
    if (draw && stacked) {
      draw(c, w * 0.5, h * 0.34, Math.min(w, h) * 0.42, ink);
      const lines = wrapTwo(title);
      const size = h * 0.10;
      lines.forEach((ln, i) => text(c, ln, w * 0.5, h * (0.66 + i * 0.13), w * 0.82, size, ink, { font, spacing: size * 0.08 }));
      if (sub) text(c, sub, w * 0.5, h * (0.66 + lines.length * 0.13 + 0.04), w * 0.76, h * 0.056, ink, { font: CONDENSED, weight: '600', spacing: h * 0.012 });
    } else if (sub) {
      const lines = w / h < 3.4 ? wrapTwo(title) : [title];
      if (lines.length === 2) {
        const size = h * 0.24;
        text(c, lines[0], cx, h * 0.28, maxW, size, ink, { font, spacing: size * 0.07 });
        text(c, lines[1], cx, h * 0.55, maxW, size, ink, { font, spacing: size * 0.07 });
        text(c, sub, cx, h * 0.82, maxW * 0.9, h * 0.115, ink, { font: CONDENSED, weight: '600', spacing: h * 0.02 });
      } else {
        text(c, title, cx, h * 0.40, maxW, h * 0.4, ink, { font, spacing: h * 0.045 });
        text(c, sub, cx, h * 0.76, maxW * 0.9, h * 0.17, ink, { font: CONDENSED, weight: '600', spacing: h * 0.045 });
      }
    } else {
      text(c, title, cx, h * 0.52, maxW, h * 0.46, ink, { font, spacing: h * 0.06 });
    }
    weather(c, w, h, r, 0.09);
  });
}

/** A long fascia over a trade front: the same board plus the visible panel
 *  joints a real fascia is boarded up in. */
export function fasciaTexture({ title, sub = '', device = null, bg, ink, wm = 4, hm = 0.5, joints = 3, seed = 'fascia' }) {
  const [w, h] = canvasFor(wm, hm);
  return cached(keyOf(['thfascia', title, sub, device, bg, ink, w, h, joints, seed]), w, h, (c) => {
    const r = rng(seed);
    c.fillStyle = col(bg);
    c.fillRect(0, 0, w, h);
    rule(c, 0, 0, w, Math.max(2, h * 0.07), ink);
    rule(c, 0, h - Math.max(2, h * 0.1), w, Math.max(2, h * 0.1), ink);
    c.globalAlpha = 0.15;
    for (let i = 1; i <= joints; i += 1) rule(c, (w * i) / (joints + 1) - 1, 0, 3, h, ink);
    c.globalAlpha = 1;
    let x0 = h * 0.2;
    let x1 = w - h * 0.2;
    const draw = device && DEVICES[device];
    if (draw) {
      draw(c, h * 0.55, h * 0.5, h * 0.62, ink);
      draw(c, w - h * 0.55, h * 0.5, h * 0.62, ink);
      x0 = h * 1.0;
      x1 = w - h * 1.0;
    }
    if (sub) {
      text(c, title, (x0 + x1) / 2, h * 0.42, x1 - x0, h * 0.42, ink, { spacing: h * 0.07 });
      text(c, sub, (x0 + x1) / 2, h * 0.76, (x1 - x0) * 0.8, h * 0.15, ink, { font: CONDENSED, weight: '600', spacing: h * 0.07 });
    } else {
      text(c, title, (x0 + x1) / 2, h * 0.5, x1 - x0, h * 0.48, ink, { spacing: h * 0.09 });
    }
    weather(c, w, h, r, 0.1);
  });
}

/**
 * A pinned paper notice. Portrait; a heading over a rule, a device if it
 * has one, then up to four body lines. `hand: true` sets it in a script
 * face with each line tilted a degree or two — that is the chalk-and-pencil
 * register, and it is the writing a person did rather than an office.
 */
export function noticeTexture({ notice, head, lines = [], device, hand = false, stamp = null, wm = 0.34, hm = 0.46, seed = 'notice' }) {
  const N = typeof notice === 'string' ? NOTICES[notice] : notice;
  if (notice && !N) throw new Error(`[signkit] unknown notice "${notice}". Known: ${Object.keys(NOTICES).join(', ')}`);
  const H = head ?? N?.head ?? 'NOTICE';
  const L = lines.length ? lines : (N?.lines ?? []);
  const D = device ?? N?.device ?? null;
  const isHand = hand || !!N?.hand;
  const ST = stamp ?? N?.stamp ?? null;
  const [w, h] = canvasFor(wm, hm, 640);
  return cached(keyOf(['thnotice', H, L, D, isHand, ST, w, h, seed]), w, h, (c) => {
    const r = rng(seed);
    const ink = isHand ? 0x453d58 : PAL.ink;
    c.fillStyle = col(isHand ? 0xeee6d0 : PAL.paper);
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.12;
    c.fillStyle = '#5c5470';
    c.fillRect(0, 0, w, h * 0.02);
    c.fillRect(0, h - h * 0.03, w, h * 0.03);
    c.globalAlpha = 1;
    const font = isHand ? HAND : SERIF;
    text(c, H, w / 2, h * 0.11, w * 0.84, h * 0.1, ink, { font, weight: 'bold', spacing: isHand ? 0 : h * 0.012 });
    rule(c, w * 0.12, h * 0.175, w * 0.76, Math.max(1, h * 0.006), ink);
    let y0 = 0.26;
    if (D && DEVICES[D]) {
      DEVICES[D](c, w / 2, h * 0.35, Math.min(w * 0.6, h * 0.3), ink);
      y0 = 0.52;
    }
    const step = (h * (D ? 0.36 : 0.58)) / Math.max(L.length, 3);
    L.slice(0, 4).forEach((line, i) => {
      c.save();
      if (isHand) {
        c.translate(w / 2, h * y0 + i * step);
        c.rotate(r.range(-0.03, 0.03));
        text(c, line, 0, 0, w * 0.84, h * 0.062, ink, { font, weight: '500' });
      } else {
        text(c, line, w / 2, h * y0 + i * step, w * 0.86, h * 0.05, ink, { font: CONDENSED, weight: '500', spacing: h * 0.004 });
      }
      c.restore();
    });
    if (ST) {
      c.save();
      c.translate(w * 0.5, h * 0.9);
      c.rotate(-0.13);
      c.strokeStyle = col(0xb4483a);
      c.lineWidth = Math.max(2, h * 0.008);
      const sw = w * 0.52;
      const sh = h * 0.09;
      c.strokeRect(-sw / 2, -sh / 2, sw, sh);
      text(c, ST, 0, 0, sw * 0.86, sh * 0.6, 0xb4483a, { weight: 'bold', spacing: sh * 0.1 });
      c.restore();
    }
    weather(c, w, h, r, 0.05);
  });
}

/** A name painted straight onto limewash. `bg` MUST be the wall's own
 *  colour or it reads as a plate screwed on. */
export function paintedTexture({ title, ink = PAL.ink, bg = PAL.limewash, wm = 3, hm = 0.6, seed = 'painted', font = SERIF }) {
  const [w, h] = canvasFor(wm, hm, 768);
  return cached(keyOf(['thpainted', title, ink, bg, w, h, seed, font]), w, h, (c) => {
    const r = rng(seed);
    c.fillStyle = col(bg);
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.82;             // paint on limewash is never solid
    text(c, title, w / 2, h * 0.54, w * 0.9, h * 0.56, ink, { font, weight: 'bold', spacing: h * 0.08 });
    c.globalAlpha = 1;
    weather(c, w, h, r, 0.15);
  });
}

/** CHALK on a dark board — the day's prices, written this afternoon. Chalk
 *  is never opaque and never white: `PAL.paper` at 0.7, with a smeared band
 *  where somebody wiped a line out. */
export function chalkTexture({ lines = [], bg = 0x4a4557, wm = 0.9, hm = 0.7, seed = 'chalk', head = null }) {
  const [w, h] = canvasFor(wm, hm, 640);
  return cached(keyOf(['thchalk', lines, bg, w, h, seed, head]), w, h, (c) => {
    const r = rng(seed);
    c.fillStyle = col(bg);
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.1;
    for (let i = 0; i < 5; i += 1) {
      c.fillStyle = col(PAL.paper);
      c.fillRect(r.range(w * 0.08, w * 0.5), r.range(h * 0.12, h * 0.9), r.range(w * 0.2, w * 0.42), Math.max(2, h * 0.05));
    }
    c.globalAlpha = 1;
    let y = h * 0.2;
    if (head) {
      c.globalAlpha = 0.84;
      text(c, head, w / 2, y, w * 0.82, h * 0.14, PAL.paper, { font: HAND, weight: 'bold' });
      c.globalAlpha = 0.5;
      rule(c, w * 0.14, h * 0.3, w * 0.72, Math.max(1, h * 0.008), PAL.paper);
      c.globalAlpha = 1;
      y = h * 0.44;
    }
    const step = (h * (head ? 0.46 : 0.72)) / Math.max(lines.length, 2);
    lines.slice(0, 5).forEach((line, i) => {
      c.save();
      c.globalAlpha = r.range(0.6, 0.8);
      c.translate(w * 0.5, y + i * step);
      c.rotate(r.range(-0.025, 0.025));
      text(c, line, 0, 0, w * 0.84, h * 0.1, PAL.paper, { font: HAND, weight: '600' });
      c.restore();
    });
    c.globalAlpha = 0.13;
    c.fillStyle = col(PAL.paper);
    c.fillRect(0, h * r.range(0.3, 0.7), w, h * 0.09);
    c.globalAlpha = 1;
  });
}

/** A device alone on a coloured field — for a banner, a shield, a shutter.
 *  No type at all: this is the sign for somebody who cannot read one. */
export function deviceTexture({ device, bg = PAL.paper, ink = PAL.ink, wm = 1, hm = 1, seed = 'device', border = false }) {
  const [w, h] = canvasFor(wm, hm, 512);
  return cached(keyOf(['thdevice', device, bg, ink, w, h, seed, border]), w, h, (c) => {
    c.fillStyle = col(bg);
    c.fillRect(0, 0, w, h);
    if (border) {
      c.strokeStyle = col(ink);
      c.lineWidth = Math.max(2, Math.min(w, h) * 0.035);
      c.globalAlpha = 0.6;
      c.strokeRect(w * 0.06, h * 0.06, w * 0.88, h * 0.88);
      c.globalAlpha = 1;
    }
    const draw = DEVICES[device];
    if (draw) draw(c, w / 2, h * 0.5, Math.min(w, h) * 0.72, ink);
  });
}

/* ---- meshes -------------------------------------------------------------
 * Every printed surface is a PlaneGeometry (which faces +z) carrying the
 * map, held a few millimetres proud of whatever it is printed on. Two
 * coplanar sheets are a coin toss, and a plate written behind its own frame
 * is invisible — so the order outward is always: board, print, frame.
 */

const printMat = (map) => cel(0xffffff, { map, bands: 'soft3' });

/** A printed plane facing +z, `w` x `h` metres, centred on its origin. */
export function printedPlane(map, w, h) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), printMat(map));
  mesh.receiveShadow = true;
  return mesh;
}

/** A device printed on a plate, both faces if `double`. Used by the banner
 *  poles and by anything that wants a charge without a name. */
export function devicePlate({ device, w = 0.8, h = 0.8, bg = PAL.paper, ink = PAL.ink, seed = 'dev', double = false, border = false }) {
  const map = deviceTexture({ device, bg, ink, wm: w, hm: h, seed, border });
  const g = new THREE.Group();
  for (const s of double ? [1, -1] : [1]) {
    const face = printedPlane(map, w, h);
    face.position.z = s * 0.004;
    if (s < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  g.userData = { kind: 'device-plate', prop: true, airborne: true, w, h, device };
  return g;
}

/**
 * A TRADE FASCIA BOARD mounted on a wall. ORIGIN ON THE WALL FACE,
 * projecting +Z; the board's centre is at the origin's height. Pass metres.
 */
export function fasciaBoard({ tenant: t, title, sub, device, w = 3.2, h = 0.5, bg, ink, depth = 0.09, seed = 'fascia', corbels = true }) {
  const T = tenant(t);
  const g = new THREE.Group();
  const P = parts();
  const bgc = bg ?? T?.bg ?? PAL.oakDark;
  const inkc = ink ?? T?.ink ?? JOINERY.bone;
  P.add(painted(bgc), bx(w, h, depth, 0, 0, depth / 2));
  if (corbels) {
    // a fascia is carried on brackets at its ends; without them it is a
    // sticker, and the shadow under it is what seats it on the building
    for (const s of [-1, 1]) P.add(M.oakDark, bx(0.1, h * 1.26, depth * 1.5, s * (w / 2 - 0.05), 0, depth * 0.75));
    P.add(M.oakDark, bx(w + 0.12, 0.07, depth * 1.7, 0, h / 2 + 0.035, depth * 0.85));
  }
  P.flush(g, { receive: false });
  const print = printedPlane(fasciaTexture({
    title: title ?? T?.title ?? '', sub: sub ?? T?.sub ?? '', device: device ?? T?.device ?? null,
    bg: bgc, ink: inkc, wm: w * 0.95, hm: h * 0.86, seed,
  }), w * 0.95, h * 0.86);
  print.position.z = depth + 0.006;
  g.add(print);
  g.userData = { kind: 'fascia', prop: true, airborne: true, w, h, depth };
  return g;
}

/**
 * AN INN'S HANGING BOARD on a wrought bracket. Origin on the wall face; the
 * bracket reaches +Z and the plate faces +/-X — i.e. ALONG the street,
 * which is where it is read from.
 *
 * THE ARM MUST SPAN THE BOARD. The plate hangs ACROSS the bracket's reach,
 * so an arm shorter than the board leaves the outboard hanger attached to
 * nothing: a sign held up by one strap and a stick of air. The arm is
 * derived from the board, never the other way round.
 *
 * Pass `ctx` and it registers a slow sway.
 */
export function hangingSign({
  tenant: t, title, sub, device, w = 1.15, h = 0.9, bg, ink, seed = 'hang',
  standoff = 0.24, ctx, sway = 0.05, scroll = true,
}) {
  const T = tenant(t);
  const g = new THREE.Group();
  const P = parts();
  const bgc = bg ?? T?.bg ?? JOINERY.plumWash;
  const inkc = ink ?? T?.ink ?? JOINERY.bone;
  const armLen = standoff + w + 0.16;
  const midZ = standoff + w / 2 + 0.08;
  P.add(M.iron, bx(0.07, 0.07, armLen, 0, 0, armLen / 2));
  P.add(M.iron, bx(0.055, 0.55, 0.055, 0, -0.26, 0.05));
  const stayRun = armLen * 0.62;
  const stayRise = 0.5;
  P.add(M.iron, bx(0.05, 0.05, Math.hypot(stayRun, stayRise), 0, -stayRise / 2, stayRun / 2,
    { rx: Math.atan2(stayRise, stayRun) }));
  P.add(M.iron, bx(0.18, 0.18, 0.07, 0, 0.02, 0.035));
  if (scroll) {
    // the wrought scroll under the arm: what makes a bracket read as forged
    for (const f of [0.32, 0.58]) {
      P.add(M.iron, tubeGeo([0, -0.02, armLen * f], [0, -0.26, armLen * (f - 0.2)], 0.022, 5));
    }
  }
  P.flush(g, { receive: false });

  const pivot = new THREE.Group();
  pivot.position.set(0, -0.055, midZ);
  g.add(pivot);
  const H = parts();
  for (const s of [-1, 1]) H.add(M.iron, bx(0.035, 0.22, 0.035, 0, -0.11, s * (w / 2 - 0.1)));
  H.add(painted(bgc), bx(0.055, h, w, 0, -0.22 - h / 2, 0));
  H.add(M.oakDark, bx(0.075, 0.05, w + 0.07, 0, -0.22 - h - 0.02, 0), bx(0.075, 0.05, w + 0.07, 0, -0.2, 0));
  H.flush(pivot, { receive: false });

  const map = boardTexture({
    title: title ?? T?.title ?? '', sub: sub ?? T?.sub ?? '', device: device ?? T?.device ?? null,
    bg: bgc, ink: inkc, wm: w * 0.9, hm: h * 0.82, seed,
  });
  for (const s of [-1, 1]) {
    const face = printedPlane(map, w * 0.9, h * 0.82);
    face.position.set(s * 0.033, -0.22 - h / 2, 0);
    face.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    pivot.add(face);
  }
  if (ctx && sway) {
    let t0 = rng(seed).range(0, 6);
    ctx.update((dt) => {
      t0 += dt;
      pivot.rotation.x = Math.sin(t0 * 0.85) * sway * (0.6 + 0.4 * Math.sin(t0 * 0.29));
    });
  }
  g.userData = { kind: 'hanging-sign', prop: true, airborne: true, w, h, armLen, pivot };
  return g;
}

/** A pinned paper notice on a wall. Origin on the wall face, +Z. A sheet of
 *  paper would z-fight the wall, so it gets a thin backing board and the
 *  print rides 4 mm proud of that. */
export function wallNotice({ notice, head, lines, device, hand, w = 0.32, h = 0.44, seed = 'notice', tilt = 0 }) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, h + 0.02, 0.012), M.paper);
  back.position.z = 0.006;
  back.castShadow = true;
  g.add(back);
  const print = printedPlane(noticeTexture({ notice, head, lines, device, hand, wm: w, hm: h, seed }), w, h);
  print.position.z = 0.016;
  g.add(print);
  g.rotation.z = tilt;
  g.userData = { kind: 'notice', prop: true, airborne: true, w, h };
  return g;
}

/** A chalked board on a wall — the mill's prices, the baker's list. Origin
 *  on the wall face, +Z, with a real frame: a chalked panel with no frame
 *  reads as a stain. */
export function chalkedBoard({ lines = [], head = null, w = 0.8, h = 0.62, seed = 'chalk', frame = true, bg = 0x4a4557 }) {
  const g = new THREE.Group();
  const P = parts();
  P.add(painted(bg), bx(w, h, 0.03, 0, 0, 0.015));
  if (frame) {
    for (const s of [-1, 1]) {
      P.add(M.oakDark, bx(0.05, h + 0.1, 0.045, s * (w / 2 + 0.025), 0, 0.022));
      P.add(M.oakDark, bx(w + 0.1, 0.05, 0.045, 0, s * (h / 2 + 0.025), 0.022));
    }
  }
  P.flush(g, { receive: false });
  const print = printedPlane(chalkTexture({ lines, head, wm: w * 0.94, hm: h * 0.9, seed, bg }), w * 0.94, h * 0.9);
  print.position.z = 0.034;
  g.add(print);
  g.userData = { kind: 'chalked-board', prop: true, airborne: true, w, h };
  return g;
}

/** A free-standing notice board on two posts with a shingled hood and up to
 *  four sheets pinned on. ORIGIN ON THE GROUND at the board's centre, so it
 *  seats with `seatOnGround`; the face looks +Z. */
export function noticeBoardStand({ notices = ['fair', 'programme'], w = 1.5, h = 1.0, postH = 1.05, seed = 'board', accent = null }) {
  const g = new THREE.Group();
  const P = parts();
  const midY = postH + h / 2;
  for (const s of [-1, 1]) P.add(M.oakDark, bx(0.1, postH + h, 0.11, s * (w / 2 - 0.06), (postH + h) / 2, 0));
  P.add(accent ? painted(accent) : M.oakSilver, bx(w, h, 0.07, 0, midY, 0.02));
  P.add(M.shingleDark, bx(w + 0.16, 0.07, 0.26, 0, midY + h / 2 + 0.07, 0.07, { rx: -0.26 }));
  P.flush(g);

  const r = rng(seed);
  const list = notices.slice(0, 4);
  const cols = list.length > 2 ? 2 : list.length;
  const rows = Math.ceil(list.length / cols);
  const sw = Math.min(0.44, (w - 0.16) / cols - 0.06);
  const sh = Math.min(0.58, (h - 0.14) / rows - 0.05);
  list.forEach((n, i) => {
    const cx = (i % cols) - (cols - 1) / 2;
    const cy = (rows - 1) / 2 - Math.floor(i / cols);
    const sheet = wallNotice({ notice: n, w: sw, h: sh, seed: `${seed}-${n}`, tilt: r.range(-0.035, 0.035) });
    sheet.position.set(cx * (sw + 0.08), midY + cy * (sh + 0.07), 0.056);
    g.add(sheet);
  });
  return tagProp(g, 'notice-board', { w, h: postH + h, footprint: { x0: -w / 2 - 0.08, z0: -0.16, x1: w / 2 + 0.08, z1: 0.16 } });
}

/**
 * A FINGERPOST: a post with one or two pointing arms. The village's only
 * wayfinding, and it is what a lane end has instead of a street sign.
 * Origin on the ground; `arms` is `[{ text, dir }]` with `dir` in radians
 * (0 points +Z), and the plate is printed on BOTH faces of each arm.
 */
export function fingerpost({ arms = [], postH = 2.1, w = 1.0, h = 0.22, seed = 'finger', bg = PAL.paper, ink = PAL.ink, cap = true }) {
  const g = new THREE.Group();
  const P = parts();
  P.add(M.granite, cyl(0.19, 0.16, 0.22, 0, 0.11, 0, { seg: 8 }));
  P.add(M.oakSilver, cyl(0.075, 0.09, postH, 0, postH / 2, 0, { seg: 8 }));
  if (cap) P.add(M.oakDark, cyl(0.115, 0.02, 0.16, 0, postH + 0.08, 0, { seg: 8 }));
  const plateD = 0.13;
  arms.forEach((arm, i) => {
    const y = postH - 0.26 - i * (h + 0.13);
    const dir = arm.dir ?? 0;
    // the arm points AWAY from the post: its plate is offset along its own
    // direction, which is why the pointer end is a real triangle out there
    const nx = Math.sin(dir);
    const nz = Math.cos(dir);
    const cx = nx * (w / 2 + 0.05);
    const cz = nz * (w / 2 + 0.05);
    P.add(painted(bg), bx(w, h, plateD, cx, y, cz, { ry: dir }));
    P.add(painted(bg), bx(h * 0.72, h * 0.72, plateD, nx * (w + 0.05), y, nz * (w + 0.05), { ry: dir, rz: Math.PI / 4 }));
    const map = boardTexture({ title: arm.text, sub: arm.sub ?? '', bg, ink, wm: w * 0.86, hm: h * 0.8, seed: `${seed}-${i}`, keyline: false });
    for (const s of [1, -1]) {
      const face = printedPlane(map, w * 0.86, h * 0.8);
      face.position.set(cx + nz * s * (plateD / 2 + 0.004), y, cz - nx * s * (plateD / 2 + 0.004));
      face.rotation.y = dir + (s > 0 ? 0 : Math.PI);
      g.add(face);
    }
  });
  P.flush(g);
  return tagProp(g, 'fingerpost', { postH, footprint: { x0: -0.2, z0: -0.2, x1: 0.2, z1: 0.2 } });
}

/** A small plate on a single post — a toll board, a lane name. */
export function platePost({ tenant: t, title, sub, device, w = 0.9, h = 0.3, postH = 1.5, seed = 'plate', double = false, bg, ink, accent = null }) {
  const T = tenant(t);
  const g = new THREE.Group();
  const P = parts();
  const bgc = bg ?? T?.bg ?? PAL.paper;
  const inkc = ink ?? T?.ink ?? PAL.ink;
  // THE PLATE MUST BE THICKER THAN THE POST IT IS BOLTED TO. A 0.055 m plate
  // centred on a 0.07 m post puts the post THROUGH the printed face, and
  // what you get is a sign with a stripe out of the middle of every word.
  const plateD = 0.13;
  const plateY = postH - h * 0.62;
  P.add(M.oakSilver, bx(0.075, postH, 0.075, 0, postH / 2, 0));
  P.add(painted(bgc), bx(w, h, plateD, 0, plateY, 0));
  if (accent) P.add(painted(accent), bx(w, 0.035, plateD + 0.01, 0, plateY - h / 2 - 0.02, 0));
  P.flush(g);
  const map = boardTexture({ title: title ?? T?.title ?? '', sub: sub ?? T?.sub ?? '', device: device ?? T?.device ?? null, bg: bgc, ink: inkc, wm: w * 0.92, hm: h * 0.8, seed });
  for (const s of double ? [1, -1] : [1]) {
    const face = printedPlane(map, w * 0.92, h * 0.8);
    face.position.set(0, plateY, s * (plateD / 2 + 0.004));
    if (s < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  return tagProp(g, 'plate-post', { w, h: postH, footprint: { x0: -0.14, z0: -0.14, x1: 0.14, z1: 0.14 } });
}

/** A name painted straight onto a wall. Origin on the wall face, +Z. */
export function paintedName({ title, w = 3, h = 0.6, ink = PAL.ink, bg = PAL.limewash, seed = 'painted', font }) {
  const print = printedPlane(paintedTexture({ title, ink, bg, wm: w, hm: h, seed, font }), w, h);
  print.position.z = 0.008;
  const g = new THREE.Group();
  g.add(print);
  g.userData = { kind: 'painted-name', prop: true, airborne: true, w, h };
  return g;
}

/** Everything above, on one object, for `import { signKit } from '../kit'`. */
export const signKit = {
  TENANTS, NOTICES, DEVICES, tenant, canvasFor,
  boardTexture, fasciaTexture, noticeTexture, paintedTexture, chalkTexture, deviceTexture,
  printedPlane, devicePlate, fasciaBoard, hangingSign, wallNotice, chalkedBoard,
  noticeBoardStand, fingerpost, platePost, paintedName,
};
