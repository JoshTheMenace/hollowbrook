import { defineDistrict } from '../core/district.js';

/* ==================================================================== *
 * southgate — STUB.  A district agent replaces this whole file (see
 * DISTRICT-BRIEFS/southgate.md).  Until then it builds NOTHING: the ground it
 * would dress is already there, because the terrain carries it — its level,
 * its wall-walk, its stair and, where the plan says so, its market rim or
 * its keep.  An empty build is what lets `npm run check` prove the terrain
 * and the routes before a single wall stands.
 * ==================================================================== */
export const southgate = defineDistrict({
  id: 'southgate',
  envelope: { x0: -18, z0: 16, x1: 18, z1: 54 },
  after: [],
  build() { /* stub — nothing yet */ },
});
