import * as THREE from 'three';
import { PAL, ACCENT } from './palette.js';
import { flat } from './materials.js';
import { M } from './kit/mats.js';
import { cached } from './core/texkit.js';
import { rng, bx, parts } from './kit/util.js';
import { colliderBlocks } from './builders.js';

/* ==================================================================== *
 * THE POLISH PASS — Hollowbrook.
 *
 * Read `.codex/skills/build-stylized-threejs-scene/references/polish-pass.md`
 * first: six A/B-tested mechanisms, each behind a toggle, each kept only
 * because a pair of frozen frames says it visibly helps.  This file is that
 * layer for a siege at dusk, plus two audits the town needed and the
 * reference list does not have.
 *
 * IT IS ADDITIVE AND DISCRETIONARY.  `?polish=off` gives a reviewer the
 * honest blockout underneath; `?polish=ash,haze` gives one mechanism at a
 * time, which is how the per-mechanism draw-call delta in
 * `final-evidence/polish/README.md` was measured.  Nothing here registers a
 * collider, a platform or an interactable — the town's routes, gates and
 * nav grid are exactly the same with the layer on and off, and that is a
 * contract, not a coincidence.
 *
 * WHAT IS MEASURED RATHER THAN REMEMBERED, and it mattered every time:
 *   - the camp fires are found by traversing for `userData.kind ===
 *     'camp-fire'`.  The brief said "outside both gates"; the town has
 *     THREE and all three are at the south gate, two of them lit.  A
 *     remembered list would have hung two smoke columns over an east gate
 *     that has no fire under it.
 *   - the ground wear is laid along the plan's OWN approach polylines (the
 *     lines the waves actually walk) and every station is dropped if a
 *     district has already worn that ground — southgate, marketlow and
 *     keephill each lay their own, and a second layer on top of theirs is
 *     z-fighting, not polish.
 *   - the surface maps are AUDITED, not attached: `window.__polish
 *     .surfaces({ measure: true })` renders a material-ID pass at every
 *     vista and reports each material's share of the frame.  The rule from
 *     the reference is "attach the missing ones only if a material that
 *     covers >2 % of a vista frame has none", and that is a measurement,
 *     not a guess.
 *
 * THE ONE MECHANISM THAT CAN MAKE THE PICTURE WORSE is the haze (p4), and
 * it is the reason `setHaze` exists as a runtime switch rather than a build
 * flag: `checkAllVistas({ polish: __polish.setHaze })` measures every vista
 * BOTH ways and any loss of a declared subject's silhouette separation is a
 * defect in THIS file.  A vista is a promise; this layer is discretionary.
 * ==================================================================== */

/**
 * THE POLISHED AERIAL-PERSPECTIVE RANGE, and it is 45..460 rather than the
 * 40..190 the scaffolding in main.js was written around, because 40..190
 * was MEASURED and it broke a promise.
 *
 * `from-the-road` stands 94 m off its declared subject — keephill's bell
 * tower, against open sky — and that is the most fog-sensitive thing in the
 * town.  A sweep of eight ranges through `checkAllVistas`, silhouette
 * separation against sky, floor 40:
 *
 *     92.4..330  (the plan's own)   48.45     the baseline
 *     60 ..400                      46.35     -2.10
 *     45 ..460                      46.2      -2.2     <- this
 *     40 ..340                      42.29     -6.16
 *     36 ..280                      37.87     FAILS THE FLOOR
 *     32 ..240                      32.26     FAILS
 *     40 ..190  (the scaffold's)    24.35     FAILS — a cream ghost
 *     26 ..100  (the starter's)     15.61     FAILS, and takes from-the-keep
 *                                             to 1.09 with it
 *
 * The town is only 132 m across and its most distant promise is at 94 m, so
 * there is no linear-fog range that is strong at conversational distance
 * AND cheap on that tower: below about 40 m of near the vista goes.  What
 * is left is honest and modest — nothing under 45 m is touched at all, and
 * the far half of a vista picks up 10-13 %.
 *
 * `setHaze(false)` puts the plan's own `fogRange` back, which is what lets
 * `checkAllVistas({ polish: __polish.setHaze })` measure a vista unhazed.
 */
export const POLISH_FOG = Object.freeze({ near: 45, far: 460 });

export const MECHANISMS = Object.freeze(['surfaces', 'sky', 'ash', 'haze', 'lanes', 'accents', 'practicals']);

/* WIND.  The Company's fires stand at z 58..62, south of a wall at z 50,
 * and the town is everything north of it — so for their smoke and their ash
 * to be over the town at all the wind has to blow NORTH, which with
 * `compass.north_xz = [0, -1]` is -z.  The westward component is the sun's
 * own quarter (bearing 268) and is what keeps a smoke column from standing
 * exactly on the gate axis in the `from-the-keep` vista. */
const WIND = new THREE.Vector2(-0.29, -0.957).normalize();

/* ---- the toggle ---------------------------------------------------- */
function wanted(search) {
  const raw = new URLSearchParams(search ?? '').get('polish');
  if (raw === null || raw === '' || raw === 'on' || raw === '1') return new Set(MECHANISMS);
  if (raw === 'off' || raw === '0' || raw === 'none') return new Set();
  const asked = raw.split(/[,+ ]+/).filter(Boolean);
  const set = new Set(asked.filter((m) => MECHANISMS.includes(m)));
  const unknown = asked.filter((m) => !MECHANISMS.includes(m));
  if (unknown.length) console.warn(`[polish] unknown mechanism(s) ${unknown.join(', ')} — known: ${MECHANISMS.join(', ')}`);
  return set;
}

/* ---- textures ------------------------------------------------------ *
 * Two soft alpha maps, drawn once.  Both are LOW CONTRAST on purpose: a
 * cloud that reads as a bright shape is a cloud standing between a vista's
 * declared subject and the sky it separates against.
 */

