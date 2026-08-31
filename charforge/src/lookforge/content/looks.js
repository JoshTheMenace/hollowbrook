// LookForge look presets — color science as reviewable data.
// A look answers: how bright, how saturated, which way does white lean,
// what do shadows/highlights tint toward, how much glow, how much frame.

export const LOOKS = {
  // Neutral pass-through: the control both eyes and gates compare against.
  flat: {
    bloom: { strength: 0 },
    grade: { exposure: 1, saturation: 1, vignette: 0 },
  },

  // Bright toy-box daylight — Sakura Crossing / village scenes.
  'sakura-day': {
    bloom: { strength: 0.25, radius: 0.5, threshold: 0.9 },
    grade: {
      exposure: 1.05, saturation: 1.12, contrast: 1.14, temp: 0.25, tint: 0.02,
      lift: [0.02, 0.015, 0.03],      // shadows drift lavender, never black
      gamma: [1.0, 1.0, 0.98],
      gain: [1.03, 1.0, 0.97],        // highlights warm
      vignette: 0.22, vignetteSoft: 0.7,
    },
  },

  // Moonlit bloom-heavy night — the survivors arena, boss scenes.
  nightbloom: {
    bloom: { strength: 0.38, radius: 0.6, threshold: 0.86 },
    grade: {
      exposure: 1.2, saturation: 1.06, contrast: 1.26, temp: -0.3, tint: -0.03,
      lift: [0.03, 0.02, 0.06],       // indigo shadows
      gamma: [1.0, 0.99, 1.04],
      gain: [1.0, 0.98, 1.06],        // cool highlights
      vignette: 0.34, vignetteSoft: 0.55,
    },
  },

  // High-drama warm dusk — cutscenes, victory screens.
  emberfall: {
    bloom: { strength: 0.34, radius: 0.55, threshold: 0.87 },
    grade: {
      exposure: 1.14, saturation: 1.2, contrast: 1.22, temp: 0.45, tint: 0.05,
      lift: [0.04, 0.02, 0.01],
      gamma: [0.98, 1.0, 1.05],
      gain: [1.08, 1.0, 0.92],
      vignette: 0.4, vignetteSoft: 0.5,
    },
  },
};
