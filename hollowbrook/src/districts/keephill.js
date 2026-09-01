import { defineDistrict } from '../core/district.js';

/* ==================================================================== *
 * keephill — STUB.  A district agent replaces this whole file (see
 * DISTRICT-BRIEFS/keephill.md).  Until then it builds NOTHING: the ground it
 * would dress is already there, because the terrain carries it — its level,
 * its wall-walk, its stair and, where the plan says so, its market rim or
 * its keep.  An empty build is what lets `npm run check` prove the terrain
 * and the routes before a single wall stands.
 * ==================================================================== */
export const keephill = defineDistrict({
  id: 'keephill',
  envelope: { x0: -18, z0: -54, x1: 54, z1: -18 },
  after: ['marketlow'],
  build() { /* stub — nothing yet */ },
});