/**
 * A cel cloud: seven soft lobes along a shallow arc, and NOTHING WITH A
 * STRAIGHT EDGE IN IT.
 *
 * The first cut ended with a "soft base wash" — a `fillRect` under a
 * LINEAR gradient, which fades vertically and is a hard cut at both ends of
 * the x it was filled over.  On a 40 m billboard in the sky that is a pale
 * RECTANGLE, and the A/B frames came back with four of them hanging over
 * the town, which is the single most artificial thing a sky can have in it.
 * Everything here is a radial falloff now; nothing is a rect.
 */
function cloudTex() {
  return cached('polish-cloud', 256, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const r = rng('polish-cloud');
    const lobe = (x, y, rx, ry, a) => {
      const g = c.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
      g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,255,255,${(a * 0.5).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.save();
      c.translate(x, y);
      c.scale(1, ry / rx);
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, rx, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    // the body: a low arc of lobes, biggest in the middle
    for (let i = 0; i < 7; i += 1) {
      const t = i / 6;
      const swell = Math.sin(t * Math.PI);
      lobe(w * (0.16 + t * 0.68), h * (0.60 - swell * 0.17 + r.range(-0.03, 0.03)),
        w * (0.09 + swell * 0.08) * r.range(0.85, 1.15),
        h * (0.20 + swell * 0.16) * r.range(0.85, 1.15),
        0.34 + swell * 0.34);
    }
    // the underside: three very wide, very flat lobes that carry the base
    // line without ever meeting an edge of the canvas
    for (let i = 0; i < 3; i += 1) {
      const t = (i + 0.5) / 3;
      lobe(w * (0.22 + t * 0.56), h * 0.60, w * 0.20, h * 0.13, 0.16);
    }
  }, { srgb: true, aniso: 4 });
}

/** One soft puff — smoke and ash both use it; ash at 0.14 m reads as a
 *  fleck, smoke at 3 m as a roll. */
function puffTex() {
  return cached('polish-puff', 64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }, { srgb: true, aniso: 4 });
}

/* ---- small helpers ------------------------------------------------- */
const PLANE = new THREE.PlaneGeometry(1, 1);

/** Every district id in the plan, and a point-in-envelope test. */
function envelopes(plan) {
  const out = new Map();
  for (const d of plan.districts ?? []) out.set(d.id, d.envelope);
  return out;
}

/** The district that BUILT a mesh: composeCity stamps every added group
 *  `district:<id>:<...>` and every anonymous pooled mesh `<id>:<group>:<n>`,
 *  so walk up until one of those matches a district in the plan. */
function ownerOf(object, ids) {
  for (let o = object; o; o = o.parent) {
    const n = typeof o.name === 'string' ? o.name : '';
    if (!n) continue;
    const parts_ = n.split(':');
    if (parts_[0] === 'district' && ids.has(parts_[1])) return parts_[1];
    if (ids.has(parts_[0])) return parts_[0];
  }
  return null;
}

const materialsOf = (o) => (Array.isArray(o.material) ? o.material : [o.material]).filter(Boolean);

/* ==================================================================== *
 * p2a — THE SKY BAND: cel cloud billboards.
 *
 * The top third of a street frame and a good half of every vista is sky,
 * and an empty gradient there is dead canvas.  ONE InstancedMesh, unlit,
 * `depthWrite: false`, no shadows, no colliders.
 *
 * THEIR TONE IS THE WHOLE RISK.  Six vista cameras look in six directions,
 * so there is no bearing to keep clear — a cloud can end up behind any
 * declared subject.  The legibility gate measures a subject's silhouette
 * against OPEN SKY, so a bright cloud there costs contrast on a promise.
 * These sit within a few luma of `PAL.sky.mid`, which is what a cel cloud
 * at dusk looks like anyway: shape without contrast.
 * ==================================================================== */
