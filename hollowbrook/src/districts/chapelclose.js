import { defineDistrict } from '../core/district.js';

/* ==================================================================== *
 * chapelclose — STUB.  A district agent replaces this whole file (see
 * DISTRICT-BRIEFS/chapelclose.md).  Until then it builds NOTHING: the ground it
 * would dress is already there, because the terrain carries it — its level,
 * its wall-walk, its stair and, where the plan says so, its market rim or
 * its keep.  An empty build is what lets `npm run check` prove the terrain
 * and the routes before a single wall stands.
 * ==================================================================== */
export const chapelclose = defineDistrict({
  id: 'chapelclose',
  envelope: { x0: -54, z0: -54, x1: -18, z1: -12 },
  after: ['millreach','keephill'],
  build() { /* stub — nothing yet */ },
});
