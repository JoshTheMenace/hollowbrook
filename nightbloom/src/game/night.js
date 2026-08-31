import * as THREE from 'three';
import { Run } from '@forge/survivors/systems.js';
import { makeCritter } from '@forge/survivors/critters.js';
import { toonMaterial, facetBall } from '@forge/lib/parts.js';

// The night battle: charforge's balance-gated survivors Run fought inside
// the festival ground's contracted arena rect. This module is the bridge —
// Run owns combat + player movement; we own visuals + the hero body.

export const ARENA = { x0: 29, z0: -3, x1: 53, z1: 15 };   // plan contract

// Every event type this module can emit. The feel lint asserts each one has
// a consumer — an event with no feedback is a gated defect, not a detail.
export const NIGHT_EVENTS = [
  'elite-spawn', 'enemy-hit', 'kill', 'elite-kill', 'gem', 'player-hurt',
  'level-up', 'arc', 'nova', 'strike', 'knife', 'bolt', 'victory', 'defeat',
];
const CENTER = { x: (ARENA.x0 + ARENA.x1) / 2, z: (ARENA.z0 + ARENA.z1) / 2 };

// Where a player entering from town actually lands: THE spawn clamp. One
// function, used by the battle AND swept by check-occlusion.mjs — the review
// measured the old clamp (x0+1 = 30) dropping every town arrival into the
// yagura's camera-blind strip (nightbloom-play-review-r1, highest-impact).
export function arenaEntry(x, z) {
  return {
    x: THREE.MathUtils.clamp(x, ARENA.x0 + 1, ARENA.x1 - 1),
    z: THREE.MathUtils.clamp(z, ARENA.z0 + 1, ARENA.z1 - 1),
  };
}

