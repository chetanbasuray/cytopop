import { expect, test } from "bun:test";
import type { FcsFile } from "../src/core/fcs";
import { compareSettings, findTime, flagUnstable } from "../src/core/qc";
import { count, evaluate } from "../src/core/populations";

const file = (keywords: Record<string, string>, params: [string, number][], spill?: number): FcsFile => ({
  version: "FCS3.1",
  keywords,
  parameters: params.map(([name, range], i) => ({ index: i + 1, name, range, bits: 32, amplification: [0, 0], gain: 1 })),
  eventCount: 0,
  data: params.map(() => new Float32Array(0)),
  ...(spill === undefined ? {} : { spillover: { parameters: ["FITC", "PE"], matrix: [[1, spill], [0, 1]] } }),
});

test("compareSettings flags differences and keeps equal settings quiet", () => {
  const a = file({ $CYT: "Lab A", $P2V: "450" }, [["FSC", 262144], ["FITC", 262144], ["PE", 262144]], 0.1);
  const b = file({ $CYT: "Lab A", $P2V: "500" }, [["FSC", 262144], ["FITC", 262144], ["PE", 1024]], 0.2);
  const c = file({ $CYT: "Lab A", $P2V: "450" }, [["FSC", 262144], ["FITC", 262144]], 0.1);
  const rows = compareSettings([a, b, c]);
  const row = (setting: string, parameter?: string) => rows.find((r) => r.setting === setting && r.parameter === parameter)!;

  expect(row("Cytometer").differs).toBe(false);
  expect(row("Spillover matrix").differs).toBe(true);
  expect(row("Voltage", "FITC")).toMatchObject({ values: ["450", "500", "450"], differs: true });
  expect(row("Voltage", "FSC")).toMatchObject({ values: [undefined, undefined, undefined], differs: false });
  expect(row("Range", "PE")).toMatchObject({ values: ["262144", "1024", undefined], differs: true });
  expect(row("Recorded", "PE")).toMatchObject({ values: ["yes", "yes", "no"], differs: true });
  expect(row("Gain", "FSC").differs).toBe(false);
});

test("compareSettings on identical files reports no differences", () => {
  const a = file({ $CYT: "X" }, [["FSC", 1024]]);
  expect(compareSettings([a, a]).some((r) => r.differs)).toBe(false);
});

test("flagUnstable finds a flow-rate surge, a signal shift and saturated events", () => {
  let s = 3;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const time: number[] = [], fl: number[] = [];
  for (let i = 0; i < 20000; i++) {
    const t = rand() * 1000;
    time.push(t);
    fl.push(1000 + 100 * (rand() - 0.5) + (t >= 700 && t < 720 ? 600 : 0)); // shift between t=700 and 720
  }
  for (let i = 0; i < 3000; i++) { time.push(400 + rand() * 20); fl.push(1000 + 100 * (rand() - 0.5)); } // surge
  for (let i = 0; i < 50; i++) { time.push(rand() * 1000); fl.push(5000); } // saturated at the top
  const names = ["Time", "FL1"];
  const { stable, report } = flagUnstable(names, [Float32Array.from(time), Float32Array.from(fl)], [undefined, 5000]);
  const flaggedWhere = (pred: (t: number, i: number) => boolean) => {
    let hit = 0, all = 0;
    time.forEach((t, i) => { if (pred(t, i)) { all++; hit += 1 - stable[i]!; } });
    return hit / all;
  };
  expect(report.timeParameter).toBe("Time");
  expect(flaggedWhere((t, i) => i >= 20000 && i < 23000)).toBeGreaterThan(0.95);
  expect(flaggedWhere((t, i) => i < 20000 && t >= 702 && t < 718)).toBeGreaterThan(0.95);
  expect(report.saturated).toBe(50);
  // Ordinary events stay: under 5% flagged outside the problem windows.
  expect(flaggedWhere((t, i) => i < 20000 && (t < 390 || t > 430) && (t < 690 || t > 730))).toBeLessThan(0.05);
});

test("flagUnstable leaves files without a time parameter alone", () => {
  const { stable, report } = flagUnstable(["FSC"], [Float32Array.from([1, 2, 3])]);
  expect(report.timeParameter).toBeUndefined();
  expect(Array.from(stable)).toEqual([1, 1, 1]);
  expect(findTime(["FSC", " TIME "])).toBe(1);
});

test("a clean gate keeps only stable events, inside its parent", () => {
  const n = 20000;
  const time = Float32Array.from({ length: n }, (_, i) => i);
  // Middle tenth of the run has its signal shifted far from the rest.
  const sig = Float32Array.from({ length: n }, (_, i) => 1000 + (i % 7) * 10 + (i >= 9000 && i < 11000 ? 5000 : 0));
  const names = ["Time", "FL1"], data = [time, sig];
  const masks = evaluate([
    { id: "s", name: "Stable", parentId: null, gate: { kind: "clean" } },
    { id: "f", name: "Flagged", parentId: null, gate: { kind: "boolean", op: "not", of: ["s"] } },
  ], names, data);
  const stable = masks.get("s")!, flagged = masks.get("f")!;
  expect(stable[0]).toBe(1);
  expect(stable[10000]).toBe(0);
  expect(count(stable) + count(flagged)).toBe(n);
  expect(count(flagged)).toBeGreaterThanOrEqual(2000);
  expect(count(flagged)).toBeLessThan(2600);
});

test("values piled at the top but far below the range are not saturated", () => {
  const n = 10000;
  const time = Float32Array.from({ length: n }, (_, i) => i);
  const fsc = Float32Array.from({ length: n }, (_, i) => 50000 + (i % 13) * 300); // discrete steps, top step is 1/13
  expect(flagUnstable(["Time", "FSC-A"], [time, fsc], [undefined, 262144]).report.saturated).toBe(0);
  expect(flagUnstable(["Time", "FSC-A"], [time, fsc]).report.saturated).toBe(0);
});
