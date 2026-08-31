import { BehaviorEngine } from "./engine.js";
import { normalizePlan } from "./contract.js";
import { VrmActorRenderer } from "./vrm-renderer.js";
import { BrowserSpeechSession, wordToVisemes } from "./speech.js";
import { scenarios } from "./scenarios.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const seededRandom = (() => { let seed = 0x9e3779b9; return () => ((seed ^= seed << 13, seed ^= seed >>> 17, seed ^= seed << 5) >>> 0) / 4294967296; })();
const engine = new BehaviorEngine({ random: seededRandom });
const renderer = new VrmActorRenderer($("#actor"));
const startedAt = performance.now();
let playback = null;
let tourTimers = [];
let fallbackTimers = [];
let lastFrame = performance.now();
let lastEventAt = performance.now();
let nextMetricUpdate = 0;
let frameSamples = [];

const planSelect = $("#plan-select");
const planEditor = $("#plan-editor");
const speechCard = $("#speech-card");
const speechText = $("#speech-text");
const timeline = $("#timeline");
const eventLog = $("#event-log");
const microphoneButton = $("#microphone-button");
const utteranceInput = $("#utterance-input");

function humanize(value) { return String(value).replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function stateLabel(state) { return state === "idle" ? "Ready" : humanize(state); }
function selectedPlan() { return normalizePlan(JSON.parse(planEditor.value)); }
function setPlanEditor(key = planSelect.value) { planEditor.value = JSON.stringify(scenarios[key], null, 2); $("#plan-error").textContent = ""; }

function updateButtons(state) {
  $$("[data-state]").forEach(button => { const active = button.dataset.state === state.conversation; button.classList.toggle("active", active); button.setAttribute("aria-pressed", active); });
  $$("[data-emotion]").forEach(button => { const active = button.dataset.emotion === state.emotion; button.classList.toggle("active", active); button.setAttribute("aria-pressed", active); });
  $$("[data-gaze]").forEach(button => { const active = button.dataset.gaze === state.gaze; button.classList.toggle("active", active); button.setAttribute("aria-pressed", active); });
}

function channelFor(type) {
  if (type.includes("interrupt")) return "interrupt";
  if (type.startsWith("state") || type.includes("recovered") || type === "plan.applied") return "state";
  if (type.startsWith("emotion")) return "face";
  if (type.startsWith("gaze")) return "gaze";
  if (type.startsWith("gesture")) return "body";
  if (type.startsWith("mouth") || type.startsWith("viseme")) return "mouth";
  return "state";
}

function describeEvent(event) {
  const detail = event.detail;
  if (event.type === "plan.applied") return `${humanize(detail.plan.emotion.name)} · ${humanize(detail.plan.gesture.name)}`;
  if (event.type.startsWith("gesture")) return humanize(detail.name ?? "gesture");
  if (event.type === "state.changed") return stateLabel(detail.conversation);
  if (event.type === "emotion.changed") return `${humanize(detail.name)} · ${Math.round(detail.intensity * 100)}%`;
  if (event.type === "gaze.changed") return humanize(detail.target);
  if (event.type === "performance.interrupted") return `Canceled ${humanize(detail.canceledGesture)}`;
  return humanize(event.type.split(".").at(-1));
}

function addTrace(event) {
  timeline.querySelector(".empty-trace")?.remove();
  const marker = document.createElement("i");
  const channel = channelFor(event.type);
  marker.className = `timeline-event ${channel}`;
  marker.title = `${event.at} ms · ${event.type}`;
  timeline.append(marker);
  const markers = [...timeline.querySelectorAll(".timeline-event")];
  if (markers.length > 18) markers.shift().remove();
  [...timeline.querySelectorAll(".timeline-event")].forEach((node, index, all) => node.style.left = `${5 + index / Math.max(1, all.length - 1) * 90}%`);

  const item = document.createElement("li");
  if (channel === "interrupt") item.className = "event-interrupt";
  item.innerHTML = `<time>${Math.max(0, Math.round(event.at - startedAt))} ms</time><div><strong>${event.type}</strong><span>${describeEvent(event)}</span></div>`;
  eventLog.prepend(item);
  if (eventLog.children.length > 30) eventLog.lastElementChild.remove();
  $("#event-count").textContent = engine.events.length;
  lastEventAt = event.at;
  $("#active-channel").textContent = channel;
}

function setVoiceStatus(label, tone = "ready") {
  $("#voice-state").textContent = label;
  microphoneButton.classList.toggle("listening", label === "Listening");
  microphoneButton.querySelector("strong").textContent = label === "Listening" ? "Listening now" : "Start listening";
  $("#stage").classList.toggle("voice-active", tone === "live");
  if (label === "Ready") finishProgress();
}

function finishProgress() {
  if (playback?.frame) cancelAnimationFrame(playback.frame);
  playback = null;
  $("#plan-progress").style.width = "0";
  $("#plan-progressbar").setAttribute("aria-valuenow", "0");
  setTimeout(() => { if (engine.state.conversation !== "speaking") speechCard.hidden = true; }, 350);
}

function startProgress(text, holdMs = 0) {
  finishProgress();
  const duration = Math.max(holdMs, text.length * 58, 1600);
  playback = { startedAt: performance.now(), duration, frame: 0 };
  const animate = now => {
    if (!playback) return;
    const progress = Math.min(1, (now - playback.startedAt) / playback.duration);
    $("#plan-progress").style.width = `${progress * 100}%`;
    $("#plan-progressbar").setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    if (progress < 1) playback.frame = requestAnimationFrame(animate);
  };
  playback.frame = requestAnimationFrame(animate);
}

engine.subscribe((state, event) => {
  renderer.render(state);
  $("#state-badge").innerHTML = `<i></i> ${stateLabel(state.conversation)}`;
  $("#performance-summary").textContent = `${stateLabel(state.conversation)} · ${state.emotion} · focused ${state.gaze === "user" ? "on you" : state.gaze}`;
  $("#viseme-readout").textContent = state.viseme.toUpperCase();
  $("#live-status").textContent = $("#performance-summary").textContent;
  speechText.textContent = state.speech;
  if (state.speech && state.conversation === "speaking") speechCard.hidden = false;
  updateButtons(state);
  if (event && event.type !== "micro.blink") addTrace(event);
});

const speech = new BrowserSpeechSession({
  engine,
  onTranscript: (text, final) => {
    $("#live-transcript").textContent = text || "Listening…";
    if (final) utteranceInput.value = text;
  },
  onStatus: setVoiceStatus,
  onReply: reply => { utteranceInput.value = reply; $("#live-transcript").textContent = reply; startProgress(reply); }
});

function populateVoices() {
  const voices = speech.loadVoices();
  const select = $("#voice-select");
  select.replaceChildren();
  if (!voices.length) select.add(new Option("Default system voice", ""));
  voices.forEach(voice => select.add(new Option(`${voice.name} · ${voice.lang}`, voice.name, false, voice === speech.voice)));
}

function updateSpeechAvailability() {
  const label = speech.canListen ? "Mic + system voice" : speech.canSpeak ? "System voice only" : "Voice unavailable";
  const element = $("#speech-availability");
  element.innerHTML = `<i></i> ${label}`;
  element.className = `availability ${speech.canSpeak ? "available" : "unavailable"}`;
  microphoneButton.disabled = !speech.canListen;
  if (!speech.canListen) microphoneButton.querySelector("small").textContent = "Use Chrome or Safari with speech recognition";
}

function clearFallbackSpeech() { fallbackTimers.forEach(clearTimeout); fallbackTimers = []; }
function runFallbackSpeech(text, plan) {
  clearFallbackSpeech();
  engine.applyPlan({ ...plan, speech: text, state: "speaking" });
  const words = text.match(/[\w']+/g) ?? [];
  let cursor = 0;
  words.forEach(word => {
    const visemes = wordToVisemes(word);
    visemes.forEach(viseme => { fallbackTimers.push(setTimeout(() => engine.setViseme(viseme, .8), cursor)); cursor += 90; });
    cursor += 75;
  });
  fallbackTimers.push(setTimeout(() => { engine.setViseme("rest", 0); engine.setConversation("idle"); setVoiceStatus("Ready"); }, cursor + 120));
}

function performLine(text, plan = null) {
  const line = text.trim();
  if (!line) return;
  const actingPlan = plan ?? { speech: line, state: "speaking", emotion: { name: "happy", intensity: .45 }, gaze: { target: "user", intensity: .9 }, energy: .48, holdMs: Math.max(1800, line.length * 55) };
  $("#live-transcript").textContent = line;
  speechText.textContent = line;
  speechCard.hidden = false;
  startProgress(line, actingPlan.holdMs);
  if (speech.canSpeak) speech.speak(line, actingPlan); else runFallbackSpeech(line, actingPlan);
}

function interrupt() {
  clearFallbackSpeech();
  finishProgress();
  speech.stop();
  speechCard.hidden = true;
  setVoiceStatus("Interrupted", "error");
  setTimeout(() => { if (engine.state.conversation === "listening") setVoiceStatus("Ready"); }, 900);
}

function cancelTour() { tourTimers.forEach(clearTimeout); tourTimers = []; }

microphoneButton.addEventListener("click", () => { cancelTour(); speech.listening ? speech.recognition.stop() : speech.startListening(); });
$("#voice-select").addEventListener("change", event => speech.setVoice(event.target.value));
$("#speak-button").addEventListener("click", () => { cancelTour(); performLine(utteranceInput.value); });
$("#stop-voice-button").addEventListener("click", () => { cancelTour(); interrupt(); });
$("#state-controls").addEventListener("click", event => { const state = event.target.dataset.state; if (state) { cancelTour(); state === "interrupted" ? interrupt() : engine.setConversation(state); } });
$("#emotion-controls").addEventListener("click", event => { const name = event.target.dataset.emotion; if (name) { cancelTour(); engine.setEmotion(name, Number($("#emotion-slider").value) / 100); } });
$("#gaze-controls").addEventListener("click", event => { const target = event.target.dataset.gaze; if (target) { cancelTour(); engine.setGaze(target); } });
$("#gesture-controls").addEventListener("click", event => { const name = event.target.dataset.gesture; if (name) { cancelTour(); engine.startGesture({ name, intensity: .72 }); } });
$("#body-controls").addEventListener("click", event => { const name = event.target.dataset.gesture; if (name) { cancelTour(); engine.startGesture({ name, intensity: .9 }); } });
$("#camera-controls").addEventListener("click", event => { const name = event.target.dataset.camera; if (name) { renderer.setCameraPreset(name); $$("#camera-controls button").forEach(button => button.classList.toggle("active", button === event.target)); } });
$("#emotion-slider").addEventListener("input", event => { cancelTour(); $("#emotion-output").textContent = `${event.target.value}%`; engine.setEmotion(engine.state.emotion, Number(event.target.value) / 100); });
$("#energy-slider").addEventListener("input", event => { cancelTour(); $("#energy-output").textContent = `${event.target.value}%`; engine.setEnergy(Number(event.target.value) / 100); });
planSelect.addEventListener("change", () => { cancelTour(); setPlanEditor(); });
$("#play-button").addEventListener("click", () => { try { cancelTour(); const plan = selectedPlan(); performLine(plan.speech, plan); $("#plan-error").textContent = ""; } catch (error) { $("#plan-error").textContent = error.message; } });
$("#interrupt-button").addEventListener("click", () => { cancelTour(); interrupt(); });
$("#apply-json-button").addEventListener("click", () => { try { const plan = selectedPlan(); planEditor.value = JSON.stringify(plan, null, 2); $("#plan-error").textContent = "Valid semantic plan."; } catch (error) { $("#plan-error").textContent = error.message; } });
$("#clear-button").addEventListener("click", () => { engine.clearEvents(); lastEventAt = performance.now(); timeline.innerHTML = '<div class="empty-trace"><strong>Trace cleared</strong><span>The performance engine is still running.</span></div>'; eventLog.replaceChildren(); $("#event-count").textContent = "0"; $("#active-channel").textContent = "baseline"; });
$("#reset-button").addEventListener("click", () => { cancelTour(); clearFallbackSpeech(); window.speechSynthesis?.cancel(); finishProgress(); renderer.reset(); $$("#camera-controls button").forEach(button => button.classList.toggle("active", button.dataset.camera === "full")); engine.reset(); setPlanEditor(); setVoiceStatus("Ready"); $("#live-transcript").textContent = "Press the microphone and speak naturally."; });
$("#export-button").addEventListener("click", () => {
  const data = JSON.stringify({ exportedAt: new Date().toISOString(), vocabularyVersion: 2, actor: "Mira", events: engine.events }, null, 2);
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([data], { type: "application/json" })), download: "mira-live-performance-trace.json" });
  link.click(); URL.revokeObjectURL(link.href);
});

