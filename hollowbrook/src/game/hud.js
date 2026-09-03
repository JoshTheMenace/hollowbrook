/* ------------------------------------------------------------------ *
 * HUD — designed, not debug text.
 *
 * A DOM layer over the canvas: health, six bolt pips, the lance's charge
 * arc, the wave / objective tracker with its countdown, the three town
 * lights, a compass strip with the objective and the live gates on it,
 * the 12-segment damage-direction ring round the crosshair, a hit marker
 * that grows with the kill, a screen-edge hurt wash, and the end cards.
 * Everything is driven from the rules' records in update(); the shell
 * pokes hit() / banner() from feel-table calls.  `state()` is the
 * side-channel __gshot writes next to a capture, so a reviewer can see what
 * the DOM showed even though a canvas capture cannot composite it.
 * ------------------------------------------------------------------ */
import { CONTRACT as C } from './data.js';
import { OBJECTIVE_TITLES } from './rules.js';

const SEGMENTS = 12;

export function createHUD(root, { compassAlso = null } = {}) {
  root.innerHTML = `
    <div class="hb-hud">
      <div class="hb-top">
        <div class="hb-tracker">
          <div class="hb-wave"><span class="hb-wave-name">—</span><span class="hb-wave-time">0:00</span></div>
          <div class="hb-objective"><span class="hb-obj-title"></span><span class="hb-obj-progress"></span></div>
        </div>
        <div class="hb-lights">${[0, 1, 2].map((i) => `<span class="hb-light on" data-i="${i}"><i></i></span>`).join('')}</div>
      </div>
      <div class="hb-compass"><div class="hb-compass-strip"></div><div class="hb-compass-needle"></div></div>
      <div class="hb-centre">
        <svg class="hb-ring" viewBox="-60 -60 120 120">${Array.from({ length: SEGMENTS }, (_, i) => ringSeg(i)).join('')}</svg>
        <div class="hb-crosshair"><i></i><i></i><i></i><i></i></div>
        <div class="hb-hitmark"><i></i><i></i></div>
        <div class="hb-prompt"><b>E</b><span class="hb-prompt-verb"></span></div>
        <div class="hb-channel"><div class="hb-channel-fill"></div></div>
      </div>
      <div class="hb-bottom">
        <div class="hb-vitals">
          <div class="hb-hp"><div class="hb-hp-fill"></div><span class="hb-hp-num">100</span></div>
          <div class="hb-bolts">${Array.from({ length: C.crossbow.magazine }, () => '<i></i>').join('')}<span class="hb-reload">reloading</span></div>
        </div>
        <div class="hb-lance">
          <svg viewBox="0 0 44 44"><circle class="hb-lance-bg" cx="22" cy="22" r="18"/><circle class="hb-lance-arc" cx="22" cy="22" r="18"/></svg>
          <span class="hb-lance-label">lance</span>
        </div>
      </div>
      <div class="hb-hurt"></div>
      <div class="hb-banner"><div class="hb-banner-title"></div><div class="hb-banner-sub"></div></div>
      <div class="hb-end"><div class="hb-end-title"></div><div class="hb-end-sub"></div><div class="hb-end-hint">R · restart from the checkpoint</div></div>
      <div class="hb-hint">click to play · WASD move · Shift sprint · LMB crossbow · hold RMB emberlance · R reload · E interact</div>
    </div>`;
  const q = (s) => root.querySelector(s);
  const el = {
    waveName: q('.hb-wave-name'), waveTime: q('.hb-wave-time'), objTitle: q('.hb-obj-title'), objProg: q('.hb-obj-progress'),
    lights: [...root.querySelectorAll('.hb-light')], strip: q('.hb-compass-strip'),
    segs: [...root.querySelectorAll('.hb-ring path')], hitmark: q('.hb-hitmark'), prompt: q('.hb-prompt'), promptVerb: q('.hb-prompt-verb'),
    channel: q('.hb-channel'), channelFill: q('.hb-channel-fill'),
    hpFill: q('.hb-hp-fill'), hpNum: q('.hb-hp-num'), bolts: [...root.querySelectorAll('.hb-bolts i')], reload: q('.hb-reload'),
    lanceArc: q('.hb-lance-arc'), lanceLabel: q('.hb-lance-label'), hurt: q('.hb-hurt'),
    banner: q('.hb-banner'), bannerTitle: q('.hb-banner-title'), bannerSub: q('.hb-banner-sub'),
    end: q('.hb-end'), endTitle: q('.hb-end-title'), endSub: q('.hb-end-sub'), hint: q('.hb-hint'),
  };
  const arcLen = 2 * Math.PI * 18;
  el.lanceArc.style.strokeDasharray = `${arcLen}`;
  let hit = { t: 0, big: false };
  let hurtWash = 0;
  let bannerT = 0;
  const markers = new Map();   // key -> element

  function marker(key, cls, label) {
    let m = markers.get(key);
    if (!m) { m = document.createElement('span'); m.className = `hb-mark ${cls}`; m.textContent = label; el.strip.appendChild(m); markers.set(key, m); }
    return m;
  }

  function update(run, dt, { yaw }) {
    const p = run.player;
    const w = run.wave;
    // tracker
    if (run.phase === 'wave') {
      el.waveName.textContent = `wave ${run.waveIndex + 1} · ${w.name}`;
      const left = w.id === 'w6' ? run.waveTime : Math.max(0, w.seconds - run.waveTime);
      el.waveTime.textContent = `${mmss(left)} · ${run.alive} out`;
    } else if (run.phase === 'breather') {
      el.waveName.textContent = `breather · wave ${Math.min(6, run.waveIndex + 2)} in`;
      el.waveTime.textContent = mmss(Math.max(0, w.breather - run.breatherTime));
    } else { el.waveName.textContent = run.phase === 'won' ? 'dawn' : 'Hollowbrook has fallen'; el.waveTime.textContent = ''; }
    const o = run.objective;
    if (o && !o.done && !o.failed) {
      el.objTitle.textContent = o.title ?? OBJECTIVE_TITLES[o.id];
      el.objProg.textContent = o.kind === 'activate' ? `${o.points.filter((x) => x.done).length}/${o.def.count}` : o.kind === 'escort' ? (run.npc(o.npc).waiting ? 'too far ahead — wait' : 'with you') : o.kind === 'hold' ? '' : '';
    } else if (o && o.done) { el.objTitle.textContent = `${o.title ?? o.id} — done`; el.objProg.textContent = ''; }
    else if (o && o.failed) { el.objTitle.textContent = `${o.title} — out of time`; el.objProg.textContent = ''; }
    else { el.objTitle.textContent = run.phase === 'wave' ? `hold ${arenaName(run)}` : ''; el.objProg.textContent = ''; }
    // lights
    el.lights.forEach((l, i) => l.classList.toggle('on', i < run.lights));
    // vitals
    el.hpFill.style.width = `${Math.max(0, p.hp)}%`;
    el.hpFill.classList.toggle('low', p.hp <= 30);
    el.hpNum.textContent = Math.max(0, Math.round(p.hp));
    el.bolts.forEach((b, i) => b.classList.toggle('on', i < p.bolts));
    el.reload.classList.toggle('on', p.reloadLeft > 0);
    const cd = p.lanceCd > 0 ? 1 - p.lanceCd / C.lance.cooldown : 1;
    const charge = p.charging ? p.charge / C.lance.charge : 0;
    const v = p.charging ? charge : cd;
    el.lanceArc.style.strokeDashoffset = `${arcLen * (1 - v)}`;
    el.lanceArc.classList.toggle('charged', p.charging && charge >= 1);
    el.lanceArc.classList.toggle('cooling', !p.charging && cd < 1);
    el.lanceLabel.textContent = p.charging ? (charge >= 1 ? 'release' : 'charging') : cd < 1 ? 'cooling' : 'lance';
    // damage ring: each hurt entry lights the segment its direction falls in
    const lit = new Array(SEGMENTS).fill(0);
    for (const h of p.hurt) {
      const a = ((-h.dir + Math.PI * 2.5) % (Math.PI * 2));    // 0 = ahead, clockwise on screen
      const i = Math.floor(a / (Math.PI * 2) * SEGMENTS) % SEGMENTS;
      lit[i] = Math.max(lit[i], h.left / 0.6);
    }
    el.segs.forEach((s, i) => { s.style.opacity = `${lit[i] * 0.95}`; });
    // hit marker + hurt wash
    hit.t = Math.max(0, hit.t - dt);
    el.hitmark.style.opacity = `${Math.min(1, hit.t / 0.12)}`;
    el.hitmark.classList.toggle('big', hit.big);
    hurtWash = Math.max(0, hurtWash - dt * 1.6);
    el.hurt.style.opacity = `${Math.min(0.85, hurtWash + (p.hp <= 25 ? 0.25 + Math.sin(run.time * 4) * 0.08 : 0))}`;
    // channel bar (bell / activate)
    const ch = p.channel > 0 ? p.channel / 3 : p.activate > 0 ? p.activate / 1.0 : 0;
    el.channel.classList.toggle('on', ch > 0);
    el.channelFill.style.width = `${ch * 100}%`;
    // prompt
    const verb = promptFor(run);
    el.prompt.classList.toggle('on', !!verb);
    if (verb) el.promptVerb.textContent = verb;
    // compass: strip scrolls with yaw; markers placed by bearing
    const deg = (yaw * 180 / Math.PI);
    const px = (b) => ((wrapDeg(b - deg) / 180) * 50 + 50);      // -180..180 -> 0..100 %
    const seen = new Set();
    const put = (key, cls, label, x, z) => {
      const b = Math.atan2(-(x - p.x), -(z - p.z)) * 180 / Math.PI;
      const m = marker(key, cls, label);
      const pos = px(b);
      m.style.left = `${pos}%`;
      m.style.opacity = pos > 2 && pos < 98 ? '1' : '0.35';
      seen.add(key);
    };
    if (o && !o.done && !o.failed) {
      if (o.kind === 'activate') o.points.forEach((pt, i) => { if (!pt.done) put(`o${i}`, 'obj', '◆', pt.x, pt.z); });
      else if (o.kind === 'escort') put('oto', 'obj', '◆', o.def.to[0], o.def.to[1]);
      else if (o.id === 'o6-ring-the-bell') { const b = run.world.interactions[o.def.interaction]; put('bell', 'obj', '♪', b.at[0], b.at[1]); }
    }
    if (run.phase === 'wave') for (const gid of w.gates) { const g = run.world.gates[gid]; put(gid, 'gate', '▲', g.at[0], g.at[1]); }
    if (run.captain) put('cap', 'elite', '✕', run.captain.x, run.captain.z);
    for (const [k, m] of markers) if (!seen.has(k)) { m.remove(); markers.delete(k); }
    // banner
    bannerT = Math.max(0, bannerT - dt);
    el.banner.classList.toggle('on', bannerT > 0);
    // end cards
    if (run.phase === 'won') { el.end.classList.add('on', 'won'); el.endTitle.textContent = 'DAWN'; el.endSub.textContent = 'Hollowbrook stands. The bell carries to Thistledown.'; }
    else if (run.phase === 'lost') { el.end.classList.add('on'); el.end.classList.remove('won'); el.endTitle.textContent = 'THE LAST LIGHT'; el.endSub.textContent = 'Three lights gone. The Company has the town.'; }
    else el.end.classList.remove('on', 'won');
    el.hint.classList.toggle('on', !document.pointerLockElement);
  }

  return {
    update,
    hit(kind) { hit = { t: kind === 'kill' ? 0.32 : 0.14, big: kind === 'kill' }; },
    hurt(amount) { hurtWash = Math.min(1, hurtWash + 0.35 + amount / 60); },
    banner(title, sub = '', seconds = 2.4) { el.bannerTitle.textContent = title; el.bannerSub.textContent = sub; bannerT = seconds; },
    state() {
      return {
        wave: el.waveName.textContent, time: el.waveTime.textContent, objective: el.objTitle.textContent, progress: el.objProg.textContent,
        lights: el.lights.filter((l) => l.classList.contains('on')).length, hp: el.hpNum.textContent,
        bolts: el.bolts.filter((b) => b.classList.contains('on')).length, reloading: el.reload.classList.contains('on'),
        lance: el.lanceLabel.textContent, prompt: el.prompt.classList.contains('on') ? el.promptVerb.textContent : null,
        ring: el.segs.map((s) => +(+s.style.opacity).toFixed(2)), hitmark: +(+el.hitmark.style.opacity).toFixed(2),
        hurt: +(+el.hurt.style.opacity).toFixed(2), markers: [...markers.entries()].map(([k, m]) => [k, m.style.left]),
        banner: el.banner.classList.contains('on') ? el.bannerTitle.textContent : null, end: el.end.classList.contains('on') ? el.endTitle.textContent : null,
      };
    },
  };
}

