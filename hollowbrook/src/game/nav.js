/* ------------------------------------------------------------------ *
 * NAV — the enemies walk the flood fill's own grid.
 *
 * The town's route gate (check-city.mjs) proves the town is walkable with a
 * BFS on a 0.35 m grid at the walker's numbers: radius 0.34 inflating every
 * collider, a step limit of 0.38 m per stride, visited keyed on height.
 * Every cell that fill marks walkable is a cell the player can reach — so
 * it is the ONLY nav grid this game should have.  A second pathfinding
 * representation would be a second world that no gate looks at.
 *
 * Pure data + pure functions, no THREE, no DOM: the headless siege sim and
 * the browser game share it.  Descent is free and ascent is step-limited,
 * exactly as the walker moves, so the grid is DIRECTED: a flow field is
 * computed by a reverse BFS that only crosses an edge the walker could take
 * in the forward direction.
 * ------------------------------------------------------------------ */

export const NAV = Object.freeze({ cell: 0.35, radius: 0.34, step: 0.38 });

export function buildNavGrid({ colliders, groundAt, rect, cell = NAV.cell, radius = NAV.radius }) {
  const W = Math.floor((rect.x1 - rect.x0) / cell) + 1;
  const D = Math.floor((rect.z1 - rect.z0) / cell) + 1;
  // bucket the colliders once — a per-cell scan of all of them is quadratic
  const GRID = 4;
  const buckets = new Map();
  const key = (i, j) => i * 100000 + j;
  for (const c of colliders) {
    for (let i = Math.floor((c.x0 - radius) / GRID); i <= Math.floor((c.x1 + radius) / GRID); i += 1) {
      for (let j = Math.floor((c.z0 - radius) / GRID); j <= Math.floor((c.z1 + radius) / GRID); j += 1) {
        const k = key(i, j);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(c);
      }
    }
  }
  const blocked = (x, z) => {
    const list = buckets.get(key(Math.floor(x / GRID), Math.floor(z / GRID)));
    if (!list) return false;
    for (const c of list) if (x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius) return true;
    return false;
  };
  const open = new Uint8Array(W * D);
  const y = new Float32Array(W * D);
  for (let j = 0; j < D; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const x = rect.x0 + i * cell;
      const z = rect.z0 + j * cell;
      const n = j * W + i;
      y[n] = groundAt(x, z);
      open[n] = blocked(x, z) ? 0 : 1;
    }
  }
  const grid = {
    W, D, cell, rect, open, y,
    toCell: (x, z) => [Math.round((x - rect.x0) / cell), Math.round((z - rect.z0) / cell)],
    toWorld: (i, j) => [rect.x0 + i * cell, rect.z0 + j * cell],
    index: (i, j) => j * W + i,
    inside: (i, j) => i >= 0 && j >= 0 && i < W && j < D,
  };
  return grid;
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Can a walker standing on cell a step onto neighbour b? (ascent-limited) */
export function canStep(grid, a, b, step = NAV.step) {
  return grid.open[b] === 1 && grid.y[b] - grid.y[a] <= step;
}

/** Every cell reachable FROM (x, z), as a Uint8Array mask. */
export function reachableFrom(grid, x, z, step = NAV.step) {
  const [si, sj] = grid.toCell(x, z);
  const seen = new Uint8Array(grid.W * grid.D);
  if (!grid.inside(si, sj) || !grid.open[grid.index(si, sj)]) return seen;
  const q = [grid.index(si, sj)];
  seen[q[0]] = 1;
  while (q.length) {
    const n = q.pop();
    const i = n % grid.W;
    const j = (n - i) / grid.W;
    for (const [di, dj] of NB) {
      const ni = i + di;
      const nj = j + dj;
      if (!grid.inside(ni, nj)) continue;
      const m = grid.index(ni, nj);
      if (seen[m] || !canStep(grid, n, m, step)) continue;
      seen[m] = 1;
      q.push(m);
    }
  }
  return seen;
}

