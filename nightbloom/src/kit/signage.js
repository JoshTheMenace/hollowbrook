import { signPlate, fascia, noticeBoard, banner } from '../core/texkit.js';
import { PAL } from '../palette.js';
import { TONE } from './common.js';

/* ------------------------------------------------------------------ *
 * Yoizaka signage tables.
 *
 * Every title here is VERBATIM from city-plan.json's
 * `shared_kit.signage_tenants`.  Invented town, invented shops: no real
 * brands, no people, no human silhouettes anywhere in the kit.
 *
 * The seven machiya tenants each get a DISTINCT scheme — a different
 * fascia ground, a different ink, a different panel-joint count, a
 * different noren colour and character — so a street of seven shops
 * built from one generator does not read as one shop built seven times.
 * Every colour is a PAL role: amber (PAL.accent) is legal here because
 * shopfronts own it; blossom pink is not, and only the shrine entries
 * below touch it.
 *
 * THE ASPECT RULE is enforced at the geometry end: signage.* returns a
 * texture, and `printed(tex, width, ASPECT.x)` derives the height.  Never
 * size a sign face by hand.
 * ------------------------------------------------------------------ */

/** The seven shops of 宵坂通り, in the plan's order. */
export const TENANTS = Object.freeze({
  soba: {
    id: 'soba',
    title: '蕎麦 よいざか',
    sub: '手打ち',
    noren: '蕎麦',
    norenBg: PAL.trim,
    norenInk: PAL.paper,
    fasciaBg: PAL.paper,
    fasciaInk: PAL.trim,
    joints: 2,
    plateBg: PAL.paper,
    plateInk: PAL.ink,
    tab: PAL.accent,
  },
  dagashi: {
    id: 'dagashi',
    title: '駄菓子 ほしや',
    sub: 'こども',
    noren: '菓子',
    norenBg: PAL.accent,
    norenInk: PAL.ink,
    fasciaBg: TONE.cedarPale,
    fasciaInk: PAL.ink,
    joints: 1,
    plateBg: PAL.accent,
    plateInk: PAL.ink,
    tab: null,
  },
  hardware: {
    id: 'hardware',
    title: '金物 たけだ',
    sub: '金物商',
    noren: '金物',
    norenBg: PAL.groundDeep,
    norenInk: PAL.paper,
    fasciaBg: TONE.plasterShade,
    fasciaInk: PAL.ink,
    joints: 3,
    plateBg: PAL.groundDeep,
    plateInk: PAL.paper,
    tab: null,
  },
  florist: {
    id: 'florist',
    title: '花 このは',
    sub: '生花',
    noren: '花',
    norenBg: PAL.primary,
    norenInk: PAL.trim,
    fasciaBg: PAL.paper,
    fasciaInk: PAL.ink,
    joints: 0,
    plateBg: PAL.paper,
    plateInk: PAL.trim,
    tab: PAL.accent,
  },
  rice: {
    id: 'rice',
    title: '米屋 いなほ',
    sub: '精米',
    noren: '米',
    norenBg: TONE.cedar,
    norenInk: PAL.paper,
    fasciaBg: TONE.cedarPale,
    fasciaInk: PAL.trim,
    joints: 2,
    plateBg: TONE.cedarPale,
    plateInk: PAL.ink,
    tab: null,
  },
  kissaten: {
    id: 'kissaten',
    title: '喫茶 月見',
    sub: '珈琲',
    noren: '喫茶',
    norenBg: PAL.accent,
    norenInk: PAL.trim,
    fasciaBg: PAL.trim,
    fasciaInk: PAL.paper,
    joints: 0,
    plateBg: PAL.trim,
    plateInk: PAL.paper,
    tab: PAL.accent,
  },
  pharmacy: {
    id: 'pharmacy',
    title: '薬局 くすのき',
    sub: '調剤',
    noren: '薬',
    norenBg: PAL.trim,
    norenInk: PAL.paper,
    fasciaBg: PAL.primary,
    fasciaInk: PAL.trim,
    joints: 2,
    plateBg: PAL.primary,
    plateInk: PAL.ink,
    tab: null,
  },
});

export const TENANT_IDS = Object.freeze(Object.keys(TENANTS));

/** Resolve a tenant by id, or deterministically by index. */
export function tenantOf(key) {
  if (typeof key === 'number') return TENANTS[TENANT_IDS[((key % TENANT_IDS.length) + TENANT_IDS.length) % TENANT_IDS.length]];
  return TENANTS[key] ?? TENANTS.soba;
}

/* ---- tenant faces (native aspects noted, honoured by `printed`) ------ */

/** 6.4:1 — the frontage board over the shop doors. */
export const tenantFascia = (t) =>
  fascia({ title: t.title, sub: t.sub, bg: t.fasciaBg, ink: t.fasciaInk, panelJoints: t.joints });

/** 4:1 — the projecting side plate. */
export const tenantPlate = (t) =>
  signPlate({ title: t.title, sub: t.sub, bg: t.plateBg, ink: t.plateInk, accent: t.tab });

/** 2:1 — the noren over the doorway (genuinely transparent slits). */
export const tenantNoren = (t) => banner({ text: t.noren, bg: t.norenBg, ink: t.norenInk });

/* ---- the town's other named surfaces --------------------------------- */

/** 4:1 — 宵坂駅, the halt's name board. */
export const haltBoard = () =>
  signPlate({ title: '宵坂駅', sub: 'よいざか', bg: PAL.paper, ink: PAL.trim, accent: PAL.trim });

/** 3:4 — the halt's notice board, still carrying the summer poster. */
export const haltNotice = () =>
  noticeBoard({ lines: ['宵祭', '八月十四日', '広場にて', '日没より', '町内会'], bg: PAL.paper, ink: PAL.trim });

/** 3:4 — 夜間立入注意, the town's one visible admission. */
export const warningNotice = () =>
  noticeBoard({ lines: ['夜間立入注意', '日没後', '広場は', '立入禁止', '宵坂町内会'], bg: PAL.paper, ink: PAL.ink });

/** 4:1 — 宵坂神社, the shrine name plate. Blossom pink is the shrine's. */
export const shrinePlate = () =>
  signPlate({ title: '宵坂神社', sub: 'よいざかじんじゃ', bg: PAL.paper, ink: PAL.ink, accent: PAL.accentCool });

/** 3:4 — the shrine's ema rack notice. */
export const shrineNotice = () =>
  noticeBoard({ lines: ['御守', '一体 五百円', '社務所にて', '宵坂神社'], bg: PAL.paper, ink: PAL.ink });

/** 1:4 — 宵祭, the festival nobori. */
export const festivalNobori = () => banner({ text: '宵祭', bg: PAL.accent, ink: PAL.ink, vertical: true });

/** 2:1 — 宵祭, the festival banner over a stall. */
export const festivalBanner = () => banner({ text: '宵祭', bg: PAL.accent, ink: PAL.ink });

/** 4:1 — the phone box's functional label (a noun, not a tenant). */
export const phonePlate = () =>
  signPlate({ title: '公衆電話', bg: PAL.paper, ink: PAL.trim, border: true });

/** 4:1 — a stall's goods plate; `title` must come from the plan's table. */
export const stallPlate = (title, sub) =>
  signPlate({ title, sub, bg: PAL.paper, ink: PAL.ink, accent: PAL.accent });
