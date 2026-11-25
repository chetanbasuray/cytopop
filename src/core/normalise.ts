// Batch normalisation by quantile mapping: each channel of a batch is warped so its reference sample's
// percentiles land on the anchor reference's, piecewise-linear on the plot scale.

import { fromSpec, type TransformSpec } from "./transforms";

export const PERCENTILES = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);

/** One channel's warp: display-scale percentiles of the batch reference (`from`) and of the anchor reference (`to`). */
export interface ChannelMap {
  scale: TransformSpec;
  from: number[];
  to: number[];
}

export const METHOD = "Quantile mapping, 1st to 99th percentile on the plot scale";

/** Percentiles of a column's finite values on the given scale; empty when the column has none. */
export function displayQuantiles(col: Float32Array, scale: TransformSpec): number[] {
  const t = fromSpec(scale);
  const v: number[] = [];
  for (const x of col) if (Number.isFinite(x)) v.push(t.forward(x));
  if (!v.length) return [];
  v.sort((a, b) => a - b);
  return PERCENTILES.map((p) => v[Math.min(v.length - 1, Math.floor(p * v.length))]!);
}

/** Maps one display value through the warp; beyond the 1st and 99th percentile it shifts with the nearest end. */
export function warp(y: number, from: number[], to: number[]): number {
  const n = from.length;
  if (y <= from[0]!) return y + to[0]! - from[0]!;
  if (y >= from[n - 1]!) return y + to[n - 1]! - from[n - 1]!;
  let lo = 0, hi = n - 1; // from[lo] < y < from[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (from[mid]! <= y) lo = mid;
    else hi = mid;
  }
  const span = from[hi]! - from[lo]!;
  return span > 0 ? to[lo]! + ((y - from[lo]!) / span) * (to[hi]! - to[lo]!) : to[lo]!;
}

/** A copy of the column with every value warped on the map's scale and converted back to raw units. */
export function mapColumn(col: Float32Array, m: ChannelMap): Float32Array {
  const t = fromSpec(m.scale);
  const out = new Float32Array(col.length);
  for (let i = 0; i < col.length; i++) {
    const x = col[i]!;
    out[i] = Number.isFinite(x) ? t.inverse(warp(t.forward(x), m.from, m.to)) : x;
  }
  return out;
}

/** Event density over [0, 1] on the plot scale in `bins` bins, scaled so the tallest bin is 1. */
export function densityOf(col: Float32Array, scale: TransformSpec, bins = 64): number[] {
  const t = fromSpec(scale);
  const h = new Array<number>(bins).fill(0);
  for (const x of col) {
    if (!Number.isFinite(x)) continue;
    const b = Math.floor(t.forward(x) * bins);
    if (b >= 0 && b < bins) h[b]!++;
  }
  const max = Math.max(...h);
  return max ? h.map((c) => c / max) : h;
}

/** Densities of each batch reference before and after the warp onto the anchor reference, for the before/after plots. */
export function batchDensities(refs: { group: string; col: Float32Array }[], anchor: string, scale: TransformSpec): { group: string; before: number[]; after: number[] }[] {
  const to = displayQuantiles(refs.find((r) => r.group === anchor)?.col ?? new Float32Array(), scale);
  return refs.map(({ group, col }) => {
    const before = densityOf(col, scale);
    const from = displayQuantiles(col, scale);
    const mapped = group !== anchor && from.length && to.length;
    return { group, before, after: mapped ? densityOf(mapColumn(col, { scale, from, to }), scale) : before };
  });
}
