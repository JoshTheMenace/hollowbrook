#!/usr/bin/env node
/**
 * City integration gate (see references/city-scale.md).  Builds the whole
 * city headless — same boot as check-spatial.mjs — and runs every check
 * that only means something once the districts stand together:
 *
 *   1. plan validity (the validate-city-plan checks, so a stale plan
 *      cannot slip past this gate);
 *   2. composeCity's own asserts — module/plan match, anchor promises —
 *      which run during the build and fail it loudly;
 *   3. seam checks: ground continuity and corridor clearance at every
 *      socket pair (src/core/seams.js);
 *   4. the global spatial audit (src/core/spatialcheck.js) over the union
 *      of all envelopes, failures annotated with the owning district;
 *   5. a city-wide flood fill — collider BFS at the walker's own numbers
 *      (RADIUS 0.34, step 0.38, visited keyed on cell + height bucket),
 *      seeded from the first district's first waypoint, reaching EVERY
 *      district's waypoints.  A waypoint unreachable across a seam is the
 *      primary failure this whole system exists to catch: hand-picked
 *      routes test what you already believe, a flood fill does not;
 *   6. per-district budget checks against the plan's budgets;
 *  6b. ENTERABLE INTERIORS — for every `districts[].enterable[]` entry:
 *      an interior is actually registered near the declared door, the
 *      doorway leaves walkable ground once the player's radius is added
 *      to both jambs, the same flood fill REACHES the interior waypoint
 *      through it, the interior camera passes the standard camera gate,
 *      and the room carries at least `min_props` dressed props.  All of
 *      it with the interiors forced visible, because the dressing is
 *      distance-culled at runtime and a check is not the runtime;
 *   7. SURROUNDS COVERAGE — the spatial audit's hole grid samples only the
 *      union of envelopes, so the space BETWEEN and BEYOND them is checked
 *      by nothing, and `surrounds.owner` proves ownership was assigned,
 *      not discharged.  This samples the whole `city.footprint_m`; a hole
 *      outside every envelope reports against the surrounds owner;
 *   8. SIGHT CORRIDORS — each `sight_corridors[]` entry raycast from
 *      `from` to `to` at `min_clear_h` across `half_width`, naming which
 *      district's geometry blocks it.  This is how "the row must be able
 *      to see its own harbour" becomes checkable rather than aspirational;
 *   9. LANDMARK CONTRACTS — each district's `landmarks_citywide[]` raycast
 *      from every vista that names it and from sample points in every
 *      district that names it.  Before this the field had no reader;
 *  10. INTERACTIONS — a district that declares `interactions[]` and
 *      registers none fails.  The first city built this way shipped ZERO
 *      interactables and the runtime's whole KeyE system was dead code;
 *  11. UNDECLARED BOUNDARY FEATURES (warn) — two districts with tall
 *      geometry on the same shared edge and no `boundary_features` entry.
 *      It cannot be a FAIL, because a legitimate butt joint looks exactly
 *      the same from geometry alone — only the plan can tell them apart —
 *      but it would have caught the real double wall;
 *  12. TERMINATING SIGHT LINES (warn) — from every socket, along its
 *      crossing axis, into each side: what does the view END on?  A
 *      street that dies at a seam, a corridor that runs out into fog and
 *      an arch that frames a blank flank all read as unfinished, and none
 *      of them is a geometry defect, so nothing else here can see them.
 *      It prints what every terminus lands on and warns on the three
 *      cases that are never composed on purpose: nothing at all, an
 *      untagged mesh, and bare ground.  Advisory by construction — the
 *      real fix is editorial and a gate cannot tell a composed wall of
 *      one thing from a lazy one. It prints the list a coordinator reads.
 *
 *   node scripts/check-city.mjs                 # the whole city
 *   node scripts/check-city.mjs --district <id> # one district's subset
 *     (its envelope, its waypoints, its sockets, its budget — for a
 *     district agent mid-build; the scene composes with `only`, so its
 *     neighbours stand as stub massing)
 *
 *   exit 0 pass · 1 defects found · 2 crashed before checking
 *
 * Scene convention: the city's src/scene.js exports
 * buildVignette(scene, { only } = {}) — main.js still calls it with one
 * argument — whose return includes `groundAt`, `colliders` (owner-stamped
 * by composeCity) and `city: { order, stats, warnings, terrain }`.
 */

// Canvas2D no-op stub: geometry never depends on what a canvas contains.
const noop = () => stubContext;
const stubContext = new Proxy({}, {
  get: (t, prop) => {
    if (prop === 'canvas') return stubCanvas;
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    if (prop === 'measureText') return () => ({ width: 1 });
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return noop;
  },
  set: () => true,
});
const stubCanvas = new Proxy({ width: 2, height: 2 }, {
  get: (t, prop) => (prop === 'getContext' ? () => stubContext : (prop in t ? t[prop] : noop)),
  set: (t, prop, v) => ((t[prop] = v), true),
});
globalThis.document = { createElement: () => stubCanvas, createElementNS: () => stubCanvas };
globalThis.window = globalThis;
globalThis.self = globalThis;

import fs from 'node:fs';

const RADIUS = 0.34; // src/player.js
const STEP = 0.38;
const CELL = 0.35;
const MARGIN = 12;  // Hollowbrook: the spawn rings and both roads stand 6 m outside the envelopes; a 2 m margin would report them unreachable by construction (nightbloom TRAPS: widen the bounds when the town grows)

