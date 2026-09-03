/* ------------------------------------------------------------------ *
 * DAYNIGHT — dusk goes to dark as the waves go on, and the town's
 * practicals come up to meet it.
 *
 * The plan's palette note: "the town's practicals ... are the second light
 * source and get stronger as the waves go on."  This is that, as one
 * number: `phase` 0 (wave 1 starts, twenty minutes before dark) → 1 (last
 * light).  The sun's amber falls, the fill and hemisphere cool a little,
 * the fog goes a shade deeper, and the practicals that were built UNLIT
 * (`userData.practical` with `lit === false`) come on in a fixed seeded
 * order as the phase advances — so the town lights itself window by
 * window over six waves rather than all at once.
 *
 * Three things are NOT this module's to touch, and it skips them by
 * contract: the o3 relight braziers (`relight-brazier`: the breather beat
 * lights those), the three town lights (`userData.townLight`: lost lights
 * stay lost), and the Company's camp fires (`camp-fire`: the enemy's, lit
 * from the start).  A VIEW over the run, like every other view: it reads
 * `run.waveIndex` / `run.waveTime` and writes light rig values only.
 * ------------------------------------------------------------------ */
import { CONTRACT as C } from './data.js';

export function createDayNight({ scene, sun, fill, hemi, fog, run }) {
  const sun0 = sun.intensity; const fill0 = fill.intensity; const hemi0 = hemi.intensity;
  const fogColor0 = fog ? fog.color.clone() : null;
  const sunColor0 = sun.color.clone();
  const dark = sun.color.clone().multiplyScalar(0.72).lerp(sun.color.clone().set(0x6a5a7a), 0.35);
  const fogDark = fogColor0 ? fogColor0.clone().multiplyScalar(0.78) : null;
  // the switchable, currently-unlit practicals, in a stable order
  const pending = [];
  scene.traverse((o) => {
    const u = o.userData;
    if (!u?.practical || !u.setLit || u.lit !== false) return;
    if (u.townLight !== undefined || /relight-brazier|camp-fire|beacon/.test(o.name ?? '') || u.kind === 'camp-fire' || u.kind === 'beacon-cage') return;
    pending.push(o);
  });
  pending.sort((a, b) => (a.name > b.name ? 1 : -1));
  const total = pending.length;
  let lit = 0;
  const waves = C.waves.length;
  const phaseOf = (r) => {
    const w = r?.waveIndex ?? 0; const len = C.waves[w]?.seconds ?? 120;
    const inWave = r?.phase === 'wave' ? Math.min(1, (r.waveTime ?? 0) / len) : 1;
    return Math.min(1, (w + inWave) / waves);
  };
  let phase = -1;
  return {
    get phase() { return phase; }, get pending() { return total; }, get lit() { return lit; },
    update(r = run) {
      const p = phaseOf(r);
      if (Math.abs(p - phase) < 1e-3) return;
      phase = p;
      sun.intensity = sun0 * (1 - 0.55 * p);
      sun.color.copy(sunColor0).lerp(dark, p);
      fill.intensity = fill0 * (1 - 0.2 * p);
      hemi.intensity = hemi0 * (1 - 0.15 * p);
      if (fog && fogDark) fog.color.copy(fogColor0).lerp(fogDark, p);
      // practicals: the first third are on by the end of wave 1, all by wave 5
      const want = Math.round(total * Math.min(1, 0.33 + p * 0.85));
      while (lit < want) { pending[lit].userData.setLit(true); lit += 1; }
    },
  };
}
