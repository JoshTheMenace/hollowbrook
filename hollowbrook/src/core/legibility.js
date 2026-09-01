import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Vista LEGIBILITY gate — does the subject READ, not can a ray reach it.
 *
 * core/camcheck.js asks whether a ray from the camera arrives at the
 * declared subject.  That is a necessary test and it is not the promise a
 * vista makes.  Measured on a real town: all three declared vistas passed
 * the raycast gate and the landmark contract, and the arrival vista — the
 * one that exists to show the destination the whole route points at —
 * gave about 60 % of its frame to one unbroken band of tree canopy and
 * rendered its subject as a hazed cream ghost.  Turning the polish pass
 * OFF made it MORE legible.  Every gate was green; the picture did not
 * work.  That gap is what this file closes.
 *
 * THE MECHANISM.  Three renders at the vista camera:
 *
 *   1. the REAL frame, through the full pipeline (ink + grade), read back
 *      out of the pipeline's own byte target — so the pixels measured are
 *      display-referred and are the ones a reviewer looks at;
 *   2. an ID pass — every mesh flat-shaded with a colour that encodes its
 *      CLASS index (nearest ancestor carrying `userData.kind`, else the
 *      nearest named ancestor), the subject's own subtree reserved as
 *      class 0, fog off, unlit, no tone map.  One pass gives the exact
 *      subject pixel mask AND the histogram of what else fills the frame;
 *   3. the same pass with everything except the subject hidden, which is
 *      the subject's UNOCCLUDED silhouette — the difference between (2)
 *      and (3) is how much of the subject something is standing in front
 *      of, which is the number that names the defect.
 *
 * THE METRICS.
 *
 *   skyEdge    THE GATE.  Median, over the part of the subject's outline
 *              that stands against open SKY, of |mean real luma just
 *              inside − mean real luma just outside|.  Local, median, and
 *              SPLIT BY WHAT THE OUTLINE ABUTS — all three of those had to
 *              be true before the metric agreed with a human.  Measured on
 *              the same three vistas, the failing one against the two
 *              working ones:
 *
 *                              share   ring   whole outline   vs SKY
 *                from-the-road  0.37%  21.6       29.8         24.9  <- ghost
 *                over-the-green 0.20%  32.4       77.9         98.7
 *                from-the-knoll 2.03%  74.2       72.8        128.8
 *
 *              Share has the sign BACKWARDS.  A ring mean and a whole-
 *              outline median both rank it worst but by a margin too thin
 *              to threshold.  Only the sky-facing split separates them by
 *              4x, and it is obvious in hindsight: a landmark seen across
 *              a town is read by its silhouette, that is exactly the part
 *              of the outline aerial perspective erases, and averaging it
 *              with the outline's dark-canopy half hides the loss.
 *   ringContrast  |mean luma in the mask − mean luma in a dilated ring|.
 *              Kept as the coarse reading; it is not the gate.
 *   share      subject pixels / frame pixels.  MEASURED NOT TO
 *              DISCRIMINATE and kept only as an absence floor — on the
 *              town this was calibrated against, the WELL-composed vista's
 *              subject was 0.20 % of the frame and the failing one's was
 *              0.37 %.  A landmark seen across a town is a note in the
 *              skyline, not an area; what makes it read is contrast.
 *              MIN_SUBJECT_SHARE therefore only catches a subject that is
 *              essentially not in the picture at all.
 *   occluded   1 − share / unoccluded share.  Advisory: it says WHY the
 *              share is low, and names the class doing it.
 *   classes    pixel share per class.  A frame more than MAX_CLASS_SHARE
 *              one class is a frame of that class, whatever it is aimed
 *              at.  Advisory, because a deliberate wall of one thing is a
 *              composition and a gate cannot tell the two apart.
 *
 * RUN IT BOTH WAYS.  `checkAllVistas({ polish })` takes a toggle callback
 * so the same three vistas can be measured with the polish layer on and
 * off; polish that REDUCES a declared subject's contrast is a defect in
 * the polish pass, not in the district.
 *
 * Needs WebGL, so unlike camcheck this cannot run headless in Node.  It is
 * exposed on the page (window.__vignette.checkVistaLegibility /
 * checkAllVistas) and scripts/check-legibility.mjs prints the recipe.
 * ------------------------------------------------------------------ */

