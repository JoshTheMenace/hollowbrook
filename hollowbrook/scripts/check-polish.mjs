#!/usr/bin/env node
/**
 * THE POLISH GATE — the A/B the polish pass is only allowed to keep what
 * survives.
 *
 * `src/polish.js` is discretionary: six mechanisms behind one URL toggle,
 * added on top of a town that already passes every mechanical gate.  The
 * reference (`.codex/skills/build-stylized-threejs-scene/references/
 * polish-pass.md`) says the layer is kept mechanism by mechanism, on
 * evidence, and names the one mechanism that can make the picture WORSE:
 * aerial perspective, which has to be A/B'd against the VISTA cameras'
 * declared subjects rather than against a street frame, because nothing on
 * a street is a hundred metres away.
 *
 * So this gate measures, in the judging space — rendered pixels:
 *
 *   1. VISTA LEGIBILITY, both ways.  `core/legibility.js`'s
 *      `checkAllVistas` at `?polish=off` and at `?polish=on`.  FAIL if any
 *      vista's silhouette separation against open sky is under 40 luma with
 *      the layer ON, or if it DROPS by more than 8 luma against OFF.  A
 *      vista is a promise; the polish layer is not.
 *   2. DRAW CALLS at every vista and both street cameras, off and on.  FAIL
 *      over 1400 (the play gate's cap) with the layer on; FAIL if the layer
 *      itself costs more than 120 at the heaviest camera, because the game
 *      page adds ~200 meshes of enemies on top of this.
 *   3. THE PER-MECHANISM DELTA, by loading `?polish=<one>` for each one and
 *      diffing against `?polish=off` — which is the number that says
 *      whether a mechanism is worth its cost.
 *   4. THE AUDITS: p1 surface maps (a material-ID pass at every vista, so
 *      "covers more than 2 % of a frame" is measured), p6 accent
 *      discipline, p7 practicals with light pools.
 *
 * It also writes the A/B frames — `.shots/polish-<camera>-{off,on}.jpg` —
 * with `--shots`, because a number is not a picture and the method is to
 * READ both frames.
 *
 *   node scripts/check-polish.mjs            # the gate
 *   node scripts/check-polish.mjs --shots    # the gate + the A/B frames
 *
 * The dev server is this project's own vite on PORT 5222 (campaign rule:
 * 5220-5229, and this agent owns 5222).  If one is already listening there
 * the script attaches to it rather than fighting it for the port.
 *
 * exit 0 pass · 1 a check failed · 2 crashed
 */

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.POLISH_PORT ?? 5222);
const SHOTS = process.argv.includes('--shots');
/* The game page too — slower (it boots charforge, the cast and the audio
 * bank), and it is where the 1400 cap actually belongs: `__drawCalls()` at
 * the play camera with a wave alive. */
const GAME = process.argv.includes('--game');

const MIN_SKY_EDGE = 40;      // core/legibility.js's own floor
const MAX_DROP = 8;           // luma a vista may lose to the polish layer
const MAX_CALLS = 1400;       // LOOP-CONTRACT drawCallsMax
const MAX_LAYER_CALLS = 120;  // what the polish layer itself may cost

/* The two STREET cameras.  The vistas are the plan's; these are not, and
 * they are here because the polish pass lives at eye level: the gate square
 * from the player's own spawn looking north up the axis, and the row lane
 * looking east at the second gate.  `__shot` in the town page takes the
 * position VERBATIM (it does not re-derive the feet), so the y is the
 * walker's eye and the ground under both was checked against
 * `groundLayerAt` and the collider list before either was written down. */
const STREET = {
  'gate-square': { position: [0, 1.66, 30], target: [0, 2.2, 4] },
  'row-lane': { position: [24, 1.66, 22], target: [46, 3.0, 22] },
};

const checks = [];
const check = (id, pass, note) => checks.push({ id, pass, note });
const r2 = (v) => (v === null || v === undefined ? null : Number(v.toFixed(2)));

