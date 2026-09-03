/**
 * HOLLOWBROOK — the role-based palette, forked from Thistledown's and
 * re-toned for DUSK.  Every key Thistledown's kit reads is still here (the
 * kit is forked verbatim and reads them by name); the VALUES are the
 * plan's `city.palette_notes`:
 *
 *   "DUSK, twenty minutes before dark: the sun is due west and nine degrees
 *    up, so only WEST faces and the tops of things are still lit, in a low
 *    amber; everything else is in a violet-blue half-light, never black,
 *    and the town's practicals are the second light source."
 *
 * VALUE-LADDER RULES (unchanged from Thistledown, they make the 2D look):
 * - NARROW value range; `ink` is a warm violet, `paper` is cream not white.
 * - Large shaded areas stay above ~0.30 luminance after the cel ramp's
 *   bottom band.  At dusk almost everything is shaded, so the pale masses
 *   (limewash, granite, canvas, paper, thatch) keep their BASE values high
 *   and lean lilac rather than grey.
 * - Shadow is a HUE SHIFT toward `shadowTint`, never a darker copy.
 * - ONE saturated accent per district, each OWNED (ACCENT below) — and ONE
 *   accent for the enemy, town-wide, that no district may wear.
 * - The ground is a ladder of one cool family so wear and depth read with
 *   no texture detail.
 *
 * THE ONE COOL THING.  `ACCENT.wardGlow` / `PAL.tealGlow` belong to
 * chapelclose (the hedge-wizard) and to nothing else: the only cool accent
 * and the only strong emissive.  Every other lit thing in Hollowbrook is
 * torch-warm, which is what makes the ward read as magic.
 */

/* ---- owned accents ---------------------------------------------------
 * A kit generator NEVER defaults a colour to one of these; a district passes
 * its own in.  Thistledown's six keys are kept because the forked kit's
 * parameter defaults and showcase name them; the Hollowbrook owners are the
 * first block and the table in city-plan.json's palette_notes.
 *
 * | district    | accent               | what wears it                       |
 * |-------------|----------------------|-------------------------------------|
 * | southgate   | ACCENT.wardenMadder  | the banner pair, the gate torches   |
 * | marketlow   | ACCENT.hallAmber     | the guild hall's lanterns           |
 * | wardrow     | ACCENT.rowGreen      | the painted door family             |
 * | millreach   | ACCENT.sailOchre     | the mill sails' canvas              |
 * | chapelclose | ACCENT.wardGlow      | the ward-glow — THE ONLY COOL ONE   |
 * | keephill    | ACCENT.gilt          | the bell, the beacon fire           |
 * | THE ENEMY   | ACCENT.companyRust   | the Company's sash; nothing else    |
 */
export const ACCENT = Object.freeze({
  wardenMadder: 0x8f3b4e,
  hallAmber: 0xe0a444,
  rowGreen: 0x3f6b4a,
  sailOchre: 0xc9a25a,
  wardGlow: 0x3cb8a8,       // chapelclose — THE ONLY COOL ACCENT IN THE TOWN
  gilt: 0xdcb75a,
  companyRust: 0xb8482e,    // THE ENEMY'S, town-wide; no district may wear it
  // Thistledown's keys, kept for the forked kit's defaults and showcase
  lanternRed: 0xd2543c,
  lanternGold: 0xe0a444,
  hedgeGreen: 0x3f6b4a,
  milledOchre: 0xc9a25a,
  alchemicalTeal: 0x3cb8a8,
});

/* ---- muted joinery: free to use, never an accent ----------------------- */
export const JOINERY = Object.freeze({
  oakStain: 0x6f5a45,
  mossPaint: 0x66735f,
  doveGrey: 0x8f8d9c,
  bone: 0xe8dfd0,
  pitch: 0x463f4f,
  plumWash: 0x745c6a,
  skyWash: 0x8496ad,
  barnRust: 0x8e6249,
});

