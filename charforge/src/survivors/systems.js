import * as THREE from 'three';
import { WEAPONS, PASSIVES, ENEMIES, WAVES, EVENTS, HP_SCALE, XP_CURVE, RUN_LENGTH, PLAYABLES } from './data.js';

// Pure game logic. NO rendering, NO DOM — all presentation goes through the
// injected `fx` adapter, so the identical Run powers the browser game AND
// the headless Node balance sim (scripts/simulate-run.mjs).
//
// fx interface (all optional): spawn(e), hit(e, dmg, dir), kill(e),
// gemSpawn(g), gemCollect(g), playerHurt(dmg), levelUp(), weaponFX(kind, data),
// projSpawn(p), projDie(p), victory(), defeat()

const BOUND = 11;              // default square arena half-size (the sim gate's arena)

export class Run {
  constructor({ character = 'ronin', fx = {}, rng = Math.random, bounds = null } = {}) {
    const c = PLAYABLES[character];
    this.character = character;
    this.fx = fx;
    this.rng = rng;
    this.time = 0;
    this.kills = 0;
    this.gold = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = XP_CURVE(1);
    this.pendingLevelUps = 0;
    this.over = null;            // 'victory' | 'defeat'
    this.playerPos = new THREE.Vector3(0, 0, 0);
    this.playerVel = new THREE.Vector3();
    this.invuln = 0;
    this.stats = {
      hp: c.hp, maxHp: c.hp, baseSpeed: 2.6 * c.speed,
      damageMul: 1, cooldownMul: 1, speedMul: 1, magnetMul: 1,
      goldMul: 1, regen: 0, knockbackMul: 1,
    };
    this.weapons = new Map();    // id -> level (1..5)
    this.passives = new Map();   // id -> count
    this.weaponState = new Map();// id -> { cd, ... }
    this.enemies = [];
    this.gems = [];
    this.projectiles = [];
    this.spawnTimer = 0;
    this.eventsFired = new Set();
    // arena bounds are injectable so a game can fight in any rectangle
    // (e.g. a festival field); the balance sim keeps the default square
    this.bounds = bounds || { x0: -BOUND, z0: -BOUND, x1: BOUND, z1: BOUND };
    this.addWeapon(c.weapon);
  }

  // --- upgrades ------------------------------------------------------------
  addWeapon(id) {
    const lvl = (this.weapons.get(id) || 0) + 1;
    this.weapons.set(id, Math.min(5, lvl));
    if (!this.weaponState.has(id)) this.weaponState.set(id, { cd: 0.4, angle: 0 });
  }
  addPassive(id) {
    const n = (this.passives.get(id) || 0) + 1;
    this.passives.set(id, n);
    PASSIVES[id].apply(this.stats);
  }
  // 3 legal choices for a level-up.
  choices() {
    const opts = [];
    for (const [id, w] of Object.entries(WEAPONS)) {
      const lvl = this.weapons.get(id) || 0;
      if (lvl >= 5) continue;
      if (lvl === 0 && this.weapons.size >= 4) continue;   // max 4 weapons
      opts.push({ kind: 'weapon', id, label: `${w.icon} ${w.name} ${lvl ? `Lv${lvl + 1}` : 'NEW'}`, desc: w.desc });
    }
    for (const [id, p] of Object.entries(PASSIVES)) {
      const n = this.passives.get(id) || 0;
      if (n >= p.max) continue;
      opts.push({ kind: 'passive', id, label: `${p.icon} ${p.name} ${n ? `Lv${n + 1}` : ''}`, desc: p.desc });
    }
    // shuffle, take 3
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts.slice(0, 3);
  }
  applyChoice(ch) {
    if (ch.kind === 'weapon') this.addWeapon(ch.id);
    else this.addPassive(ch.id);
  }

  // --- spawning ------------------------------------------------------------
  wave() { return WAVES.find((w) => this.time < w.until) || WAVES[WAVES.length - 1]; }

