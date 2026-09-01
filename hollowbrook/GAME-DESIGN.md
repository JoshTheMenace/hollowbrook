# HOLLOWBROOK — design, one page

> Read `LOOP-CONTRACT.md` for every number; this page is why. Anything the
> contract marks NOT BUILT is intent, not state.

**The promise.** You are the last warden of Hollowbrook, the walled market
town four miles down the road from Thistledown, on the evening the Ashen
Company comes for it. Six waves come through two gates between dusk and full
dark. Hold the streets, get the townsfolk behind doors, and ring the keep's
bell at dawn. First person, one town, no loading.

**Core verbs.** Two, one fast and one slow:
- **the repeating crossbow** — hitscan, six bolts then a reload. It is the
  verb you are using 80 % of the time, so it resolves *instantly* (a bolt
  over the ranges this town offers is airborne under 0.4 s anyway) and the
  bolt you see flying is cosmetic, drawn to the point already hit. Aim is
  the whole skill: no cone, no falloff.
- **the emberlance** — hold to charge 0.9 s, release a slow piercing shot.
  A real projectile at 22 m/s, because its skill is *leading* and *lining
  up a lane*: it pierces four bodies, and shields do not stop it. Charging
  slows you to a walk, so every lance is a positional bet.

Movement (sprint, stairs, the wall-walk, the market rim, the keep mound) is
the third verb and the scene pipeline's enterable buildings and terrain
shelves are what make it real.

**The loop.** wave → breather → objective → wave, six times:
1. *The first rush* (south gate, the gate square) → escort the runner Mika to
   the guild hall.
2. *The market* (south gate, the sunken square) → raise three barricades on
   the row with the smith.
3. *The row* (east gate breached, the lanes) → relight four wall braziers.
4. *The captain's probe* (both gates; the Captain appears, retreats at half
   health) → escort the Reeve up to the Warden's Hall.
5. *The storm* (both gates, the whole town) → (no breather beat: dusk is gone)
6. *Last light* (the keep) → the Captain returns; kill him, ring the bell.

Waves are 2–4 minutes, breathers 90–120 s, about **24–27 minutes** to the
bell. Every NPC has a post and a shelter (an enterable building) and walks
the real nav grid between them when a wave sounds.

**Stakes.** You die → the wave restarts from its checkpoint and the town loses
one of its **three lights** (a building's windows go dark for good). Three
lights gone = Hollowbrook falls. Objectives done in breathers are never lost.
The run is saved at every wave start through the shell's real save path.

**The decision per minute.** *Where to stand for the next thirty seconds*:
high ground (wall-walk, market rim, keep) buys sight lines and costs escape
routes; lanes buy funnels and cost flanks; every hexer is a "go now or lose
20 HP" prompt; every lance is "walk for a second to line up four".

**Win / lose.** Win: the Captain dies in wave 6 and the bell is rung (a 3 s
channel). Lose: three lights gone. No RNG resolves any player-facing choice:
spawn *timing* and *composition* per wave are authored tables; only cosmetic
spawn scatter inside a declared ring is seeded.

**Skill axis: EXECUTION + POSITIONING (hybrid, execution primary).** Referee:
the same policy bot under actuation-noise profiles — novice 340 ms / ±16°,
expert 120 ms / ±4° — in the headless siege sim. Novice must be able to win;
expert must win comfortably; a bot that only aims and never moves must lose by
wave 3, so position is provably load-bearing. Full thresholds in the contract.

**The feel ladder** (loudest last; magnitudes and the monotonicity gate in
the contract): bolt fired < bolt missed ≤ bolt hit < lance fired < cutpurse
killed < hurt < hexer killed < reaver killed < shieldbearer killed <
lance multi-kill < wave cleared < Captain killed < the bell. A whiff never
outranks a hit; being hit never outranks a real kill.

**Music.** One soundforge adaptive loop, minor, war drums in three tiers. The
game moves one number, driven by threat pressure with a written intent point
per wave: breather 0.22 → 0.50 / 0.58 / 0.68 / 0.80 (0.90 with the Captain)
/ 0.88 / 1.00 → dawn 0.30.

**NPC roles (all from the character pipeline; no painted people anywhere).**
Reeve (elder, guild hall — objectives, Performer), Mika the runner (escort,
Performer), the militia bowman (archer, south wall-walk, fires on the rush),
the smith (brute, barricades), the Millstone Warden (golem, guards the mill
yard), the hedge-wizard (mage, the ward stone), the vixen (fox, ambient,
flees to the yew close). Performer for the six humanoid rigs; Actor clips +
gaze for the fox.

**Enemy roster — clip-set reality.** Only characters with idle/walk/run/
attack/hit/death can die on screen. That is the four KayKit adventurers
(each ships Idle, Walking, Running, Hit_A/B, Death_A/B, Block, Dodge and a
dozen attacks) and the procedural ronin. So the Ashen Company is: **cutpurse**
(Rogue), **reaver** (Barbarian), **shieldbearer** (Knight), **hexer** (Mage)
and the **Captain** (ronin, elite, two appearances). Variety inside a kind is
seeded scale (0.94–1.08), seeded cloth tint through the cel bridge, and the
KayKit loadout picker. Brute/archer/mage/golem have no hit/death clips and are
therefore allies, never enemies. KayKit textures do not survive `celify`
(it keeps colour, not maps); the game agent bakes the atlas into vertex
colours first — see `KIT-GAPS.md`, "characters".

**Explicitly NOT built.** Melee/kick, a third weapon, ammo economy, upgrades
or a draft, a day phase, multiple towns, difficulty settings, gamepad,
mobile tier, headshots, friendly fire, enemy ranged types beyond the hexer,
a portcullis you can drop *during* a wave (kit gap, later), enemies on the
roofs, destructible buildings beyond the "lights" fiction.
