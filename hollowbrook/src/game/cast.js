/* ------------------------------------------------------------------ *
 * CAST — the NPC layer.  A VIEW over `run.npcs`, in the same sense
 * enemies.js is a view over `run.enemies`: it reads the records every
 * frame and never writes one.  The rules decide where an NPC is, which
 * way it faces, whether it is walking, running, sheltering, fleeing or
 * talking; this file decides what that LOOKS like — which clip, at what
 * playback rate, with which gesture on top and where the eyes go.
 *
 * WHAT DRIVES A BODY, AND IN WHICH ORDER.  Three things write joints and
 * they must not fight:
 *
 *   1. the sim   — `root.position` / `root.rotation.y`, copied from the
 *                  record.  The Actor integrates its OWN velocity, so
 *                  `actor.velocity` is zeroed every frame and
 *                  `actor.move()` is never called: the nav grid already
 *                  moved this body and a second integrator would fight it.
 *   2. the mixer — `actor.update(dt)`, an idle/walk/talk/attack clip.
 *   3. the actor — `performer.update(dt)`, AFTER the mixer, adding gesture
 *                  and gaze offsets on top of whatever the clip wrote.
 *
 * That order is the contract (charforge/performer.js): the Performer resets
 * every joint the running clips do NOT drive back to the rest pose it
 * captured at construction, then recomputes every offset from its envelope.
 * It is stateless per frame — nothing integrates — which is why the
 * Performer must be constructed BEFORE the actor's first update (it would
 * otherwise capture a mid-clip pose as "rest").
 *
 * BLEND-OUT ON A NEW LINE.  The errand review r2 found a 126° single-frame
 * arm snap when a line advanced mid-envelope, because `direct()` reset the
 * envelope's start time under a gesture that was still at full extension.
 * charforge's Performer carries the fix natively now: `direct()` keeps the
 * outgoing gesture running at a falling weight for BLEND = 0.15 s while the
 * new one rises, and both are pure functions of time, so statelessness
 * holds.  This file therefore does NOT re-implement a blend — a second
 * intensity ramp on top of it would double-fade the new gesture and buy
 * nothing.  What it does instead is PROVE it: `soakCast` advances lines
 * deliberately mid-envelope and asserts the worst single-frame joint delta
 * across the whole soak (see the table it prints).
 *
 * GAZE DURING A BOW is damped the same way, and for the same reason it is
 * not damped HERE: `_apply` returns `1 - plateau(p)` for a bow, so the gaze
 * weight falls off and comes back over the bow's own envelope.  Calling
 * `lookAt(null)` from this file the instant a bow starts would drop up to
 * 0.52 rad of head yaw in ONE frame — the exact defect the blend exists to
 * prevent, reintroduced by the fix for a different one.
 *
 * ------------------------------------------------------------------ *
 * TWO CORRECTIONS APPLIED HERE, both for defects in charforge, which is
 * read-only from this project.  Both were found by soakCast, neither
 * throws, and neither shows in a single frame.
 *
 * (1) A CLIP-DRIVEN JOINT IS NOT WRITTEN EVERY FRAME, so "the mixer
 *     rewrites it absolutely" is false and the Performer's `+=` integrates.
 *     three's PropertyMixer.apply compares this frame's accumulator against
 *     last frame's and SKIPS `binding.setValue` when they are identical —
 *     so over any constant stretch of a track (a held key, a turning point,
 *     a clip whose head barely moves) the scene graph keeps whatever was
 *     written last, offsets and all.  The Performer's `_driven()` asks the
 *     clip, not the frame, so it declines to reset the joint and adds the
 *     offset again on top of its own previous output.
 *     MEASURED, on the Reeve, mid-nod: head.rotation.x stepped +0.44 rad
 *     PER FRAME from 0.394 at t=32.25 s to 6.303 at t=32.48 s — a head
 *     rotated 361° through its own shoulders, for a fifth of a second, and
 *     then quietly correct again the moment the clip's value moved.  The
 *     soak's end-state residue was 0.0007 rad: bounded-and-back-at-rest is
 *     exactly the check this walks past.
 *     THE FIX (`guardPose`): remember the quaternion we LEFT on each acting
 *     joint; next frame, after `actor.update`, if it is bit-identical the
 *     mixer skipped and we restore the last pose the mixer actually wrote.
 *     It applies ONLY to joints the Performer will treat as driven — on the
 *     rest it would defeat a reset that is correct (the archer's bow forearm
 *     has no track in `idle`, so the bind pose IS its idle pose, and holding
 *     the mixer's last value there froze the drawn bow arm permanently).
 *
 * (3) EVERY ONE-SHOT ENDS IN A ONE-FRAME POSE FLASH.  A LoopOnce clip with
 *     `clampWhenFinished` PAUSES when it ends, so `isRunning()` goes false
 *     while the mixer is still applying its clamped pose — and the
 *     Performer's `_driven()` asks `isRunning()`.  For the one frame between
 *     the clip pausing and the crossfade's target reaching a non-zero
 *     weight, NOTHING is driven, so every joint the Performer owns is slammed
 *     to the rest pose at once.  MEASURED on the bowman: forearmL jumped
 *     0.663 rad (38 deg) in a single frame at the end of every shot, i.e.
 *     four times a wave, on the arm holding the bow.
 *     THE FIX (`releasePose`): when a joint leaves the driven set, ease from
 *     the last pose the mixer wrote to whatever the acting wants over 0.12 s
 *     — Actor's own `attack->*` fade, which is the crossfade this was
 *     supposed to be riding.
 *
 * (2) EVERY SPINE GESTURE IS INVERTED.  performer.js's SHAPE table calls
 *     `spine.rotation.x` −1 "torso forward", and on a rig authored facing
 *     +Z it is not: −x about a joint whose local +Y runs up the spine tips
 *     the top of it toward −Z, i.e. BACKWARD.  MEASURED, on the elder: a
 *     `bow` moved the head 0.175 m in −Z and lifted its world-space gaze
 *     from −0.29 to +0.05 — a bow that leans away and tucks the chin.  The
 *     r2 review caught the head half of this and flipped the head sign; the
 *     spine half survived, and charforge's own shape gate passes it because
 *     the gate asserts against the same mistaken table.  It is not only the
 *     bow: `lean_in`, `lean_back` and both sustained postures share the
 *     axis, and script.js uses all of them.
 *     THE FIX (`flipSpine`): recompute the spine term from the Performer's
 *     own public envelope state — `current`, `prev`, `switchAt`, `time`,
 *     `posture` — and subtract twice what it applied, so the blend, the
 *     intensity scaling and the plateau shape are the Performer's own
 *     numbers and only the sign is this file's.
 * ------------------------------------------------------------------ */

