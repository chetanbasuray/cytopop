import { expect, test } from "bun:test";
import { percentileOf, quadrants, splitEdge, withThresholds, type Dimension, type Gate } from "../src/core/gates";

const lin: Dimension = { param: "A", scale: { kind: "linear", min: 0, max: 100 } };
const linY: Dimension = { param: "B", scale: { kind: "linear", min: 0, max: 100 } };

test("percentile of a masked population ignores NaN", () => {
  const v = new Float32Array([1, 2, 3, 4, 5, NaN, 1000]);
  expect(percentileOf(v, undefined, 50)).toBe(3.5);
  expect(percentileOf(v, new Uint8Array([1, 1, 1, 1, 1, 1, 0]), 100)).toBe(5);
  expect(percentileOf(v, new Uint8Array([1, 1, 1, 1, 1, 0, 0]), 99)).toBeCloseTo(4.96);
  expect(percentileOf(v, new Uint8Array(7), 99)).toBeNaN();
});

test("a range gate's lower edge follows its threshold", () => {
  const g: Gate = { kind: "range", x: lin, min: 0.1, max: 0.9, threshold: { sample: "c.fcs", population: "all", percentile: 99 } };
  expect(withThresholds(g, () => 0.4)).toMatchObject({ min: 0.4, max: 0.9 });
  expect(withThresholds(g, () => 0.95)).toMatchObject({ min: 0.9 });
  expect(withThresholds(g, () => undefined)).toBe(g);
  expect(withThresholds({ ...g, threshold: undefined }, () => 0.4)).toMatchObject({ min: 0.1 });
});

test("quadrant rectangles move their bounded edge on each axis", () => {
  const q = quadrants(lin, linY, 0.5, 0.5);
  const t = { sample: "c.fcs", population: "all", percentile: 99 };
  const resolve = (_: unknown, d: Dimension) => (d.param === "A" ? 0.3 : 0.7);
  const pp = withThresholds({ ...q["++"], xThreshold: t, yThreshold: t } as Gate, resolve);
  const mm = withThresholds({ ...q["--"], xThreshold: t, yThreshold: t } as Gate, resolve);
  expect(pp).toMatchObject({ xMin: 0.3, xMax: 1e9, yMin: 0.7, yMax: 1e9 });
  expect(mm).toMatchObject({ xMin: -1e9, xMax: 0.3, yMin: -1e9, yMax: 0.7 });
  expect(splitEdge(0.2, 0.8)).toBeUndefined();
});
