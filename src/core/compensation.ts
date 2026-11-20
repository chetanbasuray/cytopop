import type { Spillover } from "./fcs";

export class CompensationError extends Error {
  override name = "CompensationError";
}

/** Gauss-Jordan inversion with partial pivoting. */
export function invert(matrix: number[][]): number[][] {
  const n = matrix.length;
  const a = matrix.map((row, i) => {
    if (row.length !== n) throw new CompensationError("Spillover matrix must be square");
    return [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))];
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) throw new CompensationError("Spillover matrix is singular");
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const row = a[col]!;
    const p = row[col]!;
    for (let j = 0; j < 2 * n; j++) row[j] = row[j]! / p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const other = a[r]!;
      const factor = other[col]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) other[j] = other[j]! - factor * row[j]!;
    }
  }
  return a.map((row) => row.slice(n));
}

/**
 * Returns compensated columns: observed (row vector over the spillover detectors) times the inverse
 * spillover matrix. Columns not named in the spillover are returned unchanged (same array).
 */
export function compensate(names: string[], data: Float32Array[], spill: Spillover): Float32Array[] {
  const idx = spill.parameters.map((p) => {
    const i = names.indexOf(p);
    if (i < 0) throw new CompensationError(`Spillover parameter ${p} is not in the sample`);
    return i;
  });
  const inv = invert(spill.matrix);
  const n = idx.length;
  const events = data[0]?.length ?? 0;
  const out = data.slice();
  const sources = idx.map((i) => data[i]!);
  const targets = idx.map(() => new Float32Array(events));
  const observed = new Float64Array(n);
  for (let e = 0; e < events; e++) {
    for (let k = 0; k < n; k++) observed[k] = sources[k]![e]!;
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += observed[k]! * inv[k]![j]!;
      targets[j]![e] = sum;
    }
  }
  idx.forEach((i, k) => (out[i] = targets[k]!));
  return out;
}
