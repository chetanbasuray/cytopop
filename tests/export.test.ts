import { expect, test } from "bun:test";
import { eventsCsv, eventsFcs, pickedEvents } from "../src/core/export";
import { parseFcs } from "../src/core/fcs";
import { writeFcs } from "./helpers/writeFcs";

const source = parseFcs(writeFcs({
  names: ["FSC-A", "FITC-A", "PE-A"],
  events: [[100, 1, 2], [200, 3, 4], [300, 5, 6], [400, 7, 8]],
  datatype: "I", bits: 16, range: 1024,
  extra: { $CYT: "Lab|A", $P2S: "CD3", $SPILLOVER: "2,FITC-A,PE-A,1,0.1,0,1", $P2G: "2" },
}));

test("pickedEvents lists masked events, or all of them", () => {
  expect(Array.from(pickedEvents(4, Uint8Array.from([0, 1, 1, 0])))).toEqual([1, 2]);
  expect(Array.from(pickedEvents(3))).toEqual([0, 1, 2]);
});

test("an exported FCS file parses back to the same events and keeps the source keywords", () => {
  const events = pickedEvents(4, Uint8Array.from([1, 0, 1, 1]));
  const back = parseFcs(eventsFcs(source, source.data, events, false, { CYTOPOP_POPULATION: "Lymphocytes" }));
  expect(back.eventCount).toBe(3);
  expect(back.parameters.map((p) => p.name)).toEqual(["FSC-A", "FITC-A", "PE-A"]);
  back.data.forEach((col, p) => expect(Array.from(col)).toEqual([0, 2, 3].map((e) => source.data[p]![e]!)));
  expect(back.keywords).toMatchObject({ $CYT: "Lab|A", $P2S: "CD3", CYTOPOP_POPULATION: "Lymphocytes", $DATATYPE: "F", $P1R: "1024" });
  expect(back.keywords.$P2G).toBeUndefined(); // the gain is already applied to the values
  expect(back.spillover).toEqual(source.spillover);
});

test("compensated exports drop the spillover matrix, and empty exports are valid", () => {
  expect(parseFcs(eventsFcs(source, source.data, pickedEvents(4), true, {})).spillover).toBeUndefined();
  expect(parseFcs(eventsFcs(source, source.data, new Uint32Array(0), false, {})).eventCount).toBe(0);
});

test("eventsCsv writes a header and one row per event", () => {
  expect(eventsCsv(["a", "b,c"], [Float32Array.from([1, 2]), Float32Array.from([3.5, 4])], Uint32Array.from([1]))).toBe('a,"b,c"\n2,4\n');
});

test("exported FCS files carry edited keywords", async () => {
  const { parseFcs } = await import("../src/core/fcs");
  const data = [new Float32Array([1, 2])];
  const file = { keywords: { $FIL: "a.fcs", CONDITION: "Stim" }, parameters: [{ name: "X", range: 1024, bits: 32, gain: 1, decades: 0, offset: 0 }], eventCount: 2, data } as unknown as Parameters<typeof eventsFcs>[0];
  expect(parseFcs(eventsFcs(file, data, pickedEvents(2), false, {})).keywords.CONDITION).toBe("Stim");
});
