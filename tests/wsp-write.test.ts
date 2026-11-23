import { expect, test } from "bun:test";
import type { FcsFile } from "../src/core/fcs";
import type { Population } from "../src/core/populations";
import type { TransformSpec } from "../src/core/transforms";
import { writeWsp } from "../src/core/wsp-write";
import { readWsp } from "../src/core/wsp";

function fcs(names: string[], range = 1024, events = 10): FcsFile {
  return {
    version: "FCS3.1",
    keywords: { $TOT: String(events), $PAR: String(names.length), ...Object.fromEntries(names.flatMap((n, i) => [[`$P${i + 1}N`, n], [`$P${i + 1}R`, String(range)]])) },
    parameters: names.map((name, i) => ({ index: i + 1, name, range, bits: 32, amplification: [0, 0] as [number, number], gain: 1 })),
    eventCount: events,
    data: names.map(() => new Float32Array(events)),
  };
}

const lin = { kind: "linear", min: 0, max: 1024 } as const;
const lgc = { kind: "logicle", T: 1024, W: 0.5, M: 3, A: 0 } as const;

/** Asserts the kind and narrows the union for the checks that follow. */
function only<T extends { kind: string }, K extends T["kind"]>(v: T | undefined, kind: K): Extract<T, { kind: K }> {
  expect(v?.kind).toBe(kind);
  return v as Extract<T, { kind: K }>;
}

function makePop(id: string, name: string, parentId: string | null, gate: Population["gate"]): Population {
  return { id, name, parentId, gate };
}

test("rectangle, range, quadrant, and polygon round-trip", () => {
  const file = fcs(["FSC-A", "FL1-A"]);
  const scales = { "FSC-A": lin, "FL1-A": lgc } as Record<string, TransformSpec>;
  const pops: Population[] = [
    makePop("p1", "Rect", null, { kind: "rectangle", x: { param: "FSC-A", scale: lin }, y: { param: "FL1-A", scale: lgc }, xMin: 0.1, xMax: 0.9, yMin: 0.2, yMax: 0.8 }),
    makePop("p2", "Range", null, { kind: "range", x: { param: "FL1-A", scale: lgc }, min: 0.3, max: 0.7 }),
    makePop("p3", "Quad", null, { kind: "rectangle", x: { param: "FSC-A", scale: lin }, y: { param: "FL1-A", scale: lgc }, xMin: 0.5, xMax: 1e9, yMin: -1e9, yMax: 0.5 }),
    makePop("p4", "Poly", "p1", { kind: "polygon", x: { param: "FSC-A", scale: lin }, y: { param: "FL1-A", scale: lgc }, points: [[0.2, 0.3], [0.8, 0.3], [0.8, 0.7], [0.2, 0.7]] }),
  ];
  const input = { populations: pops, scales, compensated: false, samples: [{ name: "test.fcs", file, counts: new Map() }] };
  const { xml } = writeWsp(input);
  const res = readWsp(xml, ["test.fcs"]);

  expect(res.populations.length).toBe(4);
  const byName = new Map(res.populations.map((p) => [p.name, p]));

  const rect = only(byName.get("Rect")?.gate, "rectangle");
  expect(rect.x.param).toBe("FSC-A");
  expect(rect.y.param).toBe("FL1-A");
  expect(rect.xMin).toBeCloseTo(0.1, 6);
  expect(rect.xMax).toBeCloseTo(0.9, 6);
  expect(rect.yMin).toBeCloseTo(0.2, 6);
  expect(rect.yMax).toBeCloseTo(0.8, 6);

  const range = only(byName.get("Range")?.gate, "range");
  expect(range.x.param).toBe("FL1-A");
  expect(range.min).toBeCloseTo(0.3, 6);
  expect(range.max).toBeCloseTo(0.7, 6);

  const quad = only(byName.get("Quad")?.gate, "rectangle");
  expect(quad.xMin).toBeCloseTo(0.5, 6);
  expect(quad.xMax).toBe(1e9);
  expect(quad.yMin).toBe(-1e9);
  expect(quad.yMax).toBeCloseTo(0.5, 6);

  const poly = only(byName.get("Poly")?.gate, "polygon");
  expect(poly.points.length).toBe(4);
  expect(byName.get("Poly")!.parentId).toBe(byName.get("Rect")!.id);

  expect(res.scales["FSC-A"]).toEqual(lin);
  expect(res.scales["FL1-A"]).toEqual(lgc);
});

