#!/usr/bin/env node
/**
 * The play-camera gate — headless Chrome, the REAL page, the REAL compositor.
 *
 *  1. __playCheck: threats legible through the PLAY camera (contract
 *     `legibility`): visibleFrac, spawn -> FIRST sight p90, legibleFrac
 *     (px + redmean separation), elite marker pixels, over two canonical
 *     segments (wave 1 from the spawn; wave 4 from the market rim, which
 *     crosses the Captain).  Rows are keyed on BODY pixels; an X-ray marker
 *     (depthTest off) is reported separately, never counted as body.
 *  2. __latencyCheck: a real key event -> feet move within 1-2 ticks.
 *  3. __drawCalls at each arena camera with a full wave alive <= 1400.
 *  4. the runtime ladder twin: charforge's Feel.checkLadder over the LIVE
 *     wired table (the ladder gate's static twin reads the data file).
 *  5. RENDERED-SPACE ladder: every rung fired through the live bus at a
 *     fixed point in view; pixels changed + shake px must be non-decreasing
 *     up the ladder (composite: a double lance kill fires kill x2 + multikill
 *     and must out-render a single kill), a whiff never out-renders a hit,
 *     and every rung above bolt-hit must move >= 400 px at 1280x720.
 *  6. HUD PIXEL assertions on a real page.screenshot: the health bar's fill
 *     fraction, the bolt pips, the lights and the wave text are read back
 *     from the PNG the compositor produced, not from DOM state.
 *  7. PAYOFF visibility: every objective completion, from the spot the
 *     player completes it, moves pixels at the payoff's own screen position
 *     and that position is inside the frame — asserted on the frame.
 *
 *   node scripts/check-play.mjs        # exit 0 pass · 1 fail · 2 crash
 */
import fs from 'node:fs';
import { withPage } from './lib/browser-harness.mjs';
import { decodePNG, fractionIn, countIn } from './lib/png.mjs';

