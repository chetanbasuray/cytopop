import { expect, test } from "bun:test";
import { applyGate, divider, hingedQuadrants, histogramDivider, type Arms, type Dimension, type Gate, type Quadrant } from "../src/core/gates";

const x: Dimension = { param: "A", scale: { kind: "linear", min: 0, max: 1 } };
const y: Dimension = { param: "B", scale: { kind: "linear", min: 0, max: 1 } };
const names = ["A", "B"];

/** Which gates each point falls in. */
function where(gates: Record<string, Gate>, points: [number, number][]): string[][] {
  const data = [Float32Array.from(points.map((p) => p[0])), Float32Array.from(points.map((p) => p[1]))];
  const masks = Object.entries(gates).map(([k, g]) => [k, applyGate(g, names, data)] as const);
  return points.map((_, i) => masks.filter(([, m]) => m[i]).map(([k]) => k));
}

const c: [number, number] = [0.5, 0.5];
const straight: Arms = {
  up: { origin: c, end: [0.5, 1] }, right: { origin: c, end: [1, 0.5] }, down: { origin: c, end: [0.5, 0] }, left: { origin: c, end: [0, 0.5] },
};

test("straight arms behave like plain quadrants, and every point lands in exactly one", () => {
  const q = hingedQuadrants(x, y, c, straight)!;
  const got = where(q, [[0.9, 0.9], [0.1, 0.9], [0.1, 0.1], [0.9, 0.1], [0.51, 0.49], [-5, 7], [3, -2]]);
  expect(got).toEqual([["++"], ["-+"], ["--"], ["+-"], ["+-"], ["-+"], ["+-"]]);
});

test("a hinged up arm leaning right moves points near it", () => {
  const q = hingedQuadrants(x, y, c, { ...straight, up: { origin: c, end: [0.75, 1] } })!;
  // (0.6, 0.9) is right of x = 0.5 but left of the arm through (0.5,0.5)-(0.75,1), which is at x = 0.7 there.
  expect(where(q, [[0.6, 0.9], [0.72, 0.9], [0.6, 0.6]])).toEqual([["-+"], ["++"], ["++"]]);
});

test("a staggered down arm splits the lower half at a different x", () => {
  const q = hingedQuadrants(x, y, c, { ...straight, down: { origin: [0.3, 0.5], end: [0.3, 0] } })!;
  expect(where(q, [[0.4, 0.2], [0.2, 0.2], [0.4, 0.8]])).toEqual([["+-"], ["--"], ["-+"]]);
});

test("arms pointing into the wrong half are rejected", () => {
  expect(hingedQuadrants(x, y, c, { ...straight, up: { origin: c, end: [0.9, 0.4] } })).toBeUndefined();
});

test("a divider splits a 2D plot into two sides", () => {
  const [l, r] = divider(x, y, [0, 0], [1, 1]);
  expect(where({ l, r }, [[0.2, 0.8], [0.8, 0.2], [0.49, 0.51], [0.51, 0.49]])).toEqual([["l"], ["r"], ["l"], ["r"]]);
});

test("a histogram divider puts the split value in the upper population", () => {
  const [lo, hi] = histogramDivider(x, 0.5);
  const data = [new Float32Array([0.2, 0.5, 0.9]), new Float32Array(3)];
  expect(Array.from(applyGate(lo, names, data))).toEqual([1, 0, 0]);
  expect(Array.from(applyGate(hi, names, data))).toEqual([0, 1, 1]);
});

// Typed so a renamed quadrant key fails to compile.
const _keys: Quadrant[] = ["++", "-+", "--", "+-"];
void _keys;