/** Frame the metrics are measured at.  Small on purpose: the numbers are
 *  areas and means, both of which are resolution-independent, and three
 *  renders at 1600x900 is a visible hitch. */
export const CAPTURE_W = 960;
export const CAPTURE_H = 540;

/** ABSENCE floor, not a composition threshold — see the header.  0.05 % of
 *  a 960x540 frame is 259 px, about a 16 px square: below that the subject
 *  is not in the picture in any useful sense.  Calibrated on Thistledown,
 *  where the failing vista's subject was LARGER (0.37 %) than the working
 *  one's (0.20 %), so a share threshold that separated them would have had
 *  the sign backwards. */
export const MIN_SUBJECT_SHARE = 0.0005;

/** THE GATE.  Median separation, in display luma, along the part of the
 *  subject's outline that stands against open SKY — its silhouette.
 *
 *  Calibrated between two anchors an independent reviewer judged without
 *  seeing any of these numbers.  On Thistledown, before repair:
 *
 *      from-the-road   24.9   "a hazed cream ghost"        FAIL
 *      over-the-green  98.7   "reads the tower cleanly"    PASS
 *      from-the-knoll 128.8   reads                        PASS
 *
 *  Anything from 25 to 98 fits, which is a wide interval and is stated
 *  rather than hidden: 40 is roughly 16 % of the range, about the value
 *  step an animator paints between two planes, and it sits clear of both
 *  anchors.  Note it is much higher than the "7 luma reads as zero" cel-band
 *  figure, and it should be: a landmark at town distance gets NO ink (the
 *  ink pass fades out by 80 m) so tone is carrying the shape alone. */
export const MIN_SKY_EDGE_CONTRAST = 40;

/** Fallback floor on the whole outline, for a subject with little or no sky
 *  behind it (a landmark seen against a hillside).  Deliberately lower: a
 *  subject read against other masses has ink and occlusion cues too. */
export const MIN_EDGE_CONTRAST = 18;

/** Below this share of its outline there is no silhouette to gate on, and
 *  MIN_EDGE_CONTRAST is used instead. */
const SKY_EDGE_QUORUM = 0.2;

/** A frame more than this one class is a frame of that class (advisory). */
export const MAX_CLASS_SHARE = 0.5;

/** Ring radius for the contrast measurement, in capture pixels. */
export const RING_PX = 12;

/** Materials fainter than this are haze, glass or cloud: they do not hide
 *  a landmark, they wash it out, and washing out is what `contrast`
 *  measures.  Counting them as occluders would double-count. */
const OPAQUE_ENOUGH = 0.85;

const BACKGROUND_INDEX = 4095;

/** Class index -> a colour whose channels survive a byte round trip: each
 *  channel is one of 16 levels, 16 apart, read back by a shift. */
const idColor = (i) => (((i & 15) * 16 + 8) << 16) | ((((i >> 4) & 15) * 16 + 8) << 8) | (((i >> 8) & 15) * 16 + 8);
const idDecode = (r, g, b) => (r >> 4) | ((g >> 4) << 4) | ((b >> 4) << 8);

const r2 = (v) => Math.round(v * 100) / 100;
const pct = (v) => `${(v * 100).toFixed(2)} %`;

