#!/usr/bin/env node
/**
 * Terrain gate — the coordinator's stage, proven before any district.
 * Builds the town headless (districts may be stubs) and checks the ground:
 *
 *   1. every plan anchor answers its promised height (composeCity already
 *      throws on a miss; this prints them as numbers);
 *   2. seams: ground continuity and corridor clearance at every socket
 *      pair (src/core/seams.js) — the wall-walk sockets included;
 *   3. THE WALL-WALK: every walk shelf's centreline reads the walk height
 *      at 1 m spacing; both gate gaps read the street; the whole walk is
 *      one connected surface — a 0.35 m fill seeded on the south walk
 *      reaches every stair-head landing and every corner;
 *   4. every internal climb is walked foot to head at the walker's step
 *      limit (traceClimb) and lands on its shelf at the promised height;
 *   5. the market's floor and rims, the keep's two shelves, exact;
 *   6. surrounds coverage: a down-cast over the whole footprint finds ground
 *      everywhere (a hole outside every envelope is the surrounds owner's);
 *   7. the terrain's own stats, for the record.
 *
 *   node scripts/check-terrain.mjs      # exit 0 pass · 1 defects · 2 crashed
 */
import { bootCity, makeChecker } from './lib/headless.mjs';

const r2 = (v) => Math.round(v * 100) / 100;
const { check, finish } = makeChecker();

