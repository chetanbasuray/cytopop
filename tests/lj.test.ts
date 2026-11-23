import { expect, test } from "bun:test";
import { leveyJennings, runDate } from "../src/core/lj";

test("runDate reads $DATE and $BTIM as UTC", () => {
  expect(runDate({ $DATE: "05-MAR-2026", $BTIM: "14:07:30.25" })?.toISOString()).toBe("2026-03-05T14:07:30.000Z");
  expect(runDate({ $DATE: "5-mar-2026" })?.toISOString()).toBe("2026-03-05T00:00:00.000Z");
  expect(runDate({ $DATE: "2026-03-05" })).toBeUndefined();
  expect(runDate({ $DATE: "05-XYZ-2026" })).toBeUndefined();
  expect(runDate({})).toBeUndefined();
});

test("leveyJennings uses the baseline for limits and flags 2 and 3 SD", () => {
  const chart = leveyJennings([98, 102, 100, 99, 101, 103.5, 105, 97, NaN], 5);
  expect(chart.mean).toBe(100);
  expect(chart.sd).toBeCloseTo(Math.sqrt(2.5));
  expect(chart.points.map((p) => p.flag)).toEqual(["ok", "ok", "ok", "ok", "ok", "warn", "fail", "ok", "ok"]);
  expect(Number.isNaN(chart.points[8]!.z)).toBe(true);
});

test("leveyJennings with one baseline value has no limits and flags nothing", () => {
  const chart = leveyJennings([100, 500], 1);
  expect(Number.isNaN(chart.sd)).toBe(true);
  expect(chart.points.every((p) => p.flag === "ok")).toBe(true);
});
