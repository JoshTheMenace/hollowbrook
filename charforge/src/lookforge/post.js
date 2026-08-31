import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// LookForge post stack — the "pro look" layer. A LOOK is a data spec:
// {
//   bloom: { strength, radius, threshold },
//   grade: { exposure, saturation, temp (-1 cool..1 warm), tint,
//            lift [r,g,b], gamma [r,g,b], gain [r,g,b],   // shadows/mids/highs
//            vignette, vignetteSoft },
// }
// Looks live in content/looks.js and are gated by scripts/check-look.mjs.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1 },
    saturation: { value: 1 },
    contrast: { value: 1 },
    temp: { value: 0 },
    tint: { value: 0 },
    lift: { value: new THREE.Vector3(0, 0, 0) },
    gamma: { value: new THREE.Vector3(1, 1, 1) },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    vignette: { value: 0.3 },
    vignetteSoft: { value: 0.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float exposure, saturation, contrast, temp, tint, vignette, vignetteSoft;
    uniform vec3 lift, gamma, gain;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * exposure;
      // white balance: temp shifts r/b, tint shifts g
      c.r *= 1.0 + temp * 0.10;
      c.b *= 1.0 - temp * 0.10;
      c.g *= 1.0 + tint * 0.08;
      // lift/gamma/gain (shadows / mids / highlights)
      c = pow(max(c * gain + lift * (1.0 - c), 0.0), 1.0 / max(gamma, vec3(0.01)));
      // contrast pivots at the toon palette's working middle (~0.36), not
      // 0.5 — most of a stylized frame sits below mid gray and a 0.5 pivot
      // crushes it (measured: meanLuma 80 -> 37)
      c = mix(vec3(0.36), c, contrast);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      // vignette
      float d = distance(vUv, vec2(0.5)) * 1.4142;
      c *= 1.0 - vignette * smoothstep(1.0 - vignetteSoft, 1.0, d);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function makePost(renderer, scene, camera, look = {}) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(size, 0.4, 0.6, 0.85);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const api = {
    composer, bloom, grade,
    setLook(l) {
      const b = l.bloom || {};
      bloom.strength = b.strength ?? 0.4;
      bloom.radius = b.radius ?? 0.6;
      bloom.threshold = b.threshold ?? 0.85;
      bloom.enabled = b.strength !== 0;
      const g = l.grade || {};
      const u = grade.uniforms;
      u.exposure.value = g.exposure ?? 1;
      u.saturation.value = g.saturation ?? 1;
      u.contrast.value = g.contrast ?? 1;
      u.temp.value = g.temp ?? 0;
      u.tint.value = g.tint ?? 0;
      u.lift.value.fromArray(g.lift ?? [0, 0, 0]);
      u.gamma.value.fromArray(g.gamma ?? [1, 1, 1]);
      u.gain.value.fromArray(g.gain ?? [1, 1, 1]);
      u.vignette.value = g.vignette ?? 0.3;
      u.vignetteSoft.value = g.vignetteSoft ?? 0.6;
      api.look = l;
    },
    render(dt) { composer.render(dt); },
    resize(w, h) { composer.setSize(w, h); },
  };
  api.setLook(look);
  return api;
}