test("population counts appear as count attributes", () => {
  const file = fcs(["FSC-A"]);
  const pops: Population[] = [makePop("p1", "Cells", null, { kind: "range", x: { param: "FSC-A", scale: lin }, min: 0, max: 1024 })];
  const counts = new Map<string, number>();
  counts.set("p1", 7);
  const input = { populations: pops, scales: { "FSC-A": lin }, compensated: false, samples: [{ name: "test.fcs", file, counts }] };
  const { xml } = writeWsp(input);
  expect(xml).toMatch(/name="Cells"[^>]*count="7"/);
});

test("compensation writes Comp- prefix and matrix", () => {
  const file = fcs(["FL1-A", "FL2-A"]);
  const pops: Population[] = [makePop("p1", "Gated", null, { kind: "range", x: { param: "FL1-A", scale: lin }, min: 0, max: 1024 })];
  const spillover = { parameters: ["FL1-A", "FL2-A"], matrix: [[1, 0.1], [0.05, 1]] };
  const input = { populations: pops, scales: { "FL1-A": lin, "FL2-A": lin }, compensated: true, samples: [{ name: "test.fcs", file, spillover, counts: new Map() }] };
  const { xml } = writeWsp(input);

  expect(xml).toContain('data-type:name="Comp-FL1-A"');
  expect(xml).toContain("Comp-FL1-A");
  const res = readWsp(xml, ["test.fcs"]);
  expect(res.compensated).toBe(true);
  expect(res.spillover?.parameters).toEqual(["FL1-A", "FL2-A"]);
  expect(res.spillover?.matrix).toEqual([[1, 0.1], [0.05, 1]]);

  const noCompInput = { ...input, compensated: false };
  const { xml: xmlNoComp } = writeWsp(noCompInput);
  expect(xmlNoComp).not.toContain("Comp-");
});

test("boolean populations round-trip", () => {
  const file = fcs(["FSC-A"]);
  const pops: Population[] = [
    makePop("pA", "A", null, { kind: "range", x: { param: "FSC-A", scale: lin }, min: 0, max: 512 }),
    makePop("pB", "B", null, { kind: "range", x: { param: "FSC-A", scale: lin }, min: 512, max: 1024 }),
    makePop("pOr", "A or B", null, { kind: "boolean", op: "or" as const, of: ["pA", "pB"] }),
  ];
  const input = { populations: pops, scales: { "FSC-A": lin }, compensated: false, samples: [{ name: "test.fcs", file, counts: new Map() }] };
  const { xml } = writeWsp(input);
  const res = readWsp(xml, ["test.fcs"]);

  const byName = new Map(res.populations.map((p) => [p.name, p]));
  const boolPop = byName.get("A or B")!;
  const bg = only(boolPop.gate, "boolean");
  expect(bg.op).toBe("or");
  const refNames = res.populations.filter((p) => bg.of.includes(p.id)).map((p) => p.name);
  expect(refNames.sort()).toEqual(["A", "B"].sort());
});

