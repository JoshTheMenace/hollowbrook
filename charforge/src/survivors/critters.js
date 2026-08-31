import * as THREE from 'three';
import { toonMaterial, facetBall, facet, chunkyBox } from '../lib/parts.js';

// Horde enemies: 6-12 part critters animated by CODE (bob/hop/flap driven in
// update), not baked clips — cheap enough for 60 on screen. Each builder
// returns { root, update(dt, t), die() } with root origin at the feet.

const mats = {};
const M = (key, color, opts) => (mats[key] ||= toonMaterial(color, opts));

export const CRITTERS = {
  slime(rng = Math.random) {
    const g = new THREE.Group();
    const body = facetBall(0.3, M('slimeA', '#7ac142', { rim: 0.45, rimColor: '#d8ffb0' }), [1, 0.82, 1], [7, 5]);
    body.position.y = 0.26;
    g.add(body);
    for (const s of [-1, 1]) {
      const eye = facetBall(0.05, M('dark', '#221f28', { rim: 0 }), [1, 1.3, 1], [5, 4]);
      eye.position.set(s * 0.11, 0.34, 0.24);
      g.add(eye);
    }
    const ph = rng() * 6.28;
    return {
      root: g,
      update(dt, t) {
        const b = 1 + Math.sin(t * 7 + ph) * 0.14;
        body.scale.set(2 - b, b * 0.82 / 0.82, 2 - b);
        body.position.y = 0.26 * b;
      },
    };
  },

  bat(rng = Math.random) {
    const g = new THREE.Group();
    const body = facetBall(0.16, M('batA', '#5a4a7a', { rim: 0.5, rimColor: '#b09ae0' }), [1, 1.1, 0.9], [6, 5]);
    body.position.y = 0.62;
    g.add(body);
    const wings = [];
    for (const s of [-1, 1]) {
      const w = facet(new THREE.ConeGeometry(0.16, 0.4, 3), M('batW', '#3a3054', { rim: 0.35 }));
      w.geometry.scale(1, 1, 0.3);
      w.position.set(s * 0.2, 0.66, 0);
      w.rotation.z = s * 1.5;
      g.add(w);
      wings.push([w, s]);
      const eye = facetBall(0.035, M('red', '#ff5a4a', { rim: 0.8, rimColor: '#ffd0c0' }), [1, 1, 1], [5, 4]);
      eye.position.set(s * 0.06, 0.66, 0.13);
      g.add(eye);
    }
    const ph = rng() * 6.28;
    return {
      root: g,
      update(dt, t) {
        for (const [w, s] of wings) w.rotation.z = s * (1.5 + Math.sin(t * 16 + ph) * 0.7);
        body.position.y = 0.62 + Math.sin(t * 8 + ph) * 0.06;
      },
    };
  },

  bonehead(rng = Math.random) {
    const g = new THREE.Group();
    const body = chunkyBox(0.34, 0.4, 0.26, M('bone', '#d8d2c4', { rim: 0.3 }), { radius: 0.3 });
    body.position.y = 0.42;
    g.add(body);
    const skull = facetBall(0.19, M('bone', '#d8d2c4'), [1, 1.05, 0.95], [7, 5]);
    skull.position.y = 0.78;
    g.add(skull);
    for (const s of [-1, 1]) {
      const socket = facetBall(0.05, M('dark', '#221f28', { rim: 0 }), [1, 1.2, 0.6], [5, 4]);
      socket.position.set(s * 0.08, 0.8, 0.16);
      g.add(socket);
      const arm = chunkyBox(0.09, 0.34, 0.09, M('bone', '#d8d2c4'), { radius: 0.4 });
      arm.position.set(s * 0.26, 0.44, 0.02);
      arm.rotation.z = s * 0.25;
      g.add(arm);
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = chunkyBox(0.1, 0.26, 0.1, M('boneD', '#a8a294', { rim: 0.2 }), { radius: 0.35 });
      leg.position.set(s * 0.1, 0.13, 0);
      g.add(leg);
      legs.push([leg, s]);
    }
    const ph = rng() * 6.28;
    return {
      root: g,
      update(dt, t) {
        for (const [leg, s] of legs) leg.rotation.x = Math.sin(t * 9 + ph + (s > 0 ? Math.PI : 0)) * 0.55;
        g.rotation.z = Math.sin(t * 9 + ph) * 0.05;
      },
    };
  },

  imp(rng = Math.random) {
    const g = new THREE.Group();
    const body = facetBall(0.2, M('impA', '#c9503c', { rim: 0.5, rimColor: '#ffb090' }), [1, 1.15, 0.9], [6, 5]);
    body.position.y = 0.36;
    g.add(body);
    for (const s of [-1, 1]) {
      const horn = facet(new THREE.ConeGeometry(0.05, 0.16, 4), M('impH', '#5a2a20', { rim: 0.2 }));
      horn.position.set(s * 0.1, 0.58, 0);
      horn.rotation.z = s * -0.4;
      g.add(horn);
      const eye = facetBall(0.04, M('yellow', '#ffd76a', { rim: 0.9, rimColor: '#fff' }), [1, 1.2, 1], [5, 4]);
      eye.position.set(s * 0.07, 0.42, 0.16);
      g.add(eye);
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = chunkyBox(0.07, 0.18, 0.07, M('impH', '#5a2a20'), { radius: 0.4 });
      leg.position.set(s * 0.09, 0.09, 0);
      g.add(leg);
      legs.push([leg, s]);
    }
    const ph = rng() * 6.28;
    return {
      root: g,
      update(dt, t) {
        for (const [leg, s] of legs) leg.rotation.x = Math.sin(t * 13 + ph + (s > 0 ? Math.PI : 0)) * 0.7;
        body.rotation.x = Math.sin(t * 13 + ph) * 0.06 + 0.1;
      },
    };
  },

  crawler(rng = Math.random) {
    const g = new THREE.Group();
    const shell = facetBall(0.42, M('crawlA', '#4a6a5a', { rim: 0.35, rimColor: '#a0d8c0' }), [1.15, 0.7, 1.25], [8, 5]);
    shell.position.y = 0.36;
    g.add(shell);
    for (let i = 0; i < 3; i++) {
      const spike = facet(new THREE.ConeGeometry(0.08, 0.22, 4), M('crawlS', '#2c4438', { rim: 0.2 }));
      spike.position.set((i - 1) * 0.18, 0.62 - Math.abs(i - 1) * 0.06, -0.05 * i);
      g.add(spike);
    }
    for (const s of [-1, 1]) {
      const eye = facetBall(0.05, M('yellow', '#ffd76a', { rim: 0.9, rimColor: '#fff' }), [1, 1, 1], [5, 4]);
      eye.position.set(s * 0.14, 0.34, 0.42);
      g.add(eye);
    }
    const feet = [];
    for (const s of [-1, 1]) for (const f of [-1, 1]) {
      const leg = chunkyBox(0.1, 0.14, 0.12, M('crawlS', '#2c4438'), { radius: 0.35 });
      leg.position.set(s * 0.3, 0.07, f * 0.28);
      g.add(leg);
      feet.push([leg, s * f]);
    }
    const ph = rng() * 6.28;
    return {
      root: g,
      update(dt, t) {
        for (const [leg, s] of feet) leg.rotation.x = Math.sin(t * 6 + ph + (s > 0 ? Math.PI : 0)) * 0.45;
        g.rotation.z = Math.sin(t * 6 + ph) * 0.03;
      },
    };
  },

  wisp(rng = Math.random) {
    const g = new THREE.Group();
    const core = facetBall(0.16, M('wispA', '#8fd8ff', { rim: 1.0, rimColor: '#ffffff' }), [1, 1.2, 1], [6, 5]);
    core.position.y = 0.7;
    g.add(core);
    const tails = [];
    for (let i = 0; i < 3; i++) {
      const tail = facetBall(0.07 - i * 0.015, M('wispB', '#4a9ad8', { rim: 0.7, rimColor: '#c0ecff' }), [1, 1.4, 1], [5, 4]);
      g.add(tail);
      tails.push(tail);
    }
    const ph = rng() * 6.28;
    return {
      root: g,
      update(dt, t) {
        core.position.y = 0.7 + Math.sin(t * 5 + ph) * 0.1;
        core.scale.setScalar(1 + Math.sin(t * 9 + ph) * 0.12);
        tails.forEach((tail, i) => {
          const lag = t * 5 + ph - (i + 1) * 0.8;
          tail.position.set(Math.sin(lag * 1.3) * 0.12, 0.62 + Math.sin(lag) * 0.1 - i * 0.1, -0.1 - i * 0.09);
        });
      },
    };
  },

  elite(rng = Math.random) {
    // Elite brute: a hulking dark version with glowing eyes — the mini-boss.
    const g = new THREE.Group();
    const body = facetBall(0.44, M('eliteA', '#3a3244', { rim: 0.5, rimColor: '#b090ff' }), [1.1, 1.15, 0.95], [8, 6]);
    body.position.y = 0.62;
    g.add(body);
    const head = facetBall(0.24, M('eliteA', '#3a3244'), [1, 0.95, 0.95], [7, 5]);
    head.position.y = 1.18;
    g.add(head);
    for (const s of [-1, 1]) {
      const eye = facetBall(0.055, M('eliteE', '#c060ff', { rim: 1.0, rimColor: '#ffffff' }), [1, 1.2, 0.8], [5, 4]);
      eye.position.set(s * 0.1, 1.22, 0.2);
      g.add(eye);
      const horn = facet(new THREE.ConeGeometry(0.07, 0.26, 5), M('bone', '#d8d2c4'));
      horn.position.set(s * 0.22, 1.32, 0);
      horn.rotation.z = s * -0.8;
      g.add(horn);
      const arm = facetBall(0.16, M('eliteA', '#3a3244'), [0.8, 1.5, 0.8], [6, 4]);
      arm.position.set(s * 0.5, 0.6, 0.05);
      g.add(arm);
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = chunkyBox(0.16, 0.3, 0.16, M('eliteL', '#28222f', { rim: 0.2 }), { radius: 0.3 });
      leg.position.set(s * 0.18, 0.15, 0);
      g.add(leg);
      legs.push([leg, s]);
    }
    const ph = rng() * 6.28;
    return {
      root: g,
      update(dt, t) {
        for (const [leg, s] of legs) leg.rotation.x = Math.sin(t * 5 + ph + (s > 0 ? Math.PI : 0)) * 0.4;
        body.rotation.z = Math.sin(t * 5 + ph) * 0.04;
        g.rotation.x = Math.sin(t * 5 + ph + 1.5) * 0.02;
      },
    };
  },
};

export function makeCritter(visual) {
  const builder = CRITTERS[visual];
  if (!builder) throw new Error(`no critter "${visual}"`);
  return builder();
}
