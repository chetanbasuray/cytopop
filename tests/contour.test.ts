import { expect, test } from "bun:test";
import { binGrid, logLevels, marchingSquares, probabilityLevels, smooth } from "../src/core/contour";

test("binGrid counts points with row 0 at the bottom and skips out-of-range points", () => {
  const g = binGrid([0.1, 0.9, 0.9, 1.2], [0.1, 0.9, 0.9, 0.5], 2);
  expect(Array.from(g)).toEqual([1, 0, 0, 2]);
  expect(Array.from(binGrid([0.1, 0.1, 0.1, 0.1], [0.1, 0.1, 0.1, 0.1], 2, 2))).toEqual([2, 0, 0, 0]);
});

test("smooth keeps a flat grid flat and spreads a peak symmetrically", () => {
  expect(Array.from(smooth(new Float64Array(25).fill(3), 5))).toEqual(new Array(25).fill(3));
  const peak = new Float64Array(49);
  peak[24] = 81; // centre of 7×7
  const s = smooth(peak, 7);
  expect(s[24]).toBeGreaterThan(s[23]!);
  expect(s[23]).toBeCloseTo(s[25]!);
  expect(s[17]).toBeCloseTo(s[31]!);
  expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(81);
});

test("probability levels enclose the requested share of events", () => {
  const g = Float64Array.from([10, 20, 30, 40]); // total 100
  expect(probabilityLevels(g, 0.25)).toEqual([20, 30, 40]);
  expect(probabilityLevels(new Float64Array(4), 0.05)).toEqual([]);
});

test("log levels halve from the maximum down to the floor", () => {
  expect(logLevels(Float64Array.from([0, 8, 1]))).toEqual([0.5, 1, 2, 4]);
  expect(logLevels(new Float64Array(3))).toEqual([]);
});

test("marching squares draws a closed ring around a peak and nothing outside the range", () => {
  const G = 5, g = new Float64Array(G * G);
  g[2 * G + 2] = 10;
  const segs = marchingSquares(g, G, 5);
  expect(segs.length).toBe(4 * 4); // four segments around the single high point
  const xs = segs.filter((_, k) => k % 2 === 0), ys = segs.filter((_, k) => k % 2 === 1);
  expect(Math.min(...xs)).toBeCloseTo(1.5);
  expect(Math.max(...xs)).toBeCloseTo(2.5);
  expect(Math.min(...ys)).toBeCloseTo(1.5);
  expect(Math.max(...ys)).toBeCloseTo(2.5);
  expect(marchingSquares(g, G, 20)).toEqual([]);
});

test("marching squares resolves a saddle with the centre value", () => {
  const g = Float64Array.from([10, 0, 0, 10]); // 2×2, corners 00 and 11 high
  expect(marchingSquares(g, 2, 4).length).toBe(8); // centre 5 >= 4: high corners joined, two segments
  expect(marchingSquares(g, 2, 6).length).toBe(8); // centre 5 < 6: high corners separate, two segments
  const joined = marchingSquares(g, 2, 4), apart = marchingSquares(g, 2, 6);
  expect(joined).not.toEqual(apart);
});