try {
  const { THREE, scene, vignette, plan } = await bootCity();
  const { groundAt, colliders } = vignette;
  const terrain = vignette.city.terrain;
  const WALK_Y = plan.siege?.wall_walk_y ?? 5.0;

  /* ---- 1. anchors ---- */
  for (const d of plan.districts) {
    for (const a of d.anchors ?? []) {
      const y = groundAt(a.x, a.z);
      check(`anchor:${d.id}:(${a.x},${a.z})`, Math.abs(y - a.expect_top) <= (a.tol ?? 0.05), `expected ${a.expect_top}, ground ${r2(y)}`);
    }
  }

  /* ---- 2. seams ---- */
  const { checkSeams } = await import('../src/core/seams.js');
  const seams = checkSeams({ plan, ctx: vignette, scene });
  for (const s of seams.results) {
    check(`seam:${s.socket}<>${s.mate}`, s.ok, s.ok ? `[${s.kind}] at (${s.at.join(', ')}) continuous and clear` : s.failures.join('; '));
  }

  /* ---- 3. the wall-walk ---- */
  const { wallWalkShelves, landingShelves, traceClimb } = await import('../src/terrain.js');
  const walks = wallWalkShelves(plan);
  let samples = 0;
  let off = [];
  for (const s of walks) {
    const alongX = (s.x1 - s.x0) > (s.z1 - s.z0);
    const cx = (s.x0 + s.x1) / 2;
    const cz = (s.z0 + s.z1) / 2;
    const lo = alongX ? s.x0 + 0.5 : s.z0 + 0.5;
    const hi = alongX ? s.x1 - 0.5 : s.z1 - 0.5;
    for (let a = lo; a <= hi; a += 1) {
      const x = alongX ? a : cx;
      const z = alongX ? cz : a;
      samples += 1;
      const y = groundAt(x, z);
      if (Math.abs(y - WALK_Y) > 0.01) off.push(`(${r2(x)}, ${r2(z)}) reads ${r2(y)} in ${s.in}`);
    }
  }
  check('walk:height', off.length === 0, off.length ? `${off.length}/${samples} samples off the walk height: ${off.slice(0, 4).join('; ')}` : `${samples} samples along ${walks.length} shelves all read ${WALK_Y}`);
  for (const [id, g] of Object.entries(plan.siege?.gates ?? {})) {
    const gx = (g.gap.x0 + g.gap.x1) / 2;
    const gz = (g.gap.z0 + g.gap.z1) / 2;
    const y = groundAt(gx, gz);
    const level = plan.terrain.levels.find((l) => l.id === g.district).y;
    check(`walk:gap:${id}`, Math.abs(y - level) < 0.01, `gap centre (${gx}, ${gz}) reads ${r2(y)} — the passage is open until the kit's gatehouse bridges it at ${WALK_Y}`);
  }
  // connectivity: a walker's fill along the walk (same numbers as check-city)
  const { buildNavGrid, reachableFrom } = await import('../src/game/nav.js');
  const fp = vignette.footprint;
  const grid = buildNavGrid({ colliders, groundAt, rect: { x0: fp.x0 - 2, z0: fp.z0 - 2, x1: fp.x1 + 2, z1: fp.z1 + 2 } });
  /* The gate gaps read the street until the kit's gatehouses bridge them, and
   * descent is free while a 5 m climb is not — so a fill seeded on one side
   * of a gap drops into the passage and cannot come back up.  Seed BOTH
   * sides of the south gate and take the union: the walk is then two
   * segments that the two gatehouses join, and every landing and corner has
   * to be on one of them. */
  const seedX = -10, seedZ = 50;
  const walkReachW = reachableFrom(grid, seedX, seedZ);
  const walkReachE = reachableFrom(grid, 10, 50);
  const walkReach = walkReachW.map((v, i) => v | walkReachE[i]);
  const reachedAt = (x, z) => {
    const [i, j] = grid.toCell(x, z);
    for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) {
      if (grid.inside(i + di, j + dj) && walkReach[grid.index(i + di, j + dj)] && Math.abs(grid.y[grid.index(i + di, j + dj)] - WALK_Y) < 0.05) return true;
    }
    return false;
  };
  for (const s of landingShelves(plan)) {
    const x = (s.x0 + s.x1) / 2;
    const z = (s.z0 + s.z1) / 2;
    check(`walk:landing:${s.in}`, reachedAt(x, z), `stair-head landing (${x}, ${z}) ${reachedAt(x, z) ? 'reached along the walk' : 'NOT reached along the walk from (' + seedX + ', ' + seedZ + ')'}`);
  }
  for (const t of plan.siege?.corner_towers ?? []) {
    const [x, z] = t.at;
    check(`walk:corner:${t.id}`, reachedAt(x, z), `corner (${x}, ${z}) ${reachedAt(x, z) ? 'reached along the walk' : 'NOT reached along the walk'}`);
  }
  // and the walk must be reachable FROM THE STREET by every stair: seed at the spawn
  const spawn = plan.game?.player?.spawn ?? [0, 30];
  const streetReach = reachableFrom(grid, spawn[0], spawn[1]);
  const streetReachedAt = (x, z) => {
    const [i, j] = grid.toCell(x, z);
    return grid.inside(i, j) && streetReach[grid.index(i, j)] === 1;
  };
  for (const s of landingShelves(plan)) {
    const x = (s.x0 + s.x1) / 2;
    const z = (s.z0 + s.z1) / 2;
    check(`walk:from-street:${s.in}`, streetReachedAt(x, z), `landing (${x}, ${z}) ${streetReachedAt(x, z) ? 'reachable from the spawn' : 'UNREACHABLE from the spawn (' + spawn.join(', ') + ')'}`);
  }

  /* ---- 4. every internal climb, walked ---- */
  for (const c of plan.terrain.crossings) {
    if (c.socket !== undefined) continue;
    const t = traceClimb(groundAt, c);
    check(`climb:${c.id}`, t.ok, `run ${r2(t.run)} m, worst rise ${r2(t.worst)} (limit 0.38), feet end at ${r2(t.reachedY)}, shelf beyond the head reads ${r2(t.headY)} (promised ${c.to})`);
  }

  /* ---- 5. the named flats, exact ---- */
  const exact = [
    ['market floor', 0, -2, -1.4], ['market north rim', 6, -15, 0], ['market south rim', 8, 12, 0],
    ['market west rim', -14, -6, 0], ['market east rim', 15, 0, 0],
    ['keep lower ward', -10, -30, 2.6], ['keep platform', 4, -36, 5.2], ['keep platform east', 12, -30, 5.2],
  ];
  for (const [name, x, z, want] of exact) {
    const y = groundAt(x, z);
    check(`flat:${name}`, Math.abs(y - want) < 0.005, `(${x}, ${z}) reads ${r2(y)} (promised ${want})`);
  }
  // the mound is EXACTLY zero on the shelves (moundAt is exported for this)
  let lifted = 0;
  for (const S of plan.terrain.shelves) {
    for (let x = S.x0 + 0.2; x < S.x1; x += 1.3) for (let z = S.z0 + 0.2; z < S.z1; z += 1.3) if (Math.abs(terrain.moundAt(x, z)) > 1e-9) lifted += 1;
  }
  check('mound:zero-on-shelves', lifted === 0, lifted ? `${lifted} shelf samples lifted by the mound` : 'no shelf sample moved by the mound');

  /* ---- 6. surrounds coverage ---- */
  {
    const raycaster = new THREE.Raycaster();
    const [fw, fd] = plan.city.footprint_m;
    const mx = (fp.x0 + fp.x1) / 2;
    const mz = (fp.z0 + fp.z1) / 2;
    const rect = { x0: Math.min(fp.x0, mx - fw / 2), x1: Math.max(fp.x1, mx + fw / 2), z0: Math.min(fp.z0, mz - fd / 2), z1: Math.max(fp.z1, mz + fd / 2) };
    const FLOOR_Y = Math.min(...plan.terrain.levels.map((l) => l.y)) - 3;
    const GRID = 2;
    let n = 0;
    const holes = [];
    for (let x = rect.x0 + 1; x < rect.x1; x += GRID) {
      for (let z = rect.z0 + 1; z < rect.z1; z += GRID) {
        n += 1;
        raycaster.set(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
        raycaster.far = 400;
        const hit = raycaster.intersectObject(scene, true).find((h) => h.distance > 1e-3);
        if (!hit || hit.point.y < FLOOR_Y) holes.push([x, z]);
      }
    }
    check('surrounds:coverage', holes.length === 0, holes.length ? `${holes.length}/${n} samples over the footprint have no ground (first at ${holes[0]})` : `${n} samples at ${GRID} m over x ${r2(rect.x0)}..${r2(rect.x1)}, z ${r2(rect.z0)}..${r2(rect.z1)} all find ground`);
    // the moor outside the walls sits BELOW the wall-walk by the full curtain height
    const outside = [[0, 53.5], [53.5, 0], [-53.5, 0], [0, -53.5]];
    const drops = outside.map(([x, z]) => r2(WALK_Y - groundAt(x, z)));
    check('surrounds:curtain-height', drops.every((d) => d >= 4.9), `outer scarp drops ${drops.join(' / ')} m at the four outer edges`);
  }

  /* ---- 7. stats ---- */
  const st = terrain.stats;
  console.log(`terrain: ${st.nodes} nodes, ${st.cells} cells, ${st.platforms} platforms (${st.treads} treads), ${st.shelves} shelves, ${st.mounds} mounds, ${st.internalCrossings} internal climbs, ${st.triangles} triangles in ${st.meshes} meshes, tones ${st.tones.join('/')}, cell ${st.cell_m} m, footprint x ${r2(st.footprint.x0)}..${r2(st.footprint.x1)} z ${r2(st.footprint.z0)}..${r2(st.footprint.z1)}`);
  console.log(`nav grid: ${grid.W}×${grid.D} cells at ${grid.cell} m, ${walkReachW.reduce((a, b) => a + b, 0)} cells reachable from the walk seed west of the south gate, ${walkReachE.reduce((a, b) => a + b, 0)} from the seed east of it (two segments until the gatehouses bridge the gaps), ${streetReach.reduce((a, b) => a + b, 0)} from the spawn`);
  finish('RESULT');
} catch (error) {
  console.error('[check-terrain] crashed before checking:', error);
  process.exit(2);
}
