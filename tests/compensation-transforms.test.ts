import { expect, test } from "bun:test";
import { CompensationError, compensate, invert } from "../src/core/compensation";
import { arcsinh, fromSpec, linear, log, logicle } from "../src/core/transforms";

test("invert returns the inverse matrix", () => {
  const inv = invert([
    [1, 0.2],
    [0.1, 1],
  ]);
  const det = 1 - 0.02;
  expect(inv[0]![0]).toBeCloseTo(1 / det);
  expect(inv[0]![1]).toBeCloseTo(-0.2 / det);
  expect(() => invert([[1, 2], [2, 4]])).toThrow(CompensationError);
});

test("compensation removes spillover and leaves other channels alone", () => {
  // True signals: FITC=1000, PE=0. FITC spills 20% into PE.
  const spill = { parameters: ["FITC", "PE"], matrix: [[1, 0.2], [0, 1]] };
  const fsc = new Float32Array([5]);
  const out = compensate(["FSC", "FITC", "PE"], [fsc, new Float32Array([1000]), new Float32Array([200])], spill);
  expect(out[0]).toBe(fsc);
  expect(out[1]![0]).toBeCloseTo(1000);
  expect(out[2]![0]).toBeCloseTo(0, 3);
  expect(() => compensate(["FSC"], [fsc], spill)).toThrow(CompensationError);
});

test("logicle maps 0 to the linear zero point and T to 1, and round-trips", () => {
  const t = logicle(262144, 0.5, 4.5, 0);
  expect(t.forward(262144)).toBeCloseTo(1, 6);
  expect(t.forward(0)).toBeCloseTo(0.5 / 4.5, 6);
  for (const x of [-500, -10, 0, 3, 120, 5000, 100000]) {
    expect(t.inverse(t.forward(x))).toBeCloseTo(x, 2);
  }
  expect(t.forward(-100)).toBeLessThan(t.forward(0));
  expect(() => logicle(262144, 3, 4.5, 0)).toThrow(RangeError);
});

test("logicle with W = 0 behaves like a pure log above zero", () => {
  const t = logicle(10000, 0, 4, 0);
  expect(t.forward(10000)).toBeCloseTo(1, 6);
  expect(t.forward(100)).toBeCloseTo(0.5, 2);
});

test("linear, log, arcsinh round trip and fromSpec rebuilds", () => {
  for (const t of [linear(-100, 1000), log(1, 1e5), arcsinh(150, -1000, 262144)]) {
    expect(t.inverse(t.forward(420))).toBeCloseTo(420, 3);
    expect(fromSpec(t.spec).forward(420)).toBeCloseTo(t.forward(420));
  }
  expect(log(1, 1e4).forward(100)).toBeCloseTo(0.5);
  expect(log(1, 1e4).forward(-5)).toBe(0);
});
