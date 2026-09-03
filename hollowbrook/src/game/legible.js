/* ------------------------------------------------------------------ *
 * LEGIBLE — the play-camera legibility instrument.
 *
 * An ID pass through the PLAY camera: every enemy BODY mesh is painted
 * (id/255, 0, 0), every elite MARKER mesh (id/255, 1, 0), the rest of the
 * town black, read back at 480×270; the graded colour frame is read from
 * the canvas the pipeline just drew.  Per enemy: body pixels (markers are
 * NOT body — a marker with depthTest off is an X-ray and is reported as
 * its own row), marker pixels, and the p90 redmean distance of the body's
 * pixels from the mean of the ring around it.  Legible = body px ≥ minPx
 * and sep ≥ minSep; an elite reads AS an elite only through marker pixels
 * actually on screen (nightbloom TRAPS: contrast is not identity).
 * ------------------------------------------------------------------ */
import * as THREE from 'three';
import { CONTRACT as C } from './data.js';

const W = 480;
const H = 270;

export function createLegibility({ renderer, scene, camera }) {
  const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const idBuf = new Uint8Array(W * H * 4);
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, toneMapped: false });
  const bodyMats = new Map();
  const markerMats = new Map();
  const mat = (map, id, marker) => {
    if (!map.has(id)) {
      const m = new THREE.MeshBasicMaterial({ fog: false, toneMapped: false });
      m.color.setRGB(id / 255, marker ? 1 : 0, 0);
      map.set(id, m);
    }
    return map.get(id);
  };
  let colour = null;

  /** Read the graded frame the pipeline just rendered (call right after pipeline.render()). */
  function grabColour() {
    const gl = renderer.getContext();
    const cw = gl.drawingBufferWidth; const ch = gl.drawingBufferHeight;
    if (!colour || colour.w !== cw || colour.h !== ch) colour = { w: cw, h: ch, buf: new Uint8Array(cw * ch * 4) };
    gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, colour.buf);
    return colour;
  }

  /** bodies: [{ id, root }], markers: [mesh] → Map id -> row */
  function measure(bodies, markers, enemyById) {
    const restore = [];
    const bodySet = new Map();
    for (const b of bodies) b.root.traverse((o) => { if (o.isMesh) bodySet.set(o, b.id); });
    const markerSet = new Map();
    for (const m of markers) { let id = null; for (let o = m; o; o = o.parent) if (o.userData?.enemy !== undefined) { id = o.userData.enemy; break; } markerSet.set(m, id); }
    const bgWas = scene.background; const fogWas = scene.fog;
    scene.background = null; scene.fog = null;
    scene.traverse((o) => {
      if (!o.visible) return;
      if (o.isPoints || o.isLine || o.isSprite) { restore.push([o, null, true]); o.visible = false; return; }
      if (!o.isMesh) return;
      restore.push([o, o.material, false]);
      if (markerSet.has(o)) o.material = mat(markerMats, markerSet.get(o) ?? 0, true);
      else if (bodySet.has(o)) o.material = mat(bodyMats, bodySet.get(o), false);
      else o.material = black;
    });
    const cm = THREE.ColorManagement.enabled;
    THREE.ColorManagement.enabled = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, idBuf);
    renderer.setRenderTarget(null);
    THREE.ColorManagement.enabled = cm;
    for (const [o, m, hidden] of restore) { if (hidden) o.visible = true; else o.material = m; }
    scene.background = bgWas; scene.fog = fogWas;

    const col = colour;
    const sx = col ? col.w / W : 1; const sy = col ? col.h / H : 1;
    const rows = new Map();
    const px = new Map(); const mk = new Map(); const pix = new Map(); const box = new Map();
    for (let p = 0; p < W * H; p += 1) {
      const r = idBuf[p * 4]; const g = idBuf[p * 4 + 1];
      if (!r) continue;
      const id = Math.round(r);
      if (g > 200) { mk.set(id, (mk.get(id) ?? 0) + 1); continue; }
      px.set(id, (px.get(id) ?? 0) + 1);
      if (!pix.has(id)) { pix.set(id, []); box.set(id, [W, H, -1, -1]); }
      pix.get(id).push(p);
      const x = p % W; const y = (p - x) / W; const b = box.get(id);
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    }
    const redmean = (a, b) => {
      const rbar = (a[0] + b[0]) / 2; const dr = a[0] - b[0]; const dg = a[1] - b[1]; const db = a[2] - b[2];
      return Math.sqrt((2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db) / 765;
    };
    const sample = (x, y) => {
      if (!col) return [0, 0, 0];
      const cx = Math.min(col.w - 1, Math.floor(x * sx)); const cy = Math.min(col.h - 1, Math.floor(y * sy));
      const k = (cy * col.w + cx) * 4;      // the rt and the canvas share the bottom-left origin
      return [col.buf[k], col.buf[k + 1], col.buf[k + 2]];
    };
    for (const [id, n] of px) {
      const [x0, y0, x1, y1] = box.get(id);
      const back = [0, 0, 0]; let bn = 0;
      for (let y = Math.max(0, y0 - 5); y <= Math.min(H - 1, y1 + 5); y += 1) {
        for (let x = Math.max(0, x0 - 5); x <= Math.min(W - 1, x1 + 5); x += 1) {
          if (idBuf[(y * W + x) * 4]) continue;
          const c = sample(x, y); back[0] += c[0]; back[1] += c[1]; back[2] += c[2]; bn += 1;
        }
      }
      let sep = 0;
      if (bn) {
        const bm = back.map((v) => v / bn);
        const d = pix.get(id).map((p) => redmean(sample(p % W, (p - (p % W)) / W), bm)).sort((a, b) => a - b);
        sep = d[Math.floor(d.length * 0.9)] ?? 0;
      }
      const e = enemyById?.(id);
      const elite = !!e?.elite;
      const markPx = mk.get(id) ?? 0;
      const L = C.legibility;
      const legible = elite ? (n >= L.minPx && markPx >= L.eliteMarkerPx) : (n >= L.minPx && sep >= L.minSep);
      rows.set(id, { id, px: n, markPx, sep: +sep.toFixed(3), elite, legible, kind: e?.kind });
    }
    for (const [id, m] of mk) if (!rows.has(id)) rows.set(id, { id, px: 0, markPx: m, sep: 0, elite: !!enemyById?.(id)?.elite, legible: false, kind: enemyById?.(id)?.kind, markerOnly: true });
    return rows;
  }

  /** Which markers see through walls (depthTest off) — reported as their own row. */
  function xrayMarkers(markers) { return markers.filter((m) => m.material && m.material.depthTest === false).length; }

  return { measure, grabColour, xrayMarkers, size: [W, H] };
}
