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

/** True for a well-formed square spillover matrix (used to check templates loaded from disk). */
export function isSpillover(x: unknown): x is Spillover {
  if (!x || typeof x !== "object") return false;
  const { parameters, matrix } = x as Spillover;
  return (
    Array.isArray(parameters) && parameters.every((p) => typeof p === "string") &&
    Array.isArray(matrix) && matrix.length === parameters.length &&
    matrix.every((row) => Array.isArray(row) && row.length === parameters.length && row.every((v) => typeof v === "number" && Number.isFinite(v)))
  );
}

/** The edited matrix wins for every sample that has all of its detectors; otherwise the file's own. */
export function spilloverFor(names: string[], own: Spillover | undefined, edited: Spillover | undefined): Spillover | undefined {
  return edited && edited.parameters.every((p) => names.includes(p)) ? edited : own;
}

/** Events of one sample to use in a compensation calculation: its uncompensated columns and an optional clean-up mask. */
export interface ControlEvents {
  names: string[];
  data: Float32Array[];
  mask?: Uint8Array;
}

function median(values: number[]): number {
  if (!values.length) return NaN;
  const v = Float64Array.from(values).sort();
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

function picked(c: ControlEvents, col: number, keep: (e: number) => boolean = () => true): number[] {
  const out: number[] = [];
  const values = c.data[col]!;
  for (let e = 0; e < values.length; e++) if ((!c.mask || c.mask[e]) && keep(e)) out.push(values[e]!);
  return out;
}

function columnOf(c: ControlEvents, detector: string, what: string): number {
  const i = c.names.indexOf(detector);
  if (i < 0) throw new CompensationError(`${what} has no ${detector} parameter`);
  return i;
}

/**
 * Spillover matrix from single-stain controls, one per detector, and a negative (unstained or universal negative).
 * A control's positive events are those brighter on its own detector than the negative's 99.5th percentile there.
 * Row i is how much dye i shows up in each detector, relative to its own detector:
 *   S[i][j] = (median of positives in j − median of negative in j) / (same on detector i).
 */
export function spilloverFromControls(detectors: string[], controls: ControlEvents[], negative: ControlEvents): Spillover {
  if (controls.length !== detectors.length) throw new CompensationError("Assign one control per detector");
  const negMedian = detectors.map((d) => median(picked(negative, columnOf(negative, d, "The negative"))));
  const matrix = detectors.map((d, i) => {
    const c = controls[i]!;
    const own = columnOf(c, d, `The ${d} control`);
    const negOwn = picked(negative, columnOf(negative, d, "The negative")).sort((a, b) => a - b);
    const cut = negOwn[Math.min(negOwn.length - 1, Math.floor(negOwn.length * 0.995))];
    if (cut === undefined) throw new CompensationError("The negative has no events");
    const isPos = (e: number) => c.data[own]![e]! > cut;
    const pos = picked(c, own, isPos);
    // About 0.5 % of negative-like events pass the cut by chance; require clearly more than that.
    if (pos.length < Math.max(10, 0.01 * picked(c, own).length)) throw new CompensationError(`The ${d} control has too few events brighter than the negative`);
    const signal = median(pos) - negMedian[i]!;
    return detectors.map((dj, j) => (i === j ? 1 : (median(picked(c, columnOf(c, dj, `The ${d} control`), isPos)) - negMedian[j]!) / signal));
  });
  return { parameters: [...detectors], matrix };
}
