const gazeVectors = { user: [0, 0], left: [-6, 0], right: [6, 0], down: [0, 5], away: [-4, 2] };

const frameByViseme = {
  rest: "assets/mira-anime-v2.png", A: "assets/mira-viseme-a.png", E: "assets/mira-viseme-e.png",
  O: "assets/mira-viseme-o.png", U: "assets/mira-viseme-u.png", M: "assets/mira-viseme-m.png",
  F: "assets/mira-viseme-f.png", S: "assets/mira-viseme-e.png", L: "assets/mira-viseme-l.png"
};

export function animationVariables(emotion, gesture) {
  return {
    "--emotion-shift": `${7 * emotion}px`, "--emotion-shift-neg": `${-7 * emotion}px`,
    "--emotion-angle": `${7 * emotion}deg`, "--emotion-angle-neg": `${-7 * emotion}deg`,
    "--emotion-mouth-y": `${-4 * emotion}px`, "--blush-opacity": String(.62 * emotion),
    "--shrug-angle": `${34 * gesture}deg`, "--shrug-angle-neg": `${-34 * gesture}deg`,
    "--shrug-x": `${2 * gesture}px`, "--shrug-x-neg": `${-2 * gesture}px`, "--shrug-y": `${-4 * gesture}px`,
    "--open-angle": `${54 * gesture}deg`, "--point-angle": `${73 * gesture}deg`,
    "--tilt-angle": `${6 * gesture}deg`, "--tilt-angle-neg": `${-6 * gesture}deg`,
    "--nod-y": `${9 * gesture}px`, "--shake-x": `${8 * gesture}px`, "--shake-x-neg": `${-8 * gesture}px`,
    "--open-hand-x": `${-22 * gesture}px`, "--open-hand-y": `${-35 * gesture}px`, "--open-hand-scale": String(1 + .1 * gesture),
    "--point-hand-x": `${-42 * gesture}px`, "--point-hand-y": `${-56 * gesture}px`, "--point-hand-scale": String(1 - .25 * gesture)
  };
}

export function portraitFrame(viseme) { return frameByViseme[viseme] ?? frameByViseme.rest; }

export class AnimeActorRenderer {
  constructor(root) {
    this.root = root;
    this.portrait = root.querySelector(".portrait-rig");
    this.mouthFrame = root.querySelector("#actor-mouth-frame");
    [...new Set(Object.values(frameByViseme)), "assets/mira-blink.png"].forEach(src => { const image = new Image(); image.src = src; });
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  }

  render(state) {
    this.root.setAttribute("class", [
      "anime-actor", `actor-${state.conversation}`,
      `emotion-${state.emotionIntensity > 0 ? state.emotion : "neutral"}`,
      `gesture-${state.gestureIntensity > 0 ? state.gesture : "none"}`,
      `actor-${state.posture}`
    ].join(" "));

    Object.entries(animationVariables(state.emotionIntensity, state.gestureIntensity)).forEach(([name, value]) => this.root.style.setProperty(name, value));
    this.root.style.setProperty("--blink", state.blink ? "1" : "0");
    this.root.style.setProperty("--shadow-scale", String(1 + state.breath * .035));
    this.mouthFrame.src = portraitFrame(state.viseme);
    this.mouthFrame.style.opacity = state.viseme === "rest" ? "0" : "1";

    const [gazeX, gazeY] = gazeVectors[state.gaze] ?? gazeVectors.user;
    const breath = this.reducedMotion.matches ? 0 : (state.breath - .5) * (2.4 + state.energy * 2.2);
    this.portrait.style.translate = `${gazeX * state.gazeIntensity}px ${gazeY * state.gazeIntensity + breath}px`;
  }
}
