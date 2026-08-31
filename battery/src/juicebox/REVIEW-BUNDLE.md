# REVIEW-BUNDLE — JUICE BOX (battery B1)

Factual launch + instrumentation only. Loop contract (with its amendment
history) is LOOP-CONTRACT.md in this directory. No evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/juicebox.html
```

Click or press any direction to start (first input also unlocks audio —
stems render ~10s; console logs "[juicebox] audio unlocked"). WASD/arrows
tap = dash; click = dash toward cursor. 60 seconds. [ / ] changes the seed
on the title screen; the default seed is today's date (the daily).

## Instrumentation (in page)

- `__feelCheck()` — runtime event-consumer lint.
- `__latencyCheck()` — real key event → position response in ticks.
- `__playCheck(seconds)` — spirit visibility through the fixed play camera.
- `__shot(name)` — canvas capture to .shots/ (HUD is DOM and not in canvas
  captures; judge HUD from live play).
- `__game` — { run, startRun, feel, music, seedSet }.

## Gates and recorded state

```
node scripts/check-juicebox.mjs --detail   # designed curve: ALL PASS
node scripts/check-juicebox-feel.mjs       # 9 events / 9 consumers: PASS
```
In-page recorded: latency 1 frame; playCheck visibleFrac 1.0.

## Contract amendment history (all pre-review, logged for the record)

1. Score window recalibrated after gold spirits were added.
2. Population band 1..7 → 1..8.
3. Skill-headroom metric changed twice, with reasoning recorded in
   TRAPS.md (nightbloom/TRAPS.md): bot-vs-bot → oracle-vs-reactive →
   actuation-noise profiles (expert 120ms/4° vs novice 340ms/16°, 1.78×
   measured). Combo target 8 → 5 after the lines-build scoring change.