/* charforge is a sibling checkout.  The browser reaches it through vite's
 * `@forge` alias; Node has no alias, so it takes the relative path.  Both
 * specifiers resolve to the SAME absolute file, so vite still bundles one
 * copy of each module.  In Node the two projects' `three` copies differ
 * (0.170 there, 0.180 here) — the only object that crosses the boundary is
 * the gaze target, which the Performer only ever reads `.x/.y/.z` off. */
const IN_NODE = typeof process !== 'undefined' && !!process.versions?.node;
const forge = {
  actor: () => (IN_NODE ? import('../../../charforge/src/game/actor.js') : import('@forge/game/actor.js')),
  performer: () => (IN_NODE ? import('../../../charforge/src/game/performer.js') : import('@forge/game/performer.js')),
  celify: () => (IN_NODE ? import('../../../charforge/src/lib/celify.js') : import('@forge/lib/celify.js')),
};

/* Clip-native locomotion speeds.  `timeScale = measured speed / native`
 * is the anti-foot-slide rule Actor.move() uses; we measure the record's
 * own displacement instead of trusting `record.speed`, because a walker
 * squeezed past a collider covers less ground than its nominal speed and
 * its feet must say so.  No ally rig here HAS a run clip (elder/mika ship
 * idle/walk/talk; archer/brute/mage/golem idle/walk/attack), so running
 * lands on `walk` at ~2.1x — inside the 2.2 clamp by design. */
const NATIVE = { walk: 1.1, run: 3.2 };
const TS_MIN = 0.5;
const TS_MAX = 2.2;

const GAZE_RANGE = 5;          // m — look at the player inside this, or while talking
/* The gaze is a smoothed DIRECTION, not a switch.  `performer.lookAt(p)` /
 * `lookAt(null)` is binary, and the Performer clamps the head to ±0.7 rad
 * at 0.75 weight — so a gaze arriving in one frame turns the head 0.52 rad
 * in that frame.  Measured on Mika at the instant a dialogue opened: 0.574
 * rad in one frame, which is the same single-frame snap the gesture
 * blend-out exists to prevent, on the same joint, from the other side.
 * When nobody is being looked at the target is the head's OWN forward, four
 * metres out — the Performer then computes an offset of exactly zero, so
 * "gaze off" needs no special case and cannot pop. */
const GAZE_LERP = 6;           // 1/s
const GAZE_DIST = 4;           // m — the target point's distance along the smoothed direction
const CADENCE_EVERY = 2.5;     // s — idle beats once the line's own gesture is spent
const ARCHER_RANGE = 25;       // m — the bowman fires on the rush
const ARCHER_EVERY = 3;        // s
const SPEED_LAG = 8;           // 1/s — smoothing on the measured ground speed
/* The record's heading is the sim's truth and it TELEPORTS: `_npcWalk`
 * rewrites it from the next waypoint, so a body leaving shelter can be
 * handed a half turn between two ticks.  A view may not teleport a facing —
 * and it is not only the body that snaps: the gaze target is world-fixed, so
 * a heading jump throws the whole compensation into head.rotation.y (0.53
 * rad in one frame, measured on four of the seven at the breather).  Turn at
 * Actor's own default rate instead; the record stays authoritative. */
const TURN = 8.4;              // rad/s — 480 deg/s, Actor.opts.turnSpeed's default
const RELEASE = 0.12;          // s - ease a joint off the mixer's last pose (correction 3)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

/* --- correction (2): the Performer's own spine coefficients, verbatim, so
 * the flip is a sign and nothing else.  Value = what performer.js ADDS to
 * spine.rotation.x at weight w and intensity scale I. */