const PAGE = '/game.html?audio=off';
const READY = 'document.querySelector("#view")?.dataset.gameReady === "true"';
const md = fs.readFileSync(new URL('../LOOP-CONTRACT.md', import.meta.url), 'utf8');
const contract = JSON.parse(md.split('```json')[1].split('```')[0]);
const checks = [];
const check = (id, ok, note) => { checks.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${note}`); };
const f = (v) => (typeof v === 'number' ? v.toFixed(3) : String(v));
fs.mkdirSync(new URL('../.shots/', import.meta.url), { recursive: true });
const shot = (name) => new URL(`../.shots/${name}.png`, import.meta.url).pathname;

try {
  await withPage(PAGE, async (page) => {
    page.on('pageerror', (e) => console.log('[page error]', e.message));
    /* ---- 2. latency ---- */
    const lat = await page.evaluate(() => window.__latencyCheck());
    check('latency', lat.pass, `feet move ${lat.ticksToMove} tick(s) after a real keydown (need 1-2)`);

    /* ---- 4. runtime ladder twin ---- */
    const lad = await page.evaluate(() => window.__game.feelLadder());
    check('ladder:runtime', lad.problems.length === 0, lad.problems.length ? lad.problems.join('; ') : `Feel.checkLadder over the live table: ${Object.entries(lad.magnitudes).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
    const unwired = await page.evaluate(() => window.__game.feelCheck());
    check('feel:runtime', unwired.length === 0, unwired.length ? unwired.slice(0, 5).join('; ') : 'every declared event wired on the live bus (sfx names resolve when audio is on)');

    /* ---- 5. rendered-space ladder ---- */
    await page.evaluate(() => { window.__game.instrument.jumpToWave(1, [0, 30], 0); });
    const ladder = contract.ladder.map(([e]) => e);
    const rendered = {};
    for (const ev of ladder) rendered[ev] = await page.evaluate((e) => window.__feelRender(e), ev);
    const composite = await page.evaluate(async () => {
      // a single cutpurse kill vs the composite a double lance kill fires
      const a = await window.__feelRender('kill-cutpurse');
      const r = window.__game.run;
      const before = r.events.length;
      const b1 = await window.__feelRender('kill-cutpurse');
      window.__game.feel.emit('kill-cutpurse', { pos: window.__game.camera.position.clone() });
      const b2 = await window.__feelRender('lance-multikill', { count: 2 });
      return { single: a.changedPx + a.shakePx * 40 + a.text * 1500, double: b1.changedPx + b2.changedPx + (b1.shakePx + b2.shakePx) * 40 + (b1.text + b2.text) * 1500 };
    });
    const score = (r) => r.changedPx + r.shakePx * 40 + r.hitstop * 800 + r.text * 1500;   // a floating text is ~120x18 DOM px the canvas cannot show
    let inv = [];
    for (let i = 1; i < ladder.length; i += 1) {
      const a = ladder[i - 1]; const b = ladder[i];
      if (score(rendered[b]) < score(rendered[a]) * 0.85 && !(a === 'bolt-miss' && b === 'bolt-hit' && rendered[b].changedPx >= rendered[a].changedPx)) inv.push(`${b} (${score(rendered[b]).toFixed(0)}) < ${a} (${score(rendered[a]).toFixed(0)})`);
    }
    console.log('rendered: ' + ladder.map((e) => `${e}:${rendered[e].changedPx}px/${rendered[e].shakePx}sh/${rendered[e].hitstop}hs/${rendered[e].text}t`).join(' '));
    check('ladder:rendered-monotone', inv.length === 0, inv.length ? `inverted in pixels: ${inv.join('; ')}` : 'rendered magnitude (changed px + 40·shake px + 800·hitstop + 1500·text) non-decreasing up the ladder (15 % tolerance)');
    check('ladder:rendered-whiff', rendered['bolt-miss'].changedPx <= rendered['bolt-hit'].changedPx + 50, `bolt-miss ${rendered['bolt-miss'].changedPx} px vs bolt-hit ${rendered['bolt-hit'].changedPx} px`);
    const weak = ladder.slice(3).filter((e) => rendered[e].changedPx < 400);
    check('ladder:rendered-visible', weak.length === 0, weak.length ? `rungs under 400 changed px: ${weak.map((e) => `${e} ${rendered[e].changedPx}`).join(', ')}` : 'every rung from lance-fired up moves >= 400 px at 1280x720');
    check('ladder:composite', composite.double > composite.single * 1.5, `a double lance kill (kill x2 + multikill) renders ${composite.double.toFixed(0)} vs a single kill ${composite.single.toFixed(0)}`);

    /* ---- 1. play-camera legibility ---- */
    // w1 runs 90 s, not 60: the segment must CROSS the sightings it judges,
    // and at 60 s only five bodies had been seen (need >= 6) — the table's
    // third knot lands at 54 s (nightbloom TRAPS: a segment must cross its events)
    const pc = await page.evaluate(() => window.__playCheck({ w1: 90, w4: 110 }));
    for (const s of pc.segments) console.log(`  segment w${s.wave} ${s.seconds}s: frames ${s.frames} visibleFrac ${s.visibleFrac} p10 ${s.p10Frac} firstSight p90 ${s.p90FirstSightSec}s (${s.sightings}) legSamples ${s.legSamples} legibleFrac ${s.legibleFrac} eliteFrames ${s.eliteFrames} eliteLegible ${s.eliteLegibleFrac} eliteBodyOnly ${s.eliteBodyLegibleFrac} xrayMarkers ${s.xrayMarkers} captainSeen ${s.captainSeen}`);
    const L = pc.thresholds; const [s1, s4] = pc.segments;
    check('play:visible', s1.visibleFrac !== null && s4.visibleFrac !== null && s1.visibleFrac >= L.visibleFrac && s4.visibleFrac >= L.visibleFrac, `in-frustum fraction (<= 20 m; frames with >= ${s1.nearFloor} near in w1 [${s1.frames} frames], >= ${s4.nearFloor} in w4 [${s4.frames}]) w1 ${s1.visibleFrac ?? 'INSUFFICIENT FRAMES'} / w4 ${s4.visibleFrac ?? 'INSUFFICIENT FRAMES'} (need >= ${L.visibleFrac}, >= 10 frames each)`);
    check('play:first-sight', s1.p90FirstSightSec <= L.p90FirstSightSec && s1.sightings >= 6, `spawn -> first sight p90 ${s1.p90FirstSightSec} s over ${s1.sightings} sightings (need <= ${L.p90FirstSightSec} s, >= 6)`);
    check('play:legible', s4.legSamples >= 5 && s4.legibleFrac >= L.legibleFrac, `legible fraction ${s4.legibleFrac} over ${s4.legSamples} samples (px >= ${L.minPx}, sep >= ${L.minSep}; need >= ${L.legibleFrac})`);
    check('play:elite', s4.eliteFrames >= 10 && s4.eliteLegibleFrac >= L.eliteFrac, `Captain legible-as-elite ${s4.eliteLegibleFrac} over ${s4.eliteFrames} frames (marker px >= ${L.eliteMarkerPx}; body-only ${s4.eliteBodyLegibleFrac}; x-ray markers ${s4.xrayMarkers}); segment crossed the Captain: ${s4.captainSeen >= 1}`);

    /* ---- 3. draw calls at each arena, a full wave alive ---- */
    const calls = await page.evaluate(() => {
      const g = window.__game; const out = [];
      for (const [wave, at, yaw] of [[1, [0, 30], 0], [2, [0, -14], Math.PI], [3, [33, 10], -Math.PI / 2], [5, [-33, -30], Math.PI / 2], [6, [4, -38], Math.PI]]) {
        const r = g.instrument.jumpToWave(wave, at, yaw);
        g.instrument.setBot(true);
        g.frames(60 * 45);
        g.instrument.setBot(false);
        out.push({ wave, alive: r.alive, calls: g.drawCalls() });
      }
      return out;
    });
    const worst = Math.max(...calls.map((c) => c.calls));
    check('draw-calls', worst <= contract.drawCallsMax, `${calls.map((c) => `w${c.wave}: ${c.calls} calls with ${c.alive} alive`).join(', ')} (need <= ${contract.drawCallsMax})`);

    /* ---- 6. HUD pixels from a real screenshot ---- */
    await page.evaluate(() => { const g = window.__game; g.instrument.jumpToWave(2, [0, -14], Math.PI); g.instrument.setBot(true); g.frames(60 * 20); g.instrument.setBot(false); g.run.player.hp = 62; g.run.player.bolts = 4; g.frames(3); });
    const rects = await page.evaluate(() => {
      const q = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const g = window.__game;
      return { hp: q('.hb-hp'), fill: q('.hb-hp-fill'), pips: [...document.querySelectorAll('.hb-bolts i')].map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }), lights: [...document.querySelectorAll('.hb-light i')].map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }), tracker: q('.hb-tracker'), hud: g.hud.state(), run: { hp: g.run.player.hp, bolts: g.run.player.bolts, lights: g.run.lights } };
    });
    await page.screenshot({ path: shot('play-hud') });
    const png = decodePNG(fs.readFileSync(shot('play-hud')));
    const warm = ([r, g, b]) => r > 180 && g > 110 && b < 150 && r > b + 60;
    const paper = ([r, g, b]) => r > 200 && g > 190 && b > 170;
    // the fill: warm pixels along the bar's centre line, as a fraction of the bar's width
    const bar = rects.hp;
    let filled = 0;
    for (let x = Math.floor(bar.x + 2); x < bar.x + bar.w - 2; x += 1) { const k = (Math.round(bar.y + bar.h / 2) * png.width + x) * 4; if (warm([png.data[k], png.data[k + 1], png.data[k + 2]])) filled += 1; }
    const fillFrac = filled / (bar.w - 4);
    check('hud:hp-pixels', Math.abs(fillFrac - rects.run.hp / 100) <= 0.06, `health bar reads ${(fillFrac * 100).toFixed(0)} % warm pixels for HP ${rects.run.hp} (DOM fill ${(rects.fill.w / rects.hp.w * 100).toFixed(0)} %)`);
    const litPips = rects.pips.filter((r) => fractionIn(png, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, paper) > 0.6).length;
    check('hud:bolt-pixels', litPips === rects.run.bolts, `${litPips} paper-bright pips in the PNG for ${rects.run.bolts} bolts`);
    const litLights = rects.lights.filter((r) => fractionIn(png, r, warm) > 0.5).length;
    check('hud:light-pixels', litLights === rects.run.lights, `${litLights} lit lamps in the PNG for ${rects.run.lights} lights`);
    const trackerInk = countIn(png, rects.tracker, ([r, g, b]) => r > 150 && g > 140 && b > 120);
    check('hud:tracker-pixels', trackerInk > 200 && /wave 2/.test(rects.hud.wave), `tracker shows "${rects.hud.wave} / ${rects.hud.objective}" with ${trackerInk} bright text pixels in the PNG`);

    /* ---- 7. payoff visibility on every objective completion ---- */
    for (const id of ['o1-escort-runner', 'o2-barricades', 'o3-relight-wall', 'o4-escort-reeve']) {
      const r = await page.evaluate((o) => window.__payoffCheck(o), id);
      await page.screenshot({ path: shot(`payoff-${id}`) });
      check(`payoff:${id}`, r.pass, r.reason ?? `done ${r.done}, payoff at NDC (${r.ndc}) in frame ${r.inFrame}, ${r.changedPx} px changed at it; HUD says "${r.hud?.objective}"; frame .shots/payoff-${id}.png`);
    }
  }, { readyExpr: READY, timeout: 120000 });
} catch (e) { console.error('[check-play] crashed:', e); process.exit(2); }
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `RESULT: FAIL (${failed})` : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
