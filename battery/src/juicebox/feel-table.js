import * as THREE from 'three';

// JUICE BOX feel table — the declared seam, as a LADDER. Every magnitude
// below is a function of the moment's value, so a +140 triple line is
// louder than a +60 gold which is louder than a +10 single which is louder
// than a whiff (review r1: the ladder was flat and partly inverted while
// the coverage lint stayed green). `Feel.checkLadder` judges this exact
// table through window.__feelLadder.
//
// ui: { breakFlash(), telegraph(index), final10() } — DOM/visual hooks the
// shell supplies; the table itself stays free of document access.

export function wireJuice(feel, ui) {
  // the whiff floor: every dash makes THIS much and no more
  feel.wire('dash', { sfx: 'slash', sfxOpts: { vol: 0.28, rate: 1.5 } });
  feel.wire('pop', {
    // the pitch IS the combo meter; volume, particles and shake follow value
    sfx: 'pickup-gem',
    sfxOpts: (d) => ({ vol: Math.min(1, 0.5 + d.value / 300), rate: 1 + Math.min(1.2, (d.combo - 1) * 0.09) }),
    burst: (d) => ({ count: 8 + Math.min(30, Math.round(d.value / 8)), color: d.gold ? '#ffe36a' : '#a8e8ff', color2: '#fff', speed: 2.2 + d.value / 150, up: 2.2, ttl: 0.4 + Math.min(0.4, d.value / 300) }),
    shake: (d) => Math.min(0.55, d.value / 220),
    hitstop: (d) => (d.gold ? 0.07 : d.nth >= 2 ? 0.02 * d.nth : 0),
    text: (d) => (d.gold ? `+${d.value} gold` : d.combo > 1 ? `+${d.value} ×${d.combo}` : `+${d.value}`),
    // stagger consecutive pops so the celebration never stacks on one spot
    textOffset: (d) => new THREE.Vector3(((d.nth ?? 1) % 3 - 1) * 0.9, 0, (d.combo % 2 ? 0.5 : -0.5)),
    textOpts: { rise: 52 },
  });
  feel.wire('multi-pop', {
    sfx: 'impact-hit', sfxOpts: (d) => ({ vol: Math.min(1, 0.35 + 0.15 * d.count) }),
    hitstop: (d) => Math.min(0.14, 0.03 * d.count),
    shake: (d) => Math.min(0.7, 0.12 * d.count),
    burst: (d) => ({ count: 10 * d.count, color: '#ffd76a', color2: '#a8e8ff', speed: 2.6 + 0.4 * d.count, up: 2.6, ttl: 0.6 }),
  });
  feel.wire('combo-break', {
    // a decay step: dampened, never louder than a pop
    sfx: 'ui-deny', sfxOpts: (d) => ({ vol: d.reason === 'timer' ? 0.35 : 0.25, rate: d.reason === 'oni' ? 0.8 : 1 }),
    call: (d) => { if (d.reason !== 'fade') ui.breakFlash(); },
  });
  feel.wire('fade-warning', { sfx: 'ui-click', sfxOpts: { vol: 0.2, rate: 0.7 } });
  feel.wire('spirit-fade', { sfx: 'ui-deny', sfxOpts: { vol: 0.15, rate: 1.5 }, burst: { count: 6, color: '#5a5478', color2: '#3a3450', speed: 0.8, up: 0.6, ttl: 0.5, size: 0.06 } });
  feel.wire('oni-telegraph', { sfx: 'ui-click', sfxOpts: { vol: 0.45, rate: 0.55 }, call: (d) => ui.telegraph(d.index) });
  // being hit: felt, but never the loudest thing in the game
  feel.wire('oni-hit', { sfx: 'hurt', sfxOpts: { vol: 0.6 }, shake: 0.3, hitstop: 0.05, burst: { count: 14, color: '#ff5a6e', color2: '#fff', speed: 2.6, up: 2, ttl: 0.5 } });
  feel.wire('final-10s', { sfx: 'impact-heavy', sfxOpts: { vol: 0.5, rate: 0.8 }, call: () => ui.final10() });
  feel.wire('timeup', { sfx: 'victory' });
}

// The ladder the gate judges, ascending by value. Values are the A5
// economy at combo 1: single 10, double line 40 (2nd pop), gold 60,
// triple line 90 (3rd pop).
export const LADDER_STEPS = [
  { name: 'whiff', event: 'dash', data: {}, value: 0 },
  { name: 'single-pop', event: 'pop', data: { value: 10, nth: 1, combo: 1, gold: false }, value: 10 },
  { name: 'double-line', event: 'multi-pop', data: { value: 40, count: 2 }, value: 40 },
  { name: 'gold-pop', event: 'pop', data: { value: 60, nth: 1, combo: 2, gold: true }, value: 60 },
  { name: 'triple-line', event: 'multi-pop', data: { value: 90, count: 3 }, value: 90 },
  { name: 'oni-hit', event: 'oni-hit', data: {}, value: null },   // judged by pairs only
];
export const LADDER_PAIRS = [
  ['whiff', 'single-pop'],          // a whiff never outranks a hit
  ['oni-hit', 'triple-line'],       // being hit is not the loudest event
  ['single-pop', 'gold-pop'],       // gold is the loudest single-spirit event
];
