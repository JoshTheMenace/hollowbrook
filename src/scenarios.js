export const scenarios = Object.freeze({
  skeptical: {
    speech: "You're seriously going to try that?",
    state: "speaking",
    emotion: { name: "skeptical", intensity: 0.62 },
    gaze: { target: "user", intensity: 0.84 },
    gesture: { name: "small_shrug", intensity: 0.46 },
    posture: "lean_back",
    energy: 0.36,
    holdMs: 2600
  },
  warm: {
    speech: "That was a thoughtful answer. Take a second and tell me what led you there.",
    state: "speaking",
    emotion: { name: "happy", intensity: 0.68 },
    gaze: { target: "user", intensity: 0.92 },
    gesture: { name: "open_hand", intensity: 0.42 },
    posture: "lean_in",
    energy: 0.48,
    holdMs: 4200
  },
  explain: {
    speech: "Watch what happens when intent, gaze, expression, and gesture arrive as one performance plan.",
    state: "speaking",
    emotion: { name: "excited", intensity: 0.76 },
    gaze: { target: "user", intensity: 0.86 },
    gesture: { name: "point", intensity: 0.58 },
    posture: "lean_in",
    energy: 0.74,
    holdMs: 4600
  }
});