function buildClouds(scene, camera, seed = 'polish-sky') {
  const r = rng(seed);
  const N = 14;
  const mat = flat(0xffffff, {
    map: cloudTex(), transparent: true, opacity: 0.46, depthWrite: false, fog: false, cache: false,
  });
  const mesh = new THREE.InstancedMesh(PLANE, mat, N);
  mesh.name = 'polish:sky-clouds';
  mesh.frustumCulled = false;           // one draw call; the test costs more than it saves
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -2;                // behind the ash and the smoke
  mesh.userData.airborne = true;
  // Inside the far plane with room to spare: a cloud clipped by the plane
  // pops as the camera turns, which is worse than no cloud.
  const R0 = Math.min(96, (camera?.far ?? 190) * 0.62);
  const spec = [];
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2 + r.range(-0.16, 0.16);
    const rad = R0 * r.range(0.86, 1.24);
    spec.push({
      a,
      rad,
      y: r.range(24, 52),
      w: r.range(26, 58),
      h: r.range(7.5, 15),
      drift: r.range(0.22, 0.5),
      // two tones only: the violet body and a warmer one for the western
      // clouds, which are the ones with the last of the sun under them
      tone: new THREE.Color(Math.cos(a) * 0 + (r.chance(0.35) ? 0xd6c3c1 : 0xc2b6c6)),
    });
  }
  const col = new THREE.Color();
  spec.forEach((s, i) => { col.copy(s.tone); mesh.setColorAt(i, col); });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  return {
    mesh,
    update(dt, eye) {
      const cx = eye?.x ?? 0;
      const cz = eye?.z ?? 0;
      for (let i = 0; i < N; i += 1) {
        const s = spec[i];
        s.a += (s.drift * dt) / s.rad;   // a slow procession round the town
        const x = cx * 0.35 + Math.sin(s.a) * s.rad;
        const z = cz * 0.35 + Math.cos(s.a) * s.rad;
        pos.set(x, s.y, z);
        // billboard about Y only: a cloud that rolls with the pitch of the
        // camera reads as a card, which is exactly what it is
        e.set(0, Math.atan2(cx - x, cz - z), 0);
        q.setFromEuler(e);
        scl.set(s.w, s.h, 1);
        mesh.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ==================================================================== *
 * p2b — SMOKE COLUMNS off the Company's fires.
 *
 * MEASURED, not remembered: traverse for `userData.kind === 'camp-fire'`
 * and smoke the LIT ones.  The town has three and all three are south of
 * the wall; a doused fire gets no column, because a column with no fire
 * under it is the thing this whole file is supposed to prevent.
 *
 * Slow, tall, thin, leaning downwind.  One InstancedMesh for every column
 * in the town: puffs ride a lean that grows with height (t^1.35 — smoke
 * goes up before it goes sideways), grow as they rise, and fade toward the
 * fog tone rather than toward transparency, because at dusk the top of a
 * column IS the sky's value.
 * ==================================================================== */
function findCampFires(scene) {
  const seen = new Set();
  const out = [];
  scene.traverse((o) => {
    if (o.userData?.kind !== 'camp-fire') return;
    const p = new THREE.Vector3();
    o.getWorldPosition(p);
    const key = `${p.x.toFixed(2)}/${p.z.toFixed(2)}`;   // the kit tags body AND wrapper
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: o.name || 'camp-fire', pos: p, lit: o.userData.lit !== false, fireY: o.userData.fireY ?? 0.5 });
  });
  return out;
}

function buildSmoke(fires) {
  const lit = fires.filter((f) => f.lit);
  if (!lit.length) return null;
  /* 30 puffs and opacity 0.46, NOT 20 and 0.34.  The first cut was sized
   * against a frame taken from the gate square, which faces away from the
   * fires; the column only ever appears in a picture that looks SOUTH, and
   * the nearest of those is `from-the-keep` at 93 m, where the first cut
   * was a barely-visible smear.  A column is either legible from the one
   * camera that can see it or it is not there. */
  const PER = 30;
  const N = lit.length * PER;
  const mat = flat(0xffffff, {
    map: puffTex(), transparent: true, opacity: 0.46, depthWrite: false, fog: true, cache: false,
  });
  const mesh = new THREE.InstancedMesh(PLANE, mat, N);
  mesh.name = 'polish:camp-smoke';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  mesh.userData.airborne = true;

  const r = rng('polish-smoke');
  const HEIGHT = 15.5;
  const LEAN = 11.0;
  const base = new THREE.Color(0x5b5368);        // grey-violet, the fire's own soot
  const top = new THREE.Color(PAL.fog);          // and the sky it dissolves into
  const p = [];
  for (const f of lit) {
    for (let i = 0; i < PER; i += 1) {
      p.push({ f, t: (i + r.range(0, 0.85)) / PER, sp: r.range(0.045, 0.062), w: r.range(-0.55, 0.55), ph: r.range(0, 6.28) });
    }
  }
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const col = new THREE.Color();
  let time = 0;
  return {
    mesh,
    columns: lit.length,
    update(dt, eye) {
      time += dt;
      const cx = eye?.x ?? 0;
      const cz = eye?.z ?? 0;
      for (let i = 0; i < N; i += 1) {
        const s = p[i];
        s.t += s.sp * dt;
        if (s.t >= 1) s.t -= 1;
        const t = s.t;
        const lean = LEAN * t ** 1.35;
        const wob = Math.sin(time * 0.5 + s.ph) * (0.35 + t * 1.5);
        const x = s.f.pos.x + WIND.x * lean + s.w * (1 + t * 2) + wob * 0.35;
        const z = s.f.pos.z + WIND.y * lean + s.w * (1 + t * 2) - wob * 0.2;
        pos.set(x, s.f.pos.y + s.f.fireY + 0.4 + t * HEIGHT, z);
        e.set(0, Math.atan2(cx - x, cz - z), 0);
        q.setFromEuler(e);
        // thin at the fire, broad at the top: 1.1 m to 4.6 m
        const sz = 1.1 + t * 3.5;
        scl.set(sz, sz, 1);
        mesh.setMatrixAt(i, m4.compose(pos, q, scl));
        // the tail is what the eye reads as height, so fade colour and not
        // only size: the last third is within a few luma of the fog
        col.copy(base).lerp(top, Math.min(1, t * 1.25));
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

/* ==================================================================== *
 * p3 — ASH.  The drifting particle native to a burning siege.
 *
 * ONE InstancedMesh, 380 quads at 0.12-0.16 m, UNLIT flat colour: a lit
 * quad tumbling in the air spends half its life with its normal away from
 * the sun, lands on the cel ramp's bottom band and becomes a black speck
 * against the sky.  `depthWrite: false` so the ink pass does not outline
 * every fleck into speckle.
 *
 * The field FOLLOWS THE EYE and wraps in a 48 m box, which is the only way
 * to spend 380 quads on a 132 m town and still have ash where somebody is
 * standing.  It drifts downwind — off the Company's fires and over the
 * town, which is the direction that makes it mean something.  Nine in a
 * hundred are ember-warm; the rest are the ash-lilac the fog is.
 * ==================================================================== */
function buildAsh(seed = 'polish-ash') {
  const N = 380;
  const HALF = 24;
  const YLOW = 0.15;
  const YHIGH = 21;
  const mat = flat(0xffffff, {
    map: puffTex(), transparent: true, opacity: 0.5, depthWrite: false, fog: true, cache: false,
  });
  const mesh = new THREE.InstancedMesh(PLANE, mat, N);
  mesh.name = 'polish:ash';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 4;
  mesh.userData.airborne = true;

  const r = rng(seed);
  /* AT OR JUST UNDER THE SKY'S OWN VALUE (`PAL.sky.mid` is 0xb3a5be).  The
   * first cut was 0xd6cdd2 at 0.72 opacity and the frames came back with a
   * field of hard white dots in the sky — snow, not ash.  A fleck has to be
   * a fleck: near the value it sits against, with only the ember-warm few
   * standing out at all. */
  const ashTone = [0xb6abb8, 0xc2b7c1, 0xa79cae];
  const emberTone = [0xe3823f, 0xd9a05c];
  const p = [];
  const col = new THREE.Color();
  for (let i = 0; i < N; i += 1) {
    const ember = r.chance(0.09);
    p.push({
      x: r.range(-HALF, HALF), y: r.range(YLOW, YHIGH), z: r.range(-HALF, HALF),
      s: r.range(0.115, 0.16) * (ember ? 0.8 : 1),
      fall: r.range(0.10, 0.26), drift: r.range(0.45, 0.95),
      ph: r.range(0, 6.28), sw: r.range(0.35, 0.9), spin: r.range(-1.4, 1.4),
    });
    col.set(ember ? emberTone[i % 2] : ashTone[i % 3]);
    mesh.setColorAt(i, col);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  let time = 0;
  let seeded = false;
  return {
    mesh,
    count: N,
    update(dt, eye) {
      time += dt;
      const cx = eye?.x ?? 0;
      const cz = eye?.z ?? 0;
      if (!seeded) { for (const s of p) { s.x += cx; s.z += cz; } seeded = true; }
      const yaw = Math.atan2(cx, cz);
      for (let i = 0; i < N; i += 1) {
        const s = p[i];
        const sway = Math.sin(time * s.sw + s.ph);
        s.x += (WIND.x * s.drift + sway * 0.22) * dt;
        s.z += (WIND.y * s.drift - sway * 0.12) * dt;
        s.y -= s.fall * dt;
        // wrap the box round the eye, not round the origin: 380 quads over
        // a 132 m town is nothing, over a 48 m box round the walker it is ash
        if (s.x - cx > HALF) s.x -= HALF * 2; else if (s.x - cx < -HALF) s.x += HALF * 2;
        if (s.z - cz > HALF) s.z -= HALF * 2; else if (s.z - cz < -HALF) s.z += HALF * 2;
        if (s.y < YLOW) s.y = YHIGH;
        pos.set(s.x, s.y, s.z);
        e.set(0, yaw, sway * 0.5 + s.ph * 0.1 + time * s.spin * 0.12);
        q.setFromEuler(e);
        scl.set(s.s, s.s, 1);
        mesh.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ==================================================================== *
 * p5 — GROUND BREAKUP IN THE LANES.
 *
 * 20-40 mm proud tone patches where feet actually pass.  Decals, never
 * platforms, never colliders — `heightAt` and the nav grid must read the
 * same number with the layer on and off.
 *
 * THE LINES ARE THE PLAN'S OWN, not a memory of where a lane looks like it
 * runs: `game.gates[].approach` and `game.arenas[].approach.points` are the
 * polylines the waves walk, which is the definition of "where feet pass".
 *
 * THREE THINGS ARE MEASURED AT EVERY STATION and all three were needed:
 *   - a district's existing wear.  southgate lays 60-odd patches through
 *     the gate passage, marketlow rakes ruts up the market ramp and
 *     keephill scatters the ward; a second layer on top of any of them is
 *     z-fighting.  Every `ground-wear` group in the scene is boxed first
 *     and a station inside one is dropped.
 *   - the colliders.  A patch inside a building is a patch nobody sees, and
 *     the approach polylines run past piers and drums.
 *   - the LOCAL FALL, sampled at the patch's own four corners with
 *     `groundLayerAt`.  A patch is a flat box seated on its centre, so on
 *     the market's 1-in-4.6 ramp a chain of them is a ladder of tiles
 *     hovering over it — marketlow's own header records exactly that, which
 *     is why its ruts are raked solids.  Anything over 0.1 m of fall across
 *     the patch is somebody else's ramp and is left alone.
 *
 * `groundLayerAt` AND NOT the two-argument `groundAt`: the gatehouse
 * registers a deck at y 5.0 over the south gate passage, and the
 * two-argument query answers FIVE METRES in there — this project has
 * already shipped a wear layer on the roof of its own gate.
 * ==================================================================== */
function lanePolylines(plan) {
  const lines = [];
  for (const g of plan.game?.gates ?? []) {
    if (Array.isArray(g.approach) && g.approach.length > 1) lines.push({ id: `${g.id}-passage`, pts: g.approach, w: 1.5 });
  }
  for (const a of plan.game?.arenas ?? []) {
    const ap = a.approach;
    if (ap && Array.isArray(ap.points) && ap.points.length > 1) lines.push({ id: `${a.id}-approach`, pts: ap.points, w: 1.2 });
  }
  /* THE ROW AND THE MARKET have no polyline of their own — the row's
   * approach is the bare string "east-gate" and the market's is
   * "south-gate" — so both are taken off the plan's other measured
   * geometry rather than invented: the row lane is the east gate's own
   * axis carried in to the arena's west edge (`the-row` rect x0 20, gate
   * at z 22), and the market's is the `gate-sees-keep` sight corridor,
   * which is the axis of the whole town and the line every wave walks
   * from the gate square to the mound. */
  const row = (plan.game?.arenas ?? []).find((a) => a.id === 'the-row');
  const gate = (plan.game?.gates ?? []).find((g) => g.id === 'east-gate');
  if (row && gate) lines.push({ id: 'the-row-lane', pts: [[gate.at[0] - 6, gate.at[1]], [row.rect.x0, gate.at[1]]], w: 1.4 });
  const axis = (plan.sight_corridors ?? []).find((c) => c.id === 'gate-sees-keep');
  if (axis) lines.push({ id: 'market-axis', pts: [axis.from, axis.to], w: 1.6 });
  return lines;
}

/**
 * WHERE A DISTRICT HAS ALREADY WORN THE GROUND, as an occupancy grid and
 * NOT as bounding boxes.
 *
 * A district's wear is one MERGED mesh per material — sixty scattered
 * patches in a single geometry — so `Box3.setFromObject` on it returns the
 * whole scatter's envelope: southgate's is 27 x 36 m, which is the entire
 * gate square.  The first cut used exactly that and dropped 182 of 364
 * stations, including every one on the town's own axis, so the market's
 * bare turf — the largest single flat tone in any street frame — got four
 * patches.  This is the same trap `withPools` records in `kit/props.js`,
 * one layer down: the bounding box of a pool is not where the pool is.
 *
 * So: every vertex of every wear mesh, in world space, stamped into a
 * `CELL`-metre grid.  A station is already worn if its own cell or any of
 * the eight round it carries a vertex.
 */
const WEAR_CELL = 0.9;
function wearGrid(scene) {
  const cells = new Set();
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || o.name?.startsWith('polish:')) return;
    let wear = false;
    for (let p = o; p; p = p.parent) if (typeof p.name === 'string' && p.name.includes('ground-wear')) { wear = true; break; }
    if (!wear) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    o.updateMatrixWorld(true);
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      cells.add(`${Math.round(v.x / WEAR_CELL)}/${Math.round(v.z / WEAR_CELL)}`);
    }
  });
  return cells;
}

function buildLaneWear(scene, ctx, plan, groundLayerAt, colliders) {
  const r = rng('polish-lanes');
  const worn = wearGrid(scene);
  const inWorn = (x, z) => {
    const cx = Math.round(x / WEAR_CELL);
    const cz = Math.round(z / WEAR_CELL);
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) if (worn.has(`${cx + i}/${cz + j}`)) return true;
    return false;
  };
  const P = parts();
  const stats = { stations: 0, laid: 0, skippedWorn: 0, skippedCollider: 0, skippedFall: 0, byLane: {} };
  /* THE TONE MIX IS THE WHOLE DIFFERENCE between a worn track and a floor
   * of tiles.  The first cut picked evenly from six ground tones including
   * `earth` (#8a7b66) and `moss` (#6f8060) on a lane paved in `ground`
   * (#b7b0ab) — a 40-luma step per patch, and the A/B frame of the row lane
   * came back as two dozen separate dark rectangles lying on the road.
   * Weighted toward the two tones a step away, with the dark one kept for
   * the middle of the lane where a rut belongs: `gravel` and `straw` are
   * the wear, `pavingDark` is the rut, `earth` is rare and `moss` is for
   * the edges only.  Same lesson southgate's own header records from the
   * other end — its patches are `pavingDark` two times in three because
   * `gravel` read as paper on the road. */
  const near = [M.gravel, M.gravel, M.gravel, M.straw, M.straw];
  const rut = [M.pavingDark, M.pavingDark, M.earth];
  const edge = [M.moss, M.straw, M.gravel];

  for (const lane of lanePolylines(plan)) {
    stats.byLane[lane.id] = 0;
    for (let i = 1; i < lane.pts.length; i += 1) {
      const [x0, z0] = lane.pts[i - 1];
      const [x1, z1] = lane.pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0);
      // 0.85 m stations against 0.9-2.4 m patches: consecutive patches
      // OVERLAP, which is what turns a row of tiles into a track
      const n = Math.max(1, Math.round(len / 0.85));
      const nx = -(z1 - z0) / (len || 1);
      const nz = (x1 - x0) / (len || 1);
      const along = Math.atan2(x1 - x0, z1 - z0);
      for (let k = 0; k <= n; k += 1) {
        const t = k / n;
        for (const side of [-1, 1]) {
          stats.stations += 1;
          const spread = r.range(0.1, 1.0);
          const off = side * lane.w * spread;
          const x = x0 + (x1 - x0) * t + nx * off;
          const z = z0 + (z1 - z0) * t + nz * off;
          if (inWorn(x, z)) { stats.skippedWorn += 1; continue; }
          const w = r.range(0.9, 2.4);
          const d = r.range(0.8, 1.8);
          const y = groundLayerAt(x, z);
          // four corners: a patch straddling a ramp or a tread is a tile
          // hovering over it, which is worse than bare ground
          let lo = y; let hi = y;
          for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
            const c = groundLayerAt(x + dx, z + dz);
            lo = Math.min(lo, c); hi = Math.max(hi, c);
          }
          if (hi - lo > 0.10) { stats.skippedFall += 1; continue; }
          if (colliders.some((c) => colliderBlocks(c, x, z, y, 0.05))) { stats.skippedCollider += 1; continue; }
          // the middle of the lane is a rut, the edge of it is litter and
          // moss: which tone a patch takes is WHERE it is, not a die roll
          const pool = spread < 0.4 ? rut : spread > 0.82 ? edge : near;
          // aligned to the lane, not spun freely: a track has a direction
          P.add(r.pick(pool), bx(w, 0.02, d, x, y + r.range(0.020, 0.036), z, { ry: along + r.range(-0.22, 0.22) }));
          stats.laid += 1;
          stats.byLane[lane.id] += 1;
        }
      }
    }
  }
  const g = new THREE.Group();
  P.flush(g, { cast: false, receive: true });
  g.name = 'polish:lane-wear';
  let meshes = 0;
  g.traverse((o) => { if (o.isMesh) { o.name = `polish:lane-wear:${meshes}`; meshes += 1; } });
  if (ctx) ctx.add(g, 'polish:lane-wear'); else scene.add(g);
  return { group: g, stats, meshes };
}

/* ==================================================================== *
 * p1 — THE SURFACE AUDIT.
 *
 * The maps themselves live on the POOL in `kit/surface.js` and are attached
 * there once, at zero draw calls.  This does not attach anything: it
 * reports which pooled material carries a multiply map and which does not,
 * and — with `{ measure: true }` — renders a material-ID pass at every
 * vista and gives each material its SHARE OF THE FRAME.  The reference's
 * rule is "attach the missing ones only if a material that covers >2 % of
 * a vista frame has none", and 2 % of a frame is a measurement.
 * ==================================================================== */
function surfaceAudit(scene, { renderer = null, camera = null, cameras = null, measure = false, w = 320, h = 180 } = {}) {
  const rows = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || o.name?.startsWith('polish:')) return;
    const tris = o.geometry?.index ? o.geometry.index.count / 3 : (o.geometry?.attributes?.position?.count ?? 0) / 3;
    for (const m of materialsOf(o)) {
      let e = rows.get(m);
      if (!e) rows.set(m, (e = { mat: m, meshes: 0, tris: 0, sample: o.name, share: 0 }));
      e.meshes += 1;
      e.tris += tris * (o.isInstancedMesh ? o.count : 1);
    }
  });

  if (measure && renderer && camera && cameras) {
    const list = [...rows.values()];
    const idx = new Map(list.map((e, i) => [e.mat, i]));
    const idMat = list.map((_, i) => new THREE.MeshBasicMaterial({
      color: new THREE.Color((((i + 1) & 255) / 255), ((((i + 1) >> 8) & 255) / 255), 0), fog: false, toneMapped: false,
    }));
    const saved = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      saved.push([o, o.material, o.visible]);
      if (o.name?.startsWith('polish:')) { o.visible = false; return; }
      const m = materialsOf(o)[0];
      o.material = idMat[idx.get(m)] ?? idMat[0];
    });
    const bg = scene.background; const fog = scene.fog;
    scene.background = null; scene.fog = null;
    const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.NoColorSpace });
    const buf = new Uint8Array(w * h * 4);
    const cam = camera.clone();
    cam.aspect = w / h;
    const counts = new Float64Array(list.length);
    let frames = 0;
    for (const [, view] of Object.entries(cameras)) {
      cam.position.fromArray(view.position);
      cam.lookAt(view.target[0], view.target[1], view.target[2]);
      cam.fov = view.fov ?? 52;
      cam.updateProjectionMatrix();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      for (let i = 0; i < w * h; i += 1) {
        const id = buf[i * 4] + (buf[i * 4 + 1] << 8);
        if (id > 0 && id <= list.length) counts[id - 1] += 1;
      }
      frames += 1;
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(new THREE.Color(PAL.fog), 1);
    rt.dispose();
    idMat.forEach((m) => m.dispose());
    for (const [o, m, vis] of saved) { o.material = m; o.visible = vis; }
    scene.background = bg; scene.fog = fog;
    list.forEach((e, i) => { e.share = counts[i] / (w * h * Math.max(1, frames)); });
  }

  const out = [...rows.values()]
    .map((e) => ({
      color: '#' + e.mat.color?.getHexString?.(),
      type: e.mat.type,
      map: e.mat.map?.name ?? (e.mat.map ? '(unnamed)' : null),
      pxPerM: e.mat.map?.userData?.pxPerM ?? null,
      meshes: e.meshes,
      tris: Math.round(e.tris),
      framePct: Number((e.share * 100).toFixed(3)),
      sample: e.sample,
    }))
    .sort((a, b) => b.framePct - a.framePct || b.meshes - a.meshes);
  const gaps = out.filter((e) => !e.map && e.framePct >= 2);
  return { rows: out, unmapped: out.filter((e) => !e.map).length, mapped: out.filter((e) => e.map).length, gaps };
}

