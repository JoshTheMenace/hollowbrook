import { normalizePlan, vocabulary } from "./contract.js";

const gestureDurations = {
  none: 0, nod: 650, shake: 800, tilt_left: 1100, tilt_right: 1100,
  lean_in: 1300, lean_back: 1300, small_shrug: 1000, point: 1400, open_hand: 1400,
  wave: 1800, bow: 1500, walk_forward: 2300, walk_back: 2300, strafe_left: 2000,
  strafe_right: 2000, turn_left: 1500, turn_right: 1500, jump: 950, dance: 3000
};

export class BehaviorEngine {
  constructor({ now = () => performance.now(), random = Math.random, cooldownMs = 2600 } = {}) {
    this.now = now;
    this.random = random;
    this.cooldownMs = cooldownMs;
    this.listeners = new Set();
    this.events = [];
    this.sequence = 0;
    this.deadlines = { blink: null, blinkEnd: null, gesture: null, gaze: null, recovery: null };
    this.cooldowns = new Map();
    this.state = {
      conversation: "idle", emotion: "neutral", emotionIntensity: 0,
      gaze: "user", gazeIntensity: 0.7, gesture: "none", gestureIntensity: 0,
      posture: "neutral", energy: 0.45, mouth: 0, viseme: "rest", blink: 0, breath: 0,
      speech: "", interrupted: false, lastCommandAt: 0
    };
    this.emotionDecay = { startedAt: 0, intensity: 0 };
    this.scheduleBlink(this.now());
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot(), null);
    return () => this.listeners.delete(listener);
  }

  snapshot() { return { ...this.state }; }

  emit(type, detail = {}, at = this.now()) {
    const event = { id: ++this.sequence, at: Math.round(at), type, detail: structuredClone(detail) };
    this.events.push(event);
    if (this.events.length > 300) this.events.shift();
    const snapshot = this.snapshot();
    this.listeners.forEach(listener => listener(snapshot, event));
    return event;
  }

  setConversation(conversation, at = this.now()) {
    if (!vocabulary.states.includes(conversation)) throw new RangeError(`Unknown conversation state: ${conversation}.`);
    if (conversation === "interrupted") return this.interrupt(at);
    this.deadlines.recovery = null;
    this.state.conversation = conversation;
    this.state.interrupted = false;
    this.state.lastCommandAt = at;
    if (conversation !== "speaking") {
      this.state.mouth = 0;
      this.state.viseme = "rest";
      this.state.speech = "";
    }
    this.emit("state.changed", { conversation }, at);
  }

  setEmotion(name, intensity, at = this.now()) {
    const { emotion } = normalizePlan({ emotion: { name, intensity } });
    this.state.emotion = emotion.name;
    this.state.emotionIntensity = emotion.intensity;
    this.state.lastCommandAt = at;
    this.emotionDecay = { startedAt: at, intensity: emotion.intensity };
    this.emit("emotion.changed", emotion, at);
  }

  setGaze(target, intensity = 0.7, holdMs = 1800, at = this.now()) {
    const plan = normalizePlan({ gaze: { target, intensity }, holdMs });
    this.state.gaze = plan.gaze.target;
    this.state.gazeIntensity = plan.gaze.intensity;
    this.state.lastCommandAt = at;
    this.deadlines.gaze = at + plan.holdMs;
    this.emit("gaze.changed", plan.gaze, at);
  }

  setEnergy(energy, at = this.now()) {
    this.state.energy = Math.min(1, Math.max(0, Number(energy) || 0));
    this.state.lastCommandAt = at;
    this.emit("energy.changed", { energy: this.state.energy }, at);
  }

  applyPlan(rawPlan, at = this.now()) {
    const plan = normalizePlan(rawPlan);
    this.deadlines.recovery = null;
    if (plan.state === "interrupted") {
      const interrupted = this.interrupt(at);
      this.emit("plan.applied", { plan, gestureAccepted: false }, at);
      return { plan, gestureAccepted: false, interrupted };
    }
    const gestureAccepted = this.startGesture(plan.gesture, at, { notify: false });
    Object.assign(this.state, {
      conversation: plan.state,
      emotion: plan.emotion.name,
      emotionIntensity: plan.emotion.intensity,
      gaze: plan.gaze.target,
      gazeIntensity: plan.gaze.intensity,
      posture: plan.posture,
      energy: plan.energy,
      speech: plan.speech,
      mouth: 0,
      viseme: "rest",
      interrupted: false,
      lastCommandAt: at
    });
    this.deadlines.gaze = at + plan.holdMs;
    this.emotionDecay = { startedAt: at, intensity: plan.emotion.intensity };
    this.emit("plan.applied", { plan, gestureAccepted }, at);
    if (plan.gesture.name !== "none") {
      const decision = this.lastGestureDecision;
      this.emit(gestureAccepted ? "gesture.started" : "gesture.rejected", decision, at);
    }
    return { plan, gestureAccepted };
  }

  startGesture(gesture, at = this.now(), { notify = true } = {}) {
    gesture = normalizePlan({ gesture }).gesture;
    if (!gesture || gesture.name === "none") return true;
    const readyAt = this.cooldowns.get(gesture.name) ?? 0;
    if (at < readyAt || (this.state.gesture !== "none" && this.deadlines.gesture !== null && at < this.deadlines.gesture)) {
      this.lastGestureDecision = { name: gesture.name, reason: at < readyAt ? "cooldown" : "occupied", readyAt };
      if (notify) this.emit("gesture.rejected", this.lastGestureDecision, at);
      return false;
    }
    this.state.gesture = gesture.name;
    this.state.gestureIntensity = gesture.intensity;
    this.deadlines.gesture = at + gestureDurations[gesture.name];
    this.cooldowns.set(gesture.name, at + this.cooldownMs);
    this.lastGestureDecision = { name: gesture.name, intensity: gesture.intensity };
    if (notify) this.emit("gesture.started", this.lastGestureDecision, at);
    return true;
  }

  interrupt(at = this.now()) {
    if (this.state.interrupted && this.deadlines.recovery !== null) {
      this.emit("performance.interrupt_ignored", { reason: "already_interrupted" }, at);
      return false;
    }
    const canceled = this.state.gesture;
    Object.assign(this.state, {
      conversation: "interrupted", interrupted: true, speech: "", mouth: 0,
      viseme: "rest", gesture: "none", gestureIntensity: 0, posture: "neutral", lastCommandAt: at
    });
    this.deadlines.gesture = null;
    this.deadlines.recovery = at + 850;
    this.emit("performance.interrupted", { canceledGesture: canceled }, at);
    return true;
  }

  setMouth(amount, at = this.now(), { silent = false } = {}) {
    if (!Number.isFinite(Number(amount))) throw new TypeError("Mouth amount must be a finite number.");
    this.state.mouth = this.state.conversation === "speaking" ? Math.min(1, Math.max(0, Number(amount))) : 0;
    if (!silent) this.emit("mouth.changed", { amount: this.state.mouth }, at);
  }

  setViseme(viseme, amount = 0.7, at = this.now(), { silent = true } = {}) {
    if (!vocabulary.visemes.includes(viseme)) throw new RangeError(`Unknown viseme: ${viseme}.`);
    this.state.viseme = this.state.conversation === "speaking" ? viseme : "rest";
    this.setMouth(viseme === "rest" ? 0 : amount, at, { silent: true });
    if (!silent) this.emit("viseme.changed", { viseme: this.state.viseme, amount: this.state.mouth }, at);
  }

  tick(at = this.now()) {
    if (this.deadlines.gesture !== null && at >= this.deadlines.gesture) {
      const completed = this.state.gesture;
      this.state.gesture = "none";
      this.state.gestureIntensity = 0;
      this.deadlines.gesture = null;
      this.emit("gesture.completed", { name: completed }, at);
    }
    if (this.deadlines.gaze !== null && at >= this.deadlines.gaze) {
      this.state.gaze = "user";
      this.state.gazeIntensity = 0.58;
      this.deadlines.gaze = null;
      this.emit("gaze.resumed", {}, at);
    }
    if (this.deadlines.recovery !== null && at >= this.deadlines.recovery) {
      this.state.conversation = "listening";
      this.state.interrupted = false;
      this.deadlines.recovery = null;
      this.emit("performance.recovered", {}, at);
    }

    if (!this.state.blink && at >= this.deadlines.blink) {
      this.state.blink = 1;
      this.deadlines.blinkEnd = at + 110;
      this.emit("micro.blink", {}, at);
    } else if (this.state.blink && at >= this.deadlines.blinkEnd) {
      this.state.blink = 0;
      this.deadlines.blinkEnd = null;
      this.scheduleBlink(at);
    }

    const seconds = at / 1000;
    this.state.breath = (Math.sin(seconds * (1.3 + this.state.energy * 0.6)) + 1) / 2;
    if (this.state.emotion !== "neutral" && at - this.emotionDecay.startedAt > 2400) {
      const elapsed = at - this.emotionDecay.startedAt - 2400;
      this.state.emotionIntensity = Math.max(0, this.emotionDecay.intensity * (1 - elapsed / 6000));
      if (this.state.emotionIntensity === 0) {
        const previous = this.state.emotion;
        this.state.emotion = "neutral";
        this.emit("emotion.decayed", { from: previous }, at);
      }
    }
    this.listeners.forEach(listener => listener(this.snapshot(), null));
    return this.snapshot();
  }

  scheduleBlink(at) {
    this.deadlines.blink = at + 1900 + this.random() * 2600;
  }

  reset(at = this.now()) {
    Object.assign(this.state, {
      conversation: "idle", emotion: "neutral", emotionIntensity: 0,
      gaze: "user", gazeIntensity: 0.7, gesture: "none", gestureIntensity: 0,
      posture: "neutral", energy: 0.45, mouth: 0, viseme: "rest", blink: 0, breath: 0,
      speech: "", interrupted: false, lastCommandAt: at
    });
    this.deadlines = { blink: null, blinkEnd: null, gesture: null, gaze: null, recovery: null };
    this.cooldowns.clear();
    this.events.length = 0;
    this.sequence = 0;
    this.emotionDecay = { startedAt: at, intensity: 0 };
    this.scheduleBlink(at);
    this.emit("engine.reset", {}, at);
  }

  clearEvents() { this.events.length = 0; }
}
