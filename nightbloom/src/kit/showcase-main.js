import * as THREE from 'three';
import { buildShowcase } from './showcase.js';
import { Pipeline } from '../core/post.js';
import { setOutlineResolution } from '../core/outline.js';
import { shadowTintActive } from '../core/toon.js';
import { sunPosition, fillPosition } from '../core/sunrig.js';
import { createCameraCheck } from '../core/camcheck.js';
import { createSpatialCheck } from '../core/spatialcheck.js';
import { skyTexture } from '../textures.js';
import { PAL } from '../palette.js';
import plan from '../../city-plan.json' with { type: 'json' };
import '../style.css';

/* ------------------------------------------------------------------ *
 * showcase.html's entry: the kit, lit by the CITY'S OWN light rig.
 *
 * The rig is derived from `city-plan.json`'s compass and sun exactly the
 * way src/main.js derives it, and that is the point of this page: a kit
 * reviewed under a light the districts will not have is a kit reviewed
 * under the wrong light, and every eave shadow, every lantern read and
 * every value judgement made here would be re-litigated five times.
 *
 * There is no walker.  The camera is placed by `__shotKit(name, opts)`,
 * which renders one frame through the full pipeline and POSTs the JPEG to
 * the vite dev server's /__shot endpoint (see vite.config.js) — the same
 * fetch src/game/cast-test.js uses.
 * ------------------------------------------------------------------ */

const canvas = document.querySelector('#view');
const prompt = document.querySelector('#prompt');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(new THREE.Color(PAL.fog), 1);
if (!shadowTintActive()) console.error('[showcase] cel shadow tint is OFF — see the [toon] error above');

const hex = (v) => '#' + v.toString(16).padStart(6, '0');

const scene = new THREE.Scene();
scene.background = skyTexture(hex(PAL.sky.top), hex(PAL.sky.mid), hex(PAL.sky.haze));
scene.fog = new THREE.Fog(PAL.fog, 46, 170);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 260);
camera.rotation.order = 'YXZ';

/* --- light: the plan's compass and sun, same derivation as main.js --- */
const sun = new THREE.DirectionalLight(PAL.sun, 2.0);
sun.position.fromArray(sunPosition(plan.city));
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const R = 46;                       // the showcase is wider than a district
sun.shadow.camera.left = -R;
sun.shadow.camera.right = R;
sun.shadow.camera.top = R;
sun.shadow.camera.bottom = -R;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(PAL.fill, 0.9);
fill.position.fromArray(fillPosition(plan.city));
scene.add(fill, fill.target);
const bounce = new THREE.DirectionalLight(PAL.bounce, 0.3);
bounce.position.set(3, -5, 12);
scene.add(bounce, bounce.target);
scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.0));

/* --- world --------------------------------------------------------- */
const showcase = buildShowcase(scene);

const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 40, fadeEnd: 130, skyDepth: 250 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  pipeline.setSize(width, height);
  setOutlineResolution(pipeline.size.x, pipeline.size.y);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/** Point the camera from a review camera, or from pos + yaw/pitch. */
function place(opts = {}) {
  const view = opts.review ? showcase.reviewCameras[opts.review] : null;
  if (view) {
    camera.position.fromArray(view.position);
    camera.lookAt(new THREE.Vector3().fromArray(view.target));
    camera.fov = view.fov ?? 50;
  }
  if (opts.pos) camera.position.fromArray(opts.pos);
  if (opts.lookAt) camera.lookAt(new THREE.Vector3().fromArray(opts.lookAt));
  if (opts.yaw !== undefined || opts.pitch !== undefined) {
    camera.rotation.set(opts.pitch ?? camera.rotation.x, opts.yaw ?? camera.rotation.y, 0, 'YXZ');
  }
  if (opts.fov) camera.fov = opts.fov;
  camera.updateProjectionMatrix();
}
place({ review: 'kit-overview' });

const clock = new THREE.Clock();
let frames = 0;
function frame() {
  showcase.update(Math.min(clock.getDelta(), 0.05));
  pipeline.render();
  frames += 1;
  if (frames % 60 === 0) {
    canvas.dataset.stats = JSON.stringify(showcase.diagnostics(renderer));
    canvas.dataset.state = JSON.stringify(showcase.state());
  }
  canvas.dataset.sceneReady = 'true';
  requestAnimationFrame(frame);
}
frame();
if (prompt) prompt.textContent = 'Kit showcase · use __shotKit(name, { pos, yaw, pitch }) or { review }';

const camcheck = createCameraCheck({
  scene,
  cameras: showcase.reviewCameras,
  colliders: showcase.colliders,
  footprintHeight: showcase.footprintHeight,
});

window.__kit = {
  scene, camera, renderer, pipeline, showcase,
  reviewCameras: showcase.reviewCameras,
  meshCounts: showcase.meshCounts,
  diagnostics: () => showcase.diagnostics(renderer),
  state: () => showcase.state(),
  strike: () => showcase.interactables[0].action(),
  reset: () => showcase.reset(),
  place,
  checkCamera: camcheck.checkCamera,
  checkAllCameras: camcheck.checkAllCameras,
  checkSpatial: createSpatialCheck({
    scene,
    groundAt: showcase.groundAt,
    colliders: showcase.colliders,
    footprint: showcase.footprint,
  }).checkSpatial,
};

/* ---- frame capture ------------------------------------------------------
 * `await __shotKit('festival-row', { review: 'kit-festival-row' })` or
 * `await __shotKit('drum', { pos: [4, 6, 22], yaw: -0.2, pitch: -0.15 })`
 * renders ONE frame through the full pipeline and POSTs it, so the file on
 * disk is the frame the reviewer would see and not a preview of it.
 */
window.__shotKit = async (name = 'kit', opts = {}) => {
  const saved = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
    aspect: camera.aspect,
  };
  try {
    const width = opts.width ?? 1280;
    const height = opts.height ?? 720;
    place(opts);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    pipeline.setSize(width, height);
    setOutlineResolution(pipeline.size.x, pipeline.size.y);
    pipeline.render();
    const data = renderer.domElement.toDataURL('image/jpeg', 0.92);
    const response = await fetch('/__shot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, data }),
    });
    return response.json();
  } finally {
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    camera.fov = saved.fov;
    camera.aspect = saved.aspect;
    camera.updateProjectionMatrix();
    resize();
  }
};
