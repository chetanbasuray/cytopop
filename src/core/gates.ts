import { fromSpec, type Transform, type TransformSpec } from "./transforms";

/** A gate dimension: a parameter name plus the scale its coordinates are expressed in (display units 0..1). */
export interface Dimension {
  param: string;
  scale: TransformSpec;
}

/** A gate edge placed at a percentile of a control sample's population on that edge's parameter. */
export interface Threshold {
  sample: string; // file name of the control
  population: string; // population id, or "all"
  percentile: number;
}

export type Gate =
  | { kind: "range"; x: Dimension; min: number; max: number; threshold?: Threshold }
  | { kind: "rectangle"; x: Dimension; y: Dimension; xMin: number; xMax: number; yMin: number; yMax: number; xThreshold?: Threshold; yThreshold?: Threshold }
  | { kind: "polygon"; x: Dimension; y: Dimension; points: [number, number][] }
  | { kind: "ellipse"; x: Dimension; y: Dimension; cx: number; cy: number; rx: number; ry: number; angle: number };

export type Quadrant = "++" | "-+" | "--" | "+-";

/** Four rectangle gates meeting at (cx, cy), in display units. Names follow x-sign then y-sign. */
export function quadrants(x: Dimension, y: Dimension, cx: number, cy: number): Record<Quadrant, Gate> {
  // Finite stand-ins for "unbounded": JSON turns Infinity into null, which would break saved templates.
  const lo = -1e9;
  const hi = 1e9;
  const rect = (xMin: number, xMax: number, yMin: number, yMax: number): Gate => ({ kind: "rectangle", x, y, xMin, xMax, yMin, yMax });
  return {
    "++": rect(cx, hi, cy, hi),
    "-+": rect(lo, cx, cy, hi),
    "--": rect(lo, cx, lo, cy),
    "+-": rect(cx, hi, lo, cy),
  };
}

/** Edges at or beyond this are unbounded (quadrants use ±1e9). */
const OPEN = 1e8;

/** The one bounded edge of a half-open interval, as quadrant gates have on each axis. */
export function splitEdge(min: number, max: number): "min" | "max" | undefined {
  if (min > -OPEN && max >= OPEN) return "min";
  if (max < OPEN && min <= -OPEN) return "max";
  return undefined;
}

/** Percentile (0-100, linear interpolation) of the values where `mask` is set, ignoring NaN. */
export function percentileOf(values: Float32Array, mask: Uint8Array | undefined, p: number): number {
  const picked: number[] = [];
  for (let i = 0; i < values.length; i++) if ((!mask || mask[i]) && !Number.isNaN(values[i]!)) picked.push(values[i]!);
  if (!picked.length) return NaN;
  const v = Float64Array.from(picked).sort();
  const pos = (v.length - 1) * Math.min(100, Math.max(0, p)) / 100;
  const lo = Math.floor(pos);
  return v[lo]! + (v[Math.ceil(pos)]! - v[lo]!) * (pos - lo);
}

/**
 * Moves threshold edges to the values `resolve` returns, in display units of the edge's dimension.
 * A range gate's threshold is its lower edge; a quadrant rectangle's thresholds replace its bounded edge.
 * Edges whose control is unavailable (resolve returns undefined or NaN) keep their stored position.
 */
export function withThresholds(gate: Gate, resolve: (t: Threshold, dim: Dimension) => number | undefined): Gate {
  const at = (t: Threshold | undefined, dim: Dimension) => {
    const v = t ? resolve(t, dim) : undefined;
    return v === undefined || !Number.isFinite(v) ? undefined : v;
  };
  if (gate.kind === "range") {
    const v = at(gate.threshold, gate.x);
    return v === undefined ? gate : { ...gate, min: Math.min(v, gate.max) };
  }
  if (gate.kind !== "rectangle") return gate;
  let g = gate;
  const x = at(gate.xThreshold, gate.x);
  const xe = splitEdge(gate.xMin, gate.xMax);
  if (x !== undefined && xe) g = { ...g, [xe === "min" ? "xMin" : "xMax"]: x };
  const y = at(gate.yThreshold, gate.y);
  const ye = splitEdge(gate.yMin, gate.yMax);
  if (y !== undefined && ye) g = { ...g, [ye === "min" ? "yMin" : "yMax"]: y };
  return g;
}

export function pointInPolygon(px: number, py: number, points: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class GateError extends Error {
  override name = "GateError";
}

function column(names: string[], data: Float32Array[], dim: Dimension): { values: Float32Array; t: Transform } {
  const i = names.indexOf(dim.param);
  if (i < 0) throw new GateError(`Parameter ${dim.param} is not in the sample`);
  return { values: data[i]!, t: fromSpec(dim.scale) };
}

/**
 * Evaluates a gate over events where `within` is set (or all events) and returns a 0/1 mask.
 * Half-open bounds: min <= v < max, so quadrants never double count events on the dividing line.
 */
export function applyGate(gate: Gate, names: string[], data: Float32Array[], within?: Uint8Array): Uint8Array {
  const n = data[0]?.length ?? 0;
  const mask = new Uint8Array(n);
  const xc = column(names, data, gate.x);
  const yc = gate.kind === "range" ? undefined : column(names, data, gate.y);
  for (let e = 0; e < n; e++) {
    if (within && !within[e]) continue;
    const x = xc.t.forward(xc.values[e]!);
    let hit: boolean;
    switch (gate.kind) {
      case "range":
        hit = x >= gate.min && x < gate.max;
        break;
      case "rectangle": {
        const y = yc!.t.forward(yc!.values[e]!);
        // Templates saved by 0.1.0-beta.1 stored open quadrant edges as null; read null as unbounded.
        hit = x >= (gate.xMin ?? -Infinity) && x < (gate.xMax ?? Infinity) && y >= (gate.yMin ?? -Infinity) && y < (gate.yMax ?? Infinity);
        break;
      }
      case "polygon":
        hit = pointInPolygon(x, yc!.t.forward(yc!.values[e]!), gate.points);
        break;
      case "ellipse": {
        const y = yc!.t.forward(yc!.values[e]!);
        const cos = Math.cos(gate.angle);
        const sin = Math.sin(gate.angle);
        const dx = x - gate.cx;
        const dy = y - gate.cy;
        const u = (dx * cos + dy * sin) / gate.rx;
        const v = (-dx * sin + dy * cos) / gate.ry;
        hit = u * u + v * v <= 1;
        break;
      }
    }
    if (hit) mask[e] = 1;
  }
  return mask;
}
