/* ------------------------------------------------------------------ *
 * The persistence gate's body: drives game.html in headless Chrome, plays
 * through the REAL shell (its key listeners, its stepper, its save path),
 * reads the ACTUAL localStorage the shell wrote, reloads the page, and
 * asserts at four checkpoints — wave 1 start, objective 1 done, wave 2
 * start, a death — that continuous play == post-reload (the game is never
 * more correct after F5), that the walker WALKED between the save and the
 * reload (an equality that cannot fail proves nothing — errand r2), and
 * that a corrupt / foreign / inconsistent save yields a fresh run with a
 * live shell.
 * ------------------------------------------------------------------ */
const PAGE = '/game.html?audio=off';
const KEY = 'hollowbrook-v1';
const READY = 'document.querySelector("#view")?.dataset.gameReady === "true"';

export async function runPersistenceChecks(withPage, { log = console.log } = {}) {
  const checks = [];
  const check = (id, ok, note) => { checks.push({ id, ok }); log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${note}`); };
  const state = (page) => page.evaluate(() => {
    const g = window.__game; const r = g.run;
    return { cp: r.checkpointState(), live: { wave: r.waveIndex + 1, phase: r.phase, lights: r.lights, hp: r.player.hp, pos: [+r.player.x.toFixed(2), +r.player.z.toFixed(2)], done: r.objectivesDone.slice() }, save: JSON.parse(localStorage.getItem('hollowbrook-v1')) };
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const walk = async (page, ticks = 90) => {
    // REAL key events through the shell's listeners; the canvas has focus
    await page.evaluate(() => document.querySelector('#view').focus());
    await page.keyboard.down('KeyW');
    await page.evaluate((n) => window.__game.tick(n), ticks);
    await page.keyboard.up('KeyW');
    await page.evaluate(() => window.__game.tick(2));
  };
  const reload = async (page) => { await page.reload({ waitUntil: 'networkidle0' }); await page.waitForFunction(READY, { timeout: 60000 }); };

  await withPage(PAGE, async (page) => {
    await page.evaluate(() => localStorage.removeItem('hollowbrook-v1'));
    await reload(page);
    /* ---- checkpoint 1: wave 1 start ---- */
    let s = await state(page);
    check('cp1:written', !!s.save && s.save.at === 'wave-start' && s.save.wave === 1, `fresh page wrote ${JSON.stringify(s.save)}`);
    const cp1 = s.cp;
    await walk(page, 120);
    let after = await state(page);
    check('cp1:walked', !same(after.live.pos, cp1.player.slice(0, 1).concat(cp1.player.slice(2))) && Math.hypot(after.live.pos[0] - cp1.player[0], after.live.pos[1] - cp1.player[2]) > 2, `walked ${Math.hypot(after.live.pos[0] - cp1.player[0], after.live.pos[1] - cp1.player[2]).toFixed(2)} m after the save (a save mid-wave would be a defect: ${same(after.save, s.save) ? 'none written' : 'ONE WAS WRITTEN'})`);
    check('cp1:no-midwave-save', same(after.save, s.save), 'the save did not change while walking mid-wave');
    await reload(page);
    let r = await state(page);
    check('cp1:reload==continuous', same(r.cp, cp1) && r.live.wave === 1 && r.live.phase === 'wave' && r.live.hp === 100, `after F5: ${JSON.stringify(r.cp)} vs ${JSON.stringify(cp1)}; lands at the checkpoint position, not the walked one`);

    /* ---- checkpoint 2: objective 1 done (through the instrument's bypass, then the REAL completion) ---- */
    await page.evaluate(() => { const g = window.__game; g.instrument.skipWave(); g.tick(30); while (g.run.dialogue) g.run.advanceDialogue(); });
    // the escort completes the real way: put the runner at the door and let the rules notice
    await page.evaluate(() => { const g = window.__game; const o = g.run.objective; const n = g.run.npc(o.npc); g.run.player.x = o.def.to[0] + 1; g.run.player.z = o.def.to[1] + 1; n.x = o.def.to[0]; n.z = o.def.to[1]; g.tick(5); });
    s = await state(page);
    check('cp2:written', s.save?.at === 'breather-done' && s.save.wave === 2 && s.save.objectivesDone.includes('o1-escort-runner'), `objective 1 done wrote ${JSON.stringify(s.save)}`);
    const cp2 = s.cp;
    await walk(page, 90);
    after = await state(page);
    check('cp2:walked', Math.hypot(after.live.pos[0] - cp2.player[0], after.live.pos[1] - cp2.player[2]) > 1.5, `walked ${Math.hypot(after.live.pos[0] - cp2.player[0], after.live.pos[1] - cp2.player[2]).toFixed(2)} m after the save`);
    await reload(page);
    r = await state(page);
    check('cp2:reload==continuous', same(r.cp, cp2) && r.live.wave === 2 && r.live.done.includes('o1-escort-runner'), `after F5: ${JSON.stringify(r.cp)} — lands at wave 2's start with objective 1 done`);

    /* ---- checkpoint 3: wave 2 start (the reload landed there; now the continuous path) ---- */
    await page.evaluate(() => localStorage.removeItem('hollowbrook-v1'));
    await reload(page);
    await page.evaluate(() => { const g = window.__game; g.instrument.skipWave(); g.tick(30); while (g.run.dialogue) g.run.advanceDialogue(); g.instrument.completeObjective(); g.instrument.endBreather(); g.tick(5); });
    s = await state(page);
    check('cp3:written', s.save?.at === 'wave-start' && s.save.wave === 2, `wave 2 start wrote ${JSON.stringify(s.save)}`);
    const cp3 = s.cp;
    await walk(page, 90);
    await reload(page);
    r = await state(page);
    check('cp3:reload==continuous', same(r.cp, cp3) && r.live.wave === 2 && r.live.phase === 'wave', `after F5: ${JSON.stringify(r.cp)}`);

    /* ---- checkpoint 4: a death ---- */
    await page.evaluate(() => { const g = window.__game; g.instrument.die(); g.tick(3); });
    s = await state(page);
    check('cp4:written', s.save?.at === 'wave-start' && s.save.wave === 2 && s.save.lights === 2 && s.save.lightsLostAt.length === 1, `death wrote ${JSON.stringify(s.save)}`);
    const cp4 = s.cp;
    await walk(page, 60);
    await reload(page);
    r = await state(page);
    check('cp4:reload==continuous', same(r.cp, cp4) && r.live.lights === 2 && r.live.hp === 100, `after F5: lights ${r.live.lights}, hp ${r.live.hp}, ${JSON.stringify(r.cp)}`);

    /* ---- corrupt / foreign / inconsistent saves yield a fresh, live run ---- */
    const bad = [
      ['garbage', '{not json'],
      ['foreign', JSON.stringify({ v: 1, quest: 'fetch' })],
      ['wrong-version', JSON.stringify({ ...s.save, v: 2 })],
      ['bad-wave', JSON.stringify({ ...s.save, wave: 9 })],
      ['bad-player', JSON.stringify({ ...s.save, player: 'a000' })],
      ['inconsistent-lights', JSON.stringify({ ...s.save, lights: 3, lightsLostAt: ['w1'] })],
      ['objective-from-the-future', JSON.stringify({ ...s.save, wave: 1, objectivesDone: ['o3-relight-wall'] })],
    ];
    for (const [name, raw] of bad) {
      await page.evaluate((v) => localStorage.setItem('hollowbrook-v1', v), raw);
      await reload(page);
      const st = await state(page);
      const alive = await page.evaluate(() => { const g = window.__game; g.tick(10); return g.run.tick > 5 && g.run.phase === 'wave'; });
      check(`corrupt:${name}`, st.live.wave === 1 && st.live.lights === 3 && st.live.done.length === 0 && alive && st.save?.at === 'wave-start', `fresh run (wave ${st.live.wave}, lights ${st.live.lights}), shell live, fresh save written`);
    }
    await page.evaluate(() => localStorage.removeItem('hollowbrook-v1'));
  }, { readyExpr: READY, timeout: 90000 });

  const failed = checks.filter((c) => !c.ok).length;
  log(failed ? `RESULT: FAIL (${failed})` : 'RESULT: PASS — continuous play == post-reload at 4 checkpoints; 7 corrupt saves yield a fresh live run');
  return failed === 0;
}
