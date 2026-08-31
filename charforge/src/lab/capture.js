import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

// Frame capture for agents. Nothing here relies on requestAnimationFrame:
// every capture explicitly poses the character, renders one frame, and POSTs
// the pixels to the dev server's /__shot endpoint.
//
//   await __shot('hero', { cam: 'hero', w: 900, h: 900 })
//   await __strip('walk8', 'walk', { frames: 8, cam: 'side' })
//   await __turntable('turn', { views: 8 })
//
// Camera presets are spherical around the character's bounds: yaw 0 faces the
// character's front (+Z), pitch in degrees above horizon, dist as a multiple
// of character height.
const PRESETS = {
  hero:  { yaw: 30,  pitch: 12, dist: 2.1, look: 0.52 },
  front: { yaw: 0,   pitch: 8,  dist: 2.2, look: 0.5 },
  side:  { yaw: 90,  pitch: 6,  dist: 2.2, look: 0.5 },
  back:  { yaw: 180, pitch: 10, dist: 2.2, look: 0.5 },
  face:  { yaw: 15,  pitch: 4,  dist: 0.9, look: 0.82 },
  low:   { yaw: 25,  pitch: -4, dist: 2.0, look: 0.45 },
};

export function installCapture(lab) {
  const { renderer, scene, camera } = lab;

  function bounds() {
    const box = new THREE.Box3().setFromObject(lab.character.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return { box, size, center, height: Math.max(size.y, 0.5) };
  }

  function placeCamera(spec = {}) {
    const p = { ...(PRESETS[spec.cam || 'hero'] || PRESETS.hero), ...spec };
    const { height, center } = bounds();
    const yaw = THREE.MathUtils.degToRad(p.yaw);
    const pitch = THREE.MathUtils.degToRad(p.pitch);
    const d = p.dist * height;
    const target = new THREE.Vector3(center.x, height * p.look, center.z);
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * d,
      target.y + Math.sin(pitch) * d,
      target.z + Math.cos(yaw) * Math.cos(pitch) * d
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function renderTo(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return renderer.domElement;
  }

  async function post(name, canvas) {
    const dataUrl = canvas.toDataURL('image/png');
    const res = await fetch('/__shot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, dataUrl }),
    });
    return res.json();
  }

  // Pose the character at absolute clip time t (seconds). Characters may
  // export update(t) for per-frame constraints (e.g. a bow string tracking
  // the draw hand) — it runs after the mixer poses the skeleton.
  function pose(clipName, t) {
    const { mixer, actions } = lab.character;
    if (!mixer) return;
    for (const a of Object.values(actions)) a.stop();
    const action = actions[clipName];
    if (!action) throw new Error(`no clip "${clipName}" — have: ${Object.keys(actions).join(', ')}`);
    action.reset().play();
    mixer.setTime(t);
    lab.character.root.updateMatrixWorld(true);
    lab.character.update?.(t);
  }

  window.__pose = pose;

  window.__shot = async (name, spec = {}) => {
    const w = spec.w || 900, h = spec.h || 900;
    if (spec.clip != null) pose(spec.clip, spec.t || 0);
    placeCamera(spec);
    const src = renderTo(w, h);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(src, 0, 0);
    return post(name, out);
  };

  // Contact sheet of an animation clip: `frames` cells sampled evenly across
  // the clip duration, tiled in a row-major grid, each cell labeled with time.
  window.__strip = async (name, clipName, spec = {}) => {
    const frames = spec.frames || 8;
    const cols = spec.cols || Math.min(frames, 4);
    const rows = Math.ceil(frames / cols);
    const cw = spec.w || 440, ch = spec.h || 440;
    const clip = lab.character.clipsByName[clipName];
    if (!clip) throw new Error(`no clip "${clipName}"`);
    const out = document.createElement('canvas');
    out.width = cw * cols; out.height = ch * rows;
    const ctx = out.getContext('2d');
    for (let i = 0; i < frames; i++) {
      const t = (clip.duration * i) / frames; // loop: last frame just before wrap
      pose(clipName, t);
      placeCamera(spec);
      const src = renderTo(cw, ch);
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      ctx.drawImage(src, x, y);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '16px monospace';
      ctx.fillText(`${i}  t=${t.toFixed(2)}s`, x + 10, y + 22);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    }
    return post(name, out);
  };

  // N views around the character at a fixed pose (default: clip 'idle' t=0
  // if present, else bind pose).
  window.__turntable = async (name, spec = {}) => {
    const views = spec.views || 8;
    const cw = spec.w || 440, ch = spec.h || 440;
    const cols = Math.min(views, 4);
    const rows = Math.ceil(views / cols);
    if (spec.clip) pose(spec.clip, spec.t || 0);
    const out = document.createElement('canvas');
    out.width = cw * cols; out.height = ch * rows;
    const ctx = out.getContext('2d');
    for (let i = 0; i < views; i++) {
      const yaw = (360 * i) / views;
      placeCamera({ ...spec, yaw });
      const src = renderTo(cw, ch);
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      ctx.drawImage(src, x, y);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '16px monospace';
      ctx.fillText(`${yaw.toFixed(0)}°`, x + 10, y + 22);
    }
    return post(name, out);
  };

  // Export the current character (mesh + all clips) as a binary GLB into
  // exports/<name>.glb via the dev server.
  window.__export = async (name) => {
    const { root, clipsByName } = lab.character;
    const glb = await new Promise((resolve, reject) =>
      new GLTFExporter().parse(root, resolve, reject, {
        binary: true,
        animations: Object.values(clipsByName),
      })
    );
    let bin = '';
    const bytes = new Uint8Array(glb);
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const res = await fetch('/__save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, dataB64: btoa(bin) }),
    });
    return res.json();
  };

  // Animated GIF of one clip, looping, written to exports/<name>.gif.
  window.__gif = async (name, clipName, spec = {}) => {
    const clip = lab.character.clipsByName[clipName];
    if (!clip) throw new Error(`no clip "${clipName}"`);
    const fps = spec.fps || 20;
    const w = spec.w || 420, h = spec.h || 420;
    const frames = Math.max(2, Math.round(clip.duration * fps));
    const gif = GIFEncoder();
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < frames; i++) {
      pose(clipName, (clip.duration * i) / frames);
      placeCamera(spec);
      tctx.drawImage(renderTo(w, h), 0, 0);
      const { data } = tctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / fps) });
    }
    gif.finish();
    const bytes = gif.bytes();
    window.__lastGif = { name, bytes };   // kept for __gifProof
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const res = await fetch('/__save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, dataB64: btoa(bin), ext: 'gif' }),
    });
    return res.json();
  };

  // Proof-of-pixels: decode the LAST GENERATED GIF's own bytes and write the
  // requested frames as a contact sheet — evidence of what the shipped file
  // actually shows, immune to any staleness between page and disk.
  window.__gifProof = async (frames) => {
    const { name, bytes } = window.__lastGif || {};
    if (!bytes) throw new Error('no gif generated yet');
    const dec = new ImageDecoder({ data: bytes.slice(), type: 'image/gif' });
    await dec.tracks.ready;
    const n = dec.tracks.selectedTrack.frameCount;
    const use = frames.filter((f) => f < n);
    const first = await dec.decode({ frameIndex: 0 });
    const fw = first.image.displayWidth, fh = first.image.displayHeight;
    const out = document.createElement('canvas');
    out.width = fw * use.length; out.height = fh;
    const ctx = out.getContext('2d');
    for (let i = 0; i < use.length; i++) {
      const { image } = await dec.decode({ frameIndex: use[i] });
      ctx.drawImage(image, i * fw, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '16px monospace';
      ctx.fillText(`gif f${use[i]}/${n}`, i * fw + 8, 20);
      image.close();
    }
    return post(`${name}-gifproof`, out);
  };

  // 2D sprite-sheet export: renders each clip from `dirs` directions at
  // `fps`, transparent background, packed one sheet per clip
  // (rows = directions starting at front and going clockwise, cols = frames)
  // plus a JSON atlas. Files land in exports/<name>-<clip>.png + <name>-sprites.json.
  window.__sprites = async (name, { clips = null, dirs = 8, fps = 10, size = 128, pitch = 28, dist = 2.4 } = {}) => {
    const list = clips || Object.keys(lab.character.clipsByName);
    const meta = { name, dirs, fps, size, clips: {} };
    const results = [];
    const prevSky = lab.stage.sky.visible, prevGround = lab.stage.ground.visible;
    lab.stage.sky.visible = false; lab.stage.ground.visible = false;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const clipName of list) {
      const clip = lab.character.clipsByName[clipName];
      const frames = Math.max(1, Math.round(clip.duration * fps));
      const out = document.createElement('canvas');
      out.width = size * frames; out.height = size * dirs;
      const ctx = out.getContext('2d');
      for (let d = 0; d < dirs; d++) {
        const yaw = (360 * d) / dirs;
        for (let f = 0; f < frames; f++) {
          pose(clipName, (clip.duration * f) / frames);
          placeCamera({ yaw, pitch, dist });
          ctx.drawImage(renderTo(size, size), f * size, d * size);
        }
      }
      const res = await fetch('/__save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `${name}-${clipName}`, dataB64: out.toDataURL('image/png').split(',')[1], ext: 'png' }),
      });
      results.push(await res.json());
      meta.clips[clipName] = { frames, duration: +clip.duration.toFixed(3), sheet: `${name}-${clipName}.png` };
    }
    renderer.setClearColor(prevClear, prevAlpha);
    lab.stage.sky.visible = prevSky; lab.stage.ground.visible = prevGround;
    const mres = await fetch('/__save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `${name}-sprites`, dataB64: btoa(JSON.stringify(meta, null, 1)), ext: 'json' }),
    });
    results.push(await mres.json());
    return results;
  };

  // Silhouette test: character rendered flat black on white, small — the
  // "does it read at gameplay distance" check.
  window.__silhouette = async (name, spec = {}) => {
    const size = spec.size || 220;
    const override = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const prevSky = lab.stage.sky.visible, prevGround = lab.stage.ground.visible;
    lab.stage.sky.visible = false; lab.stage.ground.visible = false;
    scene.overrideMaterial = override;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor('#ffffff', 1);
    if (spec.clip != null) pose(spec.clip, spec.t || 0);
    const views = spec.views || 4;
    const out = document.createElement('canvas');
    out.width = size * views; out.height = size;
    const ctx = out.getContext('2d');
    for (let i = 0; i < views; i++) {
      placeCamera({ ...spec, yaw: (360 * i) / views });
      const src = renderTo(size, size);
      ctx.drawImage(src, i * size, 0);
    }
    scene.overrideMaterial = null;
    renderer.setClearColor(prevClear, prevAlpha);
    lab.stage.sky.visible = prevSky; lab.stage.ground.visible = prevGround;
    return post(name, out);
  };
}
