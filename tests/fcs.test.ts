import { expect, test } from "bun:test";
import { FcsError, parseFcs, parseSpillover } from "../src/core/fcs";
import { writeFcs } from "./helpers/writeFcs";

const events = [
  [1, 2, 3],
  [4, 5, 6],
  [7.5, 8.25, 9],
  [0, -1, 100],
  [1000, 2000, 3000],
];

test("float32 little endian round trip", () => {
  const f = parseFcs(writeFcs({ names: ["FSC-A", "SSC-A", "CD3"], events }));
  expect(f.version).toBe("FCS3.1");
  expect(f.eventCount).toBe(5);
  expect(f.parameters.map((p) => p.name)).toEqual(["FSC-A", "SSC-A", "CD3"]);
  expect(Array.from(f.data[2]!)).toEqual([3, 6, 9, 100, 3000]);
  expect(f.data[1]![2]).toBeCloseTo(8.25);
});

test("float32 big endian", () => {
  const f = parseFcs(writeFcs({ names: ["A", "B", "C"], events, byteord: "4,3,2,1" }));
  expect(Array.from(f.data[0]!)).toEqual([1, 4, 7.5, 0, 1000]);
});

test("16-bit integers are masked to a power-of-two range", () => {
  const f = parseFcs(writeFcs({ names: ["A"], events: [[1025], [3]], datatype: "I", bits: 16, range: 1024 }));
  expect(Array.from(f.data[0]!)).toEqual([1, 3]);
});

test("log amplification", () => {
  const f = parseFcs(
    writeFcs({ names: ["A"], events: [[512]], datatype: "I", bits: 16, range: 1024, extra: { $P1E: "4,1" } }),
  );
  expect(f.data[0]![0]).toBeCloseTo(100, 3);
});

test("gain divides linear values", () => {
  const f = parseFcs(writeFcs({ names: ["A"], events: [[10], [20]], extra: { $P1G: "2" } }));
  expect(Array.from(f.data[0]!)).toEqual([5, 10]);
});

test("escaped delimiter inside a value", () => {
  const f = parseFcs(writeFcs({ names: ["A"], events: [[1]], extra: { $FIL: "a|b" } }));
  expect(f.keywords["$FIL"]).toBe("a|b");
});

test("spillover keyword", () => {
  const f = parseFcs(writeFcs({ names: ["A", "B"], events: [[1, 2]], extra: { $SPILLOVER: "2,A,B,1,0.1,0.05,1" } }));
  expect(f.spillover).toEqual({ parameters: ["A", "B"], matrix: [[1, 0.1], [0.05, 1]] });
  expect(() => parseSpillover("2,A,B,1,0")).toThrow(FcsError);
});

test("errors", () => {
  expect(() => parseFcs(writeFcs({ names: ["A"], events: [[1]], extra: { $DATATYPE: "A" } }))).toThrow(FcsError);
  const bad = new Uint8Array(writeFcs({ names: ["A"], events: [[1]] }));
  bad[0] = 0x58;
  expect(() => parseFcs(bad.buffer)).toThrow(FcsError);
  const full = writeFcs({ names: ["A", "B"], events: [[1, 2], [3, 4]] });
  expect(() => parseFcs(full.slice(0, full.byteLength - 4))).toThrow(FcsError);
});