/** Separable box dilation of a 0/1 mask. */
function dilate(mask, w, h, radius) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      let v = 0;
      for (let d = -radius; d <= radius && !v; d += 1) {
        const nx = x + d;
        if (nx >= 0 && nx < w && mask[row + nx]) v = 1;
      }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let v = 0;
      for (let d = -radius; d <= radius && !v; d += 1) {
        const ny = y + d;
        if (ny >= 0 && ny < h && tmp[ny * w + x]) v = 1;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * @param {object} args
 * @param {THREE.WebGLRenderer} args.renderer
 * @param {THREE.Scene} args.scene
 * @param {THREE.PerspectiveCamera} args.camera
 * @param {import('./post.js').Pipeline} args.pipeline
 * @param {Record<string, {position:number[], target:number[], fov?:number, subject?:string, owner?:string}>} args.cameras
 * @param {(w:number,h:number)=>void} [args.onResize] anything else that has
 *   to track the render size (the outline pass's resolution uniform), called
 *   with the capture size and again with the restored size.
 */
export function createLegibilityCheck({ renderer, scene, camera, pipeline, cameras, onResize = null }) {
  let maskRT = null;
  const matCache = new Map();

  const classMaterial = (index, src) => {
    const cut = src && src.alphaTest > 0 && src.map ? src.map.uuid : '';
    const key = `${index}|${cut}|${src ? src.side : 0}`;
    if (!matCache.has(key)) {
      const m = new THREE.MeshBasicMaterial({ fog: false, toneMapped: false });
      m.color.setHex(idColor(index));
      if (src) {
        m.side = src.side;
        if (src.alphaTest > 0 && src.map) { m.alphaMap = src.map; m.alphaTest = src.alphaTest; m.transparent = false; }
      }
      matCache.set(key, m);
    }
    return matCache.get(key);
  };

  function classKeyOf(object) {
    for (let o = object; o; o = o.parent) {
      const k = o.userData && o.userData.kind;
      if (k) return String(k);
    }
    for (let o = object; o; o = o.parent) if (o.name) return o.name;
    return '(unclassified)';
  }

  function inSubtree(object, root) {
    for (let o = object; o; o = o.parent) if (o === root) return true;
    return false;
  }

  /** Render an ID frame and read it back.  `soloSubject` hides everything
   *  that is not the subject, which gives its unoccluded silhouette. */
  function idPass(subject, w, h, soloSubject) {
    const restore = [];
    const classes = new Map(); // key -> index
    const names = ['(subject)'];
    const cmWas = THREE.ColorManagement.enabled;
    const tmWas = renderer.toneMapping;
    const bgWas = scene.background;
    const fogWas = scene.fog;
    const clearWas = new THREE.Color();
    renderer.getClearColor(clearWas);
    const clearAlphaWas = renderer.getClearAlpha();

    THREE.ColorManagement.enabled = false;
    renderer.toneMapping = THREE.NoToneMapping;
    scene.background = null;
    scene.fog = null;
    renderer.setClearColor(idColor(BACKGROUND_INDEX), 1);

    scene.traverse((o) => {
      if (!o.visible) return;
      const isMesh = o.isMesh === true;
      if (!isMesh) {
        if (o.isPoints || o.isLine || o.isSprite) { restore.push([o, null, true]); o.visible = false; }
        return;
      }
      const mine = inSubtree(o, subject);
      if (soloSubject && !mine) { restore.push([o, null, true]); o.visible = false; return; }
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!mine && src && src.transparent && (src.opacity ?? 1) < OPAQUE_ENOUGH) {
        restore.push([o, null, true]);
        o.visible = false;
        return;
      }
      let index = 0;
      if (!mine) {
        const key = classKeyOf(o);
        if (!classes.has(key)) { classes.set(key, names.length); names.push(key); }
        index = classes.get(key);
      }
      restore.push([o, o.material, false]);
      o.material = classMaterial(index, src);
    });

    renderer.setRenderTarget(maskRT);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(maskRT, 0, 0, w, h, buf);
    renderer.setRenderTarget(null);

    for (const [o, mat, hidden] of restore) {
      if (hidden) o.visible = true;
      else o.material = mat;
    }
    THREE.ColorManagement.enabled = cmWas;
    renderer.toneMapping = tmWas;
    scene.background = bgWas;
    scene.fog = fogWas;
    renderer.setClearColor(clearWas, clearAlphaWas);
    return { buf, names };
  }

  /**
   * Measure one vista.
   * @param {string} name
   * @param {{ width?: number, height?: number, label?: string }} [opts]
   */
  function checkVistaLegibility(name, opts = {}) {
    const view = cameras[name];
    const failures = [];
    const warnings = [];
    if (!view) {
      return { name, ok: false, failures: [`no vista camera named "${name}" — have: ${Object.keys(cameras).join(', ')}`], warnings: [] };
    }
    if (!view.subject) {
      return { name, ok: false, failures: ['no `subject` declared — a vista with no named subject cannot be gated on legibility'], warnings: [] };
    }
    const subject = scene.getObjectByName(view.subject);
    if (!subject) {
      return { name, ok: false, failures: [`subject "${view.subject}" is not in the scene`], warnings: [] };
    }

    const w = opts.width ?? CAPTURE_W;
    const h = opts.height ?? CAPTURE_H;
    if (!maskRT) {
      maskRT = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, colorSpace: THREE.NoColorSpace,
      });
    } else if (maskRT.width !== w || maskRT.height !== h) {
      maskRT.setSize(w, h);
    }

    const saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
      aspect: camera.aspect,
      forceScale: pipeline.forceScale,
      fxaa: pipeline.enabled.fxaa,
      size: pipeline.size.clone(),
    };
    const real = new Uint8Array(w * h * 4);
    let ids;
    try {
      camera.position.fromArray(view.position);
      camera.lookAt(new THREE.Vector3().fromArray(view.target));
      camera.fov = view.fov ?? 52;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      /* The real frame.  fxaa ON is what puts the graded, sRGB-encoded
       * result in the pipeline's byte target instead of straight on the
       * screen, which is the only place it can be read back from. */
      pipeline.forceScale = 1;
      pipeline.enabled.fxaa = true;
      pipeline.setSize(w, h);
      if (onResize) onResize(pipeline.size.x, pipeline.size.y);
      pipeline.render();
      renderer.readRenderTargetPixels(pipeline.rtB, 0, 0, w, h, real);

      ids = idPass(subject, w, h, false);
      const solo = idPass(subject, w, h, true);
      ids.solo = solo.buf;
    } finally {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.fov = saved.fov;
      camera.aspect = saved.aspect;
      camera.updateProjectionMatrix();
      pipeline.forceScale = saved.forceScale;
      pipeline.enabled.fxaa = saved.fxaa;
      pipeline.setSize(saved.size.x, saved.size.y);
      if (onResize) onResize(pipeline.size.x, pipeline.size.y);
    }

    // ---- decode ----
    const total = w * h;
    const mask = new Uint8Array(total);
    const hist = new Map(); // index -> pixels
    let subjectPixels = 0;
    for (let i = 0; i < total; i += 1) {
      const o = i * 4;
      const idx = idDecode(ids.buf[o], ids.buf[o + 1], ids.buf[o + 2]);
      if (idx === 0) { mask[i] = 1; subjectPixels += 1; }
      hist.set(idx, (hist.get(idx) ?? 0) + 1);
    }
    let soloPixels = 0;
    for (let i = 0; i < total; i += 1) {
      if (idDecode(ids.solo[i * 4], ids.solo[i * 4 + 1], ids.solo[i * 4 + 2]) === 0) soloPixels += 1;
    }

    const share = subjectPixels / total;
    const occluded = soloPixels > 0 ? Math.max(0, 1 - subjectPixels / soloPixels) : 0;

    // ---- contrast in the REAL frame ----
    const luma = (o) => 0.2126 * real[o] + 0.7152 * real[o + 1] + 0.0722 * real[o + 2];
    const ring = dilate(mask, w, h, opts.ringPx ?? RING_PX);
    let sIn = 0;
    let nIn = 0;
    let sRing = 0;
    let nRing = 0;
    const ringClasses = new Map();
    for (let i = 0; i < total; i += 1) {
      if (mask[i]) { sIn += luma(i * 4); nIn += 1; }
      else if (ring[i]) {
        sRing += luma(i * 4);
        nRing += 1;
        const idx = idDecode(ids.buf[i * 4], ids.buf[i * 4 + 1], ids.buf[i * 4 + 2]);
        ringClasses.set(idx, (ringClasses.get(idx) ?? 0) + 1);
      }
    }
    const subjectLuma = nIn ? sIn / nIn : 0;
    const ringLuma = nRing ? sRing / nRing : 0;
    const ringContrast = Math.abs(subjectLuma - ringLuma);

    /* ---- the gate: LOCAL outline separation ----------------------------
     * At every pixel on the subject's outline, the mean real luma of the
     * subject side against the mean real luma of whatever is on the other
     * side of that piece of outline, both taken in a small window.  The
     * MEDIAN over the outline is the verdict, because a subject can abut
     * dark canopy along a third of its edge and pale sky along the rest,
     * and a mean over a ring reports the average of those two as healthy
     * while most of the silhouette has in fact dissolved. */
    const HALF = opts.edgeWindowPx ?? 5;
    const edges = [];
    const skyEdges = [];   // outline against open sky -- the SILHOUETTE
    const solidEdges = []; // outline against something built or planted
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        if (!mask[i]) continue;
        if (mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) continue; // interior
        let si = 0;
        let ni = 0;
        let so = 0;
        let no = 0;
        let nSky = 0;
        for (let dy = -HALF; dy <= HALF; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -HALF; dx <= HALF; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            const l = luma(j * 4);
            if (mask[j]) { si += l; ni += 1; continue; }
            so += l;
            no += 1;
            const idx = idDecode(ids.buf[j * 4], ids.buf[j * 4 + 1], ids.buf[j * 4 + 2]);
            if (idx === BACKGROUND_INDEX) nSky += 1;
          }
        }
        if (!ni || !no) continue;
        const d = Math.abs(si / ni - so / no);
        edges.push(d);
        (nSky > no / 2 ? skyEdges : solidEdges).push(d);
      }
    }
    const median = (arr) => {
      if (!arr.length) return null;
      const s = arr.slice().sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const quant = (arr, q) => {
      if (!arr.length) return 0;
      const s = arr.slice().sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.floor(s.length * q))];
    };
    const edgeContrast = quant(edges, 0.5);
    const edgeP25 = quant(edges, 0.25);
    /* SPLIT BY WHAT THE OUTLINE IS AGAINST, which is the whole point.  A
     * landmark seen across a town is read by its SILHOUETTE — the part of
     * its outline that stands against open sky — and that is precisely the
     * part aerial perspective erases, because haze pulls a distant subject
     * toward the sky's own value.  Averaged with the outline's lower half
     * (against dark canopy, always high contrast) it disappears: on the
     * town this was calibrated against, the failing arrival vista read 29.8
     * overall and 12.6 against sky. */
    const skyEdgeContrast = median(skyEdges);
    const solidEdgeContrast = median(solidEdges);
    const skyEdgeShare = edges.length ? skyEdges.length / edges.length : 0;

    const label = (idx) => (idx === BACKGROUND_INDEX ? '(sky)' : ids.names[idx] ?? `#${idx}`);
    const classes = [...hist.entries()]
      .filter(([idx]) => idx !== 0)
      .map(([idx, n]) => ({ klass: label(idx), share: n / total }))
      .sort((a, b) => b.share - a.share);
    const ringTop = [...ringClasses.entries()].sort((a, b) => b[1] - a[1])[0];
    const occluders = [...hist.entries()]
      .filter(([idx]) => idx !== 0 && idx !== BACKGROUND_INDEX)
      .sort((a, b) => b[1] - a[1]);

    // ---- verdict ----
    const min = opts.minShare ?? MIN_SUBJECT_SHARE;
    const minE = opts.minEdgeContrast ?? MIN_EDGE_CONTRAST;
    if (share < min) {
      failures.push(`subject "${view.subject}" is ${pct(share)} of the frame, absence floor ${pct(min)} — ` +
        `${pct(occluded)} of its silhouette is behind something` +
        (occluders.length ? `, the largest class in the frame is "${label(occluders[0][0])}" at ${pct(occluders[0][1] / total)}` : '') +
        '. The vista is not showing its subject at all.');
    }
    const minSky = opts.minSkyEdgeContrast ?? MIN_SKY_EDGE_CONTRAST;
    const why = `${pct(occluded)} of it is occluded; the largest class in the frame is ` +
      `"${occluders.length ? label(occluders[0][0]) : 'nothing'}" at ${occluders.length ? pct(occluders[0][1] / total) : '0 %'}.`;
    if (skyEdgeShare >= SKY_EDGE_QUORUM && skyEdgeContrast !== null && skyEdgeContrast < minSky) {
      failures.push(`subject "${view.subject}" separates from the SKY behind it by ${r2(skyEdgeContrast)} luma at the ` +
        `median of its silhouette (${pct(skyEdgeShare)} of its outline is against sky), floor ${minSky}. ` +
        'It is in the frame and it does not read as a shape — the usual cause is aerial perspective on a subject ' +
        'further away than the atmosphere was tuned for, and the usual second cause is a subject at or past the ' +
        `camera's own far plane. Whole-outline median ${r2(edgeContrast)}, against built masses ${r2(solidEdgeContrast ?? 0)}. ${why}`);
    } else if (skyEdgeShare < SKY_EDGE_QUORUM && edgeContrast < minE) {
      failures.push(`subject "${view.subject}" separates from what it is against by ${r2(edgeContrast)} luma at the ` +
        `median of its own outline (p25 ${r2(edgeP25)}), floor ${minE}, and only ${pct(skyEdgeShare)} of that outline ` +
        `is against sky, so there is no silhouette carrying it either. ${why}`);
    }
    const dominant = classes[0];
    if (dominant && dominant.share > (opts.maxClassShare ?? MAX_CLASS_SHARE)) {
      warnings.push(`${pct(dominant.share)} of the frame is one class, "${dominant.klass}" — ` +
        'a frame more than half one thing is a picture of that thing.');
    }
    if (occluded > 0.5 && share >= min) {
      warnings.push(`${pct(occluded)} of the subject's silhouette is occluded ` +
        `(${Math.round(subjectPixels)} px visible of ${Math.round(soloPixels)} unobstructed).`);
    }

    return {
      name,
      ok: failures.length === 0,
      failures,
      warnings,
      subject: view.subject,
      owner: view.owner ?? null,
      label: opts.label ?? null,
      metrics: {
        share, sharePct: Number((share * 100).toFixed(3)),
        unoccludedShare: soloPixels / total,
        occluded: Number(occluded.toFixed(3)),
        subjectPixels, soloPixels,
        subjectLuma: r2(subjectLuma), ringLuma: r2(ringLuma),
        edgeContrast: r2(edgeContrast), edgeP25: r2(edgeP25), edgeSamples: edges.length,
        skyEdgeContrast: skyEdgeContrast === null ? null : r2(skyEdgeContrast),
        solidEdgeContrast: solidEdgeContrast === null ? null : r2(solidEdgeContrast),
        skyEdgeShare: r2(skyEdgeShare),
        ringContrast: r2(ringContrast),
        ringTopClass: ringTop ? label(ringTop[0]) : null,
        capture: [w, h],
      },
      classes: classes.slice(0, 6),
    };
  }

  /**
   * Every vista, optionally with the polish layer toggled both ways.
   * @param {{ polish?: (on:boolean)=>void, names?: string[] }} [opts]
   */
  function checkAllVistas(opts = {}) {
    const names = opts.names ?? Object.keys(cameras);
    const runs = [];
    if (opts.polish) {
      for (const on of [true, false]) {
        opts.polish(on);
        for (const n of names) runs.push(checkVistaLegibility(n, { label: on ? 'polish ON' : 'polish OFF', ...opts }));
      }
      opts.polish(true);
    } else {
      for (const n of names) runs.push(checkVistaLegibility(n, opts));
    }

    /* Polish that reduces a declared subject's contrast is a defect in the
     * polish pass: the layer is discretionary and the vista is a promise. */
    const polishWarnings = [];
    if (opts.polish) {
      for (const n of names) {
        const on = runs.find((r) => r.name === n && r.label === 'polish ON');
        const off = runs.find((r) => r.name === n && r.label === 'polish OFF');
        if (!on?.metrics || !off?.metrics) continue;
        const key = on.metrics.skyEdgeContrast !== null && off.metrics.skyEdgeContrast !== null ? 'skyEdgeContrast' : 'edgeContrast';
        const d = on.metrics[key] - off.metrics[key];
        if (d < -1) {
          polishWarnings.push(`${n}: polish REDUCES the subject's outline separation by ${r2(-d)} luma ` +
            `(${off.metrics[key]} off -> ${on.metrics[key]} on) — tune the haze against the vista cameras' ` +
            'subjects, not against a ground frame. A vista is a promise; the polish layer is discretionary.');
        }
      }
    }

    const primary = runs.filter((r) => r.label !== 'polish OFF');
    const ok = primary.every((r) => r.ok);
    const line = (r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.label ? ` [${r.label}]` : ''}` +
      (r.metrics
        ? ` — silhouette vs sky ${r.metrics.skyEdgeContrast} luma (${(r.metrics.skyEdgeShare * 100).toFixed(0)} % of outline), ` +
          `whole outline ${r.metrics.edgeContrast}, subject ${r.metrics.sharePct} % of frame` +
          `, ${(r.metrics.occluded * 100).toFixed(0)} % occluded` +
          (r.classes?.length ? `; biggest class "${r.classes[0].klass}" ${pct(r.classes[0].share)}` : '')
        : '') +
      r.failures.map((f) => `\n  - ${f}`).join('') +
      r.warnings.map((x) => `\n  WARN ${x}`).join('');
    return {
      ok,
      runs,
      warnings: [...primary.flatMap((r) => r.warnings.map((w) => `${r.name}: ${w}`)), ...polishWarnings],
      report: [...runs.map(line), ...polishWarnings.map((w) => `WARN ${w}`)].join('\n'),
    };
  }

  return { checkVistaLegibility, checkAllVistas };
}
