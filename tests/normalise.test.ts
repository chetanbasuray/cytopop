import { expect, test } from "bun:test";
import { displayQuantiles, mapColumn, warp } from "../src/core/normalise";

const lin = { kind: "linear", min: 0, max: 100 } as const;

test("warp is piecewise-linear inside the percentiles and shifts outside them", () => {
  const from = [0.1, 0.5, 0.9], to = [0.2, 0.4, 1.0];
  expect(warp(0.3, from, to)).toBeCloseTo(0.3);
  expect(warp(0.7, from, to)).toBeCloseTo(0.7);
  expect(warp(0.05, from, to)).toBeCloseTo(0.15);
  expect(warp(0.95, from, to)).toBeCloseTo(1.05);
  expect(warp(0.5, [0.5, 0.5, 0.9], [0.3, 0.6, 0.9])).toBeCloseTo(0.3); // ties do not divide by zero
});

test("a batch shifted by a constant lands on the anchor after mapping", () => {
  const anchor = Float32Array.from({ length: 1000 }, (_, i) => 20 + (i % 100) * 0.5);
  const batch = anchor.map((x) => x + 10);
  const m = { scale: lin, from: displayQuantiles(batch, lin), to: displayQuantiles(anchor, lin) };
  const mapped = mapColumn(batch, m);
  expect(displayQuantiles(mapped, lin)[49]).toBeCloseTo(displayQuantiles(anchor, lin)[49]!, 5);
  expect(mapColumn(Float32Array.of(NaN), m)[0]).toBeNaN();
  expect(displayQuantiles(Float32Array.of(NaN), lin)).toEqual([]);
});

test("batch densities leave the anchor alone and move the other batch onto it", async () => {
  const { batchDensities } = await import("../src/core/normalise");
  const anchor = Float32Array.from({ length: 2000 }, (_, i) => 20 + (i % 10));
  const shifted = anchor.map((x) => x + 30);
  const [a, b] = batchDensities([{ group: "Day 1", col: anchor }, { group: "Day 2", col: shifted }], "Day 1", lin);
  expect(a!.after).toEqual(a!.before);
  const peak = (h: number[]) => h.indexOf(Math.max(...h));
  expect(Math.abs(peak(b!.after) - peak(a!.before))).toBeLessThanOrEqual(1);
  expect(peak(b!.before)).toBeGreaterThan(peak(a!.before) + 10);
});
