const groups = [
  [/[mbp]/i, "M"], [/[fv]/i, "F"], [/[o]/i, "O"], [/[uwq]/i, "U"],
  [/[eiy]/i, "E"], [/[a]/i, "A"], [/[lrn]/i, "L"], [/[sztdcjxkg]/i, "S"]
];

export function wordToVisemes(word) {
  const visemes = [...word].filter(char => /[a-z]/i.test(char)).map(char => groups.find(([pattern]) => pattern.test(char))?.[1] ?? "A");
  return visemes.filter((viseme, index) => viseme !== visemes[index - 1]);
}

export function replyForTranscript(transcript) {
  const text = transcript.trim();
  if (!text) return "I didn't catch that. Try speaking once more.";
  if (/\b(hello|hi|hey)\b/i.test(text)) return "Hi. I'm Mira. I'm listening, and my performance is being driven live by your words.";
  if (/\b(animation|anime|character)\b/i.test(text)) return "The interesting part is that my voice, expression, gaze, and mouth are separate channels. They can stay synchronized without generating every frame.";
  if (/\b(how|why|what)\b/i.test(text)) return `That's a good question. I heard: ${text}. The next step is connecting this performance layer to a real conversational model.`;
  return `I heard you say: ${text}. The transcription is live, and this reply is using your system voice with timed mouth shapes.`;
}

export class VisemeDriver {
  constructor(engine) {
    this.engine = engine;
    this.timers = [];
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.engine.setViseme("rest", 0, performance.now());
  }

  playWord(word, durationMs = 420) {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const sequence = wordToVisemes(word);
    if (!sequence.length) return this.engine.setViseme("rest", 0, performance.now());
    const step = Math.max(65, Math.min(125, durationMs / sequence.length));
    sequence.forEach((viseme, index) => this.timers.push(setTimeout(() => this.engine.setViseme(viseme, .72 + (index % 2) * .16, performance.now()), index * step)));
    this.timers.push(setTimeout(() => this.engine.setViseme("rest", 0, performance.now()), sequence.length * step));
  }

  playText(text, rate = 1) {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    let cursor = 0;
    for (const word of text.match(/[\w']+/g) ?? []) {
      for (const viseme of wordToVisemes(word)) {
        this.timers.push(setTimeout(() => this.engine.setViseme(viseme, .78, performance.now()), cursor));
        cursor += 82 / rate;
      }
      cursor += 70 / rate;
    }
    this.timers.push(setTimeout(() => this.engine.setViseme("rest", 0, performance.now()), cursor));
  }
}

export class BrowserSpeechSession {
  constructor({ engine, onTranscript, onStatus, onReply }) {
    this.engine = engine;
    this.onTranscript = onTranscript;
    this.onStatus = onStatus;
    this.onReply = onReply;
    this.visemes = new VisemeDriver(engine);
    this.recognition = null;
    this.listening = false;
    this.pendingReplyTimer = null;
    this.speechGeneration = 0;
    this.voices = [];
    this.voice = null;
    this.prepareRecognition();
  }

  get canListen() { return Boolean(this.recognition); }
  get canSpeak() { return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window; }

  prepareRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    this.recognition = new Recognition();
    Object.assign(this.recognition, { continuous: false, interimResults: true, lang: "en-US" });
    this.recognition.onstart = () => { this.listening = true; this.engine.setConversation("listening"); this.onStatus("Listening", "live"); };
    this.recognition.onresult = event => {
      let transcript = "";
      let final = false;
      for (let index = event.resultIndex; index < event.results.length; index++) {
        transcript += event.results[index][0].transcript;
        final ||= event.results[index].isFinal;
      }
      this.onTranscript(transcript.trim(), final);
      if (final) {
        this.engine.setConversation("thinking");
        this.onStatus("Thinking", "working");
        const reply = replyForTranscript(transcript);
        this.onReply(reply);
        clearTimeout(this.pendingReplyTimer);
        this.pendingReplyTimer = setTimeout(() => this.speak(reply), 420);
      }
    };
    this.recognition.onerror = event => { this.listening = false; this.engine.setConversation("idle"); this.onStatus(event.error === "not-allowed" ? "Microphone permission needed" : `Speech error: ${event.error}`, "error"); };
    this.recognition.onend = () => { this.listening = false; if (this.engine.state.conversation === "listening") this.engine.setConversation("idle"); };
  }

  loadVoices() {
    if (!this.canSpeak) return [];
    this.voices = speechSynthesis.getVoices().filter(voice => /^en[-_]/i.test(voice.lang));
    const preferred = ["Ava", "Samantha", "Zoe", "Serena", "Victoria"];
    this.voice = preferred.map(name => this.voices.find(voice => voice.name.includes(name))).find(Boolean) ?? this.voices.find(voice => voice.default) ?? this.voices[0];
    return this.voices;
  }

  setVoice(name) { this.voice = this.voices.find(voice => voice.name === name) ?? this.voice; }

  startListening() {
    if (!this.recognition) return this.onStatus("Live transcription is unavailable in this browser", "error");
    clearTimeout(this.pendingReplyTimer);
    this.speechGeneration++;
    window.speechSynthesis?.cancel();
    this.visemes.stop();
    try { this.recognition.start(); } catch { this.recognition.stop(); }
  }

  stop() {
    if (this.listening) this.recognition?.stop();
    clearTimeout(this.pendingReplyTimer);
    this.pendingReplyTimer = null;
    this.speechGeneration++;
    window.speechSynthesis?.cancel();
    this.visemes.stop();
    this.engine.interrupt(performance.now());
  }

  speak(text, actingPlan = null) {
    if (!this.canSpeak || !text.trim()) return this.onStatus("System speech is unavailable", "error");
    const generation = ++this.speechGeneration;
    speechSynthesis.cancel();
    this.visemes.stop();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    if (this.voice) utterance.voice = this.voice;
    Object.assign(utterance, { rate: .94, pitch: 1.04, volume: 1 });
    utterance.onstart = () => {
      if (generation !== this.speechGeneration) return;
      const plan = actingPlan ? { ...actingPlan, speech: text, state: "speaking" } : { speech: text, state: "speaking", emotion: { name: "happy", intensity: .42 }, gaze: { target: "user", intensity: .9 }, energy: .48, holdMs: Math.max(1800, text.length * 55) };
      this.engine.applyPlan(plan);
      this.visemes.playText(text, utterance.rate);
      this.onStatus("Speaking", "live");
    };
    utterance.onboundary = event => {
      if (generation !== this.speechGeneration) return;
      if (event.name && event.name !== "word") return;
      const word = text.slice(event.charIndex).match(/^[\w']+/)?.[0] ?? text.slice(event.charIndex).split(/\s/)[0];
      this.visemes.playWord(word, Math.max(180, word.length * 72 / utterance.rate));
    };
    utterance.onend = () => { if (generation !== this.speechGeneration) return; this.visemes.stop(); this.engine.setConversation("idle"); this.onStatus("Ready", "ready"); };
    utterance.onerror = event => { if (generation !== this.speechGeneration) return; this.visemes.stop(); this.engine.setConversation("idle"); this.onStatus(`Voice error: ${event.error}`, "error"); };
    speechSynthesis.speak(utterance);
  }
}
