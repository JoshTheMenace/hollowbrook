/* ------------------------------------------------------------------ *
 * FEEL — one data table: event -> { sfx, burst, shake, hitstop, text }.
 *
 * DATA, not calls, because the ladder gate (scripts/check-feel-ladder.mjs)
 * computes every magnitude from it in Node with the contract's weights:
 *   magnitude = 10·shake + 40·hitstop + burst.count/4 + 2·[text] + 1·[sfx]
 * and asserts the contract's order holds.  The numbers below were chosen
 * to LAND on the declared magnitudes (each rung is ± 15 %), so the ladder
 * is monotone by construction and stays so only while this table and the
 * contract agree.  main.js wires this table into charforge's Feel bus
 * verbatim (`feel.wire(name, fx)`), so what the gate judges is what the
 * game runs.
 *
 * sfx names are Hollowbrook's semantic bank (src/game/music.js maps them
 * onto whatever bank is loaded — soundforge's core set until the music
 * agent's lands).
 * ------------------------------------------------------------------ */
export const FEEL = Object.freeze({
  // -- the ladder (magnitudes: 1.0 1.0 2.0 3.1 5.0 6.0 6.0 6.8 9.8 11.9 12.5 23.6 32.0)
  'bolt-fired':        { sfx: 'bolt-fire', sfxOpts: { vol: 0.5 } },
  'bolt-miss':         { sfx: 'bolt-miss', sfxOpts: { vol: 0.35 } },
  'bolt-hit':          { sfx: 'bolt-hit', sfxOpts: { vol: 0.7 }, burst: { count: 4, color: '#f2d6a8', color2: '#b8482e', speed: 1.6, up: 1.0, ttl: 0.3, size: 0.06 } },
  // burst SIZE is not in the static magnitude (count is), so it is the
  // rendered-space dial: the play gate orders the ladder by pixels moved,
  // and a 0.4 m muzzle puff out-rendered a cutpurse kill (integration)
  'lance-fired':       { sfx: 'lance-fire', sfxOpts: { vol: 0.8 }, shake: 0.05, burst: { count: 6, color: '#ffb877', color2: '#e3823f', speed: 1.2, up: 0.6, ttl: 0.35, size: 0.2 } },
  'kill-cutpurse':     { sfx: 'kill-light', sfxOpts: { vol: 0.7 }, burst: { count: 8, color: '#b8482e', color2: '#f2d6a8', speed: 2.0, up: 1.6, ttl: 0.45, size: 0.34 }, text: () => 'cutpurse down', textOpts: { color: '#f2d6a8' } },
  'player-hurt':       { sfx: 'hurt', sfxOpts: (d) => ({ vol: 0.5 + Math.min(0.4, (d.damage ?? 12) / 60) }), shake: 0.25, burst: { count: 10, color: '#b8482e', color2: '#6c2a1e', speed: 1.0, up: 0.4, ttl: 0.4, size: 0.34 } },
  'kill-hexer':        { sfx: 'kill-hexer', sfxOpts: { vol: 0.8 }, shake: 0.2, burst: { count: 4, color: '#62ead8', color2: '#b8482e', speed: 2.2, up: 2.0, ttl: 0.5, size: 0.3 }, text: () => 'hexer down', textOpts: { color: '#9ef0e4' } },
  'kill-reaver':       { sfx: 'kill-heavy', sfxOpts: { vol: 0.8 }, shake: 0.1, hitstop: 0.0075, burst: { count: 10, color: '#b8482e', color2: '#f2d6a8', speed: 2.4, up: 1.8, ttl: 0.5, size: 0.42 }, text: () => 'reaver down', textOpts: { color: '#f2d6a8' } },
  'kill-shieldbearer': { sfx: 'kill-heavy', sfxOpts: { vol: 0.9, rate: 0.85 }, shake: 0.2, hitstop: 0.0325, burst: { count: 14, color: '#b8482e', color2: '#dcb75a', speed: 2.6, up: 2.0, ttl: 0.55, size: 0.24 }, text: () => 'shieldbearer down', textOpts: { color: '#f2d6a8' } },
  'lance-multikill':   { sfx: 'multikill', sfxOpts: { vol: 1.0 }, shake: 0.25, hitstop: 0.06, burst: { count: 16, color: '#ffb877', color2: '#b8482e', speed: 3.0, up: 2.4, ttl: 0.6, size: 0.24 }, text: (d) => `${d.count} in one lance`, textOpts: { color: '#ffd9a0', rise: 60, ttl: 1.2 } },
  'wave-cleared':      { sfx: 'wave-clear', sfxOpts: { vol: 1.0 }, shake: 0.2, hitstop: 0.075, burst: { count: 18, color: '#ffd9a0', color2: '#dcb75a', speed: 2.0, up: 3.0, ttl: 0.9, size: 0.24 }, text: (d) => `${d.name ?? 'the wave'} — held`, textOpts: { color: '#ffd9a0', rise: 70, ttl: 1.6 } },
  'kill-captain':      { sfx: 'kill-captain', sfxOpts: { vol: 1.0 }, shake: 0.5, hitstop: 0.14, burst: { count: 40, color: '#b8482e', color2: '#ffd9a0', speed: 3.4, up: 3.0, ttl: 1.0, size: 0.24 }, text: () => 'THE CAPTAIN FALLS', textOpts: { color: '#ffb877', rise: 80, ttl: 2.0 } },
  'bell-rung':         { sfx: 'bell', sfxOpts: { vol: 1.0 }, shake: 0.6, hitstop: 0.2, burst: { count: 60, color: '#ffd9a0', color2: '#dcb75a', speed: 3.0, up: 4.0, ttl: 1.4, size: 0.24 }, text: () => 'DAWN — Hollowbrook stands', textOpts: { color: '#ffd9a0', rise: 90, ttl: 3.0 } },
  // -- also declared
  'defeat':            { sfx: 'defeat', sfxOpts: { vol: 0.9 }, shake: 0.3 },
  'light-lost':        { sfx: 'light-lost', sfxOpts: { vol: 0.8 }, shake: 0.15, text: (d) => `a light goes out — ${d.lights} left`, textOpts: { color: '#c9b6c8', rise: 50, ttl: 2.0 } },
  'objective-start':   { sfx: 'ui-open', sfxOpts: { vol: 0.5 }, text: (d) => d.title, textOpts: { color: '#ffd9a0', rise: 40, ttl: 1.8 } },
  'objective-done':    { sfx: 'objective-done', sfxOpts: { vol: 0.8 }, burst: { count: 12, color: '#ffd9a0', color2: '#f2d6a8', speed: 1.4, up: 2.4, ttl: 0.7, size: 0.24 }, text: () => 'done', textOpts: { color: '#ffd9a0' } },
  'npc-sheltered':     { sfx: 'door', sfxOpts: { vol: 0.4 }, text: (d) => `${d.name} is safe`, textOpts: { color: '#f2ecdf' } },
  'barricade-up':      { sfx: 'barricade', sfxOpts: { vol: 0.7 }, burst: { count: 8, color: '#a39b8c', color2: '#625948', speed: 1.4, up: 1.2, ttl: 0.5, size: 0.24 }, text: (d) => `barricade ${d.count}/${d.total}`, textOpts: { color: '#f2ecdf' } },
  'brazier-lit':       { sfx: 'brazier', sfxOpts: { vol: 0.7 }, burst: { count: 10, color: '#ffb877', color2: '#e3823f', speed: 1.0, up: 2.6, ttl: 0.8, size: 0.24 }, text: (d) => `brazier ${d.count}/${d.total}`, textOpts: { color: '#ffb877' } },
  'reload':            { sfx: 'reload', sfxOpts: { vol: 0.5 } },
  'hexer-telegraph':   { sfx: 'hex-charge', sfxOpts: { vol: 0.55 }, burst: { count: 5, color: '#62ead8', color2: '#3cb8a8', speed: 0.6, up: 0.8, ttl: 0.6, size: 0.07 } },
  'captain-dash':      { sfx: 'captain-dash', sfxOpts: { vol: 0.7 }, burst: { count: 6, color: '#b8482e', color2: '#463f4f', speed: 1.6, up: 0.3, ttl: 0.35, size: 0.24 } },
  // -- the rest of the run
  'wave-start':        { sfx: 'wave-start', sfxOpts: { vol: 0.9 }, text: (d) => `wave ${d.index + 1} — ${d.name}`, textOpts: { color: '#ffb877', rise: 60, ttl: 2.2 } },
  'breather-start':    { sfx: 'breather', sfxOpts: { vol: 0.6 }, text: () => 'a breath', textOpts: { color: '#c9b6c8' } },
  'objective-failed':  { sfx: 'ui-deny', sfxOpts: { vol: 0.6 }, text: () => 'out of time', textOpts: { color: '#c9b6c8' } },
  'captain-retreat':   { sfx: 'captain-retreat', sfxOpts: { vol: 0.8 }, text: () => 'the Captain withdraws', textOpts: { color: '#ffb877', rise: 60, ttl: 2.0 } },
  'captain-arrives':   { sfx: 'captain-arrives', sfxOpts: { vol: 0.9 }, shake: 0.12, text: () => 'THE CAPTAIN', textOpts: { color: '#b8482e', rise: 60, ttl: 2.0 } },
  'lance-hit':         { sfx: 'lance-hit', sfxOpts: { vol: 0.7 }, burst: { count: 6, color: '#ffb877', color2: '#b8482e', speed: 2.0, up: 1.2, ttl: 0.35, size: 0.24 } },
  'hexbolt-hit':       { sfx: 'hex-hit', sfxOpts: { vol: 0.6 }, burst: { count: 6, color: '#62ead8', color2: '#3cb8a8', speed: 1.4, up: 1.0, ttl: 0.4, size: 0.24 } },
  'player-dead':       { sfx: 'player-dead', sfxOpts: { vol: 0.9 }, shake: 0.4, hitstop: 0.08 },
  'bell-channel':      { sfx: 'bell-pull', sfxOpts: { vol: 0.5 } },
  'dialogue-open':     { sfx: 'ui-open', sfxOpts: { vol: 0.35 } },
  'dialogue-line':     { sfx: 'ui-line', sfxOpts: { vol: 0.25 } },
  'dialogue-close':    { sfx: 'ui-close', sfxOpts: { vol: 0.3 } },
  'dry-fire':          { sfx: 'ui-deny', sfxOpts: { vol: 0.3 } },
});
