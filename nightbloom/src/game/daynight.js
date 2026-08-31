import * as THREE from 'three';
import { skyTexture } from '../textures.js';

// Day/night for Yoizaka: the whole mood is DATA — three lighting poles
// (day / dusk / night) interpolated into the light rig, sky, fog, grade
// pass and the town's practicals (every kit mesh with userData.practical).
// The game moves ONE number (phase 0..1 within a pole pair) or jumps poles.

export const PHASES = {
  day: {
    sun: { color: 0xffe3b0, intensity: 2.6 },
    fill: { color: 0x9fb2e8, intensity: 1.1 },
    hemi: { sky: 0xe8dcc8, ground: 0xb0a2c2, intensity: 0.9 },
    sky: { top: 0x9db4e2, mid: 0xe8d9c8, haze: 0xf6dcbc },
    fog: { color: 0xecdcc8, near: 26, far: 100 },
    grade: { shadowTint: 0xaaa2cc, lightTint: 0xffedd2, saturation: 1.06, lift: 0.02, warmth: 0.05, vignette: 0.16 },
    practicals: 0.25,   // lanterns barely lit in daylight
  },
  dusk: {
    sun: { color: 0xff9e5e, intensity: 1.9 },
    fill: { color: 0x7c8cd8, intensity: 1.2 },
    hemi: { sky: 0xd8b8ae, ground: 0x9a8ab8, intensity: 0.85 },
    sky: { top: 0x6c74b8, mid: 0xd88f78, haze: 0xf0b088 },
    fog: { color: 0xd8a890, near: 22, far: 88 },
    grade: { shadowTint: 0x9a8ec8, lightTint: 0xffd9b0, saturation: 1.1, lift: 0.03, warmth: 0.12, vignette: 0.22 },
    practicals: 0.75,
  },
  night: {
    sun: { color: 0x93a4e8, intensity: 1.25 },       // the moon takes the key — real directional punch
    fill: { color: 0x54608f, intensity: 0.9 },
    hemi: { sky: 0x46508a, ground: 0x2e2848, intensity: 0.8 },
    sky: { top: 0x181c38, mid: 0x303664, haze: 0x555078 },
    fog: { color: 0x2b3054, near: 15, far: 58 },
    grade: { shadowTint: 0x5c548c, lightTint: 0xc8d0ff, saturation: 0.98, lift: 0.045, warmth: -0.08, vignette: 0.34 },
    practicals: 1.0,    // lanterns carry the town
  },
};

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const lerpHex = (a, b, t) => _c1.set(a).lerp(_c2.set(b), t).clone();
const lerpN = (a, b, t) => a + (b - a) * t;

export function mixPhase(A, B, t) {
  return {
    sun: { color: lerpHex(A.sun.color, B.sun.color, t), intensity: lerpN(A.sun.intensity, B.sun.intensity, t) },
    fill: { color: lerpHex(A.fill.color, B.fill.color, t), intensity: lerpN(A.fill.intensity, B.fill.intensity, t) },
    hemi: {
      sky: lerpHex(A.hemi.sky, B.hemi.sky, t), ground: lerpHex(A.hemi.ground, B.hemi.ground, t),
      intensity: lerpN(A.hemi.intensity, B.hemi.intensity, t),
    },
    sky: {
      top: lerpHex(A.sky.top, B.sky.top, t), mid: lerpHex(A.sky.mid, B.sky.mid, t), haze: lerpHex(A.sky.haze, B.sky.haze, t),
    },
    fog: { color: lerpHex(A.fog.color, B.fog.color, t), near: lerpN(A.fog.near, B.fog.near, t), far: lerpN(A.fog.far, B.fog.far, t) },
    grade: {
      shadowTint: lerpHex(A.grade.shadowTint, B.grade.shadowTint, t),
      lightTint: lerpHex(A.grade.lightTint, B.grade.lightTint, t),
      saturation: lerpN(A.grade.saturation, B.grade.saturation, t),
      lift: lerpN(A.grade.lift, B.grade.lift, t),
      warmth: lerpN(A.grade.warmth, B.grade.warmth, t),
      vignette: lerpN(A.grade.vignette, B.grade.vignette, t),
    },
    practicals: lerpN(A.practicals, B.practicals, t),
  };
}

const css = (c) => (c.isColor ? '#' + c.getHexString() : '#' + c.toString(16).padStart(6, '0'));

