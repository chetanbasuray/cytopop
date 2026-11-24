import { expect, test } from "bun:test";
import { applyGate, GateError, pointInPolygon, quadrants, type Dimension } from "../src/core/gates";
import { channelStats, compareCounts, count, sampleTable, evaluate, pathOf, populationStats, toCsv, withOverrides, EMPTY_STATS, type Population } from "../src/core/populations";

const lin = { kind: "linear", min: 0, max: 100 } as const;
const X: Dimension = { param: "X", scale: lin };
const Y: Dimension = { param: "Y", scale: lin };
const names = ["X", "Y"];
// Five events in raw units; display = raw / 100.
const data = [new Float32Array([10, 60, 60, 90, 50]), new Float32Array([10, 60, 20, 90, 50])];

test("point in polygon", () => {
  const sq: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  expect(pointInPolygon(0.5, 0.5, sq)).toBe(true);
  expect(pointInPolygon(1.5, 0.5, sq)).toBe(false);
});

test("rectangle, range, polygon and ellipse gates", () => {
  expect(Array.from(applyGate({ kind: "rectangle", x: X, y: Y, xMin: 0.5, xMax: 1, yMin: 0.5, yMax: 1 }, names, data))).toEqual([0, 1, 0, 1, 1]);
  expect(Array.from(applyGate({ kind: "range", x: X, min: 0, max: 0.5 }, names, data))).toEqual([1, 0, 0, 0, 0]);
  const tri: [number, number][] = [[0, 0], [0.7, 0], [0, 0.7]];
  expect(Array.from(applyGate({ kind: "polygon", x: X, y: Y, points: tri }, names, data))).toEqual([1, 0, 0, 0, 0]);
  expect(Array.from(applyGate({ kind: "ellipse", x: X, y: Y, cx: 0.6, cy: 0.6, rx: 0.15, ry: 0.15, angle: 0 }, names, data))).toEqual([0, 1, 0, 0, 1]);
  expect(() => applyGate({ kind: "range", x: { param: "Z", scale: lin }, min: 0, max: 1 }, names, data)).toThrow(GateError);
});

test("quadrants partition every event exactly once", () => {
  const q = quadrants(X, Y, 0.5, 0.5);
  const masks = Object.values(q).map((g) => applyGate(g, names, data));
  const sums = data[0]!.map((_, e) => masks.reduce((a, m) => a + m[e]!, 0));
  expect(Array.from(sums)).toEqual([1, 1, 1, 1, 1]);
  expect(Array.from(applyGate(q["+-"], names, data))).toEqual([0, 0, 1, 0, 0]);
});

test("quadrants survive a JSON round trip, including templates with null edges", () => {
  const q = quadrants(X, Y, 0.5, 0.5);
  const restored = JSON.parse(JSON.stringify(q)) as typeof q;
  expect(Array.from(applyGate(restored["++"], names, data))).toEqual([0, 1, 0, 1, 1]);
  const legacy = JSON.parse('{"kind":"rectangle","x":' + JSON.stringify(X) + ',"y":' + JSON.stringify(Y) + ',"xMin":0.5,"xMax":null,"yMin":0.5,"yMax":null}');
  expect(Array.from(applyGate(legacy, names, data))).toEqual([0, 1, 0, 1, 1]);
});

test("population tree, stats and CSV", () => {
  const pops: Population[] = [
    { id: "hi", name: "High X", parentId: null, gate: { kind: "range", x: X, min: 0.5, max: 2 } },
    { id: "hiy", name: "High Y", parentId: "hi", gate: { kind: "range", x: Y, min: 0.5, max: 2 } },
  ];
  const masks = evaluate(pops, names, data);
  expect(count(masks.get("hi")!)).toBe(4);
  expect(count(masks.get("hiy")!)).toBe(3);
  expect(pathOf(pops, "hiy")).toBe("High X/High Y");
  const stats = populationStats(pops, masks, 5);
  expect(stats[1]!.percentParent).toBeCloseTo(75);
  expect(stats[1]!.percentTotal).toBeCloseTo(60);
  expect(() => evaluate([{ ...pops[1]!, parentId: "nope" }], names, data)).toThrow();

  const s = channelStats(data[0]!, masks.get("hiy"));
  expect(s.mean).toBeCloseTo(200 / 3);
  expect(s.median).toBe(60);
  expect(channelStats(new Float32Array(0)).mean).toBeNaN();

  expect(toCsv(["Name", "Count"], [["A, B", 1.23456], ['say "hi"', NaN]])).toBe('Name,Count\n"A, B",1.235\n"say ""hi""",\n');
});

test("channelStats basic stats on [1, 2, 3, 4]", () => {
  const values = new Float32Array([1, 2, 3, 4]);
  const s = channelStats(values);
  expect(s.median).toBe(2.5);
  expect(s.mean).toBe(2.5);
  expect(s.sd).toBeCloseTo(1.29099, 5);
  expect(s.p25).toBe(1.75);
  expect(s.p75).toBe(3.25);
});

test("channelStats geoMean ignores non-positive values", () => {
  const s1 = channelStats(new Float32Array([1, 10, 100]));
  expect(s1.geoMean).toBeCloseTo(10, 5);
  const s2 = channelStats(new Float32Array([-5, 0, 4, 16]));
  expect(s2.geoMean).toBeCloseTo(8, 5);
});

