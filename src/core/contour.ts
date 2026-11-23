/** Counts points (u, v in [0, 1)) into a G×G grid. Points outside [0, 1) are skipped. `step` takes every step-th point. */
export function binGrid(us: ArrayLike<number>, vs: ArrayLike<number>, G: number, step = 1): Float64Array {
  const grid = new Float64Array(G * G);
  for (let k = 0; k < us.length; k += step) {
    const u = us[k]!, v = vs[k]!;
    if (u >= 0 && u < 1 && v >= 0 && v < 1) grid[Math.floor(v * G) * G + Math.floor(u * G)]! += 1;
  }
  return grid;
}

function blur1d(src: Float64Array, G: number, r: number, horizontal: boolean): Float64Array {
  const out = new Float64Array(G * G);
  const at = (line: number, k: number) => src[horizontal ? line * G + k : k * G + line]!;
  for (let line = 0; line < G; line++) {
    for (let k = 0; k < G; k++) {
      let sum = 0;
      for (let d = -r; d <= r; d++) sum += at(line, Math.min(G - 1, Math.max(0, k + d)));
      out[horizontal ? line * G + k : k * G + line] = sum / (2 * r + 1);
    }
  }
  return out;
}

/** Separable box blur of radius r (window 2r+1), applied twice, edges clamped (repeat the edge cell). Returns a new grid. */
export function smooth(grid: Float64Array, G: number, r = 1): Float64Array {
  let g = grid;
  for (let pass = 0; pass < 2; pass++) g = blur1d(blur1d(g, G, r, true), G, r, false);
  return g;
}

/**
 * Probability contour levels. Sort cell values descending and accumulate. For each p in step, 2*step, ... while p < 1,
 * the level is the smallest cell value among the cells whose cumulative sum reaches p of the total (the density threshold whose
 * enclosed cells hold fraction p of the mass). Return the levels sorted ascending, without duplicates and without zeros.
 * Empty grid returns [].
 */
export function probabilityLevels(grid: Float64Array, step: number): number[] {
  if (grid.length === 0) return [];

  const total = grid.reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const sorted = [...grid].sort((a, b) => b - a);
  const levels: number[] = [];
  let cum = 0;
  let idx = 0;

  for (let p = step; p < 1; p += step) {
    const target = p * total;
    while (idx < sorted.length && cum + sorted[idx]! < target) {
      cum += sorted[idx]!;
      idx++;
    }
    if (idx < sorted.length) {
      levels.push(sorted[idx]!);
    }
  }

  const unique = Array.from(new Set(levels)).filter(v => v !== 0).sort((a, b) => a - b);
  return unique;
}

/** Log-spaced levels: max/2, max/4, ... while the level is at least `floor` (default 0.5). Sorted ascending. Empty grid returns []. */
export function logLevels(grid: Float64Array, floor = 0.5): number[] {
  if (grid.length === 0) return [];
  let max = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]! > max) max = grid[i]!;
  }

  const levels: number[] = [];
  let val = max / 2;
  while (val >= floor) {
    levels.push(val);
    val /= 2;
  }

  return levels.sort((a, b) => a - b);
}

/**
 * Marching squares for one level. Cell corners are the grid points; each square between points (i, j), (i+1, j), (i+1, j+1), (i, j+1)
 * yields 0, 1 or 2 segments where values cross `level` (a corner is "inside" when value >= level). Edge crossing positions are
 * linearly interpolated. Saddle cases (5 and 10) are resolved with the average of the four corners. Coordinates are returned in
 * grid point units: x from 0 to G-1, y from 0 to G-1 (y up). Output is a flat array [x1, y1, x2, y2, x1, y1, ...].
 */
export function marchingSquares(grid: Float64Array, G: number, level: number): number[] {
  const out: number[] = [];
  // Point where the value crosses `level` between two grid points.
  const cross = (x0: number, y0: number, a: number, x1: number, y1: number, b: number): [number, number] => {
    const t = (level - a) / (b - a);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  const seg = (p: [number, number], q: [number, number]) => out.push(p[0], p[1], q[0], q[1]);
  for (let j = 0; j < G - 1; j++) {
    for (let i = 0; i < G - 1; i++) {
      const v00 = grid[j * G + i]!, v10 = grid[j * G + i + 1]!, v11 = grid[(j + 1) * G + i + 1]!, v01 = grid[(j + 1) * G + i]!;
      const in00 = v00 >= level, in10 = v10 >= level, in11 = v11 >= level, in01 = v01 >= level;
      const bottom = in00 !== in10 ? cross(i, j, v00, i + 1, j, v10) : undefined;
      const right = in10 !== in11 ? cross(i + 1, j, v10, i + 1, j + 1, v11) : undefined;
      const top = in01 !== in11 ? cross(i, j + 1, v01, i + 1, j + 1, v11) : undefined;
      const left = in00 !== in01 ? cross(i, j, v00, i, j + 1, v01) : undefined;
      if (bottom && right && top && left) {
        // Saddle: the centre value decides which pairs of corners are joined.
        const centreIn = (v00 + v10 + v11 + v01) / 4 >= level;
        if (centreIn === in00) { seg(bottom, right); seg(top, left); } // cuts off corners 10 and 01
        else { seg(left, bottom); seg(right, top); } // cuts off corners 00 and 11
        continue;
      }
      const pts = [bottom, right, top, left].filter((p): p is [number, number] => !!p);
      if (pts.length === 2) seg(pts[0]!, pts[1]!);
    }
  }
  return out;
}
