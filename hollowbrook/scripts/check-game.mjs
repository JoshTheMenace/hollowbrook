#!/usr/bin/env node
/**
 * Game-vocabulary gate.  The plan's `game` block is a contract the BUILT
 * scene must satisfy — arenas with real cover / elevation / landmarks, NPC
 * posts on standable ground with a character actually standing there,
 * gates with open passages, objectives that reference real things.  Prose
 * in a brief is not vocabulary; this is.  (Forked from nightbloom's
 * check-game, extended for the siege: gates, escort/activate/hold/interact
 * objectives, elevation measured against the DISTRICT LEVEL, facing.)
 *
 *   node scripts/check-game.mjs
 */
import { bootCity, makeChecker } from './lib/headless.mjs';

const { check, finish } = makeChecker();
const R = 0.34;

try {
  const { THREE, scene, vignette, plan } = await bootCity();
  const game = plan.game;
  if (!game) { check('game:block', false, 'plan has no `game` block'); finish(); }
  const districts = new Map(plan.districts.map((d) => [d.id, d]));
  const levelOf = (id) => plan.terrain.levels.find((l) => l.id === id)?.y ?? 0;
  const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const blockedBy = (x, z) => vignette.colliders.find((c) => x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R);
  const ray = new THREE.Raycaster();

  /* ---- gates ---- */
  for (const g of game.gates ?? []) {
    const d = districts.get(g.district);
    check(`gate:${g.id}:district`, !!d, d ? `in ${g.district}` : `unknown district "${g.district}"`);
    const [gx, gz] = g.at;
    const b = blockedBy(gx, gz);
    check(`gate:${g.id}:passage-open`, !b, b ? `the gate point (${gx}, ${gz}) is inside a collider (${b.x0.toFixed(1)},${b.z0.toFixed(1)})..(${b.x1.toFixed(1)},${b.z1.toFixed(1)}) — the passage is sealed` : `passage open at (${gx}, ${gz})`);
    const sr = g.spawn_ring;
    const inTown = plan.districts.some((dd) => inRect(dd.envelope, sr.centre[0], sr.centre[1]));
    check(`gate:${g.id}:spawn-ring`, sr.r_min > 0 && sr.r_max > sr.r_min && !inTown, `ring ${sr.r_min}..${sr.r_max} m at (${sr.centre})${inTown ? ' — INSIDE a district envelope; rings stand in the surrounds' : ''}`);
  }

  /* ---- arenas ---- */
  for (const a of game.arenas ?? []) {
    const d = districts.get(a.district);
    check(`arena:${a.id}:district`, !!d, d ? `district ${a.district}` : `unknown district "${a.district}"`);
    if (!d) continue;
    const inside = a.rect.x0 >= d.envelope.x0 && a.rect.x1 <= d.envelope.x1 && a.rect.z0 >= d.envelope.z0 && a.rect.z1 <= d.envelope.z1;
    check(`arena:${a.id}:in-envelope`, inside, `rect ${JSON.stringify(a.rect)} inside ${a.district}`);
    const cover = vignette.colliders.filter((c) => !c.stub && inRect(a.rect, c.x0, c.z0) && inRect(a.rect, c.x1, c.z1));
    check(`arena:${a.id}:cover`, cover.length >= a.min_cover, `${cover.length} cover colliders fully inside (need >= ${a.min_cover})`);
    const level = levelOf(a.district);
    let elevated = 0;
    for (let x = a.rect.x0 + 1; x < a.rect.x1; x += 2) for (let z = a.rect.z0 + 1; z < a.rect.z1; z += 2) if (vignette.groundAt(x, z) - level > 0.3) elevated++;
    check(`arena:${a.id}:elevation`, elevated >= a.min_elevation, `${elevated} samples stand > 0.3 m over the district level ${level} (need >= ${a.min_elevation})`);
    const centre = new THREE.Vector3((a.rect.x0 + a.rect.x1) / 2, vignette.groundAt((a.rect.x0 + a.rect.x1) / 2, (a.rect.z0 + a.rect.z1) / 2) + 1.62, (a.rect.z0 + a.rect.z1) / 2);
    let seen = 0;
    const names = (d.landmarks_citywide ?? []).map((l) => l.object);
    for (const name of names) {
      const obj = scene.getObjectByName(name);
      if (!obj) continue;
      const box = new THREE.Box3().setFromObject(obj);
      const target = box.getCenter(new THREE.Vector3());
      ray.set(centre, target.clone().sub(centre).normalize());
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.distance > 1e-3);
      if (hit) {
        let o = hit.object, ok = false;
        while (o) { if (o === obj) { ok = true; break; } o = o.parent; }
        if (ok || box.clampPoint(hit.point, new THREE.Vector3()).distanceTo(hit.point) < 1) seen++;
      }
    }
    check(`arena:${a.id}:landmarks`, seen >= a.min_landmarks, `${seen}/${names.length} district landmarks read from the arena centre (need >= ${a.min_landmarks})`);
    const gate = (game.gates ?? []).find((g) => g.id === a.approach);
    check(`arena:${a.id}:approach`, !!gate, gate ? `approached from ${a.approach}` : `approach "${a.approach}" is not a gate`);
  }

  /* ---- npc posts: standable AND present ---- */
  for (const p of game.npc_posts ?? []) {
    const d = districts.get(p.district);
    const [x, z] = p.at;
    const inEnv = d && inRect(d.envelope, x, z);
    const b = blockedBy(x, z);
    check(`npc:${p.id}:ground`, !!inEnv && !b, !inEnv ? `post (${x}, ${z}) outside district "${p.district}"` : b ? `post (${x}, ${z}) stands inside a collider (${b.x0.toFixed(1)},${b.z0.toFixed(1)})..(${b.x1.toFixed(1)},${b.z1.toFixed(1)})` : `standable at (${x}, ${z}) in ${p.district}, ground y ${vignette.groundAt(x, z).toFixed(2)}`);
    const f = p.facing ?? [0, 1];
    check(`npc:${p.id}:facing`, Math.abs(Math.hypot(f[0], f[1]) - 1) < 1e-6, `facing (${f})`);
    if (p.shelter) {
      const en = plan.districts.flatMap((dd) => dd.enterable ?? []).find((e) => e.building === p.shelter);
      check(`npc:${p.id}:shelter`, !!en, en ? `shelters in "${p.shelter}" (a declared enterable)` : `shelter "${p.shelter}" is not a declared enterable building`);
    }
    let npc = null;
    scene.traverse((o) => { if (!npc && (o.userData?.npc === p.id || o.name === `npc:${p.id}`)) npc = o; });
    if (!npc) check(`npc:${p.id}:present`, false, `NO character in the scene graph for post "${p.id}" — standable ground is not a cast member`);
    else {
      const box = new THREE.Box3().setFromObject(npc);
      const wp = npc.getWorldPosition(new THREE.Vector3());
      const dist = Math.hypot(wp.x - x, wp.z - z);
      check(`npc:${p.id}:present`, !box.isEmpty() && dist <= 2, box.isEmpty() ? `"${npc.name}" has no geometry` : `character "${npc.name}" stands ${dist.toFixed(2)} m from the post${dist <= 2 ? '' : ' (need <= 2)'}`);
    }
  }

  /* ---- objectives ---- */
  const posts = new Map((game.npc_posts ?? []).map((p) => [p.id, p]));
  const enterables = new Set(plan.districts.flatMap((dd) => (dd.enterable ?? []).map((e) => e.building)));
  for (const o of game.objectives ?? []) {
    if (o.kind === 'escort') {
      const okNpc = posts.has(o.npc);
      const okPts = !blockedBy(...o.from) && !blockedBy(...o.to);
      const okShelter = !o.shelter || enterables.has(o.shelter);
      check(`objective:${o.id}`, okNpc && okPts && okShelter, `escort ${o.npc}${okNpc ? '' : ' (UNKNOWN NPC)'} from (${o.from}) to (${o.to})${okPts ? '' : ' (an end is inside a collider)'}${okShelter ? '' : ` — shelter "${o.shelter}" is not enterable`}, leash ${o.leash_m} m, ${o.max_seconds} s`);
    } else if (o.kind === 'activate') {
      const d = o.district ? districts.get(o.district) : null;
      const bad = o.points.filter(([x, z]) => blockedBy(x, z) || (d && !inRect(d.envelope, x, z)));
      check(`objective:${o.id}`, bad.length === 0 && o.count <= o.points.length, bad.length ? `points blocked or outside ${o.district}: ${bad.map((p) => `(${p})`).join(' ')}` : `${o.count} of ${o.points.length} points, ${o.max_seconds} s`);
    } else if (o.kind === 'hold') {
      const arena = (game.arenas ?? []).find((a) => a.id === o.arena);
      check(`objective:${o.id}`, !!arena && o.seconds > 0, arena ? `hold ${o.arena} for ${o.seconds} s` : `unknown arena "${o.arena}"`);
    } else if (o.kind === 'interact') {
      const d = districts.get(o.district);
      const it = (d?.interactions ?? []).find((i) => i.name === o.interaction);
      check(`objective:${o.id}`, !!it, it ? `"${o.interaction}" at (${it.at}) in ${o.district}, ${o.channel_seconds} s channel` : `interaction "${o.interaction}" is not declared in ${o.district}`);
    } else check(`objective:${o.id}`, false, `unknown objective kind "${o.kind}"`);
  }
  finish('RESULT');
} catch (error) {
  console.error('[check-game] crashed before checking:', error);
  process.exit(2);
}
