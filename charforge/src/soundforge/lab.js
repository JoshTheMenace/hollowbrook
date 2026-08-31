import { AdaptiveMusic, SfxPlayer, windowGain } from './runtime.js';
import { LOOP } from './content/loop-nightbloom.js';
import { SFX } from './content/sfx-core.js';
import { SR } from './dsp.js';

// SoundForge Lab — hear the adaptive loop respond to one intensity dial and
// audition the SFX bank. Also exposes __soundCheck() so the runtime can be
// verified headlessly (OfflineAudioContext — no speakers or gesture needed).

const $ = (id) => document.getElementById(id);
let music = null, sfx = null, analyser = null;

const MOOD = [
  [0.0, 'pads breathe — menus, dawn'],
  [0.15, 'koto joins — first steps'],
  [0.3, 'bass grounds it — exploring'],
  [0.45, 'lead sings, sparse drums — threat near'],
  [0.62, 'straight groove, glass arp — combat'],
  [0.82, 'drive kit, bell answers — swarm'],
];

$('start').onclick = async () => {
  $('start').disabled = true;
  music = new AdaptiveMusic();
  sfx = new SfxPlayer(music.ctx);
  await music.ctx.resume();
  await music.load(LOOP, (p, name) => { $('prog').textContent = `stems ${(p * 100) | 0}% (${name})`; });
  await sfx.load(SFX, (p, name) => { $('prog').textContent = `sfx ${(p * 100) | 0}% (${name})`; });
  $('prog').textContent = `9 stems · ${Object.keys(SFX).length} sfx · running`;
  analyser = music.ctx.createAnalyser();
  analyser.fftSize = 1024;
  music.comp.connect(analyser);
  music.start();
  buildTierRows();
  window.__labReady = true;
  $('start').textContent = 'Playing';
};

function buildTierRows() {
  $('tiers').innerHTML = Object.entries(music.stems).map(([name, s]) =>
    `<div class="tier"><div class="nm">${name}</div><div class="bar"><div class="fill" id="tier-${name}"></div></div>
     <div class="win">${s.window[0].toFixed(2)}–${Math.min(1, s.window[1]).toFixed(2)}</div></div>`).join('');
}

$('intensity').oninput = (e) => {
  const v = +e.target.value;
  music?.setIntensity(v);
  $('ival').textContent = v.toFixed(2);
  const mood = [...MOOD].reverse().find(([at]) => v >= at);
  $('inames').textContent = mood ? mood[1] : '';
};

// sfx board
$('sfx').innerHTML = Object.keys(SFX).map((n) => `<button data-n="${n}">${n}</button>`).join('');
$('sfx').onclick = (e) => {
  const n = e.target.dataset?.n;
  if (n && sfx) sfx.play(n);
};

// live meters
const buf = new Float32Array(1024);
(function raf() {
  if (music?.playing) {
    for (const [name, s] of Object.entries(music.stems)) {
      const el = $(`tier-${name}`);
      if (el && s.gainNode) el.style.width = `${s.gainNode.gain.value * 100}%`;
    }
    if (analyser) {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      $('meterfill').style.width = `${Math.min(100, Math.sqrt(sum / buf.length) * 320)}%`;
    }
  }
  requestAnimationFrame(raf);
})();

// Headless runtime verification: renders the stem graph at two intensities
// through an OfflineAudioContext and proves signal exists and scales.
window.__soundCheck = async () => {
  if (!music?.stems) throw new Error('load first');
  const rmsAt = async (v) => {
    const off = new OfflineAudioContext(2, SR, SR);
    for (const s of Object.values(music.stems)) {
      const src = off.createBufferSource();
      src.buffer = s.buffer;
      src.loop = true;
      const g = off.createGain();
      g.gain.value = windowGain(v, s.window);
      src.connect(g).connect(off.destination);
      src.start();
    }
    const rendered = await off.startRendering();
    const d = rendered.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    return Math.sqrt(sum / d.length);
  };
  const lo = await rmsAt(0.15), hi = await rmsAt(0.9);
  return {
    stems: Object.keys(music.stems).length,
    sfxLoaded: sfx.buffers.size,
    loopSec: music.loopSec,
    ctxState: music.ctx.state,
    rmsLow: +lo.toFixed(4),
    rmsHigh: +hi.toFixed(4),
    scales: hi > lo * 1.3,
    audible: lo > 0.005,
  };
};