/** Nearest open cell to (x, z) within `r` metres, as [i, j] or null. */
export function nearestOpen(grid, x, z, r = 2, fromY = null, step = NAV.step) {
  const [ci, cj] = grid.toCell(x, z);
  const n = Math.ceil(r / grid.cell);
  let best = null;
  let bd = Infinity;
  for (let dj = -n; dj <= n; dj += 1) {
    for (let di = -n; di <= n; di += 1) {
      const i = ci + di;
      const j = cj + dj;
      if (!grid.inside(i, j) || !grid.open[grid.index(i, j)]) continue;
      // a body at the foot of a bank must not be given a cell halfway up it:
      // the level the feet are on is the level the path starts from
      if (fromY !== null && Math.abs(grid.y[grid.index(i, j)] - fromY) > step) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = [i, j]; }
    }
  }
  return best;
}

/**
 * Can a walker go straight from a to b?  Samples the segment at a third of
 * a cell, every sample open, every rise within `step`.  Descent is free.
 * Used to smooth A* paths and to let a body cut a corner it can actually
 * cut — the 4-connected grid cannot express a diagonal on its own.
 */
export function lineOpen(grid, ax, az, bx, bz, step = NAV.step, halfWidth = 0.3) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1e-6) return true;
  const n = Math.max(1, Math.ceil(len / (grid.cell / 3)));
  // a corridor, not a hairline: the body is 0.68 m wide and a line that
  // hugs a scarp edge leaves half of it over the drop — and the three
  // rails must agree with each other at every station, or the line runs
  // along a lateral cliff (a stair's edge beside its gutter)
  const px = -(bz - az) / len * halfWidth; const pz = (bx - ax) / len * halfWidth;
  const rails = [[0, 0], [px, pz], [-px, -pz]];
  const prev = [null, null, null];
  for (let s = 0; s <= n; s += 1) {
    const t = s / n;
    let lo = Infinity; let hi = -Infinity;
    for (let r = 0; r < 3; r += 1) {
      const [ox, oz] = rails[r];
      const [i, j] = grid.toCell(ax + ox + (bx - ax) * t, az + oz + (bz - az) * t);
      if (!grid.inside(i, j)) return false;
      const m = grid.index(i, j);
      if (!grid.open[m]) return false;
      const y = grid.y[m];
      // neither a climb over the step nor a drop over it: a smoothed line
      // must not cross a cliff edge that the cell path never crossed
      if (prev[r] !== null && Math.abs(y - prev[r]) > step) return false;
      prev[r] = y;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    if (hi - lo > step) return false;
  }
  return true;
}

