export const vocabulary = Object.freeze({
  states: ["idle", "listening", "thinking", "speaking", "interrupted"],
  emotions: ["neutral", "happy", "amused", "skeptical", "confused", "concerned", "embarrassed", "excited"],
  gazes: ["user", "down", "left", "right", "away"],
  gestures: ["none", "nod", "shake", "tilt_left", "tilt_right", "lean_in", "lean_back", "small_shrug", "point", "open_hand", "wave", "bow", "walk_forward", "walk_back", "strafe_left", "strafe_right", "turn_left", "turn_right", "jump", "dance"],
  postures: ["neutral", "lean_in", "lean_back"],
  visemes: ["rest", "A", "E", "O", "U", "M", "F", "S", "L"]
});

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const clamp = (value, fallback = 0.5, path = "value") => {
  if (value === undefined) return fallback;
  if (!Number.isFinite(Number(value))) throw new TypeError(`${path} must be a finite number.`);
  return Math.min(1, Math.max(0, Number(value)));
};
const pick = (value, allowed, fallback, path) => {
  if (value === undefined) return fallback;
  if (!allowed.includes(value)) throw new RangeError(`${path} must be one of: ${allowed.join(", ")}.`);
  return value;
};

export function normalizePlan(input) {
  if (!isRecord(input)) throw new TypeError("An acting plan must be a JSON object.");

  const emotion = isRecord(input.emotion) ? input.emotion : {};
  const gaze = isRecord(input.gaze) ? input.gaze : {};
  const gesture = isRecord(input.gesture) ? input.gesture : {};
  if (input.speech !== undefined && typeof input.speech !== "string") throw new TypeError("speech must be a string.");
  const speech = input.speech?.trim().slice(0, 500) ?? "";
  const headGesture = pick(input.head, vocabulary.gestures, "none", "head");

  const rawHold = input.holdMs ?? input.hold_ms ?? 1800;
  if (!Number.isFinite(Number(rawHold))) throw new TypeError("holdMs must be a finite number.");
  return {
    speech,
    state: pick(input.state, vocabulary.states, speech ? "speaking" : "idle", "state"),
    emotion: {
      name: pick(emotion.name, vocabulary.emotions, "neutral", "emotion.name"),
      intensity: clamp(emotion.intensity, 0.5, "emotion.intensity")
    },
    gaze: {
      target: pick(gaze.target, vocabulary.gazes, "user", "gaze.target"),
      intensity: clamp(gaze.intensity, 0.7, "gaze.intensity")
    },
    gesture: {
      name: pick(gesture.name ?? headGesture, vocabulary.gestures, "none", "gesture.name"),
      intensity: clamp(gesture.intensity, 0.5, "gesture.intensity")
    },
    posture: pick(input.posture, vocabulary.postures, "neutral", "posture"),
    energy: clamp(input.energy, 0.5, "energy"),
    holdMs: Math.min(10_000, Math.max(0, Number(rawHold)))
  };
}

export const examplePlan = Object.freeze({
  speech: "You're seriously going to try that?",
  state: "speaking",
  emotion: { name: "skeptical", intensity: 0.62 },
  gaze: { target: "user", intensity: 0.82 },
  gesture: { name: "small_shrug", intensity: 0.44 },
  posture: "lean_back",
  energy: 0.36,
  holdMs: 2200
});
