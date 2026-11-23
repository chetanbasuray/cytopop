import { expect, test } from "bun:test";
import { CompensationError, compensate, spilloverFromControls, type ControlEvents } from "../src/core/compensation";

const detectors = ["FITC-A", "PE-A", "APC-A"];
const truth = [
  [1, 0.15, 0.01],
  [0.05, 1, 0.08],
  [0, 0.12, 1],
];

// Deterministic noise so the test is stable.
let seed = 7;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

/** Events whose true dye amounts are `dyes`, mixed through the known spillover, plus background. */
function sample(n: number, dyes: (e: number) => number[]): ControlEvents {
  const data = detectors.map(() => new Float32Array(n));
  for (let e = 0; e < n; e++) {
    const d = dyes(e);
    for (let j = 0; j < 3; j++) {
      let v = 100 + 20 * (rand() - 0.5); // background
      for (let i = 0; i < 3; i++) v += d[i]! * truth[i]![j]!;
      data[j]![e] = v;
    }
  }
  return { names: [...detectors], data };
}

const negative = sample(5000, () => [0, 0, 0]);
// Each control: half unstained, half stained with its dye at a spread of brightness.
const control = (k: number) => sample(4000, (e) => (e % 2 ? [0, 1, 2].map((i) => (i === k ? 2000 + 8000 * rand() : 0)) : [0, 0, 0]));

test("recovers a known spillover matrix from synthetic single-stain controls", () => {
  const s = spilloverFromControls(detectors, [control(0), control(1), control(2)], negative);
  expect(s.parameters).toEqual(detectors);
  s.matrix.forEach((row, i) => row.forEach((v, j) => expect(Math.abs(v - truth[i]![j]!)).toBeLessThan(0.01)));
  // Compensating a control with the result removes its spill into the other detectors.
  const fitc = control(0);
  const out = compensate(fitc.names, fitc.data, s);
  const mean = (keep: (e: number) => boolean) => {
    const ev = [...fitc.data[0]!.keys()].filter(keep);
    return ev.reduce((a, e) => a + out[1]![e]!, 0) / ev.length;
  };
  // Bright and unstained FITC events end up at the same PE level once the spill is removed.
  expect(Math.abs(mean((e) => fitc.data[0]![e]! > 5000) - mean((e) => fitc.data[0]![e]! < 200))).toBeLessThan(10);
});

test("a clean-up mask limits which control events are used", () => {
  const c = control(1);
  const junk = new Uint8Array(4000).fill(1);
  for (let e = 0; e < 200; e++) (c.data[0]![e] = 50000), (junk[e] = 0); // bright FITC debris, gated out
  const s = spilloverFromControls(detectors, [control(0), { ...c, mask: junk }, control(2)], negative);
  expect(Math.abs(s.matrix[1]![0]! - truth[1]![0]!)).toBeLessThan(0.01);
});

test("explains unusable controls", () => {
  expect(() => spilloverFromControls(detectors, [control(0)], negative)).toThrow("one control per detector");
  expect(() => spilloverFromControls(detectors, [control(0), negative, control(2)], negative)).toThrow(CompensationError);
  expect(() => spilloverFromControls(detectors, [control(0), control(1), { names: ["X"], data: [new Float32Array(1)] }], negative)).toThrow("has no APC-A");
});
