import { fromSpec, type Transform, type TransformSpec } from "./transforms";

/** A gate dimension: a parameter name plus the scale its coordinates are expressed in (display units 0..1). */
export interface Dimension {
  param: string;
  scale: TransformSpec;
}

export type Gate =
  | { kind: "range"; x: Dimension; min: number; max: number }
  | { kind: "rectangle"; x: Dimension; y: Dimension; xMin: number; xMax: number; yMin: number; yMax: number }
  | { kind: "polygon"; x: Dimension; y: Dimension; points: [number, number][] }
  | { kind: "ellipse"; x: Dimension; y: Dimension; cx: number; cy: number; rx: number; ry: number; angle: number };

export type Quadrant = "++" | "-+" | "--" | "+-";

/** Four rectangle gates meeting at (cx, cy), in display units. Names follow x-sign then y-sign. */
export function quadrants(x: Dimension, y: Dimension, cx: number, cy: number): Record<Quadrant, Gate> {
  const lo = -Infinity;
  const hi = Infinity;
  const rect = (xMin: number, xMax: number, yMin: number, yMax: number): Gate => ({ kind: "rectangle", x, y, xMin, xMax, yMin, yMax });
  return {
    "++": rect(cx, hi, cy, hi),
    "-+": rect(lo, cx, cy, hi),
    "--": rect(lo, cx, lo, cy),
    "+-": rect(cx, hi, lo, cy),
  };
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
        hit = x >= gate.xMin && x < gate.xMax && y >= gate.yMin && y < gate.yMax;
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
