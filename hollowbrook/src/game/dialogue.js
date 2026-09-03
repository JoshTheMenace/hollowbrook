/* ------------------------------------------------------------------ *
 * DIALOGUE UI — the DOM half of the cast.  A view over `run.dialogue`,
 * exactly like cast.js is a view over `run.npcs`: it holds a typewriter
 * cursor and nothing else, and the shell drives it from the rules'
 * `dialogue-open` / `dialogue-line` / `dialogue-close` events.
 *
 * The look is the errand's (battery/errand.html): dark violet panel, warm
 * #ffd9a0 accent, left border, bottom centre, `.open` fades it in.  Copied
 * as a pattern, not imported — that page belongs to another project.
 *
 * TYPEWRITER, AND WHY IT IS NOT A TIMER.  `update(dt)` is fed the shell's
 * own dt, so the reveal runs on the same clock as the acting.  charforge's
 * Performer paces a gesture to the line through `plan.holdMs`, and the two
 * only stay in step if they count the same seconds — an rAF-throttled tab
 * froze exactly this in the errand's first capture run (nightbloom TRAPS).
 *
 *   const ui = createDialogueUI(document.body);
 *   ui.open('The Reeve'); ui.line(text);      // on dialogue-open / -line
 *   if (ui.typing) ui.line();                 // E while typing: skip
 *   else run.advanceDialogue();
 *   ui.update(dt);                            // every frame
 * ------------------------------------------------------------------ */
import './dialogue.css';

export const TYPE_CPS = 42;                 // characters per second

export function createDialogueUI(rootEl) {
  if (!rootEl) throw new Error('createDialogueUI(rootEl): no root element');

  const box = document.createElement('div');
  box.className = 'hb-dialogue';
  const nameEl = document.createElement('div');
  nameEl.className = 'hb-dialogue__name';
  const textEl = document.createElement('div');
  textEl.className = 'hb-dialogue__text';
  const nextEl = document.createElement('div');
  nextEl.className = 'hb-dialogue__next';
  nextEl.textContent = 'E ▸';
  box.append(nameEl, textEl, nextEl);
  rootEl.appendChild(box);

  // the whole state: what is being revealed and how far in
  let full = '';
  let shown = 0;
  let elapsed = 0;
  let open = false;

  const paint = () => {
    const typing = shown < full.length;
    textEl.textContent = full.slice(0, shown);
    box.classList.toggle('typing', typing);
  };

  const complete = () => { shown = full.length; elapsed = full.length / TYPE_CPS; paint(); };

  return {
    /** Show the panel and name the speaker.  Does not set a line. */
    open(name = '') {
      nameEl.textContent = name;
      open = true;
      box.classList.add('open');
    },

    /** Start revealing `text`.  Called again mid-reveal — with no argument,
     *  or with the line already showing — it COMPLETES instead of restarting,
     *  which is the skip. */
    line(text) {
      if (!open) { open = true; box.classList.add('open'); }
      if (text === undefined || text === full) { complete(); return; }
      full = String(text);
      shown = 0;
      elapsed = 0;
      paint();
    },

    close() {
      open = false;
      box.classList.remove('open', 'typing');
      full = '';
      shown = 0;
      elapsed = 0;
      textEl.textContent = '';
    },

    update(dt) {
      if (!open || shown >= full.length) return;
      elapsed += dt;
      const target = Math.min(full.length, Math.floor(elapsed * TYPE_CPS));
      if (target !== shown) { shown = target; paint(); }
    },

    /** True while characters are still arriving — the shell's E key reads
     *  this to decide between "skip the reveal" and "advance the line". */
    get typing() { return open && shown < full.length; },
    get isOpen() { return open; },
    get element() { return box; },

    dispose() { box.remove(); },
  };
}
