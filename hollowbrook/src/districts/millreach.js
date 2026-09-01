import { defineDistrict } from '../core/district.js';

/* ==================================================================== *
 * millreach — STUB.  A district agent replaces this whole file (see
 * DISTRICT-BRIEFS/millreach.md).  Until then it builds NOTHING: the ground it
 * would dress is already there, because the terrain carries it — its level,
 * its wall-walk, its stair and, where the plan says so, its market rim or
 * its keep.  An empty build is what lets `npm run check` prove the terrain
 * and the routes before a single wall stands.
 * ==================================================================== */
export const millreach = defineDistrict({
  id: 'millreach',
  envelope: { x0: -54, z0: -12, x1: -18, z1: 54 },
  after: ['southgate','marketlow'],
  build() { /* stub — nothing yet */ },
});
