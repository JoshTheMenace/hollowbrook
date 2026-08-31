/**
 * Role-based palette. Every colour in the scene comes from here, keyed by
 * role rather than by hue, so the whole grade can be retuned in one place.
 * The values below are neutral-but-pleasant placeholders: replace them from
 * the filled scene contract's `art_direction.palette_roles` before building.
 *
 * Value-ladder rules — these are what make the 2D look, not the shaders:
 *
 * - The whole scene lives in a NARROW value range. Ink is the darkest thing
 *   in the frame and it is not black; paper is the lightest and it is not
 *   white. Everything else sits between them, which is why a frame reads as
 *   painted rather than rendered.
 * - Large shaded areas must stay above ~0.30 relative luminance AFTER the
 *   cel ramp's bottom band (~0.36x) is applied. A "dark green" wall reads as
 *   black on its shadow side; lift the base colour instead of trusting the
 *   lights. The flagship lifted its forest greens and bottle greens for
 *   exactly this.
 * - Shadow is a HUE shift (toward the violet shadowTint), never just a darker
 *   copy of the base colour. Choosing a lighter colour does not help a
 *   surface that gets no direct light at all — that surface sits on the
 *   ramp's bottom band no matter what; keep its base value high.
 * - ONE saturated accent per area. The accent is loud precisely because
 *   nothing else is; a second one in the same frame halves both.
 * - Ground uses a ladder of 3-4 steps of the same hue family, light to dark,
 *   so wear, edges, and depth read without any texture detail.
 */
export const PAL = Object.freeze({
  // --- ink & paper: the two ends of the value range ---
  ink: 0x3c3350, // outlines + darkest structural tone; desaturated blue-violet, never black
  paper: 0xf6efdf, // the lightest large surface; warm off-white, never pure white

  // --- sky trio: golden hour — warm top, peach horizon, amber haze ---
  sky: { top: 0x9db4e2, mid: 0xe8d9c8, haze: 0xf6dcbc },
  fog: 0xecdcc8, // atmospheric fade; keep near the sky's horizon tone

  // --- light rig (see the RIG table in main.js) ---
  sun: 0xffe3b0, // warm quantised key, low west-south-west
  fill: 0x9fb2e8, // cool bounce from the opposite quarter; carries the shadow side
  bounce: 0xd8c4d8, // weak below-front bounce so undersides never go flat black
  hemiSky: 0xe8dcc8,
  hemiGround: 0xb0a2c2, // VIOLET ground hemisphere: nothing in shadow ever goes black

  // --- shadow tints ---
  shadowTint: 0x6c5c8c, // material-level: cel ramp's dark bands lean toward this
  gradeShadow: 0xaaa2cc, // grade pass split-tone, darks
  gradeLight: 0xffedd2, // grade pass split-tone, lights

  // --- ground ladder, light -> dark (warm dust over lavender) ---
  ground: 0xd9cfc0,
  groundMid: 0xbcb0a6,
  groundDark: 0x948a8c,
  groundDeep: 0x6e6678,

  // --- built masses: Yoizaka's fabric ---
  primary: 0xe4d8c2, // plaster shopfront walls
  secondary: 0x9c7e5e, // aged cedar timber, posts, fascia boards
  trim: 0x574d66, // indigo-grey roof tile + dark joinery
  glass: 0xa8c4cc,

  // --- accents: spend sparingly, one per area ---
  accent: 0xf09c46, // paper-lantern amber — owned by shopfronts + festival ground
  accentCool: 0xe08cae, // spirit-blossom pink — owned by the shrine + blossom/charms
  warmLight: 0xffc875, // practical / emissive light sources
});
