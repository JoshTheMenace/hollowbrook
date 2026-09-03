/* The declared event vocabulary.  Every name here is emitted somewhere in
 * src/game (check-feel greps the emit sites) and wired in feeltable.js; an
 * event that is declared and never emitted is stale, one emitted and never
 * wired is a defect nothing guards (nightbloom: 197 of 199 unheard). */
export const GAME_EVENTS = Object.freeze([
  // the ladder, in contract order
  'bolt-fired', 'bolt-miss', 'bolt-hit', 'lance-fired', 'kill-cutpurse',
  'player-hurt', 'kill-hexer', 'kill-reaver', 'kill-shieldbearer',
  'lance-multikill', 'wave-cleared', 'kill-captain', 'bell-rung',
  // also declared by the contract
  'defeat', 'light-lost', 'objective-start', 'objective-done',
  'npc-sheltered', 'barricade-up', 'brazier-lit', 'reload', 'hexer-telegraph', 'captain-dash',
  // the rest of what the run says
  'wave-start', 'breather-start', 'objective-failed', 'captain-retreat', 'captain-arrives',
  'lance-hit', 'hexbolt-hit', 'player-dead', 'bell-channel',
  'dialogue-open', 'dialogue-line', 'dialogue-close', 'dry-fire',
]);
