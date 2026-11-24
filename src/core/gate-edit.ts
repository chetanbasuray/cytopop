import { pointInPolygon, type Gate } from "./gates";

export type Point = [number, number];
export type Handle =
  | { kind: "move" }
  | { kind: "corner"; corner: "nw" | "ne" | "sw" | "se" }
  | { kind: "side"; side: "n" | "e" | "s" | "w" }
  | { kind: "vertex"; i: number }
  | { kind: "edge"; i: number }
  | { kind: "radius"; axis: "x" | "y" }
  | { kind: "rotate" };

const OPEN = 1e8;

function isOpen(v: number): boolean {
  return v <= -OPEN || v >= OPEN;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mid(a: number, b: number): number {
  return (clamp01(a) + clamp01(b)) / 2;
}

export function handles(gate: Gate): { handle: Handle; at: Point }[] {
  if (gate.kind === "range") {
    const res: { handle: Handle; at: Point }[] = [];
    if (!isOpen(gate.min)) res.push({ handle: { kind: "side", side: "w" }, at: [gate.min, 0.5] });
    if (!isOpen(gate.max)) res.push({ handle: { kind: "side", side: "e" }, at: [gate.max, 0.5] });
    return res;
  }

  if (gate.kind === "rectangle") {
    const res: { handle: Handle; at: Point }[] = [];
    const corners: readonly ["nw", "ne", "sw", "se"] = ["nw", "ne", "sw", "se"];
    for (const c of corners) {
      let x: number | undefined, y: number | undefined;
      if (c === "nw") { x = gate.xMin; y = gate.yMax; }
      else if (c === "ne") { x = gate.xMax; y = gate.yMax; }
      else if (c === "sw") { x = gate.xMin; y = gate.yMin; }
      else { x = gate.xMax; y = gate.yMin; }
      if (!isOpen(x) && !isOpen(y)) res.push({ handle: { kind: "corner", corner: c }, at: [x, y] });
    }
    const sides: readonly ["n", "e", "s", "w"] = ["n", "e", "s", "w"];
    for (const s of sides) {
      let x: number | undefined, y: number | undefined;
      if (s === "n") { x = mid(gate.xMin, gate.xMax); y = gate.yMax; }
      else if (s === "e") { x = gate.xMax; y = mid(gate.yMin, gate.yMax); }
      else if (s === "s") { x = mid(gate.xMin, gate.xMax); y = gate.yMin; }
      else { x = gate.xMin; y = mid(gate.yMin, gate.yMax); }
      const edgeVal = s === "n" || s === "s" ? y : x;
      if (edgeVal !== undefined && !isOpen(edgeVal)) res.push({ handle: { kind: "side", side: s }, at: [x!, y!] });
    }
    return res;
  }

  if (gate.kind === "polygon") {
    const res: { handle: Handle; at: Point }[] = [];
    const pts = gate.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (p[0] >= -0.02 && p[0] <= 1.02 && p[1] >= -0.02 && p[1] <= 1.02) {
        res.push({ handle: { kind: "vertex", i }, at: p });
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (a[0] >= -0.02 && a[0] <= 1.02 && a[1] >= -0.02 && a[1] <= 1.02 &&
          b[0] >= -0.02 && b[0] <= 1.02 && b[1] >= -0.02 && b[1] <= 1.02) {
        res.push({ handle: { kind: "edge", i }, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
      }
    }
    return res;
  }

  if (gate.kind === "ellipse") {
    const cos = Math.cos(gate.angle);
    const sin = Math.sin(gate.angle);
    const a: Point = [cos, sin];
    const b: Point = [-sin, cos];
    const cx = gate.cx;
    const cy = gate.cy;
    return [
      { handle: { kind: "radius", axis: "x" }, at: [cx + gate.rx * a[0], cy + gate.rx * a[1]] },
      { handle: { kind: "radius", axis: "y" }, at: [cx + gate.ry * b[0], cy + gate.ry * b[1]] },
      { handle: { kind: "rotate" }, at: [cx + (gate.rx + 0.06) * a[0], cy + (gate.rx + 0.06) * a[1]] },
    ];
  }

  return [];
}

export function hitHandle(gate: Gate, p: Point, tol: Point): Handle | null {
  const hList = handles(gate);
  let best: { handle: Handle; at: Point; distSq: number } | undefined;
  for (const h of hList) {
    const du = Math.abs(p[0] - h.at[0]) / tol[0];
    const dv = gate.kind === "range" ? 0 : Math.abs(p[1] - h.at[1]) / tol[1];
    if (du <= 1 && dv <= 1) {
      const distSq = du * du + dv * dv;
      if (!best || distSq < best.distSq) {
        best = { handle: h.handle, at: h.at, distSq };
      }
    }
  }
  if (best) return best.handle;

  let inside = false;
  switch (gate.kind) {
    case "range":
      inside = p[0] >= gate.min && p[0] < gate.max;
      break;
    case "rectangle":
      inside = p[0] >= gate.xMin && p[0] < gate.xMax && p[1] >= gate.yMin && p[1] < gate.yMax;
      break;
    case "polygon":
      inside = pointInPolygon(p[0], p[1], gate.points);
      break;
    case "ellipse": {
      const cos = Math.cos(gate.angle);
      const sin = Math.sin(gate.angle);
      const dx = p[0] - gate.cx;
      const dy = p[1] - gate.cy;
      const u = (dx * cos + dy * sin) / gate.rx;
      const v = (-dx * sin + dy * cos) / gate.ry;
      inside = u * u + v * v <= 1;
      break;
    }
  }
  return inside ? { kind: "move" } : null;
}

export function dragGate(gate: Gate, handle: Handle, from: Point, to: Point): Gate {
  const d: Point = [to[0] - from[0], to[1] - from[1]];

  if (handle.kind === "move") {
    if (gate.kind === "range") {
      const g = { ...gate };
      if (!isOpen(g.min)) g.min += d[0];
      if (!isOpen(g.max)) g.max += d[0];
      delete g.threshold;
      return g;
    }
    if (gate.kind === "rectangle") {
      const g = { ...gate };
      const xChanged = !isOpen(g.xMin) || !isOpen(g.xMax);
      const yChanged = !isOpen(g.yMin) || !isOpen(g.yMax);
      if (!isOpen(g.xMin)) g.xMin += d[0];
      if (!isOpen(g.xMax)) g.xMax += d[0];
      if (!isOpen(g.yMin)) g.yMin += d[1];
      if (!isOpen(g.yMax)) g.yMax += d[1];
      if (xChanged) delete g.xThreshold;
      if (yChanged) delete g.yThreshold;
      return g;
    }
    if (gate.kind === "polygon") {
      const newPts = gate.points.map(([u, v]): Point => [u + d[0], v + d[1]]);
      return { ...gate, points: newPts };
    }
    if (gate.kind === "ellipse") {
      return { ...gate, cx: gate.cx + d[0], cy: gate.cy + d[1] };
    }
  }

  if (gate.kind === "range" && handle.kind === "side") {
    const g = { ...gate };
    delete g.threshold;
    if (handle.side === "w") g.min = to[0];
    else g.max = to[0];
    if (g.min > g.max) { const t = g.min; g.min = g.max; g.max = t; }
    return g;
  }

  if (gate.kind === "rectangle" && handle.kind === "side") {
    const g = { ...gate };
    if (handle.side === "n") g.yMax = to[1];
    else if (handle.side === "s") g.yMin = to[1];
    else if (handle.side === "e") g.xMax = to[0];
    else g.xMin = to[0];
    const xChanged = handle.side === "e" || handle.side === "w";
    const yChanged = handle.side === "n" || handle.side === "s";
    if (g.xMin > g.xMax) { const t = g.xMin; g.xMin = g.xMax; g.xMax = t; }
    if (g.yMin > g.yMax) { const t = g.yMin; g.yMin = g.yMax; g.yMax = t; }
    if (xChanged) delete g.xThreshold;
    if (yChanged) delete g.yThreshold;
    return g;
  }

  if (gate.kind === "rectangle" && handle.kind === "corner") {
    const g = { ...gate };
    const c = handle.corner;
    if (c === "nw") { g.xMin = to[0]; g.yMax = to[1]; }
    else if (c === "ne") { g.xMax = to[0]; g.yMax = to[1]; }
    else if (c === "sw") { g.xMin = to[0]; g.yMin = to[1]; }
    else { g.xMax = to[0]; g.yMin = to[1]; }
    if (g.xMin > g.xMax) { const t = g.xMin; g.xMin = g.xMax; g.xMax = t; }
    if (g.yMin > g.yMax) { const t = g.yMin; g.yMin = g.yMax; g.yMax = t; }
    delete g.xThreshold;
    delete g.yThreshold;
    return g;
  }

  if (gate.kind === "polygon" && handle.kind === "vertex") {
    const newPts = [...gate.points];
    newPts[handle.i]! = to;
    return { ...gate, points: newPts };
  }

  if (gate.kind === "polygon" && handle.kind === "edge") {
    const newPts = [...gate.points];
    newPts.splice(handle.i + 1, 0, to);
    return { ...gate, points: newPts };
  }

  if (gate.kind === "ellipse" && handle.kind === "radius") {
    const cos = Math.cos(gate.angle);
    const sin = Math.sin(gate.angle);
    const a: Point = [cos, sin];
    const b: Point = [-sin, cos];
    const dx = to[0] - gate.cx;
    const dy = to[1] - gate.cy;
    if (handle.axis === "x") {
      const dot = dx * a[0] + dy * a[1];
      return { ...gate, rx: Math.max(0.003, Math.abs(dot)) };
    } else {
      const dot = dx * b[0] + dy * b[1];
      return { ...gate, ry: Math.max(0.003, Math.abs(dot)) };
    }
  }

  if (gate.kind === "ellipse" && handle.kind === "rotate") {
    return { ...gate, angle: Math.atan2(to[1] - gate.cy, to[0] - gate.cx) };
  }

  return gate;
}

export function nudge(gate: Gate, du: number, dv: number): Gate {
  return dragGate(gate, { kind: "move" }, [0, 0], [du, dv]);
}

export function removeVertex(gate: Gate, i: number): Gate {
  if (gate.kind !== "polygon") return gate;
  if (gate.points.length <= 3) return gate;
  const newPts = [...gate.points];
  newPts.splice(i, 1);
  return { ...gate, points: newPts };
}

export function linkSibling(before: Gate, after: Gate, sibling: Gate): Gate {
  if (sibling.kind !== before.kind) return sibling;
  if (sibling.x.param !== before.x.param) return sibling;

  if (before.kind === "rectangle" && after.kind === "rectangle" && sibling.kind === "rectangle") {
    if (sibling.y.param !== before.y.param) return sibling;
    const xMap = new Map<number, number>();
    const yMap = new Map<number, number>();
    if (!isOpen(before.xMin) && !isOpen(after.xMin) && before.xMin !== after.xMin) xMap.set(before.xMin, after.xMin);
    if (!isOpen(before.xMax) && !isOpen(after.xMax) && before.xMax !== after.xMax) xMap.set(before.xMax, after.xMax);
    if (!isOpen(before.yMin) && !isOpen(after.yMin) && before.yMin !== after.yMin) yMap.set(before.yMin, after.yMin);
    if (!isOpen(before.yMax) && !isOpen(after.yMax) && before.yMax !== after.yMax) yMap.set(before.yMax, after.yMax);
    let xChanged = false;
    let yChanged = false;
    const g = { ...sibling };
    if (xMap.has(g.xMin)) { g.xMin = xMap.get(g.xMin)!; xChanged = true; }
    if (xMap.has(g.xMax)) { g.xMax = xMap.get(g.xMax)!; xChanged = true; }
    if (yMap.has(g.yMin)) { g.yMin = yMap.get(g.yMin)!; yChanged = true; }
    if (yMap.has(g.yMax)) { g.yMax = yMap.get(g.yMax)!; yChanged = true; }
    if (g.xMin > g.xMax) { const t = g.xMin; g.xMin = g.xMax; g.xMax = t; }
    if (g.yMin > g.yMax) { const t = g.yMin; g.yMin = g.yMax; g.yMax = t; }
    if (xChanged) delete g.xThreshold;
    if (yChanged) delete g.yThreshold;
    return g;
  }

  if (before.kind === "polygon" && after.kind === "polygon" && sibling.kind === "polygon") {
    if (sibling.y.param !== before.y.param) return sibling;
    if (before.points.length !== after.points.length) return sibling;
    const map = new Map<string, Point>();
    for (let i = 0; i < before.points.length; i++) {
      const oldP = before.points[i]!;
      const newP = after.points[i]!;
      if (oldP[0] !== newP[0] || oldP[1] !== newP[1]) {
        map.set(`${oldP[0]},${oldP[1]}`, newP);
      }
    }
    const newPts = sibling.points.map(p => {
      const key = `${p[0]},${p[1]}`;
      return map.has(key) ? map.get(key)! : p;
    });
    return { ...sibling, points: newPts };
  }

  if (before.kind === "range" && after.kind === "range" && sibling.kind === "range") {
    const map = new Map<number, number>();
    if (!isOpen(before.min) && !isOpen(after.min) && before.min !== after.min) map.set(before.min, after.min);
    if (!isOpen(before.max) && !isOpen(after.max) && before.max !== after.max) map.set(before.max, after.max);
    let changed = false;
    const g = { ...sibling };
    if (map.has(g.min)) { g.min = map.get(g.min)!; changed = true; }
    if (map.has(g.max)) { g.max = map.get(g.max)!; changed = true; }
    if (g.min > g.max) { const t = g.min; g.min = g.max; g.max = t; }
    if (changed) delete g.threshold;
    return g;
  }

  if (before.kind === "ellipse" && after.kind === "ellipse" && sibling.kind === "ellipse") {
    return sibling;
  }

  return sibling;
}
