#!/usr/bin/env node
/**
 * SIEGE GATE — the kit's perimeter, stood up in the REAL terrain.
 *
 * The showcase (check-kit.mjs) proves each generator is not floating,
 * buried or overlapping.  It cannot prove the only thing that actually
 * matters about a curtain wall: that the wall-walk is ONE RING.
 *
 * So this boots the whole town (districts as stubs — the perimeter belongs
 * to the terrain and to this kit, not to them), dresses every wall-walk
 * shelf with `curtainWall`, bridges both gate gaps with `gatehouse`,
 * dresses every stair head with `stairTurret`, stands the four corner
 * towers, and then asks four questions no frame can answer:
 *
 *   1. WALK CONTINUITY.  A flood fill CONFINED TO GROUND ABOVE 4.5 m — so
 *      it cannot cheat by dropping into the street, walking round and
 *      coming back up a stair — must reach all four corners, both gate
 *      decks and all five stair-head landings from one seed.  Before the
 *      gatehouses the walk is two arcs, and both arcs contain corners, so
 *      "all four corners reached" is only a real test once the gaps are
 *      bridged.
 *   2. THE PASSAGES ARE STILL PASSAGES.  A ground-level fill from the
 *      player's spawn must get OUT through both gates, and the clear width
 *      at each is measured by a scan line rather than trusted.
 *   3. THE STREET UNDER THE WALL IS NOT WALLED.  Every parapet collider
 *      carries `bottom`; sample the ground beside the curtain and assert
 *      nothing there is blocked at feet height 0.
 *   4. A RAISED BARRICADE LEAVES 1.8 m.  Measured on the collider, in the
 *      lane, with the player's radius on both sides.
 *
 *   node scripts/check-siege.mjs        # exit 0 pass · 1 defects · 2 crashed
 */
import { bootCity, makeChecker } from './lib/headless.mjs';

const CELL = 0.35;
const RADIUS = 0.34;
const STEP = 0.38;
const r2 = (v) => Math.round(v * 100) / 100;

const { check, finish } = makeChecker();