const BLEND = 0.15;                                    // performer.js's constant
const SPINE_GESTURE = { bow: -0.5, lean_in: -0.16, lean_back: +0.13 };
const SPINE_POSTURE = { lean_in: -0.12, lean_back: +0.1 };
const smooth = (t) => t * t * (3 - 2 * t);
const plateau = (p) => {                               // performer.js's envelope
  if (p <= 0 || p >= 1) return 0;
  if (p < 0.3) return smooth(p / 0.3);
  if (p > 0.72) return smooth((1 - p) / 0.28);
  return 1;
};

/* ------------------------------------------------------------------ *
 * createCast
 * ------------------------------------------------------------------ */
export async function createCast({ scene, cel, world, run }) {
  const [{ Actor }, { Performer }, { celify }] = await Promise.all([
    forge.actor().then((m) => m), forge.performer().then((m) => m), forge.celify().then((m) => m),
  ]);

  // one scratch vector, reused: the Performer clones whatever it is handed
  const V = makeVec();

  const actors = new Map();

  for (const rec of run.npcs) {
    const actor = await Actor.spawn(rec.character, { walkSpeed: NATIVE.walk, runSpeed: NATIVE.run });
    const root = actor.root;
    root.name = `npc:${rec.id}`;
    root.userData.npc = rec.id;
    celify(root, cel, { worldSatCap: 0.62 });
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    root.position.set(rec.x, rec.y, rec.z);
    actor.heading = rec.heading;
    root.rotation.y = rec.heading;
    scene.add(root);

    // Performer BEFORE the first actor.update: the rest pose it captures is
    // what undriven joints return to every frame.  The fox has no arms and
    // is not Performer-driven (city-plan says so, and `point`/`wave` would
    // throw on a rig with no upperArmR) — it gets clips and a head lookAt.
    const head = root.getObjectByName('head') ?? null;
    const performer = rec.performer && head ? new Performer(actor) : null;

    /* the joints this file writes offsets onto, and therefore the joints
     * that need the mixer-skip guard (correction 1 in the header) */
    const guarded = performer
      ? [...performer.rest.keys()].map((n) => performer.j[n]).filter(Boolean)
      : (head ? [head] : []);
    const guard = guarded.map((joint) => ({
      joint,
      name: joint.name,
      rest: joint.quaternion.clone(),       // the build pose
      clean: joint.quaternion.clone(),      // last pose the MIXER actually wrote
      ax: joint.quaternion.x, ay: joint.quaternion.y, az: joint.quaternion.z, aw: joint.quaternion.w,
      driven: false, release: 0,
    }));

    actors.set(rec.id, {
      id: rec.id, rec, actor, root, performer, head, guard,
      t: 0, px: rec.x, pz: rec.z, speed: 0, heading: rec.heading,
      lineSeq: rec.lineSeq, acting: false, cadenceAt: 0, beat: 0,
      holdUntil: 0, nextFire: 0, prevState: null,
      gx: Math.sin(rec.heading), gy: 0, gz: Math.cos(rec.heading),   // smoothed gaze direction
      verbs: new Set(), states: new Set(['idle']),   // diagnostics, read by soakCast
      skips: 0,                                      // frames the mixer declined to write
    });
  }

  /** Play a one-shot clip and hold the state machine off it for its whole
   *  duration.  Actor's own `lockUntil` is min(0.4, dur*0.55) — long enough
   *  to protect the hit frame, short enough that the next frame's
   *  `setState('idle')` would cut a 1 s attack in half. */
  function oneShot(e, name) {
    const act = e.actor.actions[name];
    if (!act) return false;
    if (!e.actor.setState(name)) return false;
    e.holdUntil = e.t + act.getClip().duration;
    e.states.add(name);
    return true;
  }

  /** Joint names a running mixer action writes THIS FRAME.  Prefer the
   *  Performer's own answer so the guard and the reset cannot disagree; the
   *  fallback is the same rule for the rigs that have no Performer. */
  function drivenSet(e) {
    if (e.performer?._driven) return e.performer._driven();
    const out = new Set();
    for (const act of Object.values(e.actor.actions)) {
      if (!act.isRunning?.() || act.getEffectiveWeight?.() === 0) continue;
      for (const tr of act.getClip().tracks) out.add(tr.name.split('.')[0]);
    }
    return out;
  }

  /** Correction (1), between `actor.update` and the acting.  If a guarded
   *  joint the Performer counts as DRIVEN still holds the exact quaternion
   *  WE left on it, the mixer skipped a redundant write, so that value is
   *  last frame's offsets rather than a pose — put the mixer's own last pose
   *  back before anything adds to it again.  A joint that is NOT driven is
   *  left alone: the Performer resets it to rest, correctly, and a rig with
   *  no Performer gets the same reset here. */
  function guardPose(e) {
    const driven = drivenSet(e);
    for (const g of e.guard) {
      const q = g.joint.quaternion;
      const wrote = q.x !== g.ax || q.y !== g.ay || q.z !== g.az || q.w !== g.aw;
      if (wrote) g.clean.copy(q);
      g.driven = driven.has(g.name);
      if (g.driven) {
        if (!wrote) { q.copy(g.clean); e.skips += 1; }
        g.release = RELEASE;
      } else if (!e.performer) {
        q.copy(g.rest);
      }
    }
  }

  /** Correction (3), after the acting.  A joint that has just left the
   *  driven set eases off the mixer's last pose instead of being dropped
   *  onto the rest pose in one frame. */
  function releasePose(e, dt) {
    for (const g of e.guard) {
      if (g.driven || g.release <= 0) continue;
      g.release = Math.max(0, g.release - dt);
      const k = g.release / RELEASE;
      if (k > 0) g.joint.quaternion.slerp(g.clean, k);
    }
  }

  function rememberPose(e) {
    for (const g of e.guard) {
      const q = g.joint.quaternion;
      g.ax = q.x; g.ay = q.y; g.az = q.z; g.aw = q.w;
    }
  }

  /** Correction (2).  Undo the Performer's spine term and re-apply it with
   *  the sign a +Z-facing rig actually needs.  Every number below is read
   *  off the Performer's own state, so the envelope, the 0.15 s blend and
   *  the intensity scaling stay exactly what performer.js computed. */
  function flipSpine(perf) {
    const sp = perf.j.spine;
    if (!sp) return;
    const blend = perf.prev ? Math.min(1, (perf.time - perf.switchAt) / BLEND) : 1;
    let applied = spineTerm(perf.current, blend, perf.time);
    if (perf.prev) applied += spineTerm(perf.prev, 1 - blend, perf.time);
    applied += SPINE_POSTURE[perf.posture] ?? 0;
    if (applied) sp.rotation.x -= 2 * applied;
  }

  function spineTerm(g, k, time) {
    const c = SPINE_GESTURE[g?.name];
    if (!c || k <= 0) return 0;
    return plateau((time - g.at) / g.dur) * k * c * (0.5 + g.intensity * 0.9);
  }

  function update(dt, liveRun = run, camera = null, playerEye = null) {
    const eye = playerEye ?? camera?.position ?? null;
    const dialogue = liveRun.dialogue ?? null;

    for (const rec of liveRun.npcs) {
      const e = actors.get(rec.id);
      if (!e) continue;
      e.rec = rec;
      e.t += dt;

      /* ---- 1. the sim owns the transform ---- */
      e.actor.velocity.set(0, 0, 0);           // never integrate: the nav grid already moved it
      e.root.position.set(rec.x, rec.y, rec.z);
      e.heading += clamp(wrap(rec.heading - e.heading), -TURN * dt, TURN * dt);
      e.actor.heading = e.heading;
      e.root.rotation.y = e.heading;

      // measured ground speed, smoothed — the record's nominal speed is what
      // it ASKED for, this is what it got
      const moved = Math.hypot(rec.x - e.px, rec.z - e.pz);
      e.px = rec.x; e.pz = rec.z;
      const inst = dt > 1e-6 ? moved / dt : 0;
      e.speed += (inst - e.speed) * Math.min(1, dt * SPEED_LAG);

      /* ---- 2. one-shots: the fox startles, the bowman looses ---- */
      if (rec.state === 'flee' && e.prevState !== 'flee') oneShot(e, 'startle');
      e.prevState = rec.state;

      if (rec.character === 'archer' && liveRun.phase === 'wave' && e.t >= e.nextFire) {
        const rush = (liveRun.enemies ?? []).some((en) => en.state !== 'dead'
          && Math.hypot(en.x - rec.x, en.z - rec.z) <= ARCHER_RANGE);
        if (rush && oneShot(e, 'attack')) e.nextFire = e.t + ARCHER_EVERY;
      }

      /* ---- 3. locomotion state ---- */
      if (e.t >= e.holdUntil) {
        let want;
        // NEVER setState('talk') on a body with no talk clip: it is a silent
        // no-op, and a silent no-op is what the errand review counted as
        // wiring.  archer/brute/mage/golem act over idle, through the Performer.
        if (rec.talking) want = e.actor.has('talk') ? 'talk' : 'idle';
        else if (rec.moving) want = rec.running && e.actor.has('run') ? 'run' : 'walk';
        else want = 'idle';
        if (e.actor.setState(want)) e.states.add(want);
      }
      const st = e.actor.state;
      if (st === 'walk' || st === 'run') {
        const native = st === 'run' ? NATIVE.run : NATIVE.walk;
        const v = e.speed > 0.05 ? e.speed : (rec.running ? rec.speed * 2.1 : rec.speed);
        e.actor.actions[st].timeScale = clamp(v / native, TS_MIN, TS_MAX);
      }

      /* ---- 4. acting ---- */
      const mine = dialogue && dialogue.npc === rec.id;
      if (e.performer) {
        if (rec.lineSeq !== e.lineSeq) {
          e.lineSeq = rec.lineSeq;
          if (mine) {
            const ln = dialogue.lines[dialogue.i];
            // holdMs is script.js's own pacing, derived from the text so the
            // pose outlives it (errand review r2, finding 6: "gestures end
            // before their lines").  It is the ONLY pacing number here.
            const hold = Math.max(0.4, (ln.plan.holdMs ?? 1800) / 1000);
            e.performer.direct(ln.plan, { minDuration: hold });
            e.verbs.add(ln.plan.gesture?.name ?? 'none');
            e.acting = true;
            e.cadenceAt = e.t + hold;
          }
        }
        if (mine && e.acting && e.t >= e.cadenceAt) {
          // the line has outlived its gesture: keep the body reading as
          // someone mid-sentence rather than as someone standing still
          const beat = (e.beat += 1) % 2 ? 'nod' : 'tilt_left';
          e.performer.direct({ gesture: { name: beat, intensity: 0.3 }, posture: e.performer.posture });
          e.verbs.add(beat);
          e.cadenceAt = e.t + CADENCE_EVERY;
        }
        if (!mine && e.acting) {
          e.performer.direct({ gesture: { name: 'none' }, posture: 'neutral' });
          e.verbs.add('none');
          e.acting = false;
        }
      }

      /* ---- 5. the actor's own clock ---- */
      e.actor.update(dt);
      guardPose(e);                       // the mixer may not have written: see the header

      /* ---- 6. gaze, then the acting on top of the clip ---- */
      const near = eye ? Math.hypot(eye.x - rec.x, eye.z - rec.z) <= GAZE_RANGE : false;
      const looking = !!eye && (rec.talking || near);
      if (looking) e.verbs.add('gaze');
      const aim = e.head ? gazeAim(e, looking ? eye : null, dt) : null;
      if (e.performer) {
        // no hard cut on a bow: the Performer damps the gaze over the bow's
        // own envelope (`gazeWeight = 1 - plateau(p)`), which is smooth
        e.performer.lookAt(aim ? V.set(aim.x, aim.y, aim.z) : null);
        e.performer.update(dt);
        flipSpine(e.performer);
      } else if (e.head && aim) {
        foxGaze(e);
      }
      releasePose(e, dt);
      rememberPose(e);
      e.root.updateMatrixWorld(true);
    }
  }

  /** Chase the gaze DIRECTION rather than switching a target on and off, and
   *  hand back the point it aims at.  With no `eye` the direction settles on
   *  the head's own forward, which is an offset of zero. */
  function gazeAim(e, eye, dt) {
    const p = e.head.getWorldPosition(makeVec());
    let tx = Math.sin(e.heading); let ty = 0; let tz = Math.cos(e.heading);
    if (eye) {
      const dx = eye.x - p.x; const dy = eye.y - p.y; const dz = eye.z - p.z;
      const n = Math.hypot(dx, dy, dz) || 1;
      tx = dx / n; ty = dy / n; tz = dz / n;
    }
    const k = 1 - Math.exp(-GAZE_LERP * dt);
    e.gx += (tx - e.gx) * k; e.gy += (ty - e.gy) * k; e.gz += (tz - e.gz) * k;
    const n = Math.hypot(e.gx, e.gy, e.gz) || 1;
    return { x: p.x + (e.gx / n) * GAZE_DIST, y: p.y + (e.gy / n) * GAZE_DIST, z: p.z + (e.gz / n) * GAZE_DIST };
  }

  /** The fox's head track: the Performer's gaze maths without a Performer,
   *  off the same smoothed direction.  `guardPose` has already put the
   *  mixer's own pose back, so this is a per-frame offset and cannot
   *  integrate either. */
  function foxGaze(e) {
    const n = Math.hypot(e.gx, e.gy, e.gz) || 1;
    const dx = e.gx / n; const dy = e.gy / n; const dz = e.gz / n;
    e.head.rotation.y += clamp(wrap(Math.atan2(dx, dz) - e.heading), -0.6, 0.6) * 0.7;
    e.head.rotation.x += clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -0.3, 0.4) * 0.5;
  }

  function dispose() {
    for (const e of actors.values()) {
      e.actor.mixer?.stopAllAction();
      scene.remove?.(e.root);
      e.root.traverse?.((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.();
      });
    }
    actors.clear();
  }

  return { update, actors, dispose };
}

