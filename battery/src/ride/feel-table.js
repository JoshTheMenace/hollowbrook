// INTENSITY RIDE feel table — every magnitude is a function of the moment's
// INTENT (the curve) as well as its value, so a kill at 0.15 is a tap and a
// kill at 1.0 is a hit-stopped, shaken, particle-lit event. Judged by
// Feel.checkLadder through window.__feelLadder on the SAME wired table.
//
// ui: { beat(index, intent), levelUp(), hurt(), end(kind) } — shell hooks.

export function wireRide(feel, ui) {
  const I = (d) => d.intent ?? 0.5;
  feel.wire('spawn', { sfx: 'ui-click', sfxOpts: (d) => ({ vol: 0.06 + I(d) * 0.1, rate: 0.6 }), throttleMs: 250 });
  feel.wire('enemy-hit', {
    sfx: 'impact-hit', sfxOpts: (d) => ({ vol: 0.18 + I(d) * 0.35, rate: 1.1 }),
    burst: (d) => ({ count: 3 + Math.round(I(d) * 6), color: '#fff', color2: '#ffd76a', speed: 1.5 + I(d), up: 1.2, ttl: 0.3 }),
    throttleMs: 60,
  });
  feel.wire('kill', {
    sfx: 'slash', sfxOpts: (d) => ({ vol: 0.3 + I(d) * 0.5, rate: 0.9 + I(d) * 0.4 }),
    burst: (d) => ({ count: 8 + Math.round(I(d) * 18), color: '#a8e8ff', color2: '#fff', speed: 2 + I(d) * 2, up: 2.2, ttl: 0.4 + I(d) * 0.3 }),
    shake: (d) => I(d) * 0.3,
    hitstop: (d) => (I(d) > 0.6 ? 0.02 + (I(d) - 0.6) * 0.1 : 0),
    text: (d) => (I(d) > 0.85 ? '!!' : ''),
  });
  feel.wire('elite-spawn', { sfx: 'impact-heavy', sfxOpts: { vol: 0.7, rate: 0.7 }, shake: 0.45, burst: { count: 30, color: '#ffd76a', color2: '#ff5a6e', speed: 3, up: 3, ttl: 0.8 } });
  feel.wire('elite-kill', { sfx: 'victory', sfxOpts: { vol: 0.9 }, shake: 0.8, hitstop: 0.16, burst: { count: 60, color: '#ffd76a', color2: '#fff', speed: 4, up: 3.5, ttl: 1.0 }, text: () => 'ELITE DOWN' });
  feel.wire('gem', { sfx: 'pickup-gem', sfxOpts: (d) => ({ vol: 0.3, rate: 1 + I(d) * 0.4 }), throttleMs: 40 });
  feel.wire('player-hurt', {
    sfx: 'hurt', sfxOpts: (d) => ({ vol: 0.45 + I(d) * 0.25 }),
    shake: (d) => 0.2 + I(d) * 0.2,
    hitstop: 0.04,
    burst: { count: 10, color: '#ff5a6e', color2: '#fff', speed: 2, up: 1.6, ttl: 0.4 },
    call: () => ui.hurt(),
  });
  feel.wire('level-up', { sfx: 'victory', sfxOpts: { vol: 0.5, rate: 1.2 }, burst: { count: 24, color: '#6ee0ff', color2: '#fff', speed: 2.4, up: 3, ttl: 0.7 }, call: () => ui.levelUp() });
  // a keyframe: the music tier boundary is its consumer (plus a soft chime)
  feel.wire('beat', { sfx: 'ui-click', sfxOpts: (d) => ({ vol: 0.25, rate: 0.8 + d.intent * 0.8 }), call: (d) => ui.beat(d.index, d.intent) });
  feel.wire('victory', { sfx: 'victory', sfxOpts: { vol: 0.9 }, call: () => ui.end('victory') });
  feel.wire('defeat', { sfx: 'impact-heavy', sfxOpts: { vol: 0.8, rate: 0.5 }, shake: 0.5, call: () => ui.end('defeat') });
}

// ladder: kills across the curve (monotone in intent), and a value axis
// within one intent; hurt must not outrank the climax kill
export const LADDER_STEPS = [
  { name: 'kill@0.15', event: 'kill', data: { intent: 0.15 }, value: 0.15 },
  { name: 'kill@0.55', event: 'kill', data: { intent: 0.55 }, value: 0.55 },
  { name: 'kill@1.0', event: 'kill', data: { intent: 1.0 }, value: 1.0 },
  { name: 'elite-kill', event: 'elite-kill', data: { intent: 1.0 }, value: 2.0 },
  { name: 'hurt@1.0', event: 'player-hurt', data: { intent: 1.0 }, value: null },
  { name: 'hit@1.0', event: 'enemy-hit', data: { intent: 1.0 }, value: null },
];
export const LADDER_PAIRS = [
  ['hurt@1.0', 'kill@1.0'],
  ['hit@1.0', 'kill@1.0'],
  ['kill@0.15', 'kill@1.0'],
];
