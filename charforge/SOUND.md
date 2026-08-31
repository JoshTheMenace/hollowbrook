# SOUND.md — the SoundForge authoring contract

SoundForge is the audio pipeline: pure-JS sample-level DSP (no WebAudio), so
the identical code renders headlessly in Node for gates/evidence and can back
the game at runtime. Music and SFX are **data specs**, the way characters are
geometry specs — authored, gated, evidenced, repaired.

```
src/soundforge/
  dsp.js        oscillators (polyBLEP), envelopes, biquads, fx rack
                (delay/reverb/chorus/drive/compress/limit/widen/duck), buses
  synth.js      instrument spec -> voice renderer; parametric drum generators
  theory.js     scales/modes, roman-numeral harmony, voice leading, MOTIFS
  compose.js    song spec -> arrangement -> stems -> mixed master
  sfx.js        layered one-shot SFX (sweep/noise/impact/metal/crackle/chirp)
  features.js   LUFS (BS.1770), spectral bands, chroma similarity, onsets
  wav.js fft.js content/ (instruments.js, track-*.js, sfx-core.js)
scripts/
  sound-render.mjs   evidence: WAV + spectrogram + waveform + report.json
  check-audio.mjs    the gates (run before showing anyone anything)
  sound-lib.mjs      PNG/spectrogram encoders (Node-side)
```

## The quality loop
1. Author/edit content specs (never the engine, unless a capability is missing).
2. `node scripts/check-audio.mjs` — all gates must pass.
3. `node scripts/sound-render.mjs track|sfx` — regenerate evidence.
4. READ the spectrogram like a screenshot: melody contour should be visible
   and *varying*; sections should look different; no spectral holes; tails fade.
5. The user's ear is the final evaluator — ship WAVs, collect verdicts, fold
   them back into this contract as new gates or rules.

## Writing music
- A song is `{bpm, key, mode, seed, swing, instruments, sections[]}` — see
  `content/track-nightbloom.js` as the worked example.
- **Melody = one motif + a development plan** (`statement/echo/answer/lift/
  busy/sparse/mirror/cadence` per bar). Never author a literal note loop; the
  `not-a-loop` gate measures verbatim bar repetition and fails >10%.
- **Arrangement = parts entering/leaving across sections.** Intensity is a
  declaration the gates audit against measured onset density — don't label a
  section 0.8 and score it like a lullaby.
- Chords are roman numerals; voicings are voice-led automatically. Change 2+
  chords or the energy between adjacent sections (`sections-differ` gate).
- Sections bookending (intro ≈ outro) is good form; adjacency is what's gated.
- **Register matters**: melodies below ~A3 sit in lowmid mud. Lead lines live
  at octave 1-2 above the scale root octave (the presence bands are gated).
- Seed everything (`seed`); renders must be reproducible to be diffable.

## Writing instruments (synth.js specs)
- Role names (warmPad, subBass), not waveform names.
- Unison + detune for width, but width survives only because voices keep
  **stereo through the filter** — see trap #1 below.
- Every patch gets an fx chain; dry synths read as toys. Pads breathe (slow
  attack + chorus + big reverb), leads cut (filter env + vibrato + delay).

## Writing SFX (sfx.js specs)
- **Every sound is layers**: transient (click/crack) + body (sweep/impact) +
  tail (metal/crackle/reverb). One-generator sounds are prototypes, not sfx.
- Declare a `class` (`ui/pickup/combat/heavy/foley/voice`); gates enforce the
  class's centroid range, duration cap, and level window.
- **Interactive sounds front-load**: ui/combat/foley must peak within 90ms
  (gated). Player feedback that blooms late feels laggy.
- UI sounds are dry — room tails on clicks read as sluggish menus.

## Gates (check-audio.mjs) — what "good" means, in numbers
Track: LUFS -16.5..-11.5 · peak ≤ -1dBFS · verbatim-bar repetition <10% ·
adjacent sections distinguishable (harmony or ≥8% energy delta) · onset-density
arc ≥1.8x floor-to-peak · declared intensity vs measured energy ≥70% ordering
agreement · six spectral bands inside calibrated windows · stereo width ≥0.15
with positive correlation · ≥4 sections, 90-300s.
SFX: class centroid/duration windows · peak -26..-0.5dBFS · 90ms front-load
for interactive classes.

## Calibrated traps (paid for once already)
1. **Mono-collapse**: running summed voices through ONE filter erased all
   unison width (mix measured 0.047 wide). Voices filter per-channel now; if
   width drops, look for any mono summing point first.
2. **Register/presence**: the first render buried the melody at A3 — bands
   `mid`/`high` read -13/-16dB. Fix was octave, not EQ. Check register before
   reaching for shelves.
3. **Centroid of band-passed white noise sits far above the filter center**
   (2nd-order slopes leak highs). Whooshes/darker noises: start from pink.
4. **Spectrogram dB must be normalized to the track's own peak bin** — the
   raw-magnitude version painted everything saturated and hid all structure.
5. **Chroma similarity measures harmony, not arrangement.** Two sections with
   the same progression look ~0.99 similar even with different instruments.
   That's why `sections-differ` also compares onset density — keep both.
6. A `setInterval` sequencer outlives its scene — playback must be owned by
   the scene lifecycle, and "audio continues after exit" is a defect class.

## Runtime (built, verified)
`runtime.js`: `AdaptiveMusic` + `SfxPlayer`. The game touches two things:
`music.setIntensity(0..1)` (whole mix follows) and `sfx.play(name)`.
- Music is an N-bar seamless loop (`composeAdaptiveLoop` + a loop spec like
  `content/loop-nightbloom.js`) rendered as TIER STEMS over one timeline;
  every stem loops phase-locked and tiers crossfade by intensity window.
- **Loop baking**: stems render 2.5s past the loop and the overflow is folded
  onto the start, so reverb/release tails wrap seamlessly. Related trap: the
  voice renderer must CLAMP tails at the buffer end, never skip the note.
- `windowGain` edge rule: a window touching 0 or 1 is full there (no fade off
  the end of the scale) — otherwise intensity 0 and 1 go silent.
- SFX playback: pre-rendered buffers + per-shot detune/level variation +
  30ms retrigger guard. Everything dies with `dispose()` (scene-owned).
- Loop gates in check-audio.mjs: stem alignment, seam-click (relative to the
  stem's own max transient — a downbeat at the wrap is music, not a click),
  intensity coverage, energy-climbs. Runtime proof: `sound-lab.html` →
  `__soundCheck()` renders the graph offline and asserts audible + scaling.
The old `src/engine/audio.js` toy synth/sequencer is DEPRECATED.