const districtArg = (() => {
  const i = process.argv.indexOf('--district');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const r2 = (v) => Math.round(v * 100) / 100;
let failed = false;
const section = (name) => console.log(`\n== ${name} ==`);
const FAIL = (msg) => { failed = true; console.log(`FAIL ${msg}`); };

try {
  /* ---- 1. the plan ---- */
  const planPath = new URL('../city-plan.json', import.meta.url);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const { validatePlan } = await import('./validate-city-plan.mjs');
  section('plan');
  const pv = validatePlan(plan);
  for (const f of pv.failures) FAIL(`plan: ${f}`);
  for (const w of pv.warnings ?? []) console.log(`WARN plan: ${w}`);
  if (pv.ok) console.log(`PASS plan valid — ${plan.districts.length} districts`);
  if (districtArg && !plan.districts.some((d) => d.id === districtArg)) {
    console.error(`[check-city] --district "${districtArg}" is not in the plan`);
    process.exit(2);
  }
  const selected = districtArg ? plan.districts.filter((d) => d.id === districtArg) : plan.districts;

  const envelopeOf = (x, z) => plan.districts.find((d) =>
    x >= d.envelope.x0 && x <= d.envelope.x1 && z >= d.envelope.z0 && z <= d.envelope.z1)?.id ?? 'no district';

  /* ---- 2. build (composeCity asserts run inside) ---- */
  section('build (composeCity anchors assert during it)');
  const THREE = await import('three');
  let vignette;
  const scene = new THREE.Scene();
  try {
    const { buildVignette } = await import('../src/scene.js');
    // `only` composes the named district in full and every other as its
    // stub massing — the isolated agent's own view of the city
    vignette = buildVignette(scene, districtArg ? { only: districtArg } : {});
    scene.updateMatrixWorld(true);
  } catch (error) {
    if (error.composeCity) {
      FAIL(error.message);
      console.log('\nRESULT: FAIL — the city did not finish building');
      process.exit(1);
    }
    throw error;
  }
  if (!vignette.city) {
    console.error('[check-city] scene.js did not return a `city` field — build the scene through composeCity');
    process.exit(2);
  }
  console.log(`PASS built in order: ${vignette.city.order.join(' -> ')}`);
  for (const w of vignette.city.warnings) {
    console.log(`WARN [${w.district}] ${w.kind}: ${w.detail}`);
  }

  /* ---- 3. seams ---- */
  section('seams');
  const { checkSeams } = await import('../src/core/seams.js');
  const seams = checkSeams({ plan, ctx: vignette, scene });
  // in --district mode, only the pairs that district is a party to count
  const seamResults = districtArg
    ? seams.results.filter((r) => r.owners.split(' <-> ').includes(districtArg))
    : seams.results;
  console.log(`seam check: ${seamResults.length} socket pair${seamResults.length === 1 ? '' : 's'}${districtArg ? ` involving ${districtArg}` : ''}`);
  for (const r of seamResults) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.socket} <> ${r.mate} [${r.kind}] at (${r.at.join(', ')}) — ${r.owners}`);
    for (const f of r.failures) console.log(`  - ${f}`);
  }
  if (seamResults.some((r) => !r.ok)) failed = true;
  else console.log('PASS — ground continuous and corridors clear at every socket');

  /* ---- 4. global spatial audit, owners resolved via envelope ---- */
  section(districtArg ? `spatial audit (${districtArg})` : 'spatial audit (whole city)');
  const { createSpatialCheck } = await import('../src/core/spatialcheck.js');
  const footprint = districtArg
    ? selected[0].envelope
    : plan.districts.reduce((acc, d) => ({
        x0: Math.min(acc.x0, d.envelope.x0), z0: Math.min(acc.z0, d.envelope.z0),
        x1: Math.max(acc.x1, d.envelope.x1), z1: Math.max(acc.z1, d.envelope.z1),
      }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
  const spatial = createSpatialCheck({
    scene,
    groundAt: vignette.groundAt,
    colliders: vignette.colliders,
    footprint,
    islandSets: vignette.auditIslands,
    linearSets: vignette.auditLinear,
    interiorFloors: vignette.interiorFloors,
    holeFloorY: vignette.holeFloorY,
  }).checkSpatial();
  console.log(spatial.report.split('\n')[0]);
  const inDistrict = (p) => !districtArg || envelopeOf(p[0], p[2] ?? p[1]) === districtArg;
  let spatialShown = 0;
  for (const f of spatial.failures) {
    if (!inDistrict(f.position)) continue;
    spatialShown += 1;
    FAIL(`${f.type} [owner: ${envelopeOf(f.position[0], f.position[2] ?? f.position[1])}] ${f.object} — ${f.detail} @ [${f.position.join(', ')}]`);
  }
  for (const w of spatial.warnings) {
    if (!inDistrict(w.position)) continue;
    console.log(`WARN ${w.type} [owner: ${envelopeOf(w.position[0], w.position[2] ?? w.position[1])}] ${w.object} — ${w.detail}`);
  }
  if (spatialShown === 0) console.log('PASS no spatial defects' + (districtArg ? ` inside ${districtArg}` : ''));

  /* ---- 5. flood fill over every district's waypoints ---- */
  section(districtArg ? `flood fill (${districtArg})` : 'flood fill (whole city)');
  const fillRect = districtArg
    ? { x0: selected[0].envelope.x0 - MARGIN, x1: selected[0].envelope.x1 + MARGIN,
        z0: selected[0].envelope.z0 - MARGIN, z1: selected[0].envelope.z1 + MARGIN }
    : { x0: footprint.x0 - MARGIN, x1: footprint.x1 + MARGIN, z0: footprint.z0 - MARGIN, z1: footprint.z1 + MARGIN };
  const seedWp = districtArg ? selected[0].waypoints[0] : plan.districts[0].waypoints[0];
  const seed = [seedWp.x, seedWp.z];
  const { colliders, groundAt } = vignette;

  // bucket the colliders — a fill that scans all of them per neighbour test
  // is quadratic and wedges long before it finishes
  const GRID = 4;
  const buckets = new Map();
  const bkey = (i, j) => `${i},${j}`;
  for (const c of colliders) {
    for (let i = Math.floor((c.x0 - RADIUS) / GRID); i <= Math.floor((c.x1 + RADIUS) / GRID); i += 1) {
      for (let j = Math.floor((c.z0 - RADIUS) / GRID); j <= Math.floor((c.z1 + RADIUS) / GRID); j += 1) {
        const k = bkey(i, j);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(c);
      }
    }
  }
  /* `y` is the feet height the fill has carried to this cell.  A collider
   * with `top` (a gatehouse pier UNDER the wall-walk) or `bottom` (a parapet
   * 5 m up over a street) is not a wall at every height — `colliderBlocks`
   * in src/builders.js is the one copy of that arithmetic, shared with the
   * player and with the nav grid.  Called with y === null it is exactly the
   * old height-blind check. */
  const { colliderBlocks } = await import('../src/builders.js');
  const blocked = (x, z, y = null) => {
    const list = buckets.get(bkey(Math.floor(x / GRID), Math.floor(z / GRID)));
    if (!list) return false;
    for (const c of list) if (colliderBlocks(c, x, z, y, RADIUS)) return true;
    return false;
  };

  // hoisted: the enterable gate below asks the SAME fill whether it got
  // inside each declared room, rather than running a second one that could
  // disagree with this one
  let reachedFn = null;
  const ci = (x) => Math.round((x - fillRect.x0) / CELL);
  const cj = (z) => Math.round((z - fillRect.z0) / CELL);
  const W = ci(fillRect.x1) + 1;
  const D = cj(fillRect.z1) + 1;
  if (blocked(seed[0], seed[1], groundAt(seed[0], seed[1]))) {
    FAIL(`the fill seed (${seed.join(', ')}) — "${seedWp.name}" — is inside a collider`);
  } else {
    // visited keyed on (cell, height bucket): one bit per cell cannot verify
    // a staircase — it claims the treads at ground height from the side and
    // then refuses to revisit them at the climb's height
    const seen = new Set();
    const reachable = new Map(); // cell -> best height reached
    const startY = groundAt(seed[0], seed[1]);
    const queue = [[ci(seed[0]), cj(seed[1]), startY]];
    seen.add(`${queue[0][0]},${queue[0][1]},${Math.round(startY / 0.3)}`);
    reachable.set(queue[0][0] * 100000 + queue[0][1], startY);
    let visits = 0;
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length) {
      const [i, j, y] = queue.pop();
      visits += 1;
      for (const [di, dj] of NB) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= D) continue;
        const nx = fillRect.x0 + ni * CELL;
        const nz = fillRect.z0 + nj * CELL;
        /* the third argument is the feet height the fill has carried here:
         * a platform out of reach above them is one this walker is
         * UNDERNEATH (the gate passage, with the wall-walk over it). */
        const ny = groundAt(nx, nz, y);
        if (blocked(nx, nz, ny)) continue;
        if (ny - y > STEP) continue; // too tall a rise to climb
        const k = `${ni},${nj},${Math.round(ny / 0.3)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const cellKey = ni * 100000 + nj;
        if (!reachable.has(cellKey) || reachable.get(cellKey) < ny) reachable.set(cellKey, ny);
        queue.push([ni, nj, ny]);
      }
    }
    console.log(`fill: ${reachable.size} cells reachable from "${seedWp.name}" (${seed.join(', ')}) over ` +
      `x ${r2(fillRect.x0)}..${r2(fillRect.x1)}, z ${r2(fillRect.z0)}..${r2(fillRect.z1)} at ${CELL} m, ` +
      `radius ${RADIUS}, step ${STEP} — ${visits} visits, ${colliders.length} colliders`);
    const reached = (x, z) => {
      for (let di = -1; di <= 1; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) {
          if (reachable.has((ci(x) + di) * 100000 + (cj(z) + dj))) return true;
        }
      }
      return false;
    };
    reachedFn = reached;
    for (const d of selected) {
      for (const w of d.waypoints) {
        const ok = reached(w.x, w.z);
        if (ok) console.log(`PASS [${d.id}] ${w.name} (${w.x}, ${w.z})`);
        else FAIL(`[${d.id}] waypoint "${w.name}" (${w.x}, ${w.z}) is UNREACHABLE from the seed — a route across a seam is broken`);
      }
    }
  }

  /* ---- 6. budgets ---- */
  section('budgets');
  for (const d of selected) {
    const s = vignette.city.stats[d.id];
    if (!s) { FAIL(`[${d.id}] no stats recorded — was the district built?`); continue; }
    const over = [];
    if (s.meshes > d.budgets.max_meshes) over.push(`meshes ${s.meshes} > ${d.budgets.max_meshes}`);
    if (s.triangles > d.budgets.max_triangles) over.push(`triangles ${s.triangles} > ${d.budgets.max_triangles}`);
    if (over.length) FAIL(`[${d.id}] over budget: ${over.join(', ')}`);
    else console.log(`PASS [${d.id}] ${s.meshes} meshes / ${d.budgets.max_meshes}, ${s.triangles} triangles / ${d.budgets.max_triangles}, ${s.colliders} colliders, ${s.platforms} platforms`);
  }

  /* ---- 6b. enterable interiors ---------------------------------------
   * A seamless walk-in interior is geometry in the same world, so every
   * gate here can already see it — provided three things are true, and
   * each one of them has a failure mode that renders perfectly:
   *
   *   REACHABLE.  A building's single footprint collider seals its own
   *     doorway.  The room is tiled, dressed, platformed and lit, the
   *     frame from the street shows an open door, and the only thing that
   *     ever says otherwise is the flood fill failing to get in.  So the
   *     interior waypoint is checked against the SAME fill the routes use,
   *     and the walkable width of the doorway is measured against the same
   *     collider list the walker resolves against.
   *   COMPOSED.  The interior camera goes through the standard camera gate
   *     with its own subject.  An interior nobody framed is a room lit by
   *     accident.
   *   DRESSED.  A declared interior that is a bare box is worse than a
   *     painted window: the player opened a door for it.  `min_props`
   *     (default 6) counts the tagged units registered inside.
   *
   * And all of it runs with interiors FORCED VISIBLE — the dressing is
   * distance-culled at runtime, and a check is not the runtime. */
  section('enterable interiors');
  {
    const { withInteriorsVisible, interiorsIn, countInteriorProps } = await import('../src/core/interior.js');
    const { createCameraCheck } = await import('../src/core/camcheck.js');
    const declared = selected.flatMap((d) => (d.enterable ?? []).map((en) => ({ d, en })));
    if (!declared.length) {
      console.log(`no enterable buildings declared${districtArg ? ` in ${districtArg}` : ''} — most buildings are not enterable, and that is correct`);
    }
    withInteriorsVisible(scene, () => {
      const registered = interiorsIn(scene);
      console.log(`${registered.length} interior${registered.length === 1 ? '' : 's'} registered in the scene, ${declared.length} declared in the plan`);
      for (const { d, en } of declared) {
        const tag = `[${d.id}] "${en.building}"`;
        const [dx, dz] = en.door.at;

        /* the registered interior nearest this door — matched by POSITION,
         * not by a naming convention nobody would keep */
        const near = registered
          .map((g) => ({ g, dist: Math.hypot(g.userData.interiorDoor[0] - dx, g.userData.interiorDoor[1] - dz) }))
          .sort((a, b) => a.dist - b.dist)[0];
        if (!near || near.dist > 3) {
          FAIL(`${tag} declares an enterable building and NO interior is registered within 3 m of its door ` +
            `(${dx}, ${dz})${near ? `; nearest is "${near.g.userData.interiorName}" ${r2(near.dist)} m away` : ''}. ` +
            'Call registerInterior(ctx, dressingGroup, { door: shell.doorway }) — without it the room is never ' +
            'culled, never force-visible in a gate, and invisible to this check.');
        } else {
          const props = countInteriorProps(near.g);
          const min = en.min_props ?? 6;
          if (props < min) {
            FAIL(`${tag} interior "${near.g.userData.interiorName}" registers ${props} dressed prop${props === 1 ? '' : 's'}, ` +
              `under the declared minimum of ${min}. A door the player opens onto a bare box is worse than a ` +
              'painted window — dress it from src/interiors.js (table, stool, shelf, counter, hearth, bed, ' +
              'crates, barrel, hanging lamp) and tag each unit.');
          } else {
            console.log(`PASS ${tag} interior "${near.g.userData.interiorName}" — ${props} dressed props, cull radius ${near.g.userData.interiorRadius} m`);
          }
        }

        /* walkable width THROUGH the doorway, measured on the collider
         * list the walker itself resolves against.  A door reads fine at
         * 0.9 m and leaves 0.22 m of ground once the player's 0.34 m
         * radius is added to both jambs. */
        const along = en.door.face[0] === 'z' ? [1, 0] : [0, 1];
        let lo = 0;
        let hi = 0;
        if (blocked(dx, dz)) {
          FAIL(`${tag} the doorway centre (${dx}, ${dz}) is INSIDE a collider — the wall was registered across its ` +
            'own opening. Derive the collider run from the same door parameters as the geometry ' +
            '(builders.js `enterableColliders`), never one box over the footprint.');
        } else {
          for (let t = 0.01; t < 3; t += 0.01) { if (blocked(dx + along[0] * t, dz + along[1] * t)) break; hi = t; }
          for (let t = 0.01; t < 3; t += 0.01) { if (blocked(dx - along[0] * t, dz - along[1] * t)) break; lo = t; }
          const clear = lo + hi;
          if (clear < 0.42) {
            FAIL(`${tag} doorway is ${r2(clear)} m of WALKABLE ground (the fill strides ${CELL} m, so it cannot ` +
              'even land in it). Widen the opening: clear walkable = opening − 0.68 m, so 1.4 m of opening is the ' +
              'working minimum.');
          } else if (clear < 0.7) {
            console.log(`WARN ${tag} doorway leaves ${r2(clear)} m of walkable ground — passable, but the fill ` +
              `strides ${CELL} m and may or may not land in it. 1.4 m of clear opening is the working minimum.`);
          } else {
            console.log(`PASS ${tag} doorway ${r2(clear)} m of walkable ground through the opening`);
          }
        }

        /* the route in */
        const wp = en.interior_waypoint;
        if (!reachedFn) {
          FAIL(`${tag} the flood fill did not run, so nothing checked the route into this interior`);
        } else if (reachedFn(wp.x, wp.z)) {
          console.log(`PASS ${tag} interior waypoint "${wp.name}" (${wp.x}, ${wp.z}) reached through the doorway`);
        } else {
          FAIL(`${tag} interior waypoint "${wp.name}" (${wp.x}, ${wp.z}) is UNREACHABLE. The room renders, the door ` +
            'renders, and nothing else in this suite can tell you: a shell registered as one footprint collider ' +
            'seals its own doorway. Check the collider run against the opening.');
        }

        /* the frame */
        const cam = en.interior_camera;
        if (cam) {
          const res = createCameraCheck({
            scene,
            cameras: { [cam.name]: cam },
            colliders,
            footprintHeight: vignette.footprintHeight ?? Infinity,
          }).checkCamera(cam.name);
          if (res.ok) console.log(`PASS ${tag} interior camera "${cam.name}" shows "${cam.subject}"`);
          else for (const f of res.failures) FAIL(`${tag} interior camera "${cam.name}": ${f}`);
          for (const w of res.warnings ?? []) console.log(`WARN ${tag} interior camera "${cam.name}": ${w}`);
        }
      }
    });
  }

  /* ================================================================= *
   * The city-wide checks: everything below is about the space BETWEEN
   * districts, which is precisely the space no district agent owns.
   * ================================================================= */

  const stubMode = !!districtArg;
  const raycaster = new THREE.Raycaster();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const shoot = (origin, target) => {
    const dir = target.clone().sub(origin);
    const far = dir.length();
    raycaster.set(origin, dir.normalize());
    raycaster.far = far;
    raycaster.near = 0;
    return raycaster.intersectObject(scene, true).find((h) => h.distance > 1e-3) ?? null;
  };
  const castDown = (x, z, fromY) => {
    raycaster.set(V(x, fromY, z), V(0, -1, 0));
    raycaster.far = fromY + 200;
    return raycaster.intersectObject(scene, true).find((h) => h.distance > 1e-3) ?? null;
  };
  /* composeCity renames every group `district:<id>:<base>` and stamps every
   * anonymous mesh `<id>:<group>:<n>`, so a hit can always name its owner —
   * "blocked by pool-0" named nothing until it did. */
  const districtIds = new Set(plan.districts.map((d) => d.id));
  const ownerOf = (object) => {
    for (let o = object; o; o = o.parent) {
      const n = typeof o.name === 'string' ? o.name : '';
      if (n.startsWith('terrain')) return 'terrain';
      const m = /^district:([a-z0-9-]+):/.exec(n);
      if (m && districtIds.has(m[1])) return m[1];
      const m2 = /^([a-z0-9-]+):/.exec(n);
      if (m2 && districtIds.has(m2[1])) return m2[1];
    }
    return 'unowned';
  };
  const nameOf = (object) => {
    for (let o = object; o; o = o.parent) if (o.name) return o.name;
    return '(unnamed)';
  };
  const inSubtree = (object, root) => {
    for (let o = object; o; o = o.parent) if (o === root) return true;
    return false;
  };

  /* ---- 7. surrounds coverage ----------------------------------------
   * The spatial audit samples the union of ENVELOPES. Everything between
   * and beyond them — which is the majority of most city footprints, and
   * all of the sea/moor/backdrop — was checked by nothing at all. */
  section('surrounds coverage (the whole footprint, not the parcels)');
  {
    // the WHOLE city, never the selected district: this check exists for
    // the ground nobody's envelope covers
    const u = plan.districts.reduce((acc, d) => ({
      x0: Math.min(acc.x0, d.envelope.x0), z0: Math.min(acc.z0, d.envelope.z0),
      x1: Math.max(acc.x1, d.envelope.x1), z1: Math.max(acc.z1, d.envelope.z1),
    }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
    const [fw, fd] = plan.city.footprint_m;
    const mx = (u.x0 + u.x1) / 2;
    const mz = (u.z0 + u.z1) / 2;
    const rect = {
      x0: Math.min(u.x0, mx - fw / 2), x1: Math.max(u.x1, mx + fw / 2),
      z0: Math.min(u.z0, mz - fd / 2), z1: Math.max(u.z1, mz + fd / 2),
    };
    const levels = (plan.terrain?.levels ?? []).map((l) => l.y).filter((v) => typeof v === 'number');
    const FLOOR_Y = (levels.length ? Math.min(...levels) : 0) - 3;
    const GRID = 1.5;
    const owner = plan.surrounds?.owner ?? 'nobody';
    const holes = [];
    let samples = 0;
    for (let x = rect.x0 + GRID / 2; x < rect.x1; x += GRID) {
      for (let z = rect.z0 + GRID / 2; z < rect.z1; z += GRID) {
        samples += 1;
        const hit = castDown(x, z, 120);
        if (hit && hit.point.y >= FLOOR_Y) continue;
        const inside = envelopeOf(x, z);
        holes.push({ x, z, y: hit ? hit.point.y : null, owner: inside === 'no district' ? `surrounds (${owner})` : inside });
      }
    }
    console.log(`sampled ${samples} points at ${GRID} m over x ${r2(rect.x0)}..${r2(rect.x1)}, z ${r2(rect.z0)}..${r2(rect.z1)} ` +
      `(footprint_m ${fw}×${fd}); floor threshold y ${r2(FLOOR_Y)}`);
    if (!holes.length) console.log(`PASS ground everywhere in the footprint — nothing ends in a cut, surrounds owner "${owner}"`);
    else {
      const byOwner = new Map();
      for (const h of holes) byOwner.set(h.owner, (byOwner.get(h.owner) ?? 0) + 1);
      for (const [who, n] of byOwner) {
        const first = holes.find((h) => h.owner === who);
        FAIL(`GROUND HOLE [owner: ${who}] ${n} sample${n === 1 ? '' : 's'} with no surface ` +
          `(${(n * GRID * GRID).toFixed(0)} m²), first at (${r2(first.x)}, ${r2(first.z)})` +
          `${first.y === null ? ' — nothing below at all' : ` — first surface at y ${r2(first.y)}, under the floor threshold`}`);
      }
    }
  }

  /* ---- 8. sight corridors -------------------------------------------
   * A cross-district requirement written into ONE district's brief is a
   * requirement that agent cannot honour. */
  section('sight corridors');
  {
    const list = (plan.sight_corridors ?? []).filter((c) => !stubMode || (c.districts ?? []).includes(districtArg));
    if (!list.length) console.log(`no sight corridors declared${stubMode ? ` crossing ${districtArg}` : ''}`);
    for (const c of list) {
      const [fx, fz] = c.from;
      const [tx, tz] = c.to;
      const len = Math.hypot(tx - fx, tz - fz);
      const nx = -(tz - fz) / len;
      const nz = (tx - fx) / len;
      const hw = c.half_width;
      const offsets = [-hw, -hw / 2, 0, hw / 2, hw];
      const blocks = [];
      for (const o of offsets) {
        const a = V(fx + nx * o, c.min_clear_h, fz + nz * o);
        const b = V(tx + nx * o, c.min_clear_h, tz + nz * o);
        const hit = shoot(a, b);
        if (hit && hit.distance < len - 0.15) {
          blocks.push(`offset ${o >= 0 ? '+' : ''}${r2(o)} m blocked ${r2(hit.distance)} m along by ` +
            `"${nameOf(hit.object)}" [owner: ${ownerOf(hit.object)}] at (${r2(hit.point.x)}, ${r2(hit.point.z)})`);
        }
      }
      if (!blocks.length) {
        console.log(`PASS ${c.id} — ${r2(len)} m clear at y ${c.min_clear_h} across ±${hw} m ` +
          `[crosses ${(c.districts ?? []).join(', ')}]`);
      } else {
        FAIL(`SIGHT CORRIDOR BLOCKED "${c.id}" (${c.why ?? 'no reason given'}) — ${blocks.join('; ')}`);
      }
    }
  }

  /* ---- 9. landmark contracts ----------------------------------------- */
  section('landmark contracts');
  {
    let any = 0;
    const vistas = new Map((plan.vista_cameras ?? []).map((v) => [v.name, v]));
    for (const d of selected) {
      for (const l of d.landmarks_citywide ?? []) {
        if (typeof l === 'string' || !l?.object) continue; // the validator already failed it
        any += 1;
        const target = scene.getObjectByName(l.object);
        if (!target) {
          FAIL(`LANDMARK MISSING [${d.id}] "${l.object}" is not in the scene — nothing with that name was added ` +
            '(composeCity names a district group `district:<id>:<name>`)');
          continue;
        }
        const box = new THREE.Box3().setFromObject(target);
        if (box.isEmpty()) { FAIL(`LANDMARK EMPTY [${d.id}] "${l.object}" has no geometry to see`); continue; }
        const c = box.getCenter(new THREE.Vector3());
        const top = c.clone(); top.y = box.max.y - (box.max.y - box.min.y) * 0.2;
        const aims = [top, c];
        const visibleFrom = (origin) => {
          for (const aim of aims) {
            const hit = shoot(origin, aim);
            if (!hit) return { ok: true };
            if (inSubtree(hit.object, target)) return { ok: true };
            if (hit.distance >= origin.distanceTo(aim) - 0.3) return { ok: true };
          }
          const hit = shoot(origin, top);
          return { ok: false, hit };
        };
        for (const vname of l.must_read_from_vistas ?? []) {
          const v = vistas.get(vname);
          if (!v) { FAIL(`LANDMARK [${d.id}] "${l.object}" names vista "${vname}", which is not in the plan`); continue; }
          const res = visibleFrom(V(...v.position));
          if (res.ok) console.log(`PASS [${d.id}] "${l.object}" reads from vista "${vname}"`);
          else {
            FAIL(`LANDMARK NOT VISIBLE [${d.id}] "${l.object}" from vista "${vname}" at [${v.position.join(', ')}] — ` +
              `blocked by "${nameOf(res.hit.object)}" [owner: ${ownerOf(res.hit.object)}] ${r2(res.hit.distance)} m out`);
          }
        }
        for (const from of l.must_read_from_districts ?? []) {
          const src = plan.districts.find((x) => x.id === from);
          if (!src) { FAIL(`LANDMARK [${d.id}] "${l.object}" names district "${from}", which is not in the plan`); continue; }
          /* sample points: that district's own waypoints, at eye height.
           * "Must read from the row" is a claim about standing in the row,
           * and its waypoints are the places the plan says you stand. */
          const pts = src.waypoints.map((w) => V(w.x, vignette.groundAt(w.x, w.z) + 1.7, w.z));
          const seenFrom = [];
          const blindAt = [];
          for (const [i, p] of pts.entries()) {
            const res = visibleFrom(p);
            if (res.ok) seenFrom.push(src.waypoints[i].name);
            else blindAt.push(`"${src.waypoints[i].name}" (blocked by "${nameOf(res.hit.object)}" [${ownerOf(res.hit.object)}])`);
          }
          if (!seenFrom.length) {
            FAIL(`LANDMARK NOT VISIBLE [${d.id}] "${l.object}" from ANY of ${pts.length} sample points in "${from}" — ${blindAt.join('; ')}`);
          } else {
            console.log(`PASS [${d.id}] "${l.object}" reads from ${seenFrom.length}/${pts.length} points in "${from}" (${seenFrom.join(', ')})`);
            if (seenFrom.length * 2 < pts.length) {
              console.log(`WARN [${d.id}] "${l.object}" is hidden from most of "${from}": ${blindAt.join('; ')}`);
            }
          }
        }
      }
    }
    if (!any) console.log('no landmark contracts declared' + (districtArg ? ` for ${districtArg}` : ''));
  }

  /* ---- 10. interactions ---------------------------------------------- */
  section('interactions');
  for (const d of selected) {
    const declared = (d.interactions ?? []).length;
    const built = vignette.city.stats[d.id]?.interactables ?? 0;
    if (declared > 0 && built === 0) {
      FAIL(`[${d.id}] declares ${declared} interaction${declared === 1 ? '' : 's'} in the plan ` +
        `(${d.interactions.map((i) => `"${i.name}"`).join(', ')}) and registered NONE. ` +
        'The runtime raycasts `interactables` every frame; a city where nobody registers one leaves that ' +
        'whole system as dead code — which is exactly what the first city built this way shipped. ' +
        'Register it with ctx.interact({ label, hitbox, action }).');
    } else if (declared === 0) {
      console.log(`WARN [${d.id}] declares no interactions in the plan — every district contributes at least one`);
    } else {
      console.log(`PASS [${d.id}] ${built} interactable${built === 1 ? '' : 's'} registered for ${declared} declared`);
    }
  }

  /* ---- 11. undeclared boundary features (WARN only) ------------------
   * Two districts each raising a wall on the same line composed correctly
   * only by luck in the first city built this way.  This cannot be a FAIL:
   * a legitimate butt joint — one district's wall, the other's building
   * face right behind it — looks identical from geometry alone, and only
   * the plan can tell the two apart.  So it points at the line and asks. */
  section('boundary features (declared vs. built)');
  if (stubMode) console.log(`skipped — "${districtArg}" is composed against stub massing, so a shared edge has no real neighbour on it`);
  else {
    const TALL_M = 0.5;
    const NEAR_M = 0.5;
    const MIN_RUN_M = 2;
    const byDistrict = new Map(plan.districts.map((d) => [d.id, []]));
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const owner = ownerOf(o);
      if (!byDistrict.has(owner)) return;      // terrain and unowned are not features
      box.setFromObject(o);
      if (box.isEmpty() || box.max.y - box.min.y <= TALL_M) return;
      byDistrict.get(owner).push({ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, name: nameOf(o) });
    });
    const merge = (spans) => {
      const s = spans.slice().sort((a, b) => a[0] - b[0]);
      const out = [];
      for (const [a, b] of s) {
        if (out.length && a <= out[out.length - 1][1] + 0.1) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
        else out.push([a, b]);
      }
      return out;
    };
    const declared = plan.boundary_features ?? [];
    let pairs = 0;
    let flagged = 0;
    for (let i = 0; i < plan.districts.length; i += 1) {
      for (let j = i + 1; j < plan.districts.length; j += 1) {
        const A = plan.districts[i];
        const B = plan.districts[j];
        const a = A.envelope;
        const b = B.envelope;
        for (const axis of ['x', 'z']) {
          const [aLo, aHi, bLo, bHi] = axis === 'x' ? [a.x0, a.x1, b.x0, b.x1] : [a.z0, a.z1, b.z0, b.z1];
          const edge = Math.abs(aHi - bLo) <= 0.05 ? aHi : Math.abs(aLo - bHi) <= 0.05 ? aLo : null;
          if (edge === null) continue;
          const along = axis === 'x' ? 'z' : 'x';
          const [pLo, pHi] = along === 'z'
            ? [Math.max(a.z0, b.z0), Math.min(a.z1, b.z1)]
            : [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)];
          if (pHi - pLo <= 0.05) continue;
          pairs += 1;
          const spansOf = (id) => merge(byDistrict.get(id)
            .filter((m) => (axis === 'x' ? m.x0 - NEAR_M <= edge && edge <= m.x1 + NEAR_M
              : m.z0 - NEAR_M <= edge && edge <= m.z1 + NEAR_M))
            .map((m) => (along === 'z'
              ? [Math.max(m.z0, pLo), Math.min(m.z1, pHi)]
              : [Math.max(m.x0, pLo), Math.min(m.x1, pHi)]))
            .filter(([s, e2]) => e2 > s));
          const sa = spansOf(A.id);
          const sb = spansOf(B.id);
          for (const [a0, a1] of sa) {
            for (const [b0, b1] of sb) {
              const lo = Math.max(a0, b0);
              const hi = Math.min(a1, b1);
              if (hi - lo < MIN_RUN_M) continue;
              const covered = declared.some((f) => f.along === along && Math.abs(f.at - edge) <= 0.05 &&
                f.from <= lo + 0.1 && f.to >= hi - 0.1 &&
                ((f.owner === A.id && f.mate === B.id) || (f.owner === B.id && f.mate === A.id)));
              if (covered) continue;
              flagged += 1;
              console.log(`WARN UNDECLARED BOUNDARY FEATURE: "${A.id}" and "${B.id}" both have geometry over ` +
                `${TALL_M} m tall within ${NEAR_M} m of their shared ${axis} = ${r2(edge)} edge, overlapping over ` +
                `${along} ${r2(lo)}..${r2(hi)} (${r2(hi - lo)} m). If that is one wall it belongs to ONE of them — ` +
                `add a boundary_features entry { along: "${along}", at: ${r2(edge)}, from: ${r2(lo)}, to: ${r2(hi)}, ` +
                'owner, mate }. If it is genuinely two things butted together, declare it anyway and say so: both ' +
                'building it is a double wall, neither is a gap, and no gate can tell those apart from geometry.');
            }
          }
        }
      }
    }
    if (!flagged) console.log(`PASS ${pairs} shared edge${pairs === 1 ? '' : 's'} — no undeclared double-build on any of them`);
  }

  /* ---- 12. terminating sight lines (WARN only) -----------------------
   * "Every terminating sight line must land on a subject somebody
   * composed" is the rule; this is the checkable half of it.
   *
   * Composition is the heaviest district weight and the only category
   * that did NOT improve as the pipeline scaled, and the repeated,
   * specific failure is that a sight line's FAR END belongs to nobody: a
   * lane, a socket or an arch is composed by the district that owns the
   * near end, and whatever sits at the far end was placed by a different
   * agent for a different reason.  The reviewer's worst seam in a whole
   * town was "no path, no destination, nothing to look at" — geometrically
   * flawless, and every gate green.
   *
   * So: stand at each socket at eye height, look along the crossing axis
   * into each side, and print what closes the view.  A 5-ray fan across
   * the socket's own width, because one ray down the middle finds a lamp
   * post and calls it a terminus.
   *
   * WARN, never FAIL.  A deliberate wall of one thing is a composition
   * and no gate can tell it from a lazy one; what a gate CAN do is put
   * the list in front of a coordinator, which is what this does. */
  section('terminating sight lines (what closes each view — advisory)');
  {
    const EYE_M = 1.7;
    const CORRIDOR_DEPTH_M = 3;      // src/core/seams.js
    /* The near zone the seam check already guarantees is clear is 3 m each
     * side, and 3x that is still inside the seam.  A terminus is whatever
     * closes the view, which on a town this size is tens of metres out, so
     * the fan reaches REACH_M and the ×3 figure is only the floor. */
    const REACH_M = Math.max(CORRIDOR_DEPTH_M * 3, 45);
    const NEAR_TERMINUS_M = 6;       // closer than this is a wall in your face, not a view
    const FAN = [-0.5, -0.25, 0, 0.25, 0.5]; // fractions of the socket width
    const kindOf = (object) => {
      for (let o = object; o; o = o.parent) if (o.userData && o.userData.kind) return String(o.userData.kind);
      return null;
    };
    /* An interaction hitbox is an invisible box and three's raycaster hits
     * it anyway (it tests layers, not `visible`).  The first version of
     * this pass reported spellward's cauldron hitbox as what closes the
     * spell lane, which is a terminus nobody can see. */
    const drawn = (object) => {
      for (let o = object; o; o = o.parent) if (o.visible === false) return false;
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      return mats.some((m) => m && m.visible !== false && (m.opacity ?? 1) > 0.05);
    };
    const shootVisible = (origin, target) => {
      const dir = target.clone().sub(origin);
      const far = dir.length();
      raycaster.set(origin, dir.normalize());
      raycaster.far = far;
      raycaster.near = 0;
      return raycaster.intersectObject(scene, true).find((h) => h.distance > 1e-3 && drawn(h.object)) ?? null;
    };
    // how far the town itself runs, so a ray that leaves it can say so
    const town = plan.districts.reduce((acc, d) => ({
      x0: Math.min(acc.x0, d.envelope.x0), z0: Math.min(acc.z0, d.envelope.z0),
      x1: Math.max(acc.x1, d.envelope.x1), z1: Math.max(acc.z1, d.envelope.z1),
    }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
    const rows = [];
    const seenPair = new Set();
    for (const d of selected) {
      for (const s of d.sockets ?? []) {
        const key = [s.id, s.mate].sort().join('|');
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        const [sx, sz] = s.at;
        const axis = s.axis === 'x' ? [1, 0] : [0, 1];
        const tang = s.axis === 'x' ? [0, 1] : [1, 0];
        for (const dir of [1, -1]) {
          const hits = [];
          for (const f of FAN) {
            const ox = sx + tang[0] * f * s.width;
            const oz = sz + tang[1] * f * s.width;
            const y = vignette.groundAt(ox, oz) + EYE_M;
            const origin = V(ox, y, oz);
            const aim = V(ox + axis[0] * dir * REACH_M, y, oz + axis[1] * dir * REACH_M);
            const hit = shootVisible(origin, aim);
            if (!hit) { hits.push({ what: '(nothing — open sky or fog)', owner: 'nobody', dist: null }); continue; }
            const k = kindOf(hit.object);
            const owner = ownerOf(hit.object);
            hits.push({
              what: k ?? nameOf(hit.object),
              tagged: !!k,
              terrain: owner === 'terrain',
              owner,
              dist: hit.distance,
            });
          }
          const tally = new Map();
          for (const h of hits) tally.set(h.what, (tally.get(h.what) ?? 0) + 1);
          const [what, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
          const sample = hits.find((h) => h.what === what);
          const dists = hits.filter((h) => h.dist !== null).map((h) => h.dist);
          const meanDist = dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : null;
          const into = dir > 0 ? `+${s.axis}` : `-${s.axis}`;
          rows.push({ socket: s.id, owner: d.id, into, what, n, sample, meanDist, hits });
          const where = `[${d.id}] ${s.id} looking ${into} from (${sx}, ${sz})`;
          const dist = meanDist === null ? `nothing within ${REACH_M} m`
            : `the ${dists.length} that hit average ${r2(meanDist)} m`;
          console.log(`  ${where} -> ${n}/5 rays land on "${what}" [owner: ${sample.owner}], ${dist}`);
          const blanks = hits.filter((h) => h.dist === null).length;
          /* A ray that leaves the city footprint has not found "nothing" so
           * much as run out of town, and that is a different note to write:
           * the terminus belongs to the surrounds owner, not to the two
           * districts either side of the seam. */
          const runOut = s.axis === 'x'
            ? (dir > 0 ? town.x1 - sx : sx - town.x0)
            : (dir > 0 ? town.z1 - sz : sz - town.z0);
          const escapes = blanks >= 3 && runOut < REACH_M;
          if (escapes) {
            console.log(`WARN TERMINUS [${d.id}] "${s.id}" looking ${into}: ${blanks}/5 rays leave the city ` +
              `${r2(runOut)} m out and hit nothing at all — this axis runs off the edge of the town. ` +
              `That terminus belongs to the surrounds owner ("${plan.surrounds?.owner ?? 'nobody'}"): a treeline, a ` +
              'ridge, a wall, something that says the town stops here on purpose. Otherwise the view ends in fog.');
          } else if (blanks >= 3) {
            console.log(`WARN TERMINUS [${d.id}] "${s.id}" looking ${into}: ${blanks}/5 rays hit NOTHING inside ${REACH_M} m ` +
              `with ${r2(runOut)} m of town still to cross. The view out of this socket ends in fog. Give it something ` +
              'composed to land on — a landmark face, a gate, a tree stand, a wall with a reason.');
          } else if (n >= 3 && !sample.tagged && !sample.terrain) {
            console.log(`WARN TERMINUS [${d.id}] "${s.id}" looking ${into}: ${n}/5 rays land on "${what}" ` +
              `[owner: ${sample.owner}], which carries no userData.kind — it is an untagged mesh, not a composed subject. ` +
              'What closes a view should be something a kit generator made on purpose.');
          } else if (n >= 4 && sample.terrain && meanDist !== null && meanDist > 12) {
            console.log(`WARN TERMINUS [${d.id}] "${s.id}" looking ${into}: ${n}/5 rays land on bare terrain ` +
              `${r2(meanDist)} m out. A ground plate is not a subject; the view along this axis ends on nothing built.`);
          } else if (meanDist !== null && meanDist < NEAR_TERMINUS_M) {
            console.log(`WARN TERMINUS [${d.id}] "${s.id}" looking ${into}: the view closes at ${r2(meanDist)} m on ` +
              `"${what}". That is a wall in the face rather than a terminus — check the frame from this socket.`);
          }
        }
      }
    }
    console.log(`${rows.length} terminating sight lines walked at ${EYE_M} m eye, 5-ray fan across each socket's width, ` +
      `${REACH_M} m reach. The rule is editorial and is stated in references/city-scale.md: every terminating sight ` +
      'line must land on a subject somebody composed.');
  }

  console.log(`\nRESULT: ${failed ? 'FAIL — defects above' : 'PASS — plan, anchors, seams, spatial audit, routes, budgets, surrounds, sight corridors, landmarks and interactions all green'}`);
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error('[check-city] crashed before checking:', error);
  process.exit(2);
}
