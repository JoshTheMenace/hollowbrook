import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import {
  M, SINK, ASPECT, rng, bx, cyl, member, addMesh, printed, board, practical,
  yagura, matsuriStall, lanternString, stoneLantern, postRack,
  warningNotice, festivalNobori,
} from '../kit/index.js';

/* ------------------------------------------------------------------ *
 * 宵祭広場 — the festival ground.
 *
 * The town's one flat open field, ringed by apparatus that never quite
 * comes down: the drum tower on the west rim, the stall row along the
 * south-east, five lantern strings on their own masts, and a rope line
 * with a painted band on the sand.  The middle is EMPTY on purpose.
 *
 * THE ARENA CONTRACT (city-plan.json, non-negotiable): x 29..53,
 * z -3..15 is the game's night-combat arena and carries no collider and
 * nothing standing.  It is enforced here at registration — `collide()`
 * below THROWS rather than let a stall creep in — because the rule is
 * about what this district builds, not about what a gate happens to
 * sample.  Ground-flat dressing under 0.05 m (the painted band, the
 * broom-swept arcs, the worn ground) is the only thing allowed inside
 * it, and it is what makes the emptiness read as KEPT rather than
 * unbuilt: a swept field with a painted line round it is maintained.
 *
 * Two sight corridors cross this parcel and both are somebody else's
 * promise: `street-spine` (x -30..22, clear at 4.5 m) is why the entry
 * poles stand at x 23.4 rather than at the road socket — inside it a
 * 5.4 m pole would break the town's one long look at the tower — and
 * `field-to-torii` (clear at 6 m) is why the north lantern string starts
 * at x 36, east of the diagonal the shrine's torii reads along.
 * ------------------------------------------------------------------ */

/** The combat arena. Nothing of ours stands in it, and nothing collides. */
const ARENA = { x0: 29, z0: -3, x1: 53, z1: 15 };
/** The rope line stands this far outside it, so the edge is legible. */
const KEEP = 0.75;

const hitsArena = (x0, z0, x1, z1) =>
  Math.max(x0, x1) > ARENA.x0 && Math.min(x0, x1) < ARENA.x1 &&
  Math.max(z0, z1) > ARENA.z0 && Math.min(z0, z1) < ARENA.z1;

/**
 * A run of rope between low posts along one arena edge.  It registers NO
 * collider on purpose — the arena has to stay walkable, and a rope line
 * is a request, not a fence — and it is gapped where people actually
 * cross, which is what stops it reading as a pen.
 */
function ropeRun(a, b, gap, out, r) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / 3.2));
  let prev = null;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    if (t > gap[0] && t < gap[1]) { prev = null; continue; }
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    const h = 0.88 + r.range(-0.05, 0.05);
    out.posts.push(cyl(0.055, 0.075, h + SINK, 6, x, (h - SINK) / 2, z));
    out.posts.push(cyl(0.085, 0.085, 0.055, 6, x, h, z));
    if (prev) {
      const mx = (prev[0] + x) / 2;
      const mz = (prev[1] + z) / 2;
      const my = (prev[2] + h) / 2 - 0.3;
      out.rope.push(member([prev[0], prev[2] - 0.1, prev[1]], [mx, my, mz], 0.022, 4));
      out.rope.push(member([mx, my, mz], [x, h - 0.1, z], 0.022, 4));
      if (r.chance(0.4)) out.tags.push(bx(0.11, 0.24, 0.012, mx, my - 0.14, mz, { ry: r.range(-0.6, 0.6) }));
    }
    prev = [x, z, h];
  }
}

