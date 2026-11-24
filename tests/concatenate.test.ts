import { expect, test } from "bun:test";
import { concatenate } from "../src/core/concatenate";
import { eventsFcs, pickedEvents } from "../src/core/export";
import { parseFcs } from "../src/core/fcs";
import { writeFcs } from "./helpers/writeFcs";

const file = (names: string[], events: number[][], range = 1024) =>
  parseFcs(writeFcs({ names, events, datatype: "F", bits: 32, range, extra: { $CYT: "Lab" } }));

test("concatenation appends events in the first file's channel order and records the source file", () => {
  const a = file(["FSC-A", "PE-A"], [[1, 2], [3, 4]]);
  const b = file(["PE-A", "FSC-A"], [[50, 60]], 4096);
  const c = concatenate([{ name: "a.fcs", file: a }, { name: "b.fcs", file: b }]);
  expect(c.eventCount).toBe(3);
  expect(c.parameters.map((p) => p.name)).toEqual(["FSC-A", "PE-A", "Source"]);
  expect(c.data.map((col) => Array.from(col))).toEqual([[1, 3, 60], [2, 4, 50], [1, 1, 2]]);
  expect(c.parameters[0]!.range).toBe(4096);
  expect(c.keywords).toMatchObject({ $CYT: "Lab", CYTOPOP_SOURCES: "1=a.fcs;2=b.fcs" });

  // It survives a write and read, which is how it is kept between sessions.
  const back = parseFcs(eventsFcs(c, c.data, pickedEvents(c.eventCount), false, {}));
  expect(back.parameters.map((p) => p.name)).toEqual(["FSC-A", "PE-A", "Source"]);
  expect(back.data.map((col) => Array.from(col))).toEqual([[1, 3, 60], [2, 4, 50], [1, 1, 2]]);
});

test("concatenation names the channels that differ", () => {
  const a = file(["FSC-A", "PE-A"], [[1, 2]]);
  const b = file(["FSC-A", "APC-A"], [[1, 2]]);
  expect(() => concatenate([{ name: "a", file: a }, { name: "b", file: b }])).toThrow("PE-A, APC-A");
  expect(() => concatenate([{ name: "a", file: a }])).toThrow("at least two");
});
