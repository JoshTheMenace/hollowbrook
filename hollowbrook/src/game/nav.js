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