export class NightBattle {
  // opts: { scene, hero, character, onEvent(type, data), groundY }
  constructor({ scene, hero, character = 'ronin', onEvent = () => {}, groundY = 0 }) {
    this.scene = scene;
    this.hero = hero;
    this.onEvent = onEvent;
    this.groundY = groundY;
    this.dyn = new THREE.Group();
    this.dyn.name = 'night-battle';
    scene.add(this.dyn);
    this.critters = new Map();
    this.dying = [];
    this.flashFX = [];
    this.orbVisuals = [];
    this.gemGeo = new THREE.OctahedronGeometry(0.13);
    this.gemMat = toonMaterial('#6ee0ff', { rim: 1.0, rimColor: '#ffffff' });
    this.knifeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.42);
    this.knifeMat = toonMaterial('#d8e4f0', { rim: 0.8, rimColor: '#ffffff' });
    this.boltMat = toonMaterial('#c060ff', { rim: 1.0, rimColor: '#ffffff' });
    this.orbGeo = new THREE.BoxGeometry(0.1, 0.34, 0.16);
    this.orbMat = toonMaterial('#b08aff', { rim: 0.9, rimColor: '#ffffff' });
    this.arcMat = new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });

    this.run = new Run({
      character,
      bounds: ARENA,
      fx: this.adapter(),
    });
    const entry = arenaEntry(hero.position.x, hero.position.z);
    this.run.playerPos.set(entry.x, 0, entry.z);
    this.over = null;

    // the bloom lights its own battlefield: a spirit glow riding the player
    // plus a faint petal-pink wash over the field — combat stays readable at
    // night without touching the town's lighting
    this.bloomLight = new THREE.PointLight(0xe8b8d8, 26, 17, 1.6);
    this.bloomLight.position.set(this.run.playerPos.x, groundY + 3.2, this.run.playerPos.z);
    this.dyn.add(this.bloomLight);
    const wash = new THREE.Mesh(
      new THREE.CircleGeometry(16, 40),
      new THREE.MeshBasicMaterial({ color: 0x86487a, transparent: true, opacity: 0.16, depthWrite: false }));
    wash.rotation.x = -Math.PI / 2;
    wash.position.set(CENTER.x, groundY + 0.02, CENTER.z);
    this.dyn.add(wash);
    this.wash = wash;
  }

  adapter() {
    const up = (p) => new THREE.Vector3(p.x, this.groundY + 0.55, p.z);
    return {
      spawn: (e) => {
        const c = makeCritter(e.def.visual);
        c.root.position.set(e.pos.x, this.groundY, e.pos.z);
        this.dyn.add(c.root);
        this.critters.set(e, c);
        if (e.def.elite) this.onEvent('elite-spawn', { pos: up(e.pos) });
      },
      hit: (e, dmg) => {
        const c = this.critters.get(e);
        if (c) c._pop = 0.14;
        this.onEvent('enemy-hit', { pos: up(e.pos), dmg });
      },
      kill: (e) => {
        this.onEvent(e.def.elite ? 'elite-kill' : 'kill', { pos: up(e.pos) });
        const c = this.critters.get(e);
        if (c) { this.critters.delete(e); this.dying.push({ root: c.root, life: 0 }); }
      },
      despawn: (e) => {
        const c = this.critters.get(e);
        if (c) { this.critters.delete(e); this.dyn.remove(c.root); }
      },
      gemSpawn: (g) => {
        const m = new THREE.Mesh(this.gemGeo, this.gemMat);
        m.position.set(g.pos.x, this.groundY + 0.25, g.pos.z);
        this.dyn.add(m);
        g._vis = m;
      },
      gemCollect: (g) => {
        this.onEvent('gem', { pos: g._vis?.position.clone() });
        if (g._vis) this.dyn.remove(g._vis);
      },
      playerHurt: (dmg) => this.onEvent('player-hurt', { dmg, pos: up(this.run.playerPos) }),
      levelUp: () => this.onEvent('level-up', { pos: up(this.run.playerPos) }),
      weaponFX: (kind, data) => {
        if (kind === 'arc') {
          const half = THREE.MathUtils.degToRad(data.arc / 2);
          const geo = new THREE.RingGeometry(data.radius * 0.35, data.radius, 24, 1, -Math.PI / 2 - half, half * 2);
          geo.rotateX(-Math.PI / 2);
          const m = new THREE.Mesh(geo, this.arcMat.clone());
          m.rotation.y = Math.atan2(data.dir.x, data.dir.z);
          m.position.set(this.run.playerPos.x, this.groundY + 0.12, this.run.playerPos.z);
          this.dyn.add(m);
          this.flashFX.push({ mesh: m, ttl: 0.18, life: 0 });
          this.onEvent('arc', {});
        } else if (kind === 'nova') {
          const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), this.arcMat.clone());
          m.rotation.x = -Math.PI / 2;
          m.position.set(this.run.playerPos.x, this.groundY + 0.1, this.run.playerPos.z);
          this.dyn.add(m);
          this.flashFX.push({ mesh: m, ttl: 0.3, life: 0, grow: data.radius });
          this.onEvent('nova', { pos: up(this.run.playerPos) });
        } else if (kind === 'strike') {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), new THREE.MeshBasicMaterial({ color: '#fff6b0' }));
          m.position.set(data.pos.x, this.groundY + 3.5, data.pos.z);
          this.dyn.add(m);
          this.flashFX.push({ mesh: m, ttl: 0.14, life: 0 });
          this.onEvent('strike', { pos: up(data.pos) });
        }
      },
      projSpawn: (p) => {
        p._vis = p.kind === 'knife'
          ? new THREE.Mesh(this.knifeGeo, this.knifeMat)
          : facetBall(0.14, this.boltMat, [1, 1, 1.5], [6, 4]);
        p._vis.position.set(p.pos.x, this.groundY + 0.7, p.pos.z);
        this.dyn.add(p._vis);
        this.onEvent(p.kind === 'knife' ? 'knife' : 'bolt', {});
      },
      projDie: (p) => { if (p._vis) this.dyn.remove(p._vis); },
      victory: () => { this.over = 'victory'; this.onEvent('victory', {}); },
      defeat: () => { this.over = 'defeat'; this.onEvent('defeat', {}); },
    };
  }

  // pressure 0..1 for the music dial: enemy density + missing hp
  pressure() {
    const density = Math.min(1, this.run.enemies.length / 70);
    const wounds = 1 - this.run.stats.hp / this.run.stats.maxHp;
    const t = Math.min(1, this.run.time / 300);
    return Math.min(1, 0.35 + density * 0.4 + wounds * 0.2 + t * 0.15);
  }

  update(dt, moveDir) {
    const run = this.run;
    if (!run.over) run.update(dt, moveDir);
    const t = run.time;
    this.bloomLight.position.set(run.playerPos.x, this.groundY + 3.2, run.playerPos.z);
    this.bloomLight.intensity = 24 + Math.sin(t * 2.1) * 4;   // the bloom breathes
    this.wash.material.opacity = 0.13 + Math.sin(t * 0.7) * 0.04;
    // hero body rides the sim
    const hero = this.hero;
    hero.position.set(run.playerPos.x, this.groundY, run.playerPos.z);
    hero.eyeY = this.groundY;
    // critters
    for (const [e, c] of this.critters) {
      c.root.position.set(e.pos.x, this.groundY, e.pos.z);
      if (e.vel.lengthSq() > 0.01) c.root.rotation.y = Math.atan2(e.vel.x, e.vel.z);
      if (c._pop > 0) {
        c._pop -= dt;
        c.root.scale.setScalar(1 + 0.3 * Math.sin(Math.max(0, c._pop / 0.14) * Math.PI));
      } else if (c.root.scale.x !== 1) c.root.scale.setScalar(1);
      c.update(dt, t);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.life += dt;
      d.root.scale.setScalar(Math.max(0.001, 1 - d.life / 0.18));
      if (d.life >= 0.18) { this.dyn.remove(d.root); this.dying.splice(i, 1); }
    }
    for (const g of run.gems) if (g._vis) {
      g._vis.position.set(g.pos.x, this.groundY + 0.25 + Math.sin(t * 4 + g.pos.x * 3) * 0.06, g.pos.z);
      g._vis.rotation.y = t * 2.5;
    }
    for (const p of run.projectiles) if (p._vis) {
      p._vis.position.set(p.pos.x, this.groundY + 0.7, p.pos.z);
      p._vis.lookAt(p.pos.x + p.dir.x, p._vis.position.y, p.pos.z + p.dir.z);
    }
    const orbSt = run.weaponState.get('orbs');
    const want = orbSt?.orbPos?.length || 0;
    while (this.orbVisuals.length < want) { const m = new THREE.Mesh(this.orbGeo, this.orbMat); this.dyn.add(m); this.orbVisuals.push(m); }
    while (this.orbVisuals.length > want) this.dyn.remove(this.orbVisuals.pop());
    this.orbVisuals.forEach((m, i) => {
      const o = orbSt.orbPos[i];
      m.position.set(o.x, this.groundY + 0.65, o.z);
      m.rotation.y = orbSt.angle + (i / want) * Math.PI * 2;
    });
    for (let i = this.flashFX.length - 1; i >= 0; i--) {
      const f = this.flashFX[i];
      f.life += dt;
      const u = f.life / f.ttl;
      if (u >= 1) { this.dyn.remove(f.mesh); this.flashFX.splice(i, 1); continue; }
      if (f.mesh.material.opacity !== undefined) f.mesh.material.opacity = 0.85 * (1 - u);
      if (f.grow) { const s = 1 + (f.grow / 0.5 - 1) * u; f.mesh.scale.set(s, s, s); }
    }
  }

  dispose() {
    this.scene.remove(this.dyn);
    this.critters.clear();
  }
}