export default defineDistrict({
  id: 'festival-ground',
  envelope: { x0: 18, z0: -14, x1: 65, z1: 26 },
  build(ctx) {
    const r = rng(1904);
    const at = (x, z) => ctx.groundAt(x, z);

    /** ctx.collide, with the arena contract enforced where it is made. */
    const collide = (x0, z0, x1, z1, what) => {
      if (hitsArena(x0, z0, x1, z1)) {
        throw new Error(
          `festival-ground: "${what}" registers a collider x ${x0.toFixed(2)}..${x1.toFixed(2)}, ` +
          `z ${z0.toFixed(2)}..${z1.toFixed(2)}, which intrudes on the night-combat arena ` +
          `(x ${ARENA.x0}..${ARENA.x1}, z ${ARENA.z0}..${ARENA.z1}). The field stays clear.`);
      }
      ctx.collide(x0, z0, x1, z1);
    };

    /** Build a kit prop, seat it on the ground, register its own footprint. */
    const place = (kit, opts, x, z, what) => {
      const g = kit(opts);
      g.position.set(x, at(x, z), z);
      for (const f of kit.footprint(opts)) collide(x + f.x0, z + f.z0, x + f.x1, z + f.z1, what);
      return g;
    };

    /* ---- 1. the yagura, on the west rim ----------------------------
     * At (26.5, 2.6) rather than the massing's (27, 6): the tower's own
     * footprint is 4.1 m square, so centred on the waypoint it would
     * both swallow the ground the player has to stand on to look up at
     * the drum and push its roof over the arena's x = 29 line.  Yawed a
     * quarter turn: nobori and drum face the field, ladder and clutter
     * face the arriving road. */
    const towerOpts = { seed: 7, ry: Math.PI / 2 };
    const tower = place(yagura, towerOpts, 25.8, 2.6, 'yagura');
    ctx.add(tower, 'yagura');

    /* ---- 2. the stall row, south-east ------------------------------
     * Five stalls facing the field, mostly shut — the festival is over
     * and was never taken down — with the alley at x 44 left open, both
     * because the plan's "stall row" standing point is there and because
     * an unbroken row of five reads as wallpaper. */
    const STALLS = [
      { x: 36.2, shut: false, seed: 11, goods: 0 },
      { x: 40.0, shut: true, seed: 12, goods: 3 },
      { x: 47.6, shut: false, seed: 13, goods: 2 },
      { x: 51.4, shut: true, seed: 14, goods: 4 },
      { x: 55.2, shut: true, seed: 15, goods: 1 },
    ];
    const row = [];
    for (const s of STALLS) {
      const z = 20.4 + r.range(-0.25, 0.25);
      const opts = { seed: s.seed, goods: s.goods, shut: s.shut, ry: Math.PI + r.range(-0.05, 0.05) };
      const g = place(matsuriStall, opts, s.x, z, `stall-${s.x}`);
      ctx.add(g, `stall-${s.x}`);
      row.push({ ...s, z });
      if (!s.shut) {
        const it = g.userData.interact;
        ctx.interact({ name: `look-stall-${s.x}`, label: it.label, hitbox: it.hitbox, action: () => {} });
      }
    }

    /* ---- 3. the lantern ring ---------------------------------------
     * Five strings on their own masts, every one outside the arena, so
     * the field is enclosed by light and still empty.  The north string
     * starts at x 36: west of that it would hang across the shrine's
     * `field-to-torii` diagonal. */
    const RINGS = [
      { x: 43, z: -5.2, span: 14, ry: 0, seed: 3 },
      { x: 55.6, z: 5, span: 12, ry: Math.PI / 2, seed: 4 },
      { x: 40, z: 17.2, span: 12, ry: 0, seed: 5 },
      { x: 27.2, z: 10, span: 6, ry: Math.PI / 2, seed: 6 },
      { x: 27.2, z: -5.2, span: 6, ry: Math.PI / 2, seed: 8 },
    ];
    const strings = RINGS.map((s) => {
      const opts = { seed: s.seed, span: s.span, ry: s.ry };
      const g = place(lanternString, opts, s.x, s.z, `lantern-string-${s.seed}`);
      ctx.add(g, `lantern-string-${s.seed}`);
      return g;
    });

    /* The re-papered string: two lanterns on the west run went up this
     * month and are still white among the aged ones.  Their own
     * practicals, a shade cooler, so the difference survives to night. */
    const west = strings[3];
    const yAt = (t) => 3.9 - 0.85 * (1 - (2 * t - 1) ** 2);
    for (const t of [0.3, 0.7]) {
      const lx = -3 + 6 * t;
      const ly = yAt(t) - 0.1;
      const shade = addMesh(west, [cyl(0.185, 0.185, 0.39, 10, lx, ly - 0.195, 0)], M.paper,
        { cast: false, receive: false, name: 'fresh-lantern' });
      practical(shade, { radius: 5, color: 0xfff0d8 });
      addMesh(west, [
        cyl(0.14, 0.14, 0.05, 10, lx, ly + 0.015, 0),
        cyl(0.14, 0.14, 0.05, 10, lx, ly - 0.41, 0),
        cyl(0.02, 0.02, 0.12, 6, lx, ly + 0.1, 0),
      ], M.cedarDark, { cast: false });
    }

    /* ---- 4. the rope line ------------------------------------------
     * Posts 0.75 m outside the arena on three sides; on the west the run
     * stops either side of the tower, because the tower is the barrier
     * there.  Gaps are where the paths land: the hill spur (north), the
     * notice (east), the stall alley (south), the road (west). */
    const ring = { posts: [], rope: [], tags: [] };
    const W = ARENA.x0 - KEEP;
    const E = ARENA.x1 + KEEP;
    const N = ARENA.z0 - KEEP;
    const S = ARENA.z1 + KEEP;
    ropeRun([W, N], [E, N], [0.08, 0.25], ring, r);
    ropeRun([E, N], [E, S], [0.30, 0.48], ring, r);
    ropeRun([E, S], [W, S], [0.36, 0.52], ring, r);
    ropeRun([W, S], [W, N], [0.37, 0.89], ring, r);
    const ropeLine = new THREE.Group();
    addMesh(ropeLine, ring.posts, M.cedarDark, { name: 'rope-posts' });
    addMesh(ropeLine, ring.rope, M.cedarPale, { cast: false, name: 'rope' });
    addMesh(ropeLine, ring.tags, M.paper, { cast: false, name: 'rope-tags' });
    ctx.add(ropeLine, 'rope-line');

    /* ---- 5. ground marks — every one of these is under 50 mm ------- */
    const BY = 0.034;
    const bandY = BY / 2 - 0.012;
    /* The line is laid segment by segment, so it can wear through in
     * places: an unbroken machine-perfect stripe reads as a sports pitch,
     * and this one is lime repainted by hand every year. */
    const band = [];
    const paint = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.ceil(len / 1.15);
      const across = Math.abs(x1 - x0) < Math.abs(z1 - z0);
      for (let i = 0; i < n; i += 1) {
        if (r.chance(0.08)) continue;
        const t = (i + 0.5) / n;
        const w = (len / n) * 0.95;
        const th = 0.15 + r.range(0, 0.05);
        band.push(bx(across ? th : w, BY, across ? w : th,
          x0 + (x1 - x0) * t, bandY, z0 + (z1 - z0) * t));
      }
    };
    paint(ARENA.x0 - 0.1, ARENA.z0, ARENA.x1 + 0.1, ARENA.z0);
    paint(ARENA.x0 - 0.1, ARENA.z1, ARENA.x1 + 0.1, ARENA.z1);
    paint(ARENA.x0, ARENA.z0 - 0.1, ARENA.x0, ARENA.z1 + 0.1);
    paint(ARENA.x1, ARENA.z0 - 0.1, ARENA.x1, ARENA.z1 + 0.1);

    // broom-swept arcs struck from the tower: someone sweeps this field.
    // Strokes overlap along their arc — spaced out they read as paving.
    const sweep = [];
    for (let a = 0; a < 6; a += 1) {
      const R = 11 + a * 3.1 + r.range(-0.5, 0.5);
      const a0 = -0.82 + r.range(-0.12, 0.12);
      const a1 = 0.86 + r.range(-0.12, 0.12);
      const n = Math.ceil((R * (a1 - a0)) / 1.2);
      for (let i = 0; i <= n; i += 1) {
        const th = a0 + ((a1 - a0) * i) / n;
        const x = 26.5 + Math.cos(th) * R;
        const z = 6 + Math.sin(th) * R;
        if (x < ARENA.x0 + 0.6 || x > ARENA.x1 - 0.6 || z < ARENA.z0 + 0.6 || z > ARENA.z1 - 0.6) continue;
        sweep.push(bx(2.2, 0.024, 0.3 + r.range(0, 0.08), x, 0.002, z, { ry: -(th + Math.PI / 2) }));
      }
    }

    // trodden ground where feet actually go: road mouth, stall fronts,
    // the hill path along the north edge and its spur into the field
    const worn = [];
    // the road's hard apron dies out into the sand rather than ending square
    for (let x = 19; x < 30; x += 1.4) {
      const d = 3.3 * (1 - (x - 19) / 12) + r.range(-0.3, 0.3);
      worn.push(bx(1.9, 0.02, d, x, 0, 0.4 + r.range(-0.4, 0.4), { ry: r.range(-0.1, 0.1) }));
    }
    for (let x = 34; x < 57; x += 1.7) worn.push(bx(2.2, 0.02, 2.6 + r.range(-0.4, 0.4), x, 0, 18.3 + r.range(-0.4, 0.4), { ry: r.range(-0.1, 0.1) }));
    for (let x = 20; x < 40; x += 1.7) worn.push(bx(2.2, 0.02, 1.5 + r.range(-0.3, 0.3), x, 0, -13 + r.range(-0.3, 0.3), { ry: r.range(-0.08, 0.08) }));
    for (let z = -13; z < -3; z += 1.5) worn.push(bx(1.8 + r.range(-0.3, 0.3), 0.02, 1.9, 32.2 + r.range(-0.6, 0.6), 0, z, { ry: r.range(-0.1, 0.1) }));
    for (let z = -14.2; z < -12.4; z += 0.8) worn.push(bx(2.4, 0.02, 1.1, 28, 0, z));
    for (let z = 16; z < 20; z += 1.4) worn.push(bx(1.6, 0.02, 1.8, 44 + r.range(-0.5, 0.5), 0, z));

    const marks = new THREE.Group();
    addMesh(marks, band, M.paper, { cast: false, name: 'arena-band' });
    addMesh(marks, sweep, M.plaster, { cast: false, name: 'swept-sand' });
    addMesh(marks, worn, M.stonePale, { cast: false, name: 'worn-ground' });
    ctx.add(marks, 'ground-marks');

    /* ---- 6. the west entry, where the main road arrives ------------- */
    const entry = new THREE.Group();
    const poleH = 5.4;
    const timber = [];
    for (const s of [-1, 1]) {
      const pz = s * 3.7;
      timber.push(cyl(0.075, 0.1, poleH + SINK, 7, 23.4, (poleH - SINK) / 2, pz));
      timber.push(cyl(0.16, 0.2, 0.18, 8, 23.4, 0.09 - SINK, pz));
      timber.push(bx(0.09, 0.08, 0.66, 23.4, poleH - 0.22, pz - s * 0.3));
      const flag = printed(festivalNobori(), 0.5, ASPECT.nobori, { doubleSide: true });
      flag.position.set(23.4, poleH - 0.26 - flag.userData.signH / 2, pz - s * 0.3);
      flag.rotation.y = -Math.PI / 2;
      entry.add(flag);
      collide(23.2, pz - 0.2, 23.6, pz + 0.2, 'entry pole');
    }
    addMesh(entry, timber, M.cedarDark, { name: 'entry-poles' });

    // two bunting swags: this year's, taut; last year's, sagged and gappy
    const amber = [];
    const paper = [];
    const swag = (x, top, sag, n, missing) => {
      const cord = [];
      const yOf = (t) => top - sag * (1 - (2 * t - 1) ** 2);
      for (let i = 0; i < 16; i += 1) {
        const t0 = i / 16;
        const t1 = (i + 1) / 16;
        cord.push(member([x, yOf(t0), -3.7 + 7.4 * t0], [x, yOf(t1), -3.7 + 7.4 * t1], 0.02, 4));
      }
      addMesh(entry, cord, M.joinery, { cast: false, name: 'bunting-cord' });
      for (let i = 0; i < n; i += 1) {
        if (missing.includes(i)) continue;
        const t = (i + 0.5) / n;
        (i % 2 ? amber : paper).push(bx(0.05, 0.34, 7.4 / n - 0.06, x, yOf(t) - 0.19, -3.7 + 7.4 * t));
      }
    };
    swag(23.4, 4.62, 0.62, 13, []);
    swag(24.9, 3.98, 0.78, 11, [2, 7]);
    addMesh(entry, amber, M.amber, { cast: false, name: 'bunting-amber' });
    addMesh(entry, paper, M.paper, { cast: false, name: 'bunting-paper' });
    ctx.add(entry, 'west-entry');

    /* ---- 7. the east rope line: the town's one honest admission ----
     * 夜間立入注意 — after dark the field is closed.  It stands where the
     * rope line is gapped, facing anyone walking out of the field. */
    const notice = new THREE.Group();
    const nry = -Math.PI / 2 + 0.2;
    const ux = Math.cos(nry);
    const uz = -Math.sin(nry);
    board(notice, warningNotice(), 0.92, ASPECT.notice,
      { at: [57.8, 1.62, 7.6], ry: nry, mat: M.cedarPale, back: 0.06 });
    const legs = [];
    for (const s of [-1, 1]) {
      legs.push(cyl(0.06, 0.07, 2.3 + SINK, 6, 57.8 + s * 0.42 * ux, (2.3 - SINK) / 2, 7.6 + s * 0.42 * uz));
    }
    legs.push(bx(1.04, 0.09, 0.09, 57.8, 2.3, 7.6, { ry: nry }));
    addMesh(notice, legs, M.cedarDark, { name: 'notice-legs' });
    collide(57.4, 7.1, 58.2, 8.1, 'warning notice');
    ctx.add(notice, 'east-notice');
    ctx.add(place(stoneLantern, { seed: 21, size: 'small', ry: 0.4 }, 57.3, 4.3, 'east toro'), 'east-toro');

    /* ---- 8. the north edge: the hill path down from the shrine ------ */
    ctx.add(place(stoneLantern, { seed: 22, size: 'small', ry: -0.3 }, 34.6, -12.4, 'path marker'), 'path-marker');
    ctx.add(place(stoneLantern, { seed: 23, size: 'small', ry: 0.8 }, 23.6, -12.6, 'west marker'), 'west-marker');
    const tufts = [];
    for (let i = 0; i < 96; i += 1) {
      const x = r.range(19, 44);
      const lane = r.chance(0.5) ? -14.3 + r.range(-0.4, 0.5) : -11.5 + r.range(-0.5, 0.6);
      if (Math.abs(x - 28) < 1.9 && lane < -13) continue;   // the socket crossing stays bare
      const h = r.range(0.16, 0.34);
      tufts.push(cyl(0, r.range(0.07, 0.12), h + SINK, 4, x, (h - SINK) / 2, lane, { ry: r.range(0, 1.5) }));
    }
    for (let i = 0; i < 44; i += 1) {                        // the dry verge along the east rim
      const x = r.range(56, 64);
      const z = r.range(-11, 24);
      const h = r.range(0.16, 0.32);
      tufts.push(cyl(0, r.range(0.07, 0.12), h + SINK, 4, x, (h - SINK) / 2, z, { ry: r.range(0, 1.5) }));
    }
    const verge = new THREE.Group();
    addMesh(verge, tufts, M.moss, { cast: false, name: 'verge-grass' });
    ctx.add(verge, 'north-verge');

    /* ---- 9. use evidence ------------------------------------------
     * Rope coils at the foot of the tower's ladder, board stacks behind
     * the shut stalls, a crate of fresh lantern paper and the broom
     * under the string whose lanterns are new.  All of it clusters where
     * the work happens; none of it stands in the field. */
    const kit = new THREE.Group();
    const coils = [];
    for (const [cx, cz, s] of [[23.2, 3.6, 1], [23.7, 1.35, 0.86], [22.8, 2.4, 0.74]]) {
      const y = at(cx, cz);
      coils.push(cyl(0.3 * s, 0.32 * s, 0.1, 8, cx, y + 0.05, cz));
      coils.push(cyl(0.19 * s, 0.2 * s, 0.09, 8, cx, y + 0.14, cz));
      coils.push(member([cx, y + 0.04, cz], [cx + r.range(-0.6, 0.6), y + 0.04, cz + r.range(-0.6, 0.6)], 0.035, 4));
    }
    addMesh(kit, coils, M.cedarPale, { name: 'rope-coils' });

    const boards = [];
    for (const s of row.filter((e) => e.shut)) {
      const bz = s.z + 2.3;
      for (let i = 0, n = r.int(3, 5); i < n; i += 1) {
        boards.push(bx(1.9 + r.range(-0.3, 0.3), 0.07, 0.42, s.x + r.range(-0.4, 0.4), 0.05 + i * 0.075, bz + r.range(-0.15, 0.15), { ry: r.range(-0.12, 0.12) }));
      }
      // one board propped against the stall's own back, foot on the sand:
      // the geometry is derived so its top lands ON the back boards
      boards.push(bx(1.9, 0.06, 0.4, s.x + r.range(-0.6, 0.6), 0.85, s.z + 1.38, { rz: 1.1, ry: Math.PI / 2 + r.range(-0.12, 0.12) }));
    }
    addMesh(kit, boards, M.cedarDark, { name: 'stall-boards' });

    const crate = [
      bx(0.86, 0.44, 0.6, 27.9, 0.22 - SINK, 12.6, { ry: 0.24 }),
      bx(0.9, 0.06, 0.64, 27.9, 0.45, 12.6, { ry: 0.24 }),
      member([27.35, 0.02, 13.1], [27.26, 1.55, 13.34], 0.035, 5),      // the broom
    ];
    const shades = [];
    for (let i = 0; i < 4; i += 1) {
      shades.push(cyl(0.15, 0.15, 0.3, 8, 27.66 + r.range(-0.16, 0.44), 0.63 + (i % 2) * 0.31, 12.5 + r.range(-0.18, 0.18)));
    }
    addMesh(kit, crate, M.cedarPale, { name: 'paper-crate' });
    addMesh(kit, [bx(0.42, 0.1, 0.17, 27.35, 0.06, 13.08, { ry: 0.2 })], M.cedarDark, { cast: false, name: 'broom-head' });
    addMesh(kit, shades, M.paper, { name: 'fresh-shades' });
    ctx.add(kit, 'festival-kit');

    // parked beside the canal path's mouth, north of it: the socket's own
    // 3 m corridor has to stay walkable end to end
    ctx.add(place(postRack, { seed: 6, slots: 4, len: 2.4, bikes: 3, ry: 0.3 }, 22.8, 17.3, 'post rack'), 'post-rack');

    /* ---- 10. strike the drum ---------------------------------------
     * The kit hands over the drum BODY as the hitbox (the runtime
     * raycasts hitboxes non-recursively, so the Group would never be
     * hit) and the drum GROUP as the part to react.  The nearest lantern
     * string answers the blow — the field's one moment of noise. */
    const drum = tower.userData.parts.drum;
    let hit = 0;
    let t = 0;
    ctx.interact({
      name: 'strike the yagura drum',
      label: tower.userData.interact.label,
      hitbox: tower.userData.interact.hitbox,
      action: () => { hit = 1; t = 0; },
    });
    ctx.update((dt) => {
      if (hit <= 0) return;
      t += dt;
      hit = Math.max(0, hit - dt * 0.9);
      const k = hit * hit;
      drum.scale.setScalar(1 + 0.13 * k * Math.sin(t * 21));
      west.rotation.z = 0.035 * k * Math.sin(t * 5.2);
    });
    ctx.reset(() => { hit = 0; drum.scale.setScalar(1); west.rotation.z = 0; });
  },
});
