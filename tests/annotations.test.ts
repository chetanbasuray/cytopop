import { expect, test } from "bun:test";
import { parseCsv, wellOf, readAnnotations } from "../src/core/annotations";

test("parseCsv handles quoted commas, quoted newlines, \"\" escapes, \\r\\n, a BOM, and skips blank lines", () => {
  const input = "\uFEFFa,b,c\n\"d,e\",\"f\ng\",\"h\"\"i\"\r\n\r\nx,y,z\n";
  const rows = parseCsv(input);
  expect(rows).toEqual([
    ["a", "b", "c"],
    ["d,e", "f\ng", 'h"i'],
    ["x", "y", "z"],
  ]);
});

test("parseCsv handles text without trailing newline", () => {
  const input = "a,b,c";
  const rows = parseCsv(input);
  expect(rows).toEqual([["a", "b", "c"]]);
});

test("wellOf prefers $WELLID and falls back to WELL ID; returns undefined when none", () => {
  expect(wellOf({ "$WELLID": "A1", "WELL ID": "B2" })).toBe("A1");
  expect(wellOf({ "WELL ID": "C3" })).toBe("C3");
  expect(wellOf({ "WELLID": "D4" })).toBe("D4");
  expect(wellOf({ "WELL": "E5" })).toBe("E5");
  expect(wellOf({ "OTHER": "X" })).toBeUndefined();
  expect(wellOf({})).toBeUndefined();
});

test("readAnnotations matches by file name, by name without .fcs (case-insensitive), and by well; collects unmatched keys; omits empty cells; drops blank header columns", () => {
  const csv = `key,col1,col2
sample1.fcs,v1,v2
wellA,v5,
unmatchedKey,v6,v7`;

  const samples: { name: string; keywords: Record<string, string> }[] = [
    { name: "sample1.fcs", keywords: {} },
    { name: "other.txt", keywords: { "$WELLID": "wellA" } },
  ];

  const result = readAnnotations(csv, samples);

  expect(result.columns).toEqual(["col1", "col2"]);
  expect(result.values["sample1.fcs"]).toEqual({ col1: "v1", col2: "v2" });
  expect(result.values["other.txt"]).toEqual({ col1: "v5" });
  expect(result.unmatched).toContain("unmatchedKey");
  expect(result.unmatched.length).toBe(1);
});

test("readAnnotations throws on a header-only-key CSV", () => {
  const csv = `key\nvalue`;
  expect(() => readAnnotations(csv, [])).toThrowError("The CSV needs a header row and at least one column besides the key");
});

test("readAnnotations handles blank header column in the middle", () => {
  const csv = `key,,col2
sample1.fcs,v1,v2`;

  const samples: { name: string; keywords: Record<string, string> }[] = [
    { name: "sample1.fcs", keywords: {} },
  ];

  const result = readAnnotations(csv, samples);

  expect(result.columns).toEqual(["col2"]);
  expect(result.values["sample1.fcs"]).toEqual({ col2: "v2" });
});

test("readAnnotations applies key matching one sample by name and another by well only to the name match", () => {
  const csv = `key,col1
sample1,v1`;

  const samples: { name: string; keywords: Record<string, string> }[] = [
    { name: "sample1.fcs", keywords: {} },
    { name: "other.txt", keywords: { "$WELLID": "sample1" } },
  ];

  const result = readAnnotations(csv, samples);

  expect(result.values["sample1.fcs"]).toEqual({ col1: "v1" });
  expect(result.values["other.txt"]).toBeUndefined();
});

test("readAnnotations applies key matching two samples by well to both", () => {
  const csv = `key,col1
wellA,v1`;

  const samples: { name: string; keywords: Record<string, string> }[] = [
    { name: "sample1.fcs", keywords: { "$WELLID": "wellA" } },
    { name: "sample2.fcs", keywords: { "$WELLID": "wellA" } },
  ];

  const result = readAnnotations(csv, samples);

  expect(result.values["sample1.fcs"]).toEqual({ col1: "v1" });
  expect(result.values["sample2.fcs"]).toEqual({ col1: "v1" });
});
