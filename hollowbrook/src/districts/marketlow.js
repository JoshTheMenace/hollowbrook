import { defineDistrict } from '../core/district.js';

/* ==================================================================== *
 * marketlow — STUB.  A district agent replaces this whole file (see
 * DISTRICT-BRIEFS/marketlow.md).  Until then it builds NOTHING: the ground it
 * would dress is already there, because the terrain carries it — its level,
 * its wall-walk, its stair and, where the plan says so, its market rim or
 * its keep.  An empty build is what lets `npm run check` prove the terrain
 * and the routes before a single wall stands.
 * ==================================================================== */
export const marketlow = defineDistrict({
  id: 'marketlow',
  envelope: { x0: -18, z0: -18, x1: 18, z1: 16 },
  after: ['southgate'],
  build() { /* stub — nothing yet */ },
});
