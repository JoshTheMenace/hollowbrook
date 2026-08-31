import * as THREE from 'three';

// Code-native juice: pooled particles, floating text, screenshake, hit-stop.
// Everything is a parameter set an agent can author and a bot can assert on.

// --- Particles -------------------------------------------------------------
// One pooled Points cloud per VFX system; bursts write into free slots.
const MAX = 600;

export class VFX {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float psize; varying vec3 vColor;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = psize * (240.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vColor;
        void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d,d) > 0.25) discard;
        gl_FragColor = vec4(vColor, 1.0); }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];               // live particles: {i, vel, life, ttl, grav, drag, shrink}
    this.free = Array.from({ length: MAX }, (_, i) => MAX - 1 - i);
    this.hide(-1);
    // floating texts: DOM overlay (crisp, cheap)
    this.textLayer = document.createElement('div');
    Object.assign(this.textLayer.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', overflow: 'hidden',
      font: '800 18px ui-rounded, system-ui, sans-serif', zIndex: 5,
    });
    document.body.appendChild(this.textLayer);
    this.texts = [];
  }

  hide(except) {
    for (let i = 0; i < MAX; i++) if (i !== except) this.pos[i * 3 + 1] = -999;
  }

  // burst: spawn `count` particles at pos with preset-style params.
  burst(at, {
    count = 12, color = '#ffd76a', color2 = null, speed = 2.2, up = 1.6,
    ttl = 0.5, size = 0.09, grav = -6, drag = 2.5, spread = 1,
  } = {}) {
    const c1 = new THREE.Color(color), c2 = new THREE.Color(color2 || color);
    for (let n = 0; n < count; n++) {
      const i = this.free.pop();
      if (i == null) break;
      const a = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 0.7) * speed * spread;
      const vel = new THREE.Vector3(Math.cos(a) * r, up * (0.4 + Math.random() * 0.9), Math.sin(a) * r);
      const c = c1.clone().lerp(c2, Math.random());
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.parts.push({ i, vel, ttl: ttl * (0.6 + Math.random() * 0.7), life: 0, grav, drag });
    }
  }

  text(worldPos, str, camera, { color = '#fff3c4', rise = 46, ttl = 0.8 } = {}) {
    const el = document.createElement('div');
    el.textContent = str;
    Object.assign(el.style, {
      position: 'absolute', color, textShadow: '0 2px 0 rgba(40,25,10,0.55)',
      transform: 'translate(-50%,-50%)', whiteSpace: 'nowrap',
    });
    this.textLayer.appendChild(el);
    this.texts.push({ el, worldPos: worldPos.clone(), life: 0, ttl, rise, camera });
  }

  update(dt, camera) {
    // particles
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k];
      p.life += dt;
      if (p.life >= p.ttl) {
        this.pos[p.i * 3 + 1] = -999;
        this.free.push(p.i);
        this.parts.splice(k, 1);
        continue;
      }
      p.vel.y += p.grav * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      this.pos[p.i * 3] += p.vel.x * dt;
      this.pos[p.i * 3 + 1] += p.vel.y * dt;
      this.pos[p.i * 3 + 2] += p.vel.z * dt;
      this.size[p.i] *= (1 - 1.6 * dt * (p.life / p.ttl));
      if (this.pos[p.i * 3 + 1] < 0.02) { this.pos[p.i * 3 + 1] = 0.02; p.vel.y = Math.abs(p.vel.y) * 0.35; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.psize.needsUpdate = true;
    // texts
    const v = new THREE.Vector3();
    for (let k = this.texts.length - 1; k >= 0; k--) {
      const t = this.texts[k];
      t.life += dt;
      if (t.life >= t.ttl) { t.el.remove(); this.texts.splice(k, 1); continue; }
      const u = t.life / t.ttl;
      v.copy(t.worldPos).project(camera);
      t.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      t.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight - u * t.rise}px`;
      t.el.style.opacity = String(1 - u * u);
    }
  }
}

// --- Screenshake + hit-stop ------------------------------------------------
export class Shake {
  constructor() { this.trauma = 0; this.offset = new THREE.Vector3(); this.enabled = true; }
  add(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.enabled ? this.trauma * this.trauma * 0.35 : 0;
    this.offset.set((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s * 0.6, 0);
  }
}

export class HitStop {
  constructor() { this.until = 0; this.t = 0; }
  trigger(dur = 0.07) { this.until = this.t + dur; }
  // returns the timescale to apply to this frame's dt
  scale(dt) { this.t += dt; return this.t < this.until ? 0.12 : 1; }
}