function promptFor(run) {
  if (run.dialogue) return 'continue';
  const p = run.player;
  const o = run.objective;
  if (o && !o.done && !o.failed) {
    if (o.kind === 'activate') { const pt = o.points.find((q) => !q.done && Math.hypot(q.x - p.x, q.z - p.z) <= 2.2); if (pt) return o.id === 'o2-barricades' ? 'hold — raise the barricade' : 'hold — light the brazier'; }
    if (o.id === 'o6-ring-the-bell') { const b = run.world.interactions[o.def.interaction]; if (Math.hypot(p.x - b.at[0], p.z - b.at[1]) <= 2.8) return 'hold — ring the bell'; }
  }
  for (const n of run.npcs) if (Math.hypot(n.x - p.x, n.z - p.z) <= 2.4 && n.id !== 'vixen' && n.id !== 'millwarden') return `talk to ${n.name}`;
  return null;
}

function arenaName(run) {
  return { 'gate-square': 'the gate square', 'the-market': 'the market', 'the-row': 'the row', 'the-mill': 'the mill', 'the-close': 'the close', 'the-keep': 'the keep' }[run.wave.arena] ?? run.wave.arena;
}

function ringSeg(i) {
  const a0 = (i / SEGMENTS) * Math.PI * 2 - Math.PI / 2 + 0.05;
  const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2 - Math.PI / 2 - 0.05;
  const r0 = 44; const r1 = 52;
  const P = (r, a) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  return `<path d="M ${P(r0, a0)} A ${r0} ${r0} 0 0 1 ${P(r0, a1)} L ${P(r1, a1)} A ${r1} ${r1} 0 0 0 ${P(r1, a0)} Z" style="opacity:0"/>`;
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const wrapDeg = (d) => ((d + 540) % 360) - 180;
