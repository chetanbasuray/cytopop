import { expect, test } from "bun:test";
import { handles, hitHandle, dragGate, removeVertex, nudge, linkSibling } from "../src/core/gate-edit";
import type { Gate } from "../src/core/gates";

const x = { param: "FSC-A", scale: { kind: "linear" as const, min: 0, max: 1e6 } };
const y = { param: "SSC-A", scale: { kind: "linear" as const, min: 0, max: 1e6 } };

function only<K extends Gate["kind"]>(g: Gate, k: K): Extract<Gate, { kind: K }> {
  if (g.kind !== k) throw new Error(g.kind);
  return g as Extract<Gate, { kind: K }>;
}

test("a quadrant rectangle has handles only on its bounded edges and centre corner", () => {
  const gate: Gate = {
    kind: "rectangle",
    x,
    y,
    xMin: 0.4,
    xMax: 1e9,
    yMin: 0.3,
    yMax: 1e9,
  };
  const hList = handles(gate);
  expect(hList.map((h) => h.handle)).toEqual([{ kind: "corner", corner: "sw" }, { kind: "side", side: "s" }, { kind: "side", side: "w" }]);
  const wHandle = hList.find((h) => h.handle.kind === "side" && h.handle.side === "w");
  const sHandle = hList.find((h) => h.handle.kind === "side" && h.handle.side === "s");
  expect(wHandle).toBeDefined();
  expect(sHandle).toBeDefined();
  expect(wHandle!.at[0]).toBeCloseTo(0.4, 1);
  expect(wHandle!.at[1]).toBeCloseTo(0.65, 2);
  expect(sHandle!.at[0]).toBeCloseTo(0.7, 1);
  expect(sHandle!.at[1]).toBeCloseTo(0.3, 1);
});

test("hitHandle on a rectangle: corner, move, null", () => {
  const gate: Gate = {
    kind: "rectangle",
    x,
    y,
    xMin: 0.2,
    xMax: 0.6,
    yMin: 0.2,
    yMax: 0.6,
  };
  const tol: [number, number] = [0.05, 0.05];
  expect(hitHandle(gate, [0.6, 0.6], tol)).toEqual({ kind: "corner", corner: "ne" });
  expect(hitHandle(gate, [0.4, 0.4], tol)).toEqual({ kind: "move" });
  expect(hitHandle(gate, [1.0, 1.0], tol)).toBeNull();
});

test("dragGate rectangle side e swaps edges; corner sw moves both; move drops thresholds", () => {
  const gate: Gate = {
    kind: "rectangle",
    x,
    y,
    xMin: 0.2,
    xMax: 0.6,
    yMin: 0.2,
    yMax: 1e9,
    xThreshold: { sample: "ctrl", population: "all", percentile: 50 },
    yThreshold: { sample: "ctrl", population: "all", percentile: 50 },
  };
  const sideE = handles(gate).find((h) => h.handle.kind === "side" && h.handle.side === "e")!;
  const draggedSide = dragGate(gate, sideE.handle, sideE.at, [0.1, 0.5]);
  expect(only(draggedSide, "rectangle").xMin).toBe(0.1);
  expect(only(draggedSide, "rectangle").xMax).toBe(0.2);
  expect(only(draggedSide, "rectangle").xThreshold).toBeUndefined();
  expect(only(draggedSide, "rectangle").yThreshold).toBeDefined();

  const cornerSW = handles(gate).find((h) => h.handle.kind === "corner" && h.handle.corner === "sw")!;
  const draggedCorner = dragGate(gate, cornerSW.handle, cornerSW.at, [0.1, 0.1]);
  expect(only(draggedCorner, "rectangle").xMin).toBe(0.1);
  expect(only(draggedCorner, "rectangle").yMin).toBe(0.1);

  const moved = dragGate(gate, { kind: "move" }, [0.4, 0.4], [0.5, 0.5]);
  expect(only(moved, "rectangle").xThreshold).toBeUndefined();
  expect(only(moved, "rectangle").yThreshold).toBeUndefined();
  expect(only(moved, "rectangle").yMax).toBe(1e9);
});

