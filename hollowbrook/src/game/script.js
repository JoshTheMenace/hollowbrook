/* The cast's lines.  Every acting plan is normalised through Mira's
 * contract AT MODULE LOAD — a gesture outside the vocabulary throws before
 * anything ships (battery B3's rule) — and the Performer throws again at
 * direct() on a verb it does not implement, so a locomotion gesture cannot
 * reach a body.  Lines are paced: `holdMs` is derived from the text so a
 * gesture is not over before the line is (errand review r2, finding 6). */
import { normalizePlan } from '../../../src/contract.js';

const paced = (text) => Math.min(6000, 900 + text.length * 38);
const line = (text, plan = {}) => ({ text, plan: normalizePlan({ speech: text, holdMs: paced(text), ...plan }) });

export const SCRIPT = Object.freeze({
  'brief:o1-escort-runner': [
    line('Warden! They came straight up the road — I could not get to the hall.', { gesture: { name: 'point', intensity: 0.8 }, emotion: { name: 'concerned', intensity: 0.7 } }),
    line('Take me across the square to the Reeve. I will keep up, I promise.', { gesture: { name: 'nod', intensity: 0.7 }, posture: 'lean_in' }),
  ],
  'done:o1-escort-runner': [
    line('The hall. Thank you — go, they will be back before the bell tolls twice.', { gesture: { name: 'bow', intensity: 0.6 }, emotion: { name: 'happy', intensity: 0.5 } }),
  ],
  'during:o1-escort-runner': [
    line('I am right behind you. Do not run off — I cannot see past the stalls.', { gesture: { name: 'open_hand', intensity: 0.6 }, emotion: { name: 'concerned', intensity: 0.5 } }),
  ],
  'brief:o2-barricades': [
    line('That was the market. The next lot will come up the row, and the row is a street with no doors on it.', { gesture: { name: 'shake', intensity: 0.5 }, emotion: { name: 'concerned', intensity: 0.6 } }),
    line('Stanhope has three barricades lying ready on the lane. Raise them — all three, or the gap is where they come through.', { gesture: { name: 'point', intensity: 0.9 }, posture: 'lean_in' }),
  ],
  'done:o2-barricades': [
    line('Three up. Now the row is a throat, and a throat is somewhere one warden can stand.', { gesture: { name: 'nod', intensity: 0.8 }, emotion: { name: 'happy', intensity: 0.4 } }),
  ],
  'brief:o3-relight-wall': [
    line('The wall braziers went out in the rush. Dark walls are walls they climb.', { gesture: { name: 'tilt_left', intensity: 0.5 }, emotion: { name: 'concerned', intensity: 0.7 } }),
    line('Four of them, the corners of the town. Light them, and Aldous can see what he is shooting at.', { gesture: { name: 'open_hand', intensity: 0.8 }, posture: 'lean_in' }),
  ],
  'done:o3-relight-wall': [
    line('There. Hollowbrook has a ring of fire round it again. It will not hold them, but it will show them.', { gesture: { name: 'nod', intensity: 0.7 }, emotion: { name: 'happy', intensity: 0.5 } }),
  ],
  'brief:o4-escort-reeve': [
    line('So that was their Captain. He looked at the keep the whole time, did you see?', { gesture: { name: 'lean_in', intensity: 0.7 }, emotion: { name: 'skeptical', intensity: 0.6 } }),
    line('I am too old to run and too stubborn to hide. Walk me up to the Warden\'s Hall, and I will ring you home at dawn.', { gesture: { name: 'small_shrug', intensity: 0.6 }, posture: 'lean_back' }),
  ],
  'done:o4-escort-reeve': [
    line('The keep. Good. Whatever comes next comes here, and here is where we end it.', { gesture: { name: 'bow', intensity: 0.5 }, emotion: { name: 'concerned', intensity: 0.4 } }),
  ],
  'during:o4-escort-reeve': [
    line('Slower, warden. My knees were old when your father was a boy.', { gesture: { name: 'tilt_right', intensity: 0.5 }, emotion: { name: 'amused', intensity: 0.5 } }),
  ],
  'brief:o6-ring-the-bell': [
    line('He is down! The rope, warden — the bell is on the tower. Ring it and the night is over.', { gesture: { name: 'point', intensity: 1.0 }, emotion: { name: 'excited', intensity: 0.9 } }),
  ],
  'done:o6-ring-the-bell': [
    line('Dawn. Hollowbrook stands. Go and sleep — I will count the lights.', { gesture: { name: 'bow', intensity: 0.9 }, emotion: { name: 'happy', intensity: 0.9 } }),
  ],
  'reeve:breather': [
    line('Catch your breath. They will come again when the light goes.', { gesture: { name: 'nod', intensity: 0.5 }, posture: 'lean_back' }),
  ],
  'reeve:wave': [
    line('Not now, warden — the gate!', { gesture: { name: 'point', intensity: 0.9 }, emotion: { name: 'concerned', intensity: 0.8 } }),
  ],
  'runner:idle': [
    line('I ran the whole road from Thistledown. Four miles. They were behind me the whole way.', { gesture: { name: 'small_shrug', intensity: 0.6 }, emotion: { name: 'embarrassed', intensity: 0.4 } }),
  ],
  'smith:idle': [
    line('Carts, doors, stakes. Push them up and they lock. Pull the pin and they drop.', { gesture: { name: 'open_hand', intensity: 0.7 } }),
  ],
  'bowman:idle': [
    line('I have twelve shafts and a wall. Keep them off the stair and I will keep them off the walk.', { gesture: { name: 'nod', intensity: 0.6 } }),
  ],
  'wizard:idle': [
    line('The ward stone holds while I hold. Do not ask me what it holds against.', { gesture: { name: 'tilt_left', intensity: 0.5 }, emotion: { name: 'skeptical', intensity: 0.5 } }),
  ],
});