/* A three-free Vector3 stand-in.  The Performer only ever calls `.clone()`
 * and reads `.x/.y/.z` off a gaze target, and in Node this object crosses
 * from hollowbrook's `three` 0.180 into charforge's 0.170 — so it carries
 * no THREE identity at all and the version skew cannot bite. */
function makeVec(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
    clone() { return makeVec(this.x, this.y, this.z); },
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
    setFromMatrixPosition(m) { const e = m.elements; this.x = e[12]; this.y = e[13]; this.z = e[14]; return this; },
  };
}

/* ------------------------------------------------------------------ *
 * soakCast — scripts/check-npc-soak.mjs
 *
 * 60 s of the cast's REAL behaviour cycle, headless, with the mixer
 * running and the rules stepping: wave start (NPCs walk the nav grid to
 * shelter, the vixen bolts), the bowman loosing on the rush, a forced
 * breather (they walk back), two dialogues whose lines are advanced
 * DELIBERATELY MID-ENVELOPE so the blend-out is under load, then the
 * signed-shape probes and a settle.
 *
 * Three assertions, and the third is the one a single-step gate cannot make:
 *   bounded  — every joint of every actor, every tick, |rot| < π
 *   residue  — every Performer-driven joint within 0.02 rad of a CONTROL
 *              actor: same character, built fresh, same states, same clip
 *              times, no Performer.  Comparing against the build pose would
 *              flag the idle pose itself as drift.
 *   shape    — nod/bow/point move the right joints in the right DIRECTION,
 *              and the bow's head tips DOWN in world space.  B3 r2: three
 *              gates passed a Performer playing every verb backwards.
 * ------------------------------------------------------------------ */