test("channelStats all-zero mask returns NaN for every key", () => {
  const values = new Float32Array([1, 2, 3]);
  const mask = new Uint8Array([0, 0, 0]);
  const s = channelStats(values, mask);
  for (const key of Object.keys(EMPTY_STATS) as (keyof typeof EMPTY_STATS)[]) {
    expect(s[key]).toBeNaN();
  }
});

test("channelStats rcv on values 1..101", () => {
  const n = 101;
  const values = new Float32Array(n);
  for (let i = 0; i < n; i++) values[i] = i + 1;
  const s = channelStats(values);
  // Percentiles 84.13 and 15.87 of 1..101 are 85.13 and 16.87, so the robust SD is 34.13.
  expect(s.median).toBe(51);
  expect(s.rsd).toBeCloseTo(34.13, 5);
  expect(s.rcv).toBeCloseTo((100 * 34.13) / 51, 5);
});

test("Boolean populations", () => {
  const x: Population = { id: "x", name: "High X", parentId: null, gate: { kind: "range", x: X, min: 0.5, max: 2 } };
  const y: Population = { id: "y", name: "High Y", parentId: null, gate: { kind: "range", x: Y, min: 0.5, max: 2 } };
  const xs = Array.from(evaluate([x], names, data).get("x")!);
  const ys = Array.from(evaluate([y], names, data).get("y")!);
  const run = (op: "and" | "or" | "not", of: string[], parentId: string | null = null) =>
    Array.from(evaluate([x, y, { id: "b", name: "B", parentId, gate: { kind: "boolean", op, of } }], names, data).get("b")!);
  expect(run("and", ["x", "y"])).toEqual(xs.map((v, i) => v & ys[i]!));
  expect(run("or", ["x", "y"])).toEqual(xs.map((v, i) => v | ys[i]!));
  expect(run("not", ["x"])).toEqual(xs.map((v) => 1 - v));
  // Under a parent, the result stays inside the parent.
  expect(run("not", ["y"], "x")).toEqual(xs.map((v, i) => v & (1 - ys[i]!)));
  expect(() => run("not", ["x", "y"])).toThrow();
  expect(() => run("and", ["x"])).toThrow();
  expect(() => run("or", ["x", "gone"])).toThrow();
  expect(() => run("or", ["x", "b"])).toThrow();
});

test("a sample's adjusted gates replace the shared ones only for that sample", () => {
  const x = { param: "FSC-A", scale: { kind: "linear" as const, min: 0, max: 1 } };
  const shared: Population[] = [
    { id: "a", name: "A", parentId: null, gate: { kind: "range", x, min: 0.2, max: 0.8 } },
    { id: "b", name: "B", parentId: "a", gate: { kind: "boolean", op: "not", of: ["a"] } },
  ];
  const own = { kind: "range" as const, x, min: 0.3, max: 0.9 };
  expect(withOverrides(shared, undefined)).toBe(shared);
  expect(withOverrides(shared, {})).toBe(shared);
  const mine = withOverrides(shared, { a: own, b: own, gone: own });
  expect(mine[0]!.gate).toEqual(own);
  expect(mine[1]!.gate.kind).toBe("boolean"); // only drawn gates can be adjusted
  expect(shared[0]!.gate).not.toEqual(own);
});

test("compareCounts matches populations by path and keeps only changed counts", () => {
  const gate = { kind: "boolean", op: "not", of: [] } as unknown as Population["gate"];
  const before = { populations: [{ id: "a", name: "Cells", parentId: null, gate }, { id: "b", name: "Live", parentId: "a", gate }, { id: "c", name: "Dead", parentId: "a", gate }], counts: new Map([["a", 100], ["b", 60], ["c", 40]]) };
  const after = { populations: [{ id: "x", name: "Cells", parentId: null, gate }, { id: "y", name: "Live", parentId: "x", gate }, { id: "z", name: "B cells", parentId: "y", gate }], counts: new Map([["x", 100], ["y", 70], ["z", 20]]) };
  expect(compareCounts("s1", before, after)).toEqual([
    { sample: "s1", path: "Cells/Live", before: 60, after: 70 },
    { sample: "s1", path: "Cells/Live/B cells", before: undefined, after: 20 },
    { sample: "s1", path: "Cells/Dead", before: 40, after: undefined },
  ]);
});

test("sampleTable puts every sample on one row with a column per population and measure", () => {
  const long = {
    header: ["Sample", "Group", "Population", "Count", "% parent"],
    rows: [
      ["a.fcs", "Day 1", "All events", 100, 100],
      ["a.fcs", "Day 1", "Live", 60, 60],
      ["b.fcs", "Day 2", "Error: Parameter X is not in the sample"],
      ["c.fcs", "Day 2", "Live", 30, 50],
    ],
  };
  expect(sampleTable(long, 1, ["Live"], ["Count", "% parent"])).toEqual({
    header: ["Sample", "Group", "Live Count", "Live % parent"],
    rows: [["a.fcs", "Day 1", 60, 60], ["b.fcs", "Day 2", "", ""], ["c.fcs", "Day 2", 30, 50]],
  });
});
