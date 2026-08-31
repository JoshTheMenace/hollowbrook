// All survivors content is DATA — weapons, passives, enemies, waves,
// characters. Agents (and balance sims) work on this file, not on systems.

// --- Weapons ---------------------------------------------------------------
// behavior: implemented in systems.js. stats arrays are per level (1-5).
export const WEAPONS = {
  slash: {
    name: 'Iai Slash', icon: '⚔️', behavior: 'arc',
    desc: 'A sweeping blade arc in front of you.',
    cooldown: [0.9, 0.85, 0.8, 0.7, 0.6],
    damage: [12, 16, 22, 30, 42],
    radius: [2.3, 2.5, 2.7, 3.0, 3.4],
    arc: [100, 110, 120, 140, 170],          // degrees
    knockback: 2.4,
  },
  knives: {
    name: 'Throwing Knives', icon: '🔪', behavior: 'projectile',
    desc: 'Fast knives toward the nearest foe.',
    cooldown: [0.9, 0.8, 0.7, 0.6, 0.45],
    damage: [8, 10, 13, 17, 22],
    count: [1, 2, 2, 3, 4],
    speed: 11, life: 1.4, pierce: [0, 0, 1, 1, 2],
  },
  orbs: {
    name: 'Orbiting Blades', icon: '🌀', behavior: 'orbit',
    desc: 'Blades circle you, shredding what they touch.',
    cooldown: [0.5, 0.5, 0.5, 0.5, 0.5],     // tick rate for damage
    damage: [6, 8, 10, 13, 18],
    count: [1, 2, 3, 3, 4],
    radius: [1.5, 1.5, 1.6, 1.8, 2.0],
    spin: 2.6,
  },
  bolt: {
    name: 'Spirit Bolt', icon: '🔮', behavior: 'homing',
    desc: 'A slow bolt that hunts the strongest enemy.',
    cooldown: [1.6, 1.4, 1.25, 1.1, 0.9],
    damage: [20, 28, 38, 52, 70],
    speed: 5.5, turn: 5.2, life: 3.2,
  },
  stomp: {
    name: 'Earthen Stomp', icon: '💥', behavior: 'nova',
    desc: 'A shockwave that knocks everything back.',
    cooldown: [3.2, 2.9, 2.6, 2.2, 1.8],
    damage: [16, 22, 30, 40, 55],
    radius: [2.2, 2.4, 2.7, 3.0, 3.5],
    knockback: 5.5,
  },
  storm: {
    name: 'Sky Wrath', icon: '⚡', behavior: 'strike',
    desc: 'Lightning falls on random enemies.',
    cooldown: [2.4, 2.1, 1.8, 1.5, 1.1],
    damage: [26, 34, 44, 58, 78],
    count: [1, 1, 2, 2, 3],
    radius: 1.1,                              // splash
  },
};

// --- Passive upgrades ------------------------------------------------------
export const PASSIVES = {
  might: { name: 'Might', icon: '💪', desc: '+15% damage', max: 5, apply: (s) => { s.damageMul += 0.15; } },
  haste: { name: 'Haste', icon: '⏩', desc: '-10% weapon cooldowns', max: 5, apply: (s) => { s.cooldownMul *= 0.9; } },
  swift: { name: 'Swift Feet', icon: '👟', desc: '+12% move speed', max: 4, apply: (s) => { s.speedMul += 0.12; } },
  vigor: { name: 'Vigor', icon: '❤️', desc: '+25 max HP and heal 25', max: 4, apply: (s) => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); } },
  magnet: { name: 'Magnet', icon: '🧲', desc: '+40% pickup radius', max: 3, apply: (s) => { s.magnetMul += 0.4; } },
  greed: { name: 'Greed', icon: '💰', desc: '+25% gold gained', max: 3, apply: (s) => { s.goldMul += 0.25; } },
  regen: { name: 'Regrowth', icon: '🌿', desc: '+1 HP per second', max: 3, apply: (s) => { s.regen += 1; } },
  crush: { name: 'Heavy Hands', icon: '🥊', desc: '+30% knockback', max: 3, apply: (s) => { s.knockbackMul += 0.3; } },
};