/* ==================================================================== *
 * p6 — ACCENT DISCIPLINE, town-wide.
 *
 * One saturated accent per district, each OWNED, and ONE for the enemy that
 * no district may wear.  Two rules, both reported and neither fixed here —
 * a district's paint is the district's:
 *   FAIL  `ACCENT.companyRust` anywhere but the Company's camp banner and
 *         the enemies themselves.
 *   FAIL  a district wearing another district's accent.
 *   WARN  an owned accent standing outside its owner's envelope (which the
 *         surrounds legitimately do — southgate owns the ground outside the
 *         wall — so it is a warning and it names the owner).
 * ==================================================================== */
const ACCENT_OWNER = Object.freeze({
  [ACCENT.wardenMadder]: 'southgate',
  [ACCENT.hallAmber]: 'marketlow',       // === ACCENT.lanternGold, the same hex
  [ACCENT.rowGreen]: 'wardrow',          // === ACCENT.hedgeGreen
  [ACCENT.sailOchre]: 'millreach',       // === ACCENT.milledOchre
  [ACCENT.wardGlow]: 'chapelclose',      // === ACCENT.alchemicalTeal
  [ACCENT.gilt]: 'keephill',
  [ACCENT.companyRust]: 'ENEMY',
});
const ACCENT_NAME = Object.freeze({
  [ACCENT.wardenMadder]: 'wardenMadder', [ACCENT.hallAmber]: 'hallAmber/lanternGold',
  [ACCENT.rowGreen]: 'rowGreen/hedgeGreen', [ACCENT.sailOchre]: 'sailOchre/milledOchre',
  [ACCENT.wardGlow]: 'wardGlow/alchemicalTeal', [ACCENT.gilt]: 'gilt',
  [ACCENT.companyRust]: 'companyRust', [ACCENT.lanternRed]: 'lanternRed (unowned)',
});
/** The only things allowed to wear the enemy's rust. */
const RUST_ALLOWED = /company|enemy|raider|captain|hexer|shieldbearer|sapper/i;