try {
  const { vignette, plan } = await bootCity();
  const { colliderBlocks } = await import('../src/builders.js');
  const { curtainWall, gatehouse, stairTurret, barricade, roundTower, place } = await import('../src/kit/index.js');
  const { wallWalkShelves, landingShelves } = await import('../src/terrain.js');

  /* A shim ctx over the built vignette: composeCity's own `groundAt` reads
   * `ctx.platforms` live, so a platform pushed here is ground immediately —
   * which is what lets the gatehouse deck be walked onto. */
  const updaters = [];
  const ctx = {
    colliders: vignette.colliders,
    platforms: vignette.platforms,
    interactables: vignette.interactables,
    groundAt: vignette.groundAt,
    add: (o, n) => { if (n) o.name = n; vignette.root.add(o); return o; },
    collide: (x0, z0, x1, z1, top, bottom) => {
      const c = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
      if (top !== undefined && top !== null) c.top = top;
      if (bottom !== undefined && bottom !== null) c.bottom = bottom;
      vignette.colliders.push(c);
    },
    platform: (x0, z0, x1, z1, top) => vignette.platforms.push({
      x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), top,
    }),
    interact: (e) => vignette.interactables.push(e),
    update: (f) => updaters.push(f),
    reset: () => {},
  };

  const S = plan.siege;
  const before = { colliders: ctx.colliders.length, platforms: ctx.platforms.length };

  /* ---- 1. the curtain, one call per shelf run -------------------------- */
  const walks = wallWalkShelves(plan);
  const sideOf = (s) => {
    if (Math.abs(s.z1 - s.z0 - 2.4) < 1e-6) return s.z0 > 0 ? 's' : 'n';
    return s.x0 > 0 ? 'e' : 'w';
  };
  let runs = 0;
  for (const s of walks) {
    const side = sideOf(s);
    const alongX = side === 's' || side === 'n';
    const from = alongX ? s.x0 : s.z0;
    const to = alongX ? s.x1 : s.z1;
    curtainWall({
      from, to, side, ctx, plan, seed: `run-${s.in}-${side}-${from}`,
      /* every run in this town ends at a corner tower, a gatehouse or the
       * next district's run, so nothing is capped here.  A district that
       * ends a run in open air passes 'pier'. */
      endCaps: ['none', 'none'],
    });
    runs += 1;
  }
  check('curtain:runs', runs === walks.length, `${runs} curtain runs dressed over ${walks.length} wall-walk shelves`);

  /* ---- 2. the gatehouses ---------------------------------------------- */
  const gates = [];
  for (const [id, gate] of Object.entries(S.gates)) {
    const g = gatehouse({ gate, id, ctx, plan, seed: `gate-${id}` });
    gates.push([id, g]);
  }
  check('gatehouse:built', gates.length === 2, `${gates.length} gatehouses: ${gates.map(([i, g]) => `${i} clear ${r2(g.userData.clearWidth)} m (walkable ${r2(g.userData.walkableWidth)})`).join('; ')}`);
  for (const [id, g] of gates) {
    check(`gatehouse:${id}:clear`, g.userData.clearWidth >= 5.0,
      `passage clear ${r2(g.userData.clearWidth)} m (contract >= 5.0), walkable ${r2(g.userData.walkableWidth)} m`);
  }

  /* ---- 3. the stair turrets ------------------------------------------- */
  const crossings = plan.terrain.crossings.filter((c) => c.id && c.to === S.wall_walk_y);
  let turrets = 0;
  for (const L of landingShelves(plan)) {
    const flight = crossings.find((c) => c.in === L.in) ?? null;
    stairTurret({ landing: L, flight, ctx, plan, seed: `turret-${L.in}` });
    turrets += 1;
  }
  check('turret:built', turrets === landingShelves(plan).length, `${turrets} stair turrets on ${landingShelves(plan).length} landings`);

  /* ---- 4. the corner towers ------------------------------------------- *
   * PUSHED OUT ALONG THE DIAGONAL, and that is the whole geometry lesson of
   * a corner tower on a walkable wall: a drum centred on the corner is a
   * collider across the only place the walk turns.  At (+-52.6, +-52.6) with
   * r 1.9 it touches the outer corner, reads as a tower ON the corner from
   * every angle, and leaves 1.40 m of walk behind it. */
  for (const t of S.corner_towers) {
    const sx = Math.sign(t.at[0]);
    const sz = Math.sign(t.at[1]);
    const tw = roundTower({
      seed: `corner-${t.id}`, r: 1.9, h: 8.6, taper: 0.1, crook: 0.25,
      wall: 'granite', cap: 'cone', bands: 2, machicolation: true, door: null,
    });
    place(ctx, tw, { x: sx * 52.6, z: sz * 52.6, yaw: 0, name: t.id });
  }

  console.log(`dressing added ${ctx.colliders.length - before.colliders} colliders and ${ctx.platforms.length - before.platforms} platforms`);
  const withBottom = ctx.colliders.filter((c) => c.bottom !== undefined).length;
  const withTop = ctx.colliders.filter((c) => c.top !== undefined).length;
  console.log(`  of them ${withBottom} carry \`bottom\` (parapets) and ${withTop} carry \`top\` (gatehouse piers)`);

  /* ---- the fill ------------------------------------------------------- */
  const groundAt = vignette.groundAt;
  const GRID = 4;
  const buckets = new Map();
  const bkey = (i, j) => i * 100000 + j;
  for (const c of ctx.colliders) {
    for (let i = Math.floor((c.x0 - RADIUS) / GRID); i <= Math.floor((c.x1 + RADIUS) / GRID); i += 1) {
      for (let j = Math.floor((c.z0 - RADIUS) / GRID); j <= Math.floor((c.z1 + RADIUS) / GRID); j += 1) {
        const k = bkey(i, j);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(c);
      }
    }
  }
  const blocked = (x, z, y) => {
    const list = buckets.get(bkey(Math.floor(x / GRID), Math.floor(z / GRID)));
    if (!list) return false;
    for (const c of list) if (colliderBlocks(c, x, z, y, RADIUS)) return true;
    return false;
  };

  const RECT = { x0: -62, x1: 62, z0: -62, z1: 62 };
  const ci = (x) => Math.round((x - RECT.x0) / CELL);
  const cj = (z) => Math.round((z - RECT.z0) / CELL);
  const W = ci(RECT.x1) + 1;
  const D = cj(RECT.z1) + 1;

  function fill(seedX, seedZ, { floorY = -Infinity } = {}) {
    const y0 = groundAt(seedX, seedZ);
    if (y0 < floorY) throw new Error(`fill seed (${seedX}, ${seedZ}) is at y ${r2(y0)}, under the floor ${floorY}`);
    const seen = new Set();
    const best = new Map();
    const q = [[ci(seedX), cj(seedZ), y0]];
    seen.add(`${q[0][0]},${q[0][1]},${Math.round(y0 / 0.3)}`);
    best.set(q[0][0] * 100000 + q[0][1], y0);
    let visits = 0;
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const [i, j, y] = q.pop();
      visits += 1;
      for (const [di, dj] of NB) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= D) continue;
        const nx = RECT.x0 + ni * CELL;
        const nz = RECT.z0 + nj * CELL;
        const ny = groundAt(nx, nz, y);   // the feet carried here — see district.js
        if (ny < floorY) continue;
        if (ny - y > STEP) continue;
        if (blocked(nx, nz, ny)) continue;
        const k = `${ni},${nj},${Math.round(ny / 0.3)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const ck = ni * 100000 + nj;
        if (!best.has(ck) || best.get(ck) < ny) best.set(ck, ny);
        q.push([ni, nj, ny]);
      }
    }
    const reached = (x, z) => {
      for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) {
        if (best.has((ci(x) + di) * 100000 + (cj(z) + dj))) return true;
      }
      return false;
    };
    return { cells: best.size, visits, reached };
  }

  /* ---- Q1: is the wall-walk one ring? --------------------------------- */
  const walk = fill(-40, 50, { floorY: 4.5 });
  console.log(`\nwall-walk fill (ground >= 4.5 only): ${walk.cells} cells from (-40, 50), ${walk.visits} visits`);
  const walkTargets = [
    ['corner sw', -49.6, 49.6], ['corner nw', -49.6, -49.6],
    ['corner ne', 49.6, -49.6], ['corner se', 49.6, 49.6],
    ['south-gate deck', 0, 50], ['east-gate deck', 50, 22],
    ['landing southgate', -16.5, 47.3], ['landing keephill', 41.5, -47.3],
    ['landing millreach', -47.3, 31.5], ['landing chapelclose', -31.5, -47.3],
    ['landing wardrow', 47.3, 41.5],
    ['north walk mid', 0, -50], ['west walk mid', -50, 0], ['east walk n', 50, -30],
  ];
  let walkFails = 0;
  for (const [nm, x, z] of walkTargets) {
    const ok = walk.reached(x, z);
    if (!ok) walkFails += 1;
    check(`walk:${nm}`, ok, `(${x}, ${z}) at y ${r2(groundAt(x, z))} — ${ok ? 'reached along the walk' : 'NOT REACHED without leaving the wall'}`);
  }
  check('walk:ring', walkFails === 0, walkFails === 0
    ? 'the wall-walk is ONE RING: every corner, both gate decks and all five landings from one seed, never dropping below 4.5 m'
    : `${walkFails} points off the ring`);

  /* ---- Q2: the passages ----------------------------------------------- */
  const spawn = plan.game?.player?.spawn ?? [0, 30];
  const town = fill(spawn[0], spawn[1]);
  console.log(`\nground fill: ${town.cells} cells from the player spawn (${spawn})`);
  for (const [id, g] of gates) {
    const p = g.userData.passage;
    const out = p.outward;
    const inn = p.inward;
    check(`passage:${id}:through`, town.reached(out[0], out[1]) && town.reached(inn[0], inn[1]),
      `the gate is open both ways — inside (${r2(inn[0])}, ${r2(inn[1])}) ${town.reached(inn[0], inn[1]) ? 'reached' : 'BLOCKED'}, ` +
      `outside (${r2(out[0])}, ${r2(out[1])}) ${town.reached(out[0], out[1]) ? 'reached' : 'BLOCKED'}`);
    /* MEASURE the throat rather than trusting the declared number — and
     * measure it AT THE PASSAGE FLOOR.  The first cut sampled
     * `groundAt(x, z)` per station, which over the piers is the wall-walk
     * at 5 m: the piers' `top` colliders correctly stop blocking somebody
     * standing on them, so the scan reported 10.05 m of open ground across
     * a 5.70 m gate.  A throat is measured from the feet of whoever is
     * walking through it. */
    const cross = p.axis === 'z' ? 'x' : 'z';
    const mid = [(p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2];
    const floor = groundAt(mid[0], mid[1], 0);
    let open = 0;
    for (let t = -5; t <= 5; t += 0.05) {
      const x = cross === 'x' ? mid[0] + t : mid[0];
      const z = cross === 'x' ? mid[1] : mid[1] + t;
      if (blocked(x, z, floor)) continue;
      if (groundAt(x, z, floor) - floor > STEP) continue;   // a 5 m rise is a wall
      open += 0.05;
    }
    check(`passage:${id}:width`, open >= 5.0, `scan line across the throat at the passage floor (y ${r2(floor)}): ${r2(open)} m of walkable ground (contract >= 5.0)`);
  }
  check('surrounds:reachable', town.reached(0, 58) && town.reached(58, 22),
    `the moor outside both gates is reachable from the spawn — (0, 58) ${town.reached(0, 58)}, (58, 22) ${town.reached(58, 22)}`);

  /* ---- Q3: the street under the wall ---------------------------------- */
  const samples = [];
  for (let x = -46; x <= 46; x += 2) samples.push([x, 47.6], [x, -47.6]);
  for (let z = -46; z <= 46; z += 2) samples.push([47.6, z], [-47.6, z]);
  const sealedBy = [];
  let street = 0;
  for (const [x, z] of samples) {
    const y = groundAt(x, z, 0);
    /* only the STREET: a sample that lands on a stair-head landing is 5 m
     * up and its parapet is supposed to stop you there.  (This filter is
     * the fix for the check's own first false positive, which reported the
     * southgate turret's landing parapet as a sealed street.) */
    if (y > 1.0) continue;
    street += 1;
    if (!blocked(x, z, y)) continue;
    // name the culprit rather than counting: a parapet with no `bottom` and
    // a turret standing in the street look identical to a counter
    const hit = ctx.colliders.find((c) => colliderBlocks(c, x, z, y, RADIUS));
    sealedBy.push(`(${x}, ${z}) by ${hit?.bottom !== undefined ? 'a PARAPET' : (hit?.top !== undefined ? 'a PIER' : 'a solid mass')} ` +
      `x ${r2(hit.x0)}..${r2(hit.x1)} z ${r2(hit.z0)}..${r2(hit.z1)}`);
  }
  const byParapet = sealedBy.filter((s) => s.includes('PARAPET')).length;
  check('street:under-wall', byParapet === 0,
    `${street} street samples 1.2 m inside the curtain: ${sealedBy.length} blocked, ${byParapet} of them by a parapet ` +
    `(a parapet without \`bottom\` seals every one of them; the rest are the gatehouses' own turrets, which are buildings)` +
    `${sealedBy.length ? `\n      ${sealedBy.join('\n      ')}` : ''}`);

  let outerSealed = 0;
  const outer = [];
  for (let x = -46; x <= 46; x += 2) outer.push([x, 52.6], [x, -52.6]);
  for (let z = -46; z <= 46; z += 2) outer.push([52.6, z], [-52.6, z]);
  for (const [x, z] of outer) if (blocked(x, z, groundAt(x, z, 0))) outerSealed += 1;
  check('surrounds:under-wall', outerSealed === 0,
    `${outer.length} samples of the moor 1.4 m outside the curtain: ${outerSealed} blocked at feet height`);

  /* ---- Q4: a raised barricade leaves 1.8 m ---------------------------- */
  {
    const LANE_Z = 40;
    const bx0 = -1.6;
    const b = barricade({ w: 3.2, seed: 'gate-check', kind: 'carts', at: [bx0, LANE_Z], yaw: 0, ctx, gap: 1.8, state: 'down' });
    const nBefore = ctx.colliders.length;
    b.userData.raise();
    check('barricade:registers', ctx.colliders.length === nBefore + 1 && b.userData.state === 'up',
      `raise() registered ${ctx.colliders.length - nBefore} collider and the state is "${b.userData.state}"`);
    const rc = b.userData.rect;
    /* the DECLARED gap is the clear one, face to face — the same number the
     * kit's README uses for a gateway ("a gate needs 1.8 m of clear
     * face-to-face gap to be walkable").  What a body actually gets is that
     * minus one radius at the barrier's end, and both are reported, because
     * quoting only one of them is how a 1.8 m gap becomes a 0.42 m one. */
    const clear = (bx0 + 3.2 / 2) - rc.x1;
    const walkable = clear - RADIUS;
    check('barricade:gap', clear >= 1.8 - 1e-6 && walkable > 0.68,
      `raised, the clear end is ${r2(clear)} m face to face (contract 1.8) and ${r2(walkable)} m walkable — ` +
      `barrier x ${r2(rc.x0)}..${r2(rc.x1)} in a lane ending at ${r2(bx0 + 1.6)}`);
    b.userData.lower();
    check('barricade:lower', ctx.colliders.length === nBefore && b.userData.state === 'down',
      'lower() removed the collider again and the lane is clear');
    check('barricade:cover', b.userData.cover === true && b.userData.coverH >= 0.9,
      `tagged cover at ${b.userData.coverH} m (the referee's "behind cover" test reads that tag)`);
  }

  /* ---- budget --------------------------------------------------------- */
  let meshes = 0;
  let tris = 0;
  vignette.root.traverse((o) => {
    if (!o.isMesh) return;
    meshes += 1;
    tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
  });
  console.log(`\nwhole perimeter dressed: ${meshes} meshes, ${Math.round(tris)} triangles in the scene (terrain + stubs + siege kit)`);

  finish('SIEGE');
} catch (error) {
  console.error('[check-siege] crashed before checking:', error);
  process.exit(2);
}