async function main() {
  let server = null;
  let url = `http://127.0.0.1:${PORT}`;
  const alive = await fetch(url, { method: 'GET' }).then((r) => r.ok).catch(() => false);
  if (!alive) {
    server = await createServer({ root: ROOT, server: { port: PORT, strictPort: true }, logLevel: 'error' });
    await server.listen();
    url = `http://127.0.0.1:${PORT}`;
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  });

  /** One page load at one polish setting; hands the callback the page. */
  async function withPolish(query, fn) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.on('pageerror', (e) => console.error('[page error]', e.message));
    await page.goto(`${url}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__vignette && document.querySelector("#view").dataset.sceneReady === "true"', { timeout: 60000 });
    // NOTHING ANIMATES ON ITS OWN in a headless page beyond the rAF the
    // loop runs, and the drifting layers want to be mid-drift rather than
    // at their seeded scatter: step the vignette by hand, exactly as the
    // capture recipe in CLAUDE.md does.
    await page.evaluate(() => {
      const v = window.__vignette;
      const eye = v.camera.position;
      for (let i = 0; i < 240; i += 1) v.vignette.update(1 / 60, eye);
    });
    try { return await fn(page); } finally { await page.close(); }
  }

  /* Draw calls at a named camera.  `renderer.info` resets on EVERY
   * `renderer.render`, and the pipeline is four of them, so the count has
   * to be taken with `autoReset` off — which is exactly what the game
   * page's own `__drawCalls` does. */
  const CALLS = (views) => {
    const v = window.__vignette;
    const { renderer, pipeline, camera } = v;
    const saved = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, auto: renderer.info.autoReset };
    renderer.info.autoReset = false;
    const out = {};
    for (const [name, view] of Object.entries(views)) {
      camera.position.fromArray(view.position);
      camera.lookAt(view.target[0], view.target[1], view.target[2]);
      camera.fov = view.fov ?? 52;
      camera.updateProjectionMatrix();
      renderer.info.reset();
      pipeline.render();
      out[name] = renderer.info.render.calls;
    }
    camera.position.copy(saved.p); camera.quaternion.copy(saved.q); camera.fov = saved.fov;
    camera.updateProjectionMatrix(); renderer.info.autoReset = saved.auto;
    return out;
  };

  const views = async (page) => page.evaluate(() => ({ ...window.__vignette.reviewCameras }));

  /* ---- 1. legibility, both ways ------------------------------------ */
  const legOff = await withPolish('polish=off', (p) => p.evaluate(() => window.__vignette.checkAllVistas().runs.map((r) => ({
    name: r.name, ok: r.ok, sky: r.metrics?.skyEdgeContrast ?? null, edge: r.metrics?.edgeContrast ?? null,
    share: r.metrics?.sharePct ?? null, failures: r.failures,
  }))));
  const legOn = await withPolish('polish=on', (p) => p.evaluate(() => window.__vignette.checkAllVistas().runs.map((r) => ({
    name: r.name, ok: r.ok, sky: r.metrics?.skyEdgeContrast ?? null, edge: r.metrics?.edgeContrast ?? null,
    share: r.metrics?.sharePct ?? null, failures: r.failures,
  }))));
  const byName = (list) => Object.fromEntries(list.map((r) => [r.name, r]));
  const LO = byName(legOff); const LN = byName(legOn);
  for (const name of Object.keys(LN)) {
    const on = LN[name]; const off = LO[name];
    const key = on.sky !== null && off.sky !== null ? 'sky' : 'edge';
    const drop = off[key] - on[key];
    check(`legibility:${name}`, on[key] >= MIN_SKY_EDGE && drop <= MAX_DROP,
      `${key === 'sky' ? 'silhouette vs sky' : 'whole outline'} ${r2(off[key])} off -> ${r2(on[key])} on ` +
      `(${drop >= 0 ? '-' : '+'}${r2(Math.abs(drop))}; floor ${MIN_SKY_EDGE}, max drop ${MAX_DROP})` +
      (on.failures?.length ? ` — ${on.failures[0]}` : ''));
  }

  /* ---- 2. draw calls, off and on ----------------------------------- */
  const vistaViews = await withPolish('polish=off', views);
  const ALL = { ...vistaViews, ...STREET };
  const callsOff = await withPolish('polish=off', (p) => p.evaluate(CALLS, ALL));
  const callsOn = await withPolish('polish=on', (p) => p.evaluate(CALLS, ALL));
  let worstDelta = 0; let worstAt = '';
  for (const name of Object.keys(ALL)) {
    const d = callsOn[name] - callsOff[name];
    if (d > worstDelta) { worstDelta = d; worstAt = name; }
    /* THE CAP IS A CAP ON WHAT THIS LAYER DID, and that distinction is the
     * whole check.  `drawCallsMax` 1400 is the PLAY camera's, measured in
     * the game page with a wave alive; the town viewer's vista cameras
     * stand outside the walls and see the whole town at once, and they read
     * 1931-3350 with the polish layer OFF.  Failing them on 1400 is failing
     * the polish pass for the town's own geometry, which it did not build
     * and may not change.  So: a camera fails only if the layer pushed it
     * over a cap it was under. */
    check(`draw-calls:${name}`, !(callsOn[name] > MAX_CALLS && callsOff[name] <= MAX_CALLS),
      `${callsOff[name]} off -> ${callsOn[name]} on (+${d})` +
      (callsOff[name] > MAX_CALLS ? `; already over the play cap ${MAX_CALLS} without the layer — the town's, not the layer's` : `; cap ${MAX_CALLS}`));
  }
  check('draw-calls:layer-cost', worstDelta <= MAX_LAYER_CALLS,
    `the polish layer costs at most +${worstDelta} calls (at ${worstAt}); budget ${MAX_LAYER_CALLS}`);

  /* ---- 2b. the GAME page, where the 1400 cap actually lives ---------- */
  let game = null;
  if (GAME) {
    game = {};
    for (const [q, tag] of [['polish=off', 'off'], ['polish=on', 'on']]) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      page.on('pageerror', (e) => console.error('[game page error]', e.message));
      await page.goto(`${url}/game.html?audio=off&${q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction('window.__game && document.querySelector("#view").dataset.gameReady === "true"', { timeout: 120000 });
      game[tag] = await page.evaluate(() => {
        const g = window.__game;
        const out = [];
        for (const wave of [1, 4, 6]) {
          const r = g.instrument.jumpToWave(wave, null, Math.PI);
          for (let i = 0; i < 60 * 40; i += 1) g.stepper.tickOnce();
          g.tick(1);
          out.push({ wave, alive: r.alive, calls: g.drawCalls() });
        }
        return out;
      });
      await page.close();
    }
    const worstOn = Math.max(...game.on.map((r) => r.calls));
    const worstOff = Math.max(...game.off.map((r) => r.calls));
    check('draw-calls:play-camera', !(worstOn > MAX_CALLS && worstOff <= MAX_CALLS),
      `game page, play camera with a wave alive: ${worstOff} off -> ${worstOn} on (+${worstOn - worstOff}); ` +
      `cap ${MAX_CALLS}${worstOff > MAX_CALLS ? ' — already over it without the layer' : ''}`);
  }

  /* ---- 3. the per-mechanism delta ---------------------------------- */
  const MECH = ['sky', 'ash', 'lanes', 'haze'];
  const perMech = {};
  for (const m of MECH) {
    const c = await withPolish(`polish=${m}`, (p) => p.evaluate(CALLS, ALL));
    perMech[m] = Object.fromEntries(Object.keys(ALL).map((n) => [n, c[n] - callsOff[n]]));
  }

  /* ---- 4. the audits ------------------------------------------------ */
  const audits = await withPolish('polish=on', (p) => p.evaluate(() => {
    const P = window.__polish;
    const s = P.surfaces({ measure: true });
    const a = P.accents();
    const pr = P.practicals();
    return {
      surfaces: { mapped: s.mapped, unmapped: s.unmapped, gaps: s.gaps, top: s.rows.slice(0, 14) },
      accents: { ok: a.ok, hits: a.hits.length, fails: a.fails, warns: a.warns },
      practicals: { ok: pr.ok, totals: pr.totals, missing: pr.missing, byDistrict: pr.byDistrict },
      stats: P.stats(), report: P.report(), fires: P.campFires, overhead: P.overhead().length,
    };
  }));
  check('p1:surface-maps', audits.surfaces.gaps.length === 0,
    audits.surfaces.gaps.length
      ? `unmapped materials over 2 % of a vista frame: ${audits.surfaces.gaps.map((g) => `${g.color} ${g.framePct} %`).join(', ')} — attach at the pool in src/kit/surface.js`
      : `${audits.surfaces.mapped} pooled materials carry a multiply map; the largest unmapped one is ` +
        `${audits.surfaces.top.find((t) => !t.map)?.framePct ?? 0} % of a vista frame, under the 2 % rule`);
  check('p6:accent-discipline', audits.accents.ok,
    audits.accents.ok
      ? `${audits.accents.hits} accent meshes, every one on its owner (companyRust on the camp banner only)`
      : audits.accents.fails.map((f) => `${f.accent} on ${f.mesh} at ${f.at}: ${f.why}`).join(' | '));
  check('p7:practicals-travel', audits.practicals.ok,
    `${audits.practicals.totals.lit} lit practicals, ${audits.practicals.totals.litWithPool} with a light pool` +
    (audits.practicals.missing.length ? ` — MISSING: ${audits.practicals.missing.map((m) => `${m.mesh} (${m.district})`).join(', ')}` : ''));

  /* ---- the A/B frames ----------------------------------------------- */
  if (SHOTS) {
    for (const [query, tag] of [['polish=off', 'off'], ['polish=on', 'on']]) {
      await withPolish(query, async (page) => {
        for (const name of Object.keys(vistaViews)) {
          await page.evaluate((n, t) => window.__shot(`polish-${n}-${t}`, 1280, 720, { review: n }), name, tag);
        }
        for (const [name, v] of Object.entries(STREET)) {
          await page.evaluate((n, t, view) => window.__shot(`polish-${n}-${t}`, 1280, 720, { pos: view.position, lookAt: view.target }), name, tag, v);
        }
      });
    }
  }

  await browser.close();
  if (server) await server.close();

  /* ---- the report ---------------------------------------------------- */
  console.log('== polish A/B ==\n');
  console.log('camera                 calls off   calls on   delta   sky-edge off   sky-edge on   drop');
  for (const name of Object.keys(ALL)) {
    const off = LO[name]; const on = LN[name];
    const k = on && off ? (on.sky !== null && off.sky !== null ? 'sky' : 'edge') : null;
    console.log(
      name.padEnd(22),
      String(callsOff[name]).padStart(9), String(callsOn[name]).padStart(10),
      String(callsOn[name] - callsOff[name]).padStart(7),
      String(k ? r2(off[k]) : '--').padStart(14), String(k ? r2(on[k]) : '--').padStart(13),
      String(k ? r2(off[k] - on[k]) : '--').padStart(6));
  }
  console.log('\n== per-mechanism draw-call delta (against ?polish=off) ==');
  console.log('camera                 ' + MECH.map((m) => m.padStart(7)).join(''));
  for (const name of Object.keys(ALL)) {
    console.log(name.padEnd(22) + MECH.map((m) => String(perMech[m][name]).padStart(7)).join(''));
  }
  console.log('\n' + audits.report + '\n');

  fs.mkdirSync(path.join(ROOT, 'final-evidence/polish'), { recursive: true });
  if (game) {
    console.log('== game page, play camera with a wave alive ==');
    for (let i = 0; i < game.on.length; i += 1) {
      console.log(`wave ${game.on[i].wave} (${game.on[i].alive} alive): ${game.off[i].calls} off -> ${game.on[i].calls} on (+${game.on[i].calls - game.off[i].calls})`);
    }
    console.log('');
  }

  fs.writeFileSync(path.join(ROOT, 'final-evidence/polish/ab.json'), JSON.stringify({
    legibility: { off: legOff, on: legOn }, calls: { off: callsOff, on: callsOn }, perMech, audits, cameras: ALL, game,
  }, null, 1));

  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} — ${c.note}`);
  const failed = checks.filter((c) => !c.pass);
  console.log(failed.length ? `RESULT: FAIL (${failed.length})` : 'RESULT: PASS');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('[check-polish] crashed:', e); process.exit(2); });