test("dragGate polygon: vertex moves one point; edge inserts point; input not mutated", () => {
  const points: [number, number][] = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
  const gate: Gate = { kind: "polygon", x, y, points };
  const vertexHandle = handles(gate).find((h) => h.handle.kind === "vertex" && h.handle.i === 0)!;
  const draggedVertex = dragGate(gate, vertexHandle.handle, vertexHandle.at, [0.2, 0.2]);
  expect(only(draggedVertex, "polygon").points[0]).toEqual([0.2, 0.2]);
  expect(only(draggedVertex, "polygon").points[1]).toEqual([0.9, 0.1]);

  const edgeHandle = handles(gate).find((h) => h.handle.kind === "edge" && h.handle.i === 0)!;
  const draggedEdge = dragGate(gate, edgeHandle.handle, edgeHandle.at, [0.5, 0.2]);
  expect(only(draggedEdge, "polygon").points[1]).toEqual([0.5, 0.2]);

  expect(only(gate, "polygon").points).toEqual([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]);
});

test("removeVertex keeps triangle unchanged and removes vertex from square", () => {
  const triangle: Gate = { kind: "polygon", x, y, points: [[0, 0], [1, 0], [0.5, 1]] };
  expect(removeVertex(triangle, 0)).toBe(triangle);

  const square: Gate = { kind: "polygon", x, y, points: [[0, 0], [1, 0], [1, 1], [0, 1]] };
  const result = removeVertex(square, 1);
  expect(only(result, "polygon").points).toEqual([[0, 0], [1, 1], [0, 1]]);
});

test("ellipse: radius x sets rx from projection; rotate to point above gives angle pi/2", () => {
  const gate: Gate = { kind: "ellipse", x, y, cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1, angle: 0 };
  const radiusX = handles(gate).find((h) => h.handle.kind === "radius" && h.handle.axis === "x")!;
  const newRx = dragGate(gate, radiusX.handle, radiusX.at, [0.7, 0.5]);
  expect(only(newRx, "ellipse").rx).toBeCloseTo(0.2, 4);

  const rotateHandle = handles(gate).find((h) => h.handle.kind === "rotate")!;
  const rotated = dragGate(gate, rotateHandle.handle, rotateHandle.at, [0.5, 0.7]);
  expect(only(rotated, "ellipse").angle).toBeCloseTo(Math.PI / 2, 4);
});

test("nudge moves a range gate and drops its threshold", () => {
  const gate: Gate = { kind: "range", x, min: 0.1, max: 0.5, threshold: { sample: "ctrl", population: "all", percentile: 50 } };
  const result = nudge(gate, 0.1, 0);
  expect(only(result, "range").min).toBe(0.2);
  expect(only(result, "range").max).toBe(0.6);
  expect(only(result, "range").threshold).toBeUndefined();
});

test("linkSibling: dragging shared edge of quadrant ++ moves -+ sibling xMax; other params unchanged; hinged polygons move centre", () => {
  const before: Gate = { kind: "rectangle", x, y, xMin: 0.4, xMax: 1e9, yMin: 0.5, yMax: 1e9 };
  const after: Gate = { kind: "rectangle", x, y, xMin: 0.5, xMax: 1e9, yMin: 0.5, yMax: 1e9 };
  const sibling: Gate = { kind: "rectangle", x, y, xMin: -1e9, xMax: 0.4, yMin: 0.5, yMax: 1e9 };
  const result = linkSibling(before, after, sibling);
  expect(only(result, "rectangle").xMax).toBe(0.5);
  expect(only(result, "rectangle").yMin).toBe(0.5);

  const otherParamY = { param: "CD4", scale: { kind: "linear" as const, min: 0, max: 1e6 } };
  const siblingOtherParam: Gate = { kind: "rectangle", x, y: otherParamY, xMin: -1e9, xMax: 0.4, yMin: 0.5, yMax: 1e9 };
  expect(linkSibling(before, after, siblingOtherParam)).toBe(siblingOtherParam);

  const beforePoly: Gate = { kind: "polygon", x, y, points: [[0.4, 0.5], [0.6, 0.5]] };
  const afterPoly: Gate = { kind: "polygon", x, y, points: [[0.5, 0.5], [0.6, 0.5]] };
  const siblingPoly: Gate = { kind: "polygon", x, y, points: [[0.4, 0.5], [0.3, 0.3]] };
  const resultPoly = linkSibling(beforePoly, afterPoly, siblingPoly);
  expect(only(resultPoly, "polygon").points[0]).toEqual([0.5, 0.5]);
});
