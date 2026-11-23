import { expect, test } from "bun:test";
import type { FcsFile } from "../src/core/fcs";
import { compareSettings } from "../src/core/qc";

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