test("skipped items produce warnings", () => {
  const file = fcs(["FSC-A"]);
  const pops: Population[] = [
    makePop("pClean", "Clean", null, { kind: "clean" }),
    makePop("pChild", "Child", "pClean", { kind: "range", x: { param: "FSC-A", scale: lin }, min: 0, max: 1024 }),
    makePop("pBool", "BadBool", null, { kind: "boolean", op: "or" as const, of: ["pClean"] }),
    makePop("pDerived", "Derived", null, { kind: "range", x: { param: "Ratio", scale: lin }, min: 0, max: 1024 }),
  ];
  const input = { populations: pops, scales: { "FSC-A": lin }, compensated: false, samples: [{ name: "test.fcs", file, counts: new Map() }] };
  const { warnings } = writeWsp(input);

  expect(warnings.some((w) => w.startsWith("Clean:") && w.includes("clean-up gates"))).toBe(true);
  expect(warnings.some((w) => w.startsWith("Clean/Child:"))).toBe(false); // left out with its parent, reported once
  expect(warnings.some((w) => w.startsWith("BadBool:") && w.includes("combined population"))).toBe(true);
  expect(warnings.some((w) => w.startsWith("Derived:") && w.includes("derived parameter"))).toBe(true);
});

test("ellipse is written as 64-point polygon", () => {
  const file = fcs(["FSC-A", "FL1-A"]);
  const pops: Population[] = [makePop("pEll", "Ellipse", null, { kind: "ellipse", x: { param: "FSC-A", scale: lin }, y: { param: "FL1-A", scale: lin }, cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.1, angle: 0.3 })];
  const input = { populations: pops, scales: { "FSC-A": lin, "FL1-A": lin }, compensated: false, samples: [{ name: "test.fcs", file, counts: new Map() }] };
  const { xml, warnings } = writeWsp(input);

  expect(warnings.some((w) => w.includes("64-point polygons"))).toBe(true);
  const res = readWsp(xml, ["test.fcs"]);
  const gate = only(res.populations[0]?.gate, "polygon");
  expect(gate.points.length).toBe(64);
});

test("hyperlog scale writes as logicle with warning", () => {
  const file = fcs(["FL1-A"]);
  const hyperlog: TransformSpec = { kind: "hyperlog", T: 1024, W: 0.5, M: 3, A: 0 };
  const pops: Population[] = [makePop("p1", "Gated", null, { kind: "range", x: { param: "FL1-A", scale: hyperlog }, min: 0, max: 1024 })];
  const input = { populations: pops, scales: { "FL1-A": hyperlog }, compensated: false, samples: [{ name: "test.fcs", file, counts: new Map() }] };
  const { warnings } = writeWsp(input);

  expect(warnings.some((w) => w.includes("hyperlog"))).toBe(true);
});

test("two samples get IDs and appear in SampleRefs", () => {
  const file1 = fcs(["FSC-A"]);
  const file2 = fcs(["FSC-A"]);
  const pops: Population[] = [makePop("p1", "Gated", null, { kind: "range", x: { param: "FSC-A", scale: lin }, min: 0, max: 1024 })];
  const input = { populations: pops, scales: { "FSC-A": lin }, compensated: false, samples: [{ name: "s1.fcs", file: file1, counts: new Map() }, { name: "s2.fcs", file: file2, counts: new Map() }] };
  const { xml } = writeWsp(input);

  expect(xml).toContain('sampleID="1"');
  expect(xml).toContain('sampleID="2"');
  expect(xml).toContain("SampleRefs");
  const res = readWsp(xml, ["s1.fcs"]);
  expect(res.samples.length).toBe(2);
  expect(res.samples).toEqual(["s1.fcs", "s2.fcs"]);
});

test("XML never contains flowJo and starts with correct header", () => {
  const file = fcs(["FSC-A"]);
  const pops: Population[] = [makePop("p1", "Gated", null, { kind: "range", x: { param: "FSC-A", scale: lin }, min: 0, max: 1024 })];
  const input = { populations: pops, scales: { "FSC-A": lin }, compensated: false, samples: [{ name: "test.fcs", file, counts: new Map() }] };
  const { xml } = writeWsp(input);

  expect(xml).not.toMatch(/flowJo/i);
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<Workspace')).toBe(true);
});