export const PAL = Object.freeze({
  // --- ink & paper: the two ends of the value range ---
  ink: 0x3a3450,
  paper: 0xf1e9dc,

  // --- sky trio: top -> horizon -> the last amber in the west at ground line ---
  sky: { top: 0x5a6a9a, mid: 0xb3a5be, haze: 0xe4b58c },
  fog: 0xb8a8bc,

  // --- light rig (direction comes from city.sun; these are hues) ---
  sun: 0xffb877,       // the last low amber; the only shadow caster
  fill: 0x8d9ad8,      // violet-blue from the east, deliberately strong
  bounce: 0xc9b6c8,
  hemiSky: 0xb9c3e6,
  hemiGround: 0x9c8cb4, // VIOLET ground hemisphere

  // --- shadow tints ---
  shadowTint: 0x66588c,
  gradeShadow: 0x9a90c2,
  gradeLight: 0xffe7c8,

  // --- ground ladder, light -> dark: one cool family --------------------
  // terrain.js maps: paving->ground, ground->groundMid, bank->groundDark,
  // surrounds->groundDeep.  The moor beyond the walls is the coolest.
  ground: 0xb7b0ab,     // cobbles and the wall-walk's flags
  groundMid: 0x8f9a7c,  // the town's turf, gone grey-green in the half light
  groundDark: 0x7a7562, // banks, the curtain's scarps before they are faced
  groundDeep: 0x76748e, // the moor, heathery and cold

  cobble: 0xa39a92,
  gravel: 0xa9a394,
  earth: 0x8a7b66,
  turf: 0x8b9772,
  moss: 0x6f8060,
  strawLitter: 0xb3a27c,

  // --- walls: cream lime gone lilac ------------------------------------
  limewash: 0xe6dccd,
  limewashHoney: 0xdcc9a8,
  limewashPale: 0xece5da,
  limewashRose: 0xdfcbc2,
  plasterWarm: 0xd8c9b2,
  render: 0xd6ccbf,
  granite: 0x9fa0a6,     // the curtain: wet slate
  graniteWarm: 0xaaa69e,
  graniteDark: 0x7a7a84,
  rubble: 0x968f8d,

  /* --- the curtain wall (siege kit) ------------------------------------
   * A DEFENCE IS NOT A HOUSE.  The town's granite is the masons' warm
   * ashlar; the curtain is older, colder and coarser, and it has to read as
   * one continuous mass at 60 m with the whole town in front of it — so it
   * sits a step DARKER and a step BLUER than `granite`, and its dressed
   * stone (`coping`) is the one part that is pale, because a coping is the
   * only thing on a wall the last of the sun still touches.  Three tones,
   * not one: a wall in one tone is a grey card. */
  curtain: 0x93949e,
  curtainDark: 0x6e6f7c,
  coping: 0xb2ada6,

  // --- timber: silvered oak -------------------------------------------
  oak: 0x8e8474,
  oakDark: 0x625948,
  oakSilver: 0xa39b8c,
  timberFrame: 0x7c705f,
  timberDark: 0x514a40,
  bark: 0x6f6658,
  barkDark: 0x554d43,

  // --- roofs -----------------------------------------------------------
  thatch: 0xb09a68,
  thatchWorn: 0x9c865a,
  thatchRidge: 0xc2ab78,
  thatchDeep: 0x83704a,
  shingle: 0x7f8574,
  shingleMoss: 0x6f7c64,
  shingleDark: 0x60665a,
  lead: 0x6f7080,
  slate: 0x636374,

  // --- foliage: yews and the close's trees, blue in the dusk -----------
  leafLight: 0x7f9764,
  leaf: 0x66805a,
  leafDeep: 0x50694c,
  leafYew: 0x40534a,
  leafOrchard: 0x748e62,
  hedge: 0x5f7654,

  // --- metal, glass, cloth ---------------------------------------------
  iron: 0x565064,
  ironDark: 0x433e52,
  ironRust: 0x7a5344,     // siege iron that has stood out a winter: strapping, a portcullis, a chain
  brass: 0xa98d55,
  copper: 0x8c745a,
  glass: 0x7f92a6,
  glassDark: 0x5e6f82,
  canvas: 0xd9d0bb,
  canvasWorn: 0xc6bba3,
  rope: 0xa8987c,
  hessian: 0xb09d7f,
  wicker: 0xb29a70,

  // --- light: everything warm except one -------------------------------
  warmLight: 0xffc57a,
  ember: 0xe3823f,
  /* The HEART of a big fire — a beacon, a brazier's bed of coals, a camp
   * fire seen from the wall.  `ember` is the flame; this is what is under
   * it, and a fire drawn in one tone is a paper cut-out. */
  emberDeep: 0xbe5423,
  /* The Ashen Company's canvas: `ACCENT.companyRust` knocked back to a
   * cloth value, so a camp of tents reads as THEIRS at 60 m without any
   * one tent being as loud as a raider's sash. */
  companyCanvas: 0x91503d,
  tealGlow: 0x62ead8,     // CHAPELCLOSE ONLY — the one cool emissive
  lanternPaper: 0xd9ccb0,

  // --- legacy vignette roles, kept so materials.js / scene.js keep working
  primary: 0xe6dccd,
  secondary: 0x9fa0a6,
  trim: 0x7c705f,
  accent: 0x8f3b4e,
  accentCool: 0x3cb8a8,
});
