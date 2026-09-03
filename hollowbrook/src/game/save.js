/* The shell's save path.  ONE key, ONE shape (LOOP-CONTRACT "Persistence"),
 * written only at wave starts and objective completions — never mid-wave —
 * and read back through the same three functions the persistence gate
 * exercises from headless Chrome.  Validation is the rules' (SiegeRun.validSave):
 * a corrupt or foreign save yields a fresh run and a live shell. */
import { CONTRACT as C } from './data.js';

export const SAVE_KEY = C.save.key;

export function readSave(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function writeSave(snap, storage = globalThis.localStorage) {
  try { storage?.setItem(SAVE_KEY, JSON.stringify(snap)); return true; } catch { return false; }
}

export function clearSave(storage = globalThis.localStorage) {
  try { storage?.removeItem(SAVE_KEY); } catch { /* private mode */ }
}