/* A binary min-heap over (cost, index) pairs for A*. */
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.v.length; }
  push(key, val) {
    const k = this.k; const v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k; const v = this.v;
    const top = v[0];
    const lk = k.pop(); const lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1; const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* from (ax, az) to (bx, bz) over the directed grid (ascent step-limited,
 * descent free), 4-connected, Manhattan heuristic.  Returns a list of world
 * points [[x, z], ...] from the first step to the goal (smoothed by
 * `lineOpen` so a body walks diagonals it can actually walk), or null when
 * no route exists.  `maxNodes` bounds the search so a sealed target cannot
 * stall a frame — a null path is a result the caller must handle.
 */
export function astar(grid, ax, az, bx, bz, { step = NAV.step, maxNodes = 60000, smooth = true, fromY = null } = {}) {
  const s = nearestOpen(grid, ax, az, 1.2, fromY, step) ?? nearestOpen(grid, ax, az, 1.2);
  const g = nearestOpen(grid, bx, bz, 1.5);
  if (!s || !g) return null;
  const start = grid.index(s[0], s[1]);
  const goal = grid.index(g[0], g[1]);
  if (start === goal) return [[bx, bz]];
  const W = grid.W;
  const gCost = new Map();
  const came = new Map();
  const closed = new Set();
  const h = (n) => { const i = n % W; const j = (n - i) / W; return Math.abs(i - g[0]) + Math.abs(j - g[1]); };
  const heap = new Heap();
  gCost.set(start, 0);
  heap.push(h(start), start);
  let expanded = 0;
  let found = false;
  while (heap.size) {
    const n = heap.pop();
    if (closed.has(n)) continue;
    if (n === goal) { found = true; break; }
    closed.add(n);
    if (++expanded > maxNodes) break;
    const i = n % W;
    const j = (n - i) / W;
    const gn = gCost.get(n);
    for (const [di, dj] of NB) {
      const ni = i + di;
      const nj = j + dj;
      if (!grid.inside(ni, nj)) continue;
      const m = grid.index(ni, nj);
      if (closed.has(m) || !canStep(grid, n, m, step)) continue;
      // a climb costs a little more than a stride so routes prefer the flat,
      // and a cell on the lip of a drop (a tread's edge beside its gutter, a
      // rim over the square) costs more still: a body following a path down
      // an edge row drifts half a radius over it and falls off the route
      const rise = Math.max(0, grid.y[m] - grid.y[n]);
      const c = gn + 1 + rise * 2 + edgeCost(grid, m, mi_i(m, W), step);
      if (c < (gCost.get(m) ?? Infinity)) {
        gCost.set(m, c);
        came.set(m, n);
        heap.push(c + h(m), m);
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let n = goal; n !== start; n = came.get(n)) cells.push(n);
  cells.reverse();
  let pts = cells.map((n) => { const i = n % W; return grid.toWorld(i, (n - i) / W); });
  pts[pts.length - 1] = [bx, bz];
  if (smooth && pts.length > 2) {
    const out = [];
    let from = [ax, az];
    let k = 0;
    while (k < pts.length) {
      // furthest point straight-walkable from `from`, within 8 m
      let best = k;
      for (let q = k + 1; q < pts.length; q += 1) {
        if (Math.hypot(pts[q][0] - from[0], pts[q][1] - from[1]) > 8) break;
        if (lineOpen(grid, from[0], from[1], pts[q][0], pts[q][1], step)) best = q;
      }
      out.push(pts[best]);
      from = pts[best];
      k = best + 1;
    }
    pts = out;
  }
  return pts;
}

const mi_i = (m, W) => m % W;
function edgeCost(grid, m, i, step) {
  const j = (m - i) / grid.W;
  const y = grid.y[m];
  for (const [di, dj] of NB) {
    const ni = i + di; const nj = j + dj;
    if (!grid.inside(ni, nj)) return 2;
    const k = grid.index(ni, nj);
    if (!grid.open[k] || Math.abs(grid.y[k] - y) > step) return 2;
  }
  return 0;
}

/**
 * A flow field TOWARD a target: dist[n] = grid steps from n to the target
 * along edges the walker could take, and next[n] = the neighbour index to
 * move to (or -1).  Reverse BFS: an edge b -> a is usable if a walker at b
 * could step to a, i.e. canStep(b, a).
 */
export function flowToward(grid, x, z, step = NAV.step) {
  const [ti, tj] = grid.toCell(x, z);
  const N = grid.W * grid.D;
  const dist = new Int32Array(N).fill(-1);
  const next = new Int32Array(N).fill(-1);
  if (!grid.inside(ti, tj) || !grid.open[grid.index(ti, tj)]) return { dist, next };
  const t = grid.index(ti, tj);
  dist[t] = 0;
  const q = [t];
  let head = 0;
  while (head < q.length) {
    const a = q[head++];
    const i = a % grid.W;
    const j = (a - i) / grid.W;
    for (const [di, dj] of NB) {
      const bi = i + di;
      const bj = j + dj;
      if (!grid.inside(bi, bj)) continue;
      const b = grid.index(bi, bj);
      if (dist[b] >= 0 || !canStep(grid, b, a, step)) continue;
      dist[b] = dist[a] + 1;
      next[b] = a;
      q.push(b);
    }
  }
  return { dist, next };
}