export async function soakCast({ seconds = 60 } = {}) {
  const DT = 1 / 60;
  const { bootCity } = await import('../../scripts/lib/headless.mjs');
  const { scene, vignette, plan } = await bootCity();
  const { buildWorld } = await import('./world.js');
  const { SiegeRun } = await import('./rules.js');
  const { cel } = await import('../core/toon.js');
  const { Actor } = await forge.actor();

  const world = buildWorld(vignette, plan, { scene });
  const run = new SiegeRun(world, { seed: 1 });
  const stub = { add() {}, remove() {}, traverse() {}, children: [] };
  const cast = await createCast({ scene: stub, cel, world, run });

  /* ---- control actors: same build, same states, no Performer ---- */
  const controls = new Map();
  for (const [id, e] of cast.actors) {
    const ctrl = await Actor.spawn(e.rec.character, { walkSpeed: NATIVE.walk, runSpeed: NATIVE.run });
    const orig = e.actor.setState.bind(e.actor);
    e.actor.setState = (next, force) => { const ok = orig(next, force); if (ok) ctrl.setState(next, force); return ok; };
    controls.set(id, ctrl);
  }

  /* ---- what every joint is: the union of every clip's tracks and every
   * joint the Performer offsets.  Derived from the data, not a name list. */
  const jointsOf = (e) => {
    const names = new Set(e.performer ? e.performer.rest.keys() : []);
    for (const act of Object.values(e.actor.actions)) for (const t of act.getClip().tracks) names.add(t.name.split('.')[0]);
    const out = [];
    for (const n of names) { const o = e.root.getObjectByName(n); if (o) out.push([n, o]); }
    return out;
  };
  const tracked = new Map([...cast.actors].map(([id, e]) => [id, jointsOf(e)]));

  /* A SNAP is measured on the ACTING'S OWN CONTRIBUTION — the real actor's
   * rotation minus the control's, per guarded joint — not on the joint.  A
   * clip-driven forearm crossfading into an attack legitimately moves 0.66
   * rad in a frame and a shin at timeScale 2.2 swings 0.58; subtracting the
   * control removes every one of those and leaves the gesture and the gaze,
   * which are the only things a snap here would be a defect in. */
  const acting = new Map([...cast.actors].map(([id, e]) => [id, e.guard.map((g) => {
    let name = null;
    e.root.traverse((o) => { if (!name && o === g.joint) name = o.name; });
    return { name, joint: g.joint, ctrl: controls.get(id).root.getObjectByName(g.joint.name) };
  }).filter((a) => a.ctrl)]));

  const stat = new Map([...cast.actors.keys()].map((id) => [id, { max: 0, maxAt: '', jump: 0, jumpAt: '', residue: 0, resJoint: '' }]));
  const last = new Map([...tracked].map(([id, js]) => [id, js.map(([, o]) => [o.rotation.x, o.rotation.y, o.rotation.z])]));
  const lastAct = new Map([...acting].map(([id, as]) => [id, as.map(() => [0, 0, 0])]));
  let boundFail = null;

  /* ---- the schedule ---- */
  const reeve = cast.actors.get('reeve');
  const bowRec = run.npcs.find((n) => n.character === 'archer');
  const FAR = { x: 500, y: 1.6, z: 500 };
  const shape = { nod: null, bow: null, point: null };
  let bowBefore = null;
  const fired = new Set();
  const at = (t, key, fn) => { if (!fired.has(key) && t >= key) { fired.add(key); fn(); } };
  const closeAny = () => { let g = 0; while (run.dialogue && g++ < 24) run.advanceDialogue(); };
  const worldForward = (joint) => {                 // local +Z into world space
    joint.updateWorldMatrix(true, false);
    const m = joint.matrixWorld.elements;
    const n = Math.hypot(m[8], m[9], m[10]) || 1;
    return { x: m[8] / n, y: m[9] / n, z: m[10] / n };
  };

  const total = Math.round(seconds / DT);
  for (let i = 0; i < total; i++) {
    const t = i * DT;

    at(t, 18.0, () => { run._startBreather(); if (run.dialogue?.npc !== 'runner') { closeAny(); run.openDialogue('runner', 'brief:o1-escort-runner'); } });
    at(t, 20.0, () => run.advanceDialogue());                    // MID-ENVELOPE: blend under load
    at(t, 22.5, closeAny);
    at(t, 25.0, () => { closeAny(); run.openDialogue('reeve', 'brief:o2-barricades'); });
    at(t, 26.5, () => run.advanceDialogue());                    // MID-ENVELOPE again
    at(t, 29.5, closeAny);
    // the four rigs with NO talk clip: they must act over `idle` through the
    // Performer, and setState('talk') must never be called on them
    at(t, 45.0, () => { closeAny(); run.openDialogue('bowman', 'bowman:idle'); });
    at(t, 47.5, closeAny);
    at(t, 48.0, () => run.openDialogue('smith', 'smith:idle'));
    at(t, 50.5, closeAny);
    at(t, 51.0, () => run.openDialogue('hedgewizard', 'wizard:idle'));
    at(t, 53.5, closeAny);
    at(t, 55.5, () => {                                          // settle: everyone idle at post
      closeAny();
      for (const n of run.npcs) { n.talking = false; n.moving = false; n.running = false; n.state = 'post'; }
    });

    if (!run.over) run.step();
    if (t >= 55.5) for (const n of run.npcs) { n.talking = false; n.moving = false; n.running = false; n.state = 'post'; }

    /* the bowman's rush: a synthetic enemy 6 m off his post for six seconds,
     * fed to the cast through a read-only view of the run.  An instrument —
     * the wave's own spawns are not guaranteed to reach the south wall-walk
     * inside a 60 s soak, and "the bowman fires" has to be exercised. */
    let view = run;
    if (t >= 6 && t < 12 && bowRec) {
      view = { ...run, enemies: [{ id: -1, kind: 'reaver', state: 'move', x: bowRec.x + 5, y: bowRec.y, z: bowRec.z + 3 }] };
    }

    // eye: the player while anyone is talking (so gaze is exercised), far
    // away during the shape probes (so gaze cannot contaminate the signs)
    const probing = t >= 31.5 && t < 45;
    const eye = probing ? FAR : { x: run.player.x, y: run.player.y + 1.62, z: run.player.z };

    cast.update(DT, view, null, eye);

    for (const [id, e] of cast.actors) {
      const ctrl = controls.get(id);
      ctrl.root.position.copy(e.root.position);
      ctrl.root.rotation.y = e.root.rotation.y;
      ctrl.heading = e.actor.heading;
      ctrl.velocity.set(0, 0, 0);
      for (const k of Object.keys(e.actor.actions)) if (ctrl.actions[k]) ctrl.actions[k].timeScale = e.actor.actions[k].timeScale;
      ctrl.update(DT);
    }

    /* ---- probes (after the frame's update, so the next frame renders them) ---- */
    if (reeve?.performer) {
      at(t, 32.0, () => reeve.performer.direct({ gesture: { name: 'nod', intensity: 0.9 } }));
      at(t, 32.35, () => { shape.nod = delta(reeve, controls.get('reeve')); });
      at(t, 35.0, () => { bowBefore = worldForward(reeve.performer.j.head).y; reeve.performer.direct({ gesture: { name: 'bow', intensity: 0.9 } }); });
      at(t, 35.75, () => { shape.bow = delta(reeve, controls.get('reeve')); shape.bow.headFwdY = worldForward(reeve.performer.j.head).y; });
      at(t, 38.0, () => reeve.performer.direct({ gesture: { name: 'point', intensity: 0.9 } }));
      at(t, 38.7, () => { shape.point = delta(reeve, controls.get('reeve')); });
      at(t, 41.0, () => reeve.performer.direct({ gesture: { name: 'none' }, posture: 'neutral' }));
    }

    /* ---- per-tick assertions ---- */
    for (const [id, js] of tracked) {
      const s = stat.get(id);
      const prev = last.get(id);
      for (let k = 0; k < js.length; k++) {
        const [name, o] = js[k];
        const r = [o.rotation.x, o.rotation.y, o.rotation.z];
        const mag = Math.max(Math.abs(r[0]), Math.abs(r[1]), Math.abs(r[2]));
        if (mag > s.max) { s.max = mag; s.maxAt = name; }
        if (mag >= Math.PI && !boundFail) boundFail = `${id}.${name} reached ${mag.toFixed(2)} rad at t=${t.toFixed(2)}s`;
        prev[k] = r;
      }
    }
    for (const [id, as] of acting) {
      const s = stat.get(id);
      const prev = lastAct.get(id);
      for (let k = 0; k < as.length; k++) {
        const { name, joint, ctrl } = as[k];
        const d = [joint.rotation.x - ctrl.rotation.x, joint.rotation.y - ctrl.rotation.y, joint.rotation.z - ctrl.rotation.z];
        // i === 0 compares against a control that has not been stepped yet
        const jump = i ? Math.max(Math.abs(d[0] - prev[k][0]), Math.abs(d[1] - prev[k][1]), Math.abs(d[2] - prev[k][2])) : 0;
        if (jump > s.jump) { s.jump = jump; s.jumpAt = `${name}@${t.toFixed(1)}s`; }
        prev[k] = d;
      }
    }
  }

  /* ---- settle 2 s of idle with nothing directed, then residue ---- */
  for (const e of cast.actors.values()) e.performer?.direct({ gesture: { name: 'none' }, posture: 'neutral' });
  for (let i = 0; i < 120; i++) {
    cast.update(DT, run, null, FAR);
    for (const [id, e] of cast.actors) {
      const ctrl = controls.get(id);
      ctrl.root.position.copy(e.root.position);
      ctrl.root.rotation.y = e.root.rotation.y;
      for (const k of Object.keys(e.actor.actions)) if (ctrl.actions[k]) ctrl.actions[k].timeScale = e.actor.actions[k].timeScale;
      ctrl.update(DT);
    }
  }
  for (const [id, e] of cast.actors) {
    if (!e.performer) continue;
    const ctrl = controls.get(id);
    const s = stat.get(id);
    for (const n of e.performer.rest.keys()) {
      const a = e.performer.j[n];
      const b = ctrl.root.getObjectByName(n);
      if (!a || !b) continue;
      const d = quatAngle(a.quaternion, b.quaternion);
      if (d > s.residue) { s.residue = d; s.resJoint = n; }
    }
  }

  /* ---- report ---- */
  let fails = 0;
  const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) fails++; };

  console.log(`\nNPC SOAK — ${seconds}s at 1/60, ${cast.actors.size} cast members, rules stepping\n`);
  console.log('actor        character  perf  max|rot|            snap (acting joints)  residue  mixer-skips  clips | verbs');
  console.log('-------------------------------------------------------------------------------------------------------------------');
  for (const [id, e] of cast.actors) {
    const s = stat.get(id);
    const verbs = [...e.verbs].sort().join(' ') || '—';
    const clips = [...e.states].sort().join(',');
    console.log(
      `${id.padEnd(12)} ${e.rec.character.padEnd(10)} ${(e.performer ? 'yes' : 'no ').padEnd(5)} `
      + `${s.max.toFixed(3)} ${s.maxAt.padEnd(10)} ${s.jump.toFixed(3)} ${s.jumpAt.padEnd(16)} `
      + `${(e.performer ? s.residue.toFixed(4) : ' n/a  ').padEnd(8)} ${String(e.skips).padEnd(12)} ${clips} | ${verbs}`);
  }
  console.log('');

  const maxAll = Math.max(...[...stat.values()].map((s) => s.max));
  const jumpAll = Math.max(...[...stat.values()].map((s) => s.jump));
  const resAll = Math.max(...[...cast.actors].filter(([, e]) => e.performer).map(([id]) => stat.get(id).residue));

  const skips = [...cast.actors.values()].reduce((n, e) => n + e.skips, 0);
  check('every joint of every actor bounded through the soak (< π rad)', !boundFail, boundFail ?? `worst |rot| ${maxAll.toFixed(3)} rad`);
  check('no single-frame snap on an acting joint (lines advanced mid-envelope ×2)', jumpAll < 0.35, `worst ${jumpAll.toFixed(3)} rad/frame (the r2 defect was 2.20)`);
  check('back at rest vs a control actor (±0.02 rad)', resAll < 0.02, `worst residue ${resAll.toFixed(4)} rad`);
  check('the mixer-skip guard did work (see header, correction 1)', skips > 0, `${skips} joint-frames the mixer declined to write and the guard restored`);

  const walked = [...cast.actors.values()].filter((e) => e.states.has('walk')).length;
  check('NPCs walked the nav grid (shelter, then back to post)', walked >= 4, `${walked} of ${cast.actors.size} played a walk clip`);
  check('the bowman looses on the rush', cast.actors.get('bowman')?.states.has('attack') === true, 'archer attack clip fired');
  check('the vixen startles when she flees', cast.actors.get('vixen')?.states.has('startle') === true, 'fox startle clip fired');
  const talked = [...cast.actors.values()].filter((e) => e.states.has('talk')).length;
  check('talk clips only on bodies that have one', talked === 2, `${talked} (elder + mika); the other four act over idle`);

  // signed shape — the sign convention is performer.js's SHAPE table:
  // nod = head.x POSITIVE, and +x about a joint whose local +Z is forward
  // sends that forward vector's y DOWN, so positive head.x IS chin-down.
  const okNod = shape.nod && shape.nod.head?.x > 0.05;
  check('nod tips the head DOWN (head.rotation.x > 0)', !!okNod, shape.nod ? `Δhead.x ${shape.nod.head.x.toFixed(3)} rad` : 'not sampled');
  // bow, AFTER correction (2): the spine's sign is this file's, so the test
  // that matters is the world-space one — where is the head actually looking
  const b = shape.bow;
  const okBow = b && b.spine?.x > 0.05 && b.head?.x > 0.05 && b.headFwdY < bowBefore - 0.05;
  check('bow folds the torso FORWARD and the head DOWN in world space', !!okBow,
    b ? `Δspine.x ${b.spine.x.toFixed(3)} (charforge alone: ${(-b.spine.x).toFixed(3)}), Δhead.x ${b.head.x.toFixed(3)}, head world-forward y ${bowBefore.toFixed(3)} → ${b.headFwdY.toFixed(3)}` : 'not sampled');
  const okPoint = shape.point && shape.point.upperArmR?.x < -0.1;
  check('point raises the right arm FORWARD (upperArmR.x < 0)', !!okPoint, shape.point ? `ΔupperArmR.x ${shape.point.upperArmR.x.toFixed(3)} rad` : 'not sampled');

  cast.dispose();
  console.log(`\nRESULT: ${fails ? `FAIL (${fails})` : 'PASS'}`);
  return fails === 0;
}

/** Per-joint rotation of the real actor MINUS the control's — the gesture's
 *  own contribution, with the clip underneath subtracted out. */
function delta(e, ctrl) {
  const out = {};
  for (const n of e.performer.rest.keys()) {
    const a = e.performer.j[n];
    const b = ctrl.root.getObjectByName(n);
    if (!a || !b) continue;
    out[n] = { x: a.rotation.x - b.rotation.x, y: a.rotation.y - b.rotation.y, z: a.rotation.z - b.rotation.z };
  }
  return out;
}

/** Angle between two quaternions, written out so the two `three` copies in
 *  a Node run never have to meet (`a.angleTo(b)` would cross the boundary). */
function quatAngle(a, b) {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, d));
}
