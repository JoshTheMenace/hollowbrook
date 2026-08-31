// Game shell: scene/state manager, save/load, settings, input abstraction.
// Genre-agnostic — every future game starts from this instead of ad-hoc glue.

// --- Scenes ---------------------------------------------------------------
// A scene: { enter(shell, params), exit(), update(dt), domId? }. The shell
// shows/hides a DOM overlay per scene if domId is given.
export class Shell {
  constructor() {
    this.scenes = new Map();
    this.current = null;
    this.currentName = null;
  }
  scene(name, def) { this.scenes.set(name, def); return this; }
  go(name, params) {
    const next = this.scenes.get(name);
    if (!next) throw new Error(`no scene "${name}"`);
    if (this.current?.exit) this.current.exit();
    if (this.current?.domId) document.getElementById(this.current.domId)?.style.setProperty('display', 'none');
    this.current = next;
    this.currentName = name;
    if (next.domId) document.getElementById(next.domId)?.style.setProperty('display', 'flex');
    next.enter?.(this, params);
  }
  update(dt) { this.current?.update?.(dt); }
}

// --- Save / settings -------------------------------------------------------
export class Save {
  constructor(key, version = 1) { this.key = key; this.version = version; }
  load(fallback = {}) {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { ...fallback };
      const data = JSON.parse(raw);
      if (data.__v !== this.version) return { ...fallback };   // stale schema
      delete data.__v;
      return { ...fallback, ...data };
    } catch { return { ...fallback }; }
  }
  store(data) {
    try { localStorage.setItem(this.key, JSON.stringify({ ...data, __v: this.version })); } catch {}
  }
  clear() { try { localStorage.removeItem(this.key); } catch {} }
}

// --- Input ----------------------------------------------------------------
// Unified move vector + action buttons from keyboard AND gamepad. Games read
// input.move (Vector-like {x,z}), input.pressed('attack') etc. Bots inject
// via input.virtual.
const KEYMAP = {
  w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
  shift: 'run', e: 'interact', ' ': 'interact', f: 'attack', escape: 'pause',
};
const PADMAP = { 0: 'interact', 2: 'attack', 9: 'pause', 5: 'run' };

export class Input {
  constructor() {
    this.down = new Set();
    this.justPressed = new Set();
    this.virtual = { move: { x: 0, z: 0 }, actions: new Set() };  // bot injection
    addEventListener('keydown', (e) => {
      const act = KEYMAP[e.key.toLowerCase()];
      if (!act) return;
      if (!e.repeat && !this.down.has(act)) this.justPressed.add(act);
      this.down.add(act);
      if (act === 'interact' || act === 'pause') e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      const act = KEYMAP[e.key.toLowerCase()];
      if (act) this.down.delete(act);
    });
    this._padPrev = new Set();
  }

  pollGamepad() {
    const pad = navigator.getGamepads?.()[0];
    if (!pad) return;
    for (const [btn, act] of Object.entries(PADMAP)) {
      const pressed = pad.buttons[btn]?.pressed;
      if (pressed && !this._padPrev.has(act)) this.justPressed.add(act);
      if (pressed) { this.down.add(act); this._padPrev.add(act); }
      else if (this._padPrev.has(act)) { this.down.delete(act); this._padPrev.delete(act); }
    }
    const dz = (v) => (Math.abs(v) > 0.2 ? v : 0);
    this._padMove = { x: dz(pad.axes[0] || 0), z: dz(pad.axes[1] || 0) };
  }

  get move() {
    if (this.virtual.move.x || this.virtual.move.z) return this.virtual.move;
    if (this._padMove && (this._padMove.x || this._padMove.z)) return this._padMove;
    return {
      x: (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0),
      z: (this.down.has('down') ? 1 : 0) - (this.down.has('up') ? 1 : 0),
    };
  }
  held(action) { return this.down.has(action) || this.virtual.actions.has(action); }
  pressed(action) {                       // edge-triggered, consumed per frame
    if (this.justPressed.has(action)) { this.justPressed.delete(action); return true; }
    if (this.virtual.actions.has(action)) { this.virtual.actions.delete(action); return true; }
    return false;
  }
  endFrame() { this.justPressed.clear(); }
}
