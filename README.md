# Mira Live

Mira Live is a proof of concept for a voice-driven, fully rigged anime character. It combines a VRM humanoid skeleton, procedural full-body motion, facial blendshapes, browser speech recognition, installed system voices, and word-timed articulation.

## Run it

Use a recent Node.js release:

```sh
npm install
npm start
```

Open `http://127.0.0.1:4173`. Chrome and Safari provide the broadest Web Speech support. The browser will request microphone permission when live transcription starts.

Run the deterministic tests with:

```sh
npm test
```

## Voice pipeline

```text
microphone
    ↓
browser speech recognition
    ↓ interim + final transcript
response planner
    ↓
installed system voice
    ↓ word boundaries + timed fallback
viseme driver
    ↓
VRM facial blendshapes
```

The voice picker prefers installed English voices such as Ava, Samantha, Zoe, Serena, or Victoria. Exact voice availability depends on the operating system and browser.

Speech synthesis boundary events keep the mouth aligned to spoken words. Some browser/voice combinations omit boundary events, so the same utterance also starts a deterministic text-to-viseme timeline. A boundary event replaces that fallback for the active word when it is available.

## Architecture

- `src/contract.js` defines and validates the semantic animation vocabulary.
- `src/engine.js` owns state, interruption, cooldowns, gaze expiry, breathing, blinking, and emotion decay.
- `src/speech.js` owns transcription, native speech synthesis, reply selection, and text-to-viseme mapping.
- `src/vrm-renderer.js` loads the model and drives its humanoid bones, locomotion, facial expressions, gaze, and camera.
- `src/app.js` connects voice, manual controls, acting plans, telemetry, and trace export.
- `models/mira.vrm` is the project-local full-body model. Any compatible VRM model can replace it without changing the controller.

## Browser behavior

- Live transcription uses `SpeechRecognition` or `webkitSpeechRecognition` when the browser exposes it.
- Spoken responses use `SpeechSynthesisUtterance` and an installed system voice.
- Walk, back, strafe, turn, jump, dance, wave, point, bow, gaze, expression, and speech all resolve through the same actor state.
- Full-body, medium, and portrait camera presets coexist with manual orbit and zoom.
- If speech synthesis is unavailable, a silent timed performance still exercises the same facial and interruption paths.
- Escape or the Stop button cancels speech, mouth motion, queued gestures, and pending automatic replies.
- Reduced-motion preferences disable decorative breathing movement while preserving readable state changes and mouth articulation.

## Deliberate boundary

The conversational reply is currently deterministic so the voice and animation loop remains runnable without an API key. Replacing `replyForTranscript()` with a streaming conversational model does not require changes to the speech, behavior, or renderer contracts.

The bundled character is a redistributable VRoid sample. For a production identity, replace it with a custom VRoid/Blender-authored VRM containing the same humanoid bone map, vowel blendshapes, expressions, and spring bones. A single image cannot provide occluded geometry, a back side, joints, clothing topology, or animation weights, so image-to-mesh reconstruction is not used as the runtime foundation.