  pickEnemy(mix) {
    let total = 0;
    for (const w of Object.values(mix)) total += w;
    let r = this.rng() * total;
    for (const [id, w] of Object.entries(mix)) { r -= w; if (r <= 0) return id; }
    return Object.keys(mix)[0];
  }

  spawnEnemy(id, pos) {
    const def = ENEMIES[id];
    const e = {
      id, def,
      hp: def.hp * HP_SCALE(this.time),
      maxHp: def.hp * HP_SCALE(this.time),
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      knock: new THREE.Vector3(),
      phase: this.rng() * 6.28,
      hitCd: 0,
      dead: false,
    };
    this.enemies.push(e);
    this.fx.spawn?.(e);
    return e;
  }

  edgeSpawnPos() {
    // ring just outside the play view. 45% of spawns land AHEAD of a moving
    // player (±60° of their heading) — running away feeds you into fresh
    // enemies, so pure kiting is not a win strategy.
    let a = this.rng() * Math.PI * 2;
    if (this.playerVel.lengthSq() > 0.1 && this.rng() < 0.45) {
      a = Math.atan2(this.playerVel.z, this.playerVel.x) + (this.rng() - 0.5) * (Math.PI / 1.5);
    }
    const r = 10.2 + this.rng() * 1.5;
    const p = new THREE.Vector3(this.playerPos.x + Math.cos(a) * r, 0, this.playerPos.z + Math.sin(a) * r);
    p.x = THREE.MathUtils.clamp(p.x, this.bounds.x0, this.bounds.x1);
    p.z = THREE.MathUtils.clamp(p.z, this.bounds.z0, this.bounds.z1);
    return p;
  }