$("#tour-button").addEventListener("click", () => {
  cancelTour(); clearFallbackSpeech(); window.speechSynthesis?.cancel(); engine.reset();
  engine.setConversation("listening"); setVoiceStatus("Listening", "live"); $("#live-transcript").textContent = "Can an AI character feel present before it says anything?";
  tourTimers = [
    setTimeout(() => { engine.setConversation("thinking"); setVoiceStatus("Thinking", "working"); }, 1200),
    setTimeout(() => performLine(scenarios.warm.speech, scenarios.warm), 2200),
    setTimeout(() => { engine.startGesture({ name: "nod", intensity: .78 }); }, 4300),
    setTimeout(() => { interrupt(); }, 5900),
    setTimeout(() => { const plan = scenarios.skeptical; performLine(plan.speech, plan); tourTimers = []; }, 7100)
  ];
});

document.addEventListener("keydown", event => {
  const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (event.key === "Escape" && !editing) { cancelTour(); interrupt(); }
  if (event.code === "Space" && document.activeElement === $(".stage-panel")) { event.preventDefault(); cancelTour(); interrupt(); }
});

function renderLoop(now) {
  engine.tick(now);
  const delta = now - lastFrame;
  lastFrame = now;
  if (delta > 0) frameSamples.push(1000 / delta);
  if (frameSamples.length > 45) frameSamples.shift();
  if (now >= nextMetricUpdate) {
    if (frameSamples.length) $("#fps").textContent = `${Math.round(frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length)} FPS`;
    $("#last-command").textContent = `${Math.max(0, Math.round(now - lastEventAt))} ms`;
    nextMetricUpdate = now + 250;
  }
  requestAnimationFrame(renderLoop);
}

setPlanEditor();
updateSpeechAvailability();
populateVoices();
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;
requestAnimationFrame(renderLoop);
