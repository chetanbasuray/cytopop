import { expect, test } from "bun:test";
import { applyGate, GateError, pointInPolygon, quadrants, type Dimension } from "../src/core/gates";
import { channelStats, count, evaluate, pathOf, populationStats, toCsv, type Population } from "../src/core/populations";

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