// --- Enemies ---------------------------------------------------------------
// visual: critter builder key in critters.js. behavior: chase | zigzag | charge | tank
export const ENEMIES = {
  slime: { visual: 'slime', hp: 18, speed: 1.55, damage: 6, xp: 1, gold: 1, radius: 0.34, behavior: 'chase', mass: 1 },
  bat: { visual: 'bat', hp: 9, speed: 2.45, damage: 4, xp: 1, gold: 1, radius: 0.28, behavior: 'zigzag', mass: 0.5 },
  bonehead: { visual: 'bonehead', hp: 42, speed: 1.35, damage: 10, xp: 3, gold: 2, radius: 0.4, behavior: 'chase', mass: 1.6 },
  imp: { visual: 'imp', hp: 26, speed: 2.05, damage: 8, xp: 2, gold: 2, radius: 0.32, behavior: 'charge', mass: 0.9 },
  crawler: { visual: 'crawler', hp: 70, speed: 1.05, damage: 14, xp: 5, gold: 4, radius: 0.52, behavior: 'tank', mass: 3 },
  wisp: { visual: 'wisp', hp: 14, speed: 2.5, damage: 6, xp: 2, gold: 2, radius: 0.26, behavior: 'zigzag', mass: 0.4 },
  brute_elite: { visual: 'elite', hp: 420, speed: 1.3, damage: 20, xp: 40, gold: 30, radius: 0.62, behavior: 'tank', mass: 8, elite: true },
};

// --- Waves: the 8-minute run timeline --------------------------------------
// Each phase: until (sec), spawnEvery (sec), mix (weighted), burst events.
export const RUN_LENGTH = 480; // 8:00 — survive to win
export const WAVES = [
  { until: 45, spawnEvery: 1.0, mix: { slime: 5, bat: 1 } },
  { until: 90, spawnEvery: 0.75, mix: { slime: 4, bat: 3 } },
  { until: 150, spawnEvery: 0.6, mix: { slime: 3, bat: 3, bonehead: 2 } },
  { until: 210, spawnEvery: 0.56, mix: { bat: 3, bonehead: 3, imp: 2, wisp: 1 } },
  { until: 270, spawnEvery: 0.48, mix: { bonehead: 3, imp: 3, wisp: 2, crawler: 1 } },
  { until: 330, spawnEvery: 0.42, mix: { imp: 3, wisp: 3, crawler: 2, bat: 2 } },
  { until: 400, spawnEvery: 0.3, mix: { imp: 3, crawler: 3, bonehead: 2, wisp: 2 } },
  { until: RUN_LENGTH, spawnEvery: 0.22, mix: { crawler: 3, imp: 3, wisp: 3, bonehead: 2 } },
];
export const EVENTS = [
  { at: 120, type: 'elite' },                // first elite brute
  { at: 260, type: 'elite' },
  { at: 300, type: 'ring', enemy: 'bat', count: 26 },   // surprise surround
  { at: 420, type: 'elite' }, { at: 421, type: 'elite' },
];
// Enemy scaling over the run (hp multiplier by minute).
export const HP_SCALE = (t) => 1 + (t / 60) * 0.38;

// --- Playable characters (the CharForge roster!) ---------------------------
export const PLAYABLES = {
  ronin: { name: 'Ronin', weapon: 'slash', hp: 100, speed: 1.0, cost: 0, blurb: 'Balanced. Sweeping iai arcs.' },
  archer: { name: 'Archer', weapon: 'knives', hp: 85, speed: 1.12, cost: 120, blurb: 'Fast and fragile. Ranged volleys.' },
  mage: { name: 'Mage', weapon: 'bolt', hp: 80, speed: 0.95, cost: 200, blurb: 'Slow, devastating homing bolts.' },
  brute: { name: 'Brute', weapon: 'stomp', hp: 130, speed: 0.88, cost: 300, blurb: 'Tanky. Shockwave stomps.' },
};

// XP needed per level.
export const XP_CURVE = (level) => Math.floor(5 + level * 4 + level * level * 0.9);