const LIGHT_POOL = 6;   // real point lights that TRAVEL to the practicals
                        // nearest the player — every lantern seems live, only
                        // six ever cost anything ("practicals that travel")

export class DayNight {
  // refs: { scene, sun, fill, hemi, pipeline, root }
  constructor(refs) {
    this.refs = refs;
    this.practicals = [];
    this.skyCache = new Map();
    this.current = null;
    this.fade = null;           // { from, to, t, dur }
    this.level = 0;             // current practicals level, for the pool
    this.pool = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xffc27a, 0, 9, 1.9);
      refs.scene.add(l);
      this.pool.push(l);
    }
    this._pos = new THREE.Vector3();
    if (refs.root) this.collectPracticals(refs.root);
  }

  collectPracticals(root) {
    this.practicals.length = 0;
    root.traverse((o) => {
      if (o.userData?.practical && o.material) {
        if (o.material.userData._pracBase === undefined) {
          o.material.userData._pracBase = o.material.emissiveIntensity ?? 1;
        }
        this.practicals.push(o);
      }
    });
    return this.practicals.length;
  }

  set(phaseName) {
    this.apply(PHASES[phaseName]);
    this.current = phaseName;
    this.fade = null;
  }

  fadeTo(phaseName, dur = 6) {
    this.fade = { from: PHASES[this.current ?? 'day'], to: PHASES[phaseName], t: 0, dur, name: phaseName };
  }

  update(dt, playerPos = null) {
    if (this.fade) {
      this.fade.t += dt / this.fade.dur;
      if (this.fade.t >= 1) {
        this.apply(this.fade.to);
        this.current = this.fade.name;
        this.fade = null;
      } else this.apply(mixPhase(this.fade.from, this.fade.to, this.fade.t));
    }
    this.placePool(playerPos);
  }

  // park the pooled lights at the practicals nearest the player (or scene
  // origin); intensity follows the phase's practicals level
  placePool(playerPos) {
    const at = playerPos ?? this._pos.set(0, 0, 0);
    const glow = Math.max(0, this.level - 0.35) * 14; // lights only matter from dusk on
    if (!this.practicals.length || glow <= 0) {
      for (const l of this.pool) l.intensity = 0;
      return;
    }
    const nearest = this.practicals
      .map((o) => ({ o, d: o.getWorldPosition(new THREE.Vector3()).distanceToSquared(at) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.pool.length);
    this.pool.forEach((l, i) => {
      const n = nearest[i];
      if (!n) { l.intensity = 0; return; }
      n.o.getWorldPosition(l.position);
      l.position.y -= 0.15;      // pool of light under the lantern, not in it
      l.intensity = glow;
    });
  }

  apply(p) {
    const { scene, sun, fill, hemi, pipeline } = this.refs;
    sun.color.set(p.sun.color); sun.intensity = p.sun.intensity;
    fill.color.set(p.fill.color); fill.intensity = p.fill.intensity;
    hemi.color.set(p.hemi.sky); hemi.groundColor.set(p.hemi.ground); hemi.intensity = p.hemi.intensity;
    // sky texture is cached per rounded phase so a slow fade doesn't
    // regenerate a canvas every frame
    const key = [p.sky.top, p.sky.mid, p.sky.haze].map((c) => css(c)).join();
    if (!this.skyCache.has(key)) {
      this.skyCache.set(key, skyTexture(css(p.sky.top), css(p.sky.mid), css(p.sky.haze)));
      if (this.skyCache.size > 24) this.skyCache.delete(this.skyCache.keys().next().value);
    }
    scene.background = this.skyCache.get(key);
    scene.fog.color.set(p.fog.color);
    scene.fog.near = p.fog.near; scene.fog.far = p.fog.far;
    if (pipeline?.grade?.mat) {
      const u = pipeline.grade.mat.uniforms;
      u.uShadowTint?.value.set(p.grade.shadowTint);
      u.uLightTint?.value.set(p.grade.lightTint);
      if (u.uSaturation) u.uSaturation.value = p.grade.saturation;
      if (u.uLift) u.uLift.value = p.grade.lift;
      if (u.uWarmth) u.uWarmth.value = p.grade.warmth;
      if (u.uVignette) u.uVignette.value = p.grade.vignette;
    }
    for (const o of this.practicals) {
      o.material.emissiveIntensity = o.material.userData._pracBase * p.practicals;
    }
    this.level = p.practicals;
    this.placePool();
  }
}