  // --- damage --------------------------------------------------------------
  damageEnemy(e, dmg, dir, knockback = 0) {
    if (e.dead) return;
    e.hp -= dmg;
    if (dir && knockback > 0) {
      e.knock.add(dir.clone().setY(0).normalize().multiplyScalar(knockback * this.stats.knockbackMul / e.def.mass));
    }
    this.fx.hit?.(e, dmg, dir);
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      const gem = { pos: e.pos.clone(), xp: e.def.xp, gold: e.def.gold, t: 0, magnet: false };
      this.gems.push(gem);
      this.fx.gemSpawn?.(gem);
      this.fx.kill?.(e);
    }
  }

  hurtPlayer(dmg) {
    if (this.invuln > 0 || this.over) return;
    this.stats.hp -= dmg;
    this.invuln = 0.6;
    this.fx.playerHurt?.(dmg);
    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this.over = 'defeat';
      this.fx.defeat?.();
    }
  }

  // --- main update ---------------------------------------------------------
  update(dt, moveDir) {
    if (this.over) return;
    this.time += dt;
    if (this.time >= RUN_LENGTH) {
      this.over = 'victory';
      this.fx.victory?.();
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.regen * dt);

    // player movement
    if (moveDir && moveDir.lengthSq() > 0) {
      const sp = this.stats.baseSpeed * this.stats.speedMul;
      this.playerVel.copy(moveDir).setY(0).normalize().multiplyScalar(sp);
    } else this.playerVel.set(0, 0, 0);
    this.playerPos.addScaledVector(this.playerVel, dt);
    this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, this.bounds.x0, this.bounds.x1);
    this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, this.bounds.z0, this.bounds.z1);

    // spawning
    const wave = this.wave();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < 110) {
      this.spawnTimer = wave.spawnEvery;
      this.spawnEnemy(this.pickEnemy(wave.mix), this.edgeSpawnPos());
    }
    for (const ev of EVENTS) {
      if (this.time >= ev.at && !this.eventsFired.has(ev.at)) {
        this.eventsFired.add(ev.at);
        if (ev.type === 'elite') this.spawnEnemy('brute_elite', this.edgeSpawnPos());
        if (ev.type === 'ring') {
          for (let i = 0; i < ev.count; i++) {
            const a = (i / ev.count) * Math.PI * 2;
            this.spawnEnemy(ev.enemy, new THREE.Vector3(
              this.playerPos.x + Math.cos(a) * 7, 0, this.playerPos.z + Math.sin(a) * 7));
          }
        }
      }
    }

    // enemies: steer + contact damage + separation-lite
    const P = this.playerPos;
    for (const e of this.enemies) {
      const to = P.clone().sub(e.pos).setY(0);
      const dist = to.length();
      to.normalize();
      let want = to;
      if (e.def.behavior === 'zigzag') {
        const side = new THREE.Vector3(-to.z, 0, to.x);
        want = to.clone().addScaledVector(side, Math.sin(this.time * 3.5 + e.phase) * 0.8).normalize();
      } else if (e.def.behavior === 'charge') {
        e.chargeT = (e.chargeT ?? this.rng() * 2.5) - dt;
        if (e.chargeT <= 0) { e.charging = 1.1; e.chargeT = 2.2 + this.rng() * 1.6; e.chargeDir = to.clone(); }
        if (e.charging > 0) { e.charging -= dt; want = e.chargeDir; }
      }
      const speed = e.def.speed * (e.charging > 0 ? 2.6 : 1);
      e.vel.lerp(want.multiplyScalar(speed), 1 - Math.exp(-6 * dt));
      e.pos.addScaledVector(e.vel, dt).addScaledVector(e.knock, dt * 6);
      e.knock.multiplyScalar(Math.max(0, 1 - 8 * dt));
      e.hitCd = Math.max(0, e.hitCd - dt);
      if (dist < e.def.radius + 0.35 && e.hitCd <= 0) {
        e.hitCd = 0.8;
        this.hurtPlayer(e.def.damage);
      }
    }

    // weapons
    for (const [id, lvl] of this.weapons) this.updateWeapon(id, lvl - 1, dt);

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.homing) {
        const target = this.strongestEnemy();
        if (target) {
          const want = target.pos.clone().sub(p.pos).setY(0).normalize();
          p.dir.lerp(want, Math.min(1, p.turn * dt)).normalize();
        }
      }
      p.pos.addScaledVector(p.dir, p.speed * dt);
      let dead = p.life <= 0;
      for (const e of this.enemies) {
        if (e.dead || p.hitSet.has(e)) continue;
        const hx = p.pos.x - e.pos.x, hz = p.pos.z - e.pos.z; // hit in XZ — projectiles fly at chest height
        if (hx * hx + hz * hz < (e.def.radius + 0.22) ** 2) {
          p.hitSet.add(e);
          this.damageEnemy(e, p.damage, p.dir, 1.2);
          if (p.pierce-- <= 0) { dead = true; break; }
        }
      }
      if (dead) { this.fx.projDie?.(p); this.projectiles.splice(i, 1); }
    }

    // gems: magnetize + collect
    const magnetR = 1.6 * this.stats.magnetMul;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const d = g.pos.distanceTo(P);
      if (d < magnetR) g.magnet = true;
      if (g.magnet) g.pos.lerp(P, Math.min(1, 9 * dt));
      if (d < 0.45) {
        this.gems.splice(i, 1);
        this.gold += Math.round(g.gold * this.stats.goldMul);
        this.xp += g.xp;
        this.fx.gemCollect?.(g);
        while (this.xp >= this.xpNeed) {
          this.xp -= this.xpNeed;
          this.level++;
          this.xpNeed = XP_CURVE(this.level);
          this.pendingLevelUps++;
          this.fx.levelUp?.();
        }
      }
    }

    // cull dead enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) { this.fx.despawn?.(this.enemies[i]); this.enemies.splice(i, 1); }
    }
  }

  strongestEnemy() {
    let best = null;
    for (const e of this.enemies) if (!e.dead && (!best || e.hp > best.hp)) best = e;
    return best;
  }
  nearestEnemy(from) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = e.pos.distanceToSquared(from);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  updateWeapon(id, li, dt) {
    const w = WEAPONS[id];
    const st = this.weaponState.get(id);
    const dmg = w.damage[li] * this.stats.damageMul;
    st.cd -= dt;
    const P = this.playerPos;

    if (w.behavior === 'orbit') {
      st.angle += w.spin * dt;
      const count = w.count[li], R = w.radius[li];
      st.orbPos = st.orbPos || [];
      st.orbPos.length = count;
      for (let i = 0; i < count; i++) {
        const a = st.angle + (i / count) * Math.PI * 2;
        st.orbPos[i] = { x: P.x + Math.cos(a) * R, z: P.z + Math.sin(a) * R };
      }
      if (st.cd <= 0) {
        st.cd = w.cooldown[li] * this.stats.cooldownMul;
        for (const e of this.enemies) {
          if (e.dead) continue;
          for (const o of st.orbPos) {
            const dx = e.pos.x - o.x, dz = e.pos.z - o.z;
            if (dx * dx + dz * dz < (e.def.radius + 0.32) ** 2) {
              this.damageEnemy(e, dmg, new THREE.Vector3(dx, 0, dz), 1.4);
              break;
            }
          }
        }
      }
      return;
    }
    if (st.cd > 0) return;
    st.cd = w.cooldown[li] * this.stats.cooldownMul;

    if (w.behavior === 'arc') {
      const target = this.nearestEnemy(P);
      const dir = target ? target.pos.clone().sub(P).setY(0).normalize()
        : new THREE.Vector3(Math.sin(st.angle || 0), 0, Math.cos(st.angle || 0));
      const half = THREE.MathUtils.degToRad(w.arc[li] / 2);
      const R = w.radius[li];
      for (const e of this.enemies) {
        if (e.dead) continue;
        const to = e.pos.clone().sub(P).setY(0);
        const d = to.length();
        if (d > R + e.def.radius) continue;
        if (Math.acos(THREE.MathUtils.clamp(to.normalize().dot(dir), -1, 1)) > half) continue;
        this.damageEnemy(e, dmg, to, w.knockback);
      }
      this.fx.weaponFX?.('arc', { dir, radius: R, arc: w.arc[li] });
    } else if (w.behavior === 'projectile') {
      const target = this.nearestEnemy(P);
      if (!target) { st.cd = 0.15; return; }
      const base = target.pos.clone().sub(P).setY(0).normalize();
      const n = w.count[li];
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.16;
        const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
        const p = { pos: P.clone().setY(0.7), dir, speed: w.speed, life: w.life, damage: dmg, pierce: w.pierce[li], hitSet: new Set(), kind: 'knife' };
        this.projectiles.push(p);
        this.fx.projSpawn?.(p);
      }
    } else if (w.behavior === 'homing') {
      const target = this.strongestEnemy();
      if (!target) { st.cd = 0.2; return; }
      const dir = target.pos.clone().sub(P).setY(0).normalize();
      const p = { pos: P.clone().setY(0.8), dir, speed: w.speed, life: w.life, damage: dmg, pierce: 0, turn: w.turn, homing: true, hitSet: new Set(), kind: 'bolt' };
      this.projectiles.push(p);
      this.fx.projSpawn?.(p);
    } else if (w.behavior === 'nova') {
      const R = w.radius[li];
      for (const e of this.enemies) {
        if (e.dead) continue;
        const to = e.pos.clone().sub(P).setY(0);
        if (to.length() > R + e.def.radius) continue;
        this.damageEnemy(e, dmg, to, w.knockback);
      }
      this.fx.weaponFX?.('nova', { radius: R });
    } else if (w.behavior === 'strike') {
      const n = w.count[li];
      const live = this.enemies.filter((e) => !e.dead);
      for (let i = 0; i < n && live.length; i++) {
        const e = live[Math.floor(this.rng() * live.length)];
        for (const o of live) {
          if (o.pos.distanceTo(e.pos) < w.radius + o.def.radius) {
            this.damageEnemy(o, dmg, o.pos.clone().sub(e.pos), 1.5);
          }
        }
        this.fx.weaponFX?.('strike', { pos: e.pos.clone() });
      }
    }
  }
}
