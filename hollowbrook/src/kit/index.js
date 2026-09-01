/* ------------------------------------------------------------------ *
 * THE THISTLEDOWN KIT — one import for a district.
 *
 *   import {
 *     M, painted, glowing, PAL, ACCENT, JOINERY,   // materials & palette
 *     place, rng, seatOnGround, parts, bx, cyl,    // plumbing
 *     cottage, longhouse, roundTower, temple, windmill, tradeFront,
 *     thatchRoof, shingleRoof, hipRoof, coneCap,
 *     bigTree, treeStand, tree, smallTree, hedgeRun,
 *     villageProps, marketStall, lanternString, interactive,
 *     signKit,
 *   } from '../kit/index.js';
 *
 * THE KIT IS APPEND-ONLY DURING DISTRICT BUILDS. If you need a generator
 * that is not here, ask the coordinator — do not write your own building
 * generator. Two districts inventing their own bakery is how a town stops
 * being one place. Variation lives in seeds and parameters; identity lives
 * in the kit.
 *
 * Read `README.md` in this folder before your first build. It is short and
 * every line of it was learned the expensive way.
 * ------------------------------------------------------------------ */

export { PAL, ACCENT, JOINERY } from '../palette.js';
export { M, painted, litGlass, glowing, wallMaterial, panelMaterial, thatchMaterial, shingleMaterial } from './mats.js';

export {
  rng, hashSeed, bx, cyl, tubeGeo, parts, mergeParts, place, tagProp,
  pushQuad, pushTri, pushQuadUV, polyGeometry, polyGeometryUV,
} from './util.js';

/* The architecture kit, re-exported so a district has ONE import. Roofs,
 * stairs, rails, walls and banks are NEVER hand-placed with guessed
 * rotations — read builders.js's header before using any of them. */
export {
  box, mergedBoxes, tubeBetween, stairs, stairRail, pier, wallRun, bench,
  leanTo, bankWedge, seatOnGround, createBuilder,
} from '../builders.js';

export {
  thatchRoof, shingleRoof, hipRoof, coneCap, gableRoof, shedRoof,
  gableFill, chimney, THATCH_PITCH, SHINGLE_PITCH,
} from './roofs.js';

export {
  cottage, longhouse, roundTower, temple, windmill,
  tradeFront, windowOn, doorOn, frameElevation, faceFrame, facePlane, FACES,
} from './buildings.js';

export { bigTree, treeStand, smallTree, hedgeRun } from './trees.js';

export {
  villageProps, lightPool, hitbox, interactive, lanternString,
  bracketLantern, postLantern, torch, brazier,
  wellHead, cart, hayBale, hayRick, barrel, barrelStack, crate, crateStack,
  sackStack, logPile, chickenCoop, beehive, shrineStone,
  fenceRun, bannerPole, ladder, washingLine, marketStall,
  trough, mountingBlock, waymarker, kitchenGarden,
} from './props.js';

export {
  signKit, TENANTS, NOTICES, DEVICES, tenant, canvasFor,
  boardTexture, fasciaTexture, noticeTexture, paintedTexture, chalkTexture, deviceTexture,
  printedPlane, devicePlate, fasciaBoard, hangingSign, wallNotice, chalkedBoard,
  noticeBoardStand, fingerpost, platePost, paintedName,
} from './signkit.js';