function accentAudit(scene, plan) {
  const ids = new Set((plan.districts ?? []).map((d) => d.id));
  const env = envelopes(plan);
  const hits = [];
  const p = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || o.name?.startsWith('polish:')) return;
    for (const m of materialsOf(o)) {
      const hex = m.color?.getHex?.();
      if (hex === undefined || !(hex in ACCENT_OWNER || hex in ACCENT_NAME)) continue;
      o.getWorldPosition(p);
      const owner = ownerOf(o, ids);
      const want = ACCENT_OWNER[hex] ?? null;
      const name = ACCENT_NAME[hex];
      const chain = [];
      for (let q = o; q && chain.length < 4; q = q.parent) if (q.name) chain.push(q.name);
      const rec = {
        accent: name, hex: '#' + hex.toString(16).padStart(6, '0'),
        owner: want, builtBy: owner, mesh: o.name, path: chain.join(' < '),
        at: [Number(p.x.toFixed(1)), Number(p.z.toFixed(1))],
        status: 'ok', why: '',
      };
      if (want === 'ENEMY') {
        if (!RUST_ALLOWED.test(rec.path)) {
          rec.status = 'FAIL';
          rec.why = "the enemy's rust is the Company's alone — only its camp banner and the enemies may wear it";
        }
      } else if (want && owner && owner !== want) {
        rec.status = 'FAIL';
        rec.why = `built by "${owner}" and this accent belongs to "${want}"`;
      } else if (want && owner === want) {
        const e = env.get(want);
        if (e && (p.x < e.x0 - 1 || p.x > e.x1 + 1 || p.z < e.z0 - 1 || p.z > e.z1 + 1)) {
          rec.status = 'WARN';
          rec.why = `outside "${want}"'s own envelope (the surrounds are southgate's by contract; anything else wants a look)`;
        }
      } else if (!want) {
        rec.status = 'WARN';
        rec.why = 'an unowned Thistledown accent key — no Hollowbrook district owns this hex';
      }
      hits.push(rec);
    }
  });
  const fails = hits.filter((h) => h.status === 'FAIL');
  return { ok: fails.length === 0, hits, fails, warns: hits.filter((h) => h.status === 'WARN') };
}

/* ==================================================================== *
 * p7 — PRACTICALS THAT TRAVEL.
 *
 * A lit lamp is three things or it is a flat orange quad: a banded body,
 * warm emissive glass, and a soft light-pool decal on the ground under it.
 * The kit builds the pool whatever `lit` says and merely hides it, so the
 * check is: every LIT practical has a `light-pool` sibling (or descendant)
 * and that pool is visible.  Reported per district; nothing is added here —
 * a pool belongs to whoever built the lamp.
 * ==================================================================== */
function practicalAudit(scene, plan) {
  const ids = new Set((plan.districts ?? []).map((d) => d.id));
  const byDistrict = {};
  const missing = [];
  const seen = new Set();
  const p = new THREE.Vector3();
  scene.traverse((o) => {
    const u = o.userData;
    if (!u?.practical) return;
    // the kit copies a body's userData onto its `withPools` wrapper, so the
    // same lamp shows up twice; count it once, at its own position
    o.getWorldPosition(p);
    const key = `${p.x.toFixed(2)}/${p.y.toFixed(2)}/${p.z.toFixed(2)}/${u.kind ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const d = ownerOf(o, ids) ?? 'unowned';
    const row = (byDistrict[d] ??= { practicals: 0, lit: 0, pools: 0, litWithPool: 0 });
    row.practicals += 1;
    const lit = u.lit !== false;
    if (lit) row.lit += 1;
    let pool = null;
    const scan = (node) => { node.traverse((c) => { if (c.name === 'light-pool') pool ??= c; }); };
    scan(o);
    if (!pool && o.parent) scan(o.parent);
    if (pool) row.pools += 1;
    if (lit && pool) row.litWithPool += 1;
    if (lit && !pool) missing.push({ district: d, mesh: o.name, kind: u.kind ?? null, at: [Number(p.x.toFixed(1)), Number(p.z.toFixed(1))] });
  });
  const totals = Object.values(byDistrict).reduce((a, b) => ({
    practicals: a.practicals + b.practicals, lit: a.lit + b.lit, pools: a.pools + b.pools, litWithPool: a.litWithPool + b.litWithPool,
  }), { practicals: 0, lit: 0, pools: 0, litWithPool: 0 });
  return { ok: missing.length === 0, byDistrict, totals, missing };
}

/* ==================================================================== *
 * THE OVERHEAD LAYER — measured, and deliberately NOT added to.
 *
 * The reference asks for wires, bunting or banners strung with real sag
 * between REAL anchors.  Hollowbrook already has them where they belong —
 * marketlow strings its lantern runs over the market, chapelclose and
 * wardrow hang washing — and every one of those is anchored to a building
 * whose posts that district measured.  An anchor this file cannot measure
 * is an anchor in mid-air, so this reports what is already up there and
 * adds nothing.
 * ==================================================================== */
function overheadAudit(scene) {
  const runs = [];
  const p = new THREE.Vector3();
  scene.traverse((o) => {
    const n = typeof o.name === 'string' ? o.name : '';
    if (!/lantern-string|washing|bunting|banner-line/i.test(n)) return;
    o.getWorldPosition(p);
    runs.push({ name: n, at: [Number(p.x.toFixed(1)), Number(p.z.toFixed(1))], y: Number(p.y.toFixed(2)) });
  });
  return runs;
}

/* ==================================================================== *
 * THE ENTRY POINT
 * ==================================================================== */
export function applyPolish({ scene, ctx = null, plan, vignette, camera, renderer = null, mode = 'town', search = null } = {}) {
  const want = wanted(search ?? (typeof location !== 'undefined' ? location.search : ''));
  const groundLayerAt = vignette?.groundLayerAt ?? vignette?.groundAt ?? (() => 0);
  const colliders = vignette?.colliders ?? [];
  const cameras = vignette?.reviewCameras ?? null;
  const built = { clouds: null, smoke: null, ash: null, lanes: null };
  const fires = findCampFires(scene);
  const updaters = [];

  /* ---- p2: the sky band ---- */
  if (want.has('sky')) {
    built.clouds = buildClouds(scene, camera);
    scene.add(built.clouds.mesh);
    updaters.push(built.clouds.update);
    built.smoke = buildSmoke(fires);
    if (built.smoke) { scene.add(built.smoke.mesh); updaters.push(built.smoke.update); }
  }

  /* ---- p3: ash ---- */
  if (want.has('ash')) {
    built.ash = buildAsh();
    scene.add(built.ash.mesh);
    updaters.push(built.ash.update);
  }

  /* ---- p5: the lanes ---- */
  if (want.has('lanes')) built.lanes = buildLaneWear(scene, ctx, plan, groundLayerAt, colliders);

  /* ---- p4: the haze.  RANGE ONLY.  In the game the day-night rig owns
   * the fog COLOUR as the waves go on (game/daynight.js) and this must not
   * fight it; here it owns the near/far and nothing else. ---- */
  const unpolished = scene.fog ? { near: scene.fog.near, far: scene.fog.far } : null;
  const setHaze = (on) => {
    if (!scene.fog || !unpolished) return;
    scene.fog.near = on ? POLISH_FOG.near : unpolished.near;
    scene.fog.far = on ? POLISH_FOG.far : unpolished.far;
  };
  /** For the SWEEP that decided p4: one range at a time, measured through
   *  `checkAllVistas`, so the haze's cost to a declared subject is a curve
   *  and not one guess. */
  const setFog = (near, far) => { if (scene.fog) { scene.fog.near = near; scene.fog.far = far; } };
  if (want.has('haze')) setHaze(true);

  /* One updater for the whole layer, on the vignette's own step, so a
   * headless page that steps `vignette.update(dt, eye)` by hand steps the
   * polish with it — nothing in this project animates on its own. */
  const step = (dt, eye) => { for (const u of updaters) u(dt, eye); };
  if (ctx?.update) ctx.update(step);

  const handle = {
    mode,
    mechanisms: [...want],
    active: (m) => want.has(m),
    setHaze,
    setFog,
    fog: { polished: { ...POLISH_FOG }, unpolished: unpolished ? { ...unpolished } : null },
    update: step,
    campFires: fires.map((f) => ({ name: f.name, at: [Number(f.pos.x.toFixed(1)), Number(f.pos.z.toFixed(1))], lit: f.lit })),
    surfaces: (opts = {}) => surfaceAudit(scene, { renderer, camera, cameras, ...opts }),
    accents: () => accentAudit(scene, plan),
    practicals: () => practicalAudit(scene, plan),
    overhead: () => overheadAudit(scene),
    /** every mesh this layer added, and what it costs in draw calls */
    stats() {
      const meshes = [];
      scene.traverse((o) => { if (o.isMesh && o.name?.startsWith('polish:')) meshes.push(o.name); });
      return {
        mechanisms: [...want],
        meshes: meshes.length,
        names: meshes,
        clouds: built.clouds ? 14 : 0,
        smokeColumns: built.smoke?.columns ?? 0,
        ash: built.ash?.count ?? 0,
        laneWear: built.lanes ? { ...built.lanes.stats, meshes: built.lanes.meshes } : null,
      };
    },
    /** one line per audit, for a console or a gate */
    report() {
      const s = this.surfaces();
      const a = this.accents();
      const p = this.practicals();
      const st = this.stats();
      return [
        `[polish] mechanisms: ${st.mechanisms.join(', ') || '(off)'} — ${st.meshes} added meshes`,
        `[polish] p1 surfaces: ${s.mapped} pooled materials mapped, ${s.unmapped} not; ` +
          `${s.gaps.length ? `GAPS over 2 % of a vista frame: ${s.gaps.map((g) => `${g.color} ${g.framePct} %`).join(', ')}` : 'no unmapped material covers 2 % of a vista frame'}`,
        `[polish] p2 sky: ${st.clouds} clouds, ${st.smokeColumns} smoke column(s) over ${this.campFires.length} camp fire(s) ` +
          `(${this.campFires.filter((f) => f.lit).length} lit, all at ${this.campFires.every((f) => f.at[1] > 40) ? 'the SOUTH gate' : 'both gates'})`,
        `[polish] p3 ash: ${st.ash} quads in one instanced mesh`,
        `[polish] p4 haze: ${unpolished ? `${unpolished.near.toFixed(1)}..${unpolished.far.toFixed(1)} -> ${POLISH_FOG.near}..${POLISH_FOG.far}` : 'no fog on this scene'}`,
        `[polish] p5 lanes: ${st.laneWear ? `${st.laneWear.laid} patches in ${st.laneWear.meshes} merged meshes ` +
          `(${st.laneWear.skippedWorn} stations already worn by a district, ${st.laneWear.skippedCollider} blocked, ${st.laneWear.skippedFall} on a grade)` : 'off'}`,
        `[polish] p6 accents: ${a.ok ? 'PASS' : `FAIL (${a.fails.length})`} — ${a.hits.length} accent meshes, ${a.warns.length} warning(s)`,
        ...a.fails.map((f) => `  FAIL ${f.accent} on ${f.mesh} at ${f.at} — ${f.why}`),
        `[polish] p7 practicals: ${p.ok ? 'PASS' : `FAIL (${p.missing.length} lit with no pool)`} — ` +
          `${p.totals.practicals} practicals, ${p.totals.lit} lit, ${p.totals.litWithPool} of those with a light pool`,
        `[polish] overhead: ${this.overhead().length} strung run(s) already hung by districts; this layer adds none`,
      ].join('\n');
    },
  };
  if (typeof window !== 'undefined') window.__polish = handle;
  return handle;
}
