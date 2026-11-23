// Reader for .wsp workspace files (XML; gate shapes, transforms and matrices use Gating-ML 2.0 elements).

import type { Spillover } from "./fcs";
import type { Dimension, Gate } from "./gates";
import type { BooleanGate, Population } from "./populations";
import { fromSpec, type TransformSpec } from "./transforms";
import { attr, child, childrenNamed, localName, parseXml, type XmlElement } from "./xml";

export interface WspImport {
  populations: Population[]; // parents before children
  scales: Record<string, TransformSpec>; // per plain parameter name
  spillover?: Spillover; // plain parameter names
  compensated: boolean; // true when any gate uses a compensated parameter
  samples: string[]; // every sample name in the workspace
  source: string; // name of the sample whose gate tree was imported
  report: string[]; // one readable line per element that could not be converted
}

const OPEN = 1e9; // open rectangle edges, as quadrant gates use
const NODES = ["Population", "AndNode", "OrNode", "NotNode"];

/** Thrown inside gate conversion; caught per population and turned into a report line. */
class Unsupported extends Error {}

/** Numeric attribute by local name; undefined when missing or not a finite number. */
function num(el: XmlElement, local: string): number | undefined {
  const v = attr(el, local);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Keyword name to value for a Sample element. */
function keywords(sample: XmlElement): Record<string, string> {
  const kwEl = child(sample, "Keywords");
  if (!kwEl) return {};
  const out: Record<string, string> = {};
  for (const k of childrenNamed(kwEl, "Keyword")) {
    const name = attr(k, "name");
    const val = attr(k, "value");
    if (name !== undefined && val !== undefined) {
      out[name] = val;
    }
  }
  return out;
}

function sampleName(sample: XmlElement, kw: Record<string, string>): string {
  const sn = child(sample, "SampleNode");
  if (sn) {
    const name = attr(sn, "name");
    if (name !== undefined && name !== "") return name;
  }
  const fil = kw["$FIL"];
  if (fil !== undefined && fil !== "") return fil;
  const ds = child(sample, "DataSet");
  const id = ds ? attr(ds, "sampleID") : "unknown";
  return `Sample ${id}`;
}

/** Node children (Population, AndNode, OrNode, NotNode) of an element's Subpopulations child. */
function nodes(el: XmlElement): XmlElement[] {
  const sub = child(el, "Subpopulations");
  if (!sub) return [];
  return sub.children.filter(c => NODES.includes(localName(c.name)));
}

/** Everything needed to turn a gate dimension name into a CytoPop Dimension. */
interface Context {
  transforms: Map<string, XmlElement>; // transform element per parameter name as written (plain or compensated)
  kw: Record<string, string>;
  prefix: string; // matrix prefix, "" when there is no matrix
  suffix: string;
  matrixParams: Set<string>;
  report: string[];
  compensated: boolean; // set to true when a compensated dimension is seen
}

/** The plain parameter name when `name` is a compensated parameter name, else undefined. */
function plainOf(name: string, ctx: Context): string | undefined {
  if (ctx.prefix !== "" || ctx.suffix !== "") {
    if (name.startsWith(ctx.prefix) && name.endsWith(ctx.suffix)) {
      const rem = name.slice(ctx.prefix.length, name.length - ctx.suffix.length);
      if (ctx.matrixParams.has(rem)) return rem;
    }
  }
  if (name.startsWith("Comp-")) {
    const rem = name.slice(5);
    if (ctx.matrixParams.has(rem)) return rem;
  }
  if (name.startsWith("<") && name.endsWith(">")) {
    const rem = name.slice(1, -1);
    if (ctx.matrixParams.has(rem)) return rem;
  }
  return undefined;
}

/** $PnR for a plain parameter name, or 262144. */
function rangeOf(param: string, kw: Record<string, string>): number {
  let n = 1;
  while (true) {
    const key = `$P${n}N`;
    if (!(key in kw)) break;
    if (kw[key] === param) return Number(kw[`$P${n}R`] ?? "262144") || 262144;
    n++;
  }
  return 262144;
}

/** TransformSpec for one transform element; `param` is only used in report lines. */
function specOf(el: XmlElement, param: string, ctx: Context): TransformSpec {
  const ln = localName(el.name);
  if (ln === "linear") {
    // Linear scales and gates on Time are in raw value × gain (seconds), so divide to get raw values.
    const gain = num(el, "gain") || 1;
    const min = (num(el, "minRange") ?? 0) / gain;
    const max = num(el, "maxRange") !== undefined ? num(el, "maxRange")! / gain : rangeOf(param, ctx.kw);
    return { kind: "linear", min, max };
  }
  if (ln === "log") {
    const offset = num(el, "offset") ?? 1;
    const decades = num(el, "decades") ?? 4.5;
    const max = offset * Math.pow(10, decades);
    return { kind: "log", min: offset, max };
  }
  if (ln === "biex") {
    const maxRange = num(el, "maxRange") ?? 262144;
    const pos = num(el, "pos") ?? 4.418539922;
    const neg = num(el, "neg") ?? 0;
    const width = num(el, "width") ?? -10;
    const T = maxRange;
    const M = pos;
    const A = neg;
    const W = Math.log10(Math.abs(width)) / 2;
    return clampLogicle(T, W, M, A, ctx.report, param);
  }
  if (ln === "logicle") {
    const T = num(el, "T") ?? 262144;
    const W = num(el, "W") ?? 0.5;
    const M = num(el, "M") ?? 4.5;
    const A = num(el, "A") ?? 0;
    return clampLogicle(T, W, M, A, ctx.report, param);
  }
  if (ln === "fasinh") {
    const T = num(el, "T") ?? 262144;
    const M = num(el, "M") ?? 4.5;
    const A = num(el, "A") ?? 0;
    const c = T / Math.sinh(M * Math.LN10);
    const min = -c * Math.sinh(A * Math.LN10);
    return { kind: "arcsinh", cofactor: c, min, max: T };
  }
  ctx.report.push(`Transform ${ln} for ${param} is not supported; a linear scale is used`);
  const max = rangeOf(param, ctx.kw);
  return { kind: "linear", min: 0, max };
}

function clampLogicle(T: number, W: number, M: number, A: number, report: string[], param: string): TransformSpec {
  let changed = false;
  if (W < 0) { W = 0; changed = true; }
  if (W > M / 2) { W = M / 2; changed = true; }
  if (A < -W) { A = -W; changed = true; }
  if (A > M - 2 * W) { A = M - 2 * W; changed = true; }
  if (changed) {
    report.push(`Logicle scale for ${param} was adjusted to valid parameters`);
  }
  return { kind: "logicle", T, W, M, A };
}

/** Dimension for a gate dimension name: plain param plus the scale of the exact name, else of the plain name, else linear 0..$PnR. */
function dimensionOf(name: string, ctx: Context): Dimension {
  const plain = plainOf(name, ctx);
  if (plain !== undefined) {
    ctx.compensated = true;
  }
  let scale: TransformSpec;
  const exactEl = ctx.transforms.get(name);
  if (exactEl) {
    scale = specOf(exactEl, name, ctx);
  } else if (plain !== undefined) {
    const plainEl = ctx.transforms.get(plain);
    if (plainEl) {
      scale = specOf(plainEl, plain, ctx);
    } else {
      const max = rangeOf(plain, ctx.kw);
      scale = { kind: "linear", min: 0, max };
    }
  } else {
    const max = rangeOf(name, ctx.kw);
    scale = { kind: "linear", min: 0, max };
  }
  return { param: plain ?? name, scale };
}

/** Maps a stored gate value on `dim` to display units: undo the linear gain (see specOf), then apply the scale. */
function toDisplay(d: Dimension, dim: XmlElement, ctx: Context): { forward(v: number): number } {
  const name = dimName(dim);
  const el = ctx.transforms.get(name) ?? ctx.transforms.get(plainOf(name, ctx) ?? name);
  const gain = (el && localName(el.name) === "linear" && num(el, "gain")) || 1;
  const t = fromSpec(d.scale);
  return { forward: (v) => t.forward(v / gain) };
}

/** Parameter name of a gating:dimension element (its fcs-dimension child's name). Throws Unsupported when missing. */
function dimName(dim: XmlElement): string {
  const fd = child(dim, "fcs-dimension");
  if (!fd) throw new Unsupported("Missing fcs-dimension in gate dimension");
  const name = attr(fd, "name");
  if (name === undefined) throw new Unsupported("Missing name on fcs-dimension");
  return name;
}

/** The two coordinate values of a gating:vertex element. Throws Unsupported when missing or not finite. */
function vertex(v: XmlElement): [number, number] {
  const coords = childrenNamed(v, "coordinate");
  if (coords.length !== 2) throw new Unsupported("Vertex must have exactly two coordinates");
  const v1 = num(coords[0]!, "value");
  const v2 = num(coords[1]!, "value");
  if (v1 === undefined || v2 === undefined) throw new Unsupported("Missing coordinate value");
  if (!Number.isFinite(v1) || !Number.isFinite(v2)) throw new Unsupported("Non-finite coordinate value");
  return [v1, v2];
}

/** Converts the single shape inside a Gate element. Throws Unsupported with a short reason. */
function gateOf(gateEl: XmlElement, ctx: Context): Gate {
  const shape = gateEl.children.find(c => !["dimension"].includes(localName(c.name)));
  if (!shape) throw new Unsupported("Gate must hold one shape");

  const dims = childrenNamed(shape, "dimension");
  if (dims.length === 0) throw new Unsupported("Gate has no dimensions");

  if (attr(shape, "eventsInside") === "0") {
    throw new Unsupported("eventsInside=0 is not supported");
  }

  const ln = localName(shape.name);

  if (ln === "RectangleGate") {
    if (dims.length === 1) {
      const d = dimensionOf(dimName(dims[0]!), ctx);
      const minRaw = num(dims[0]!, "min");
      const maxRaw = num(dims[0]!, "max");
      const t = toDisplay(d, dims[0]!, ctx);
      const min = minRaw === undefined ? -OPEN : t.forward(minRaw);
      const max = maxRaw === undefined ? OPEN : t.forward(maxRaw);
      if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Unsupported("Non-finite gate edge");
      return { kind: "range", x: d, min, max };
    }
    if (dims.length === 2) {
      const dx = dimensionOf(dimName(dims[0]!), ctx);
      const dy = dimensionOf(dimName(dims[1]!), ctx);
      const tx = toDisplay(dx, dims[0]!, ctx);
      const ty = toDisplay(dy, dims[1]!, ctx);
      const xMinRaw = num(dims[0]!, "min");
      const xMaxRaw = num(dims[0]!, "max");
      const yMinRaw = num(dims[1]!, "min");
      const yMaxRaw = num(dims[1]!, "max");
      const xMin = xMinRaw === undefined ? -OPEN : tx.forward(xMinRaw);
      const xMax = xMaxRaw === undefined ? OPEN : tx.forward(xMaxRaw);
      const yMin = yMinRaw === undefined ? -OPEN : ty.forward(yMinRaw);
      const yMax = yMaxRaw === undefined ? OPEN : ty.forward(yMaxRaw);
      if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) throw new Unsupported("Non-finite gate edge");
      return { kind: "rectangle", x: dx, y: dy, xMin, xMax, yMin, yMax };
    }
    throw new Unsupported("RectangleGate must have 1 or 2 dimensions");
  }

  if (ln === "PolygonGate") {
    if (dims.length !== 2) throw new Unsupported("PolygonGate must have 2 dimensions");
    const dx = dimensionOf(dimName(dims[0]!), ctx);
    const dy = dimensionOf(dimName(dims[1]!), ctx);
    const tx = toDisplay(dx, dims[0]!, ctx);
    const ty = toDisplay(dy, dims[1]!, ctx);
    const verts = childrenNamed(shape, "vertex");
    if (verts.length < 3) throw new Unsupported("Polygon must have at least 3 vertices");
    const points: [number, number][] = [];
    for (const v of verts) {
      const [xRaw, yRaw] = vertex(v);
      const x = tx.forward(xRaw);
      const y = ty.forward(yRaw);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Unsupported("Non-finite polygon point");
      points.push([x, y]);
    }
    return { kind: "polygon", x: dx, y: dy, points };
  }

  if (ln === "EllipsoidGate") {
    if (dims.length !== 2) throw new Unsupported("EllipsoidGate must have 2 dimensions");
    const dx = dimensionOf(dimName(dims[0]!), ctx);
    const dy = dimensionOf(dimName(dims[1]!), ctx);
    const fociEl = child(shape, "foci");
    const edgeEl = child(shape, "edge");
    if (!fociEl || !edgeEl) throw new Unsupported("EllipsoidGate missing foci or edge");
    const fociVerts = childrenNamed(fociEl, "vertex");
    const edgeVerts = childrenNamed(edgeEl, "vertex");
    if (fociVerts.length !== 2 || edgeVerts.length !== 4) throw new Unsupported("Invalid ellipse vertices count");
    const [fx1, fy1] = vertex(fociVerts[0]!);
    const [fx2, fy2] = vertex(fociVerts[1]!);
    const cx = (fx1 + fx2) / 512; // divide by 256 then average
    const cy = (fy1 + fy2) / 512;
    const e0 = vertex(edgeVerts[0]!);
    const rx = Math.hypot(e0[0] / 256 - cx, e0[1] / 256 - cy);
    const angle = Math.atan2((e0[1] / 256) - cy, (e0[0] / 256) - cx);
    const f = Math.hypot(fx1 - fx2, fy1 - fy2) / 512;
    let ry = Math.sqrt(Math.max(rx * rx - f * f, 0));
    if (ry === 0) {
      const e2 = vertex(edgeVerts[2]!);
      ry = Math.hypot(e2[0] / 256 - cx, e2[1] / 256 - cy);
    }
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(angle)) {
      throw new Unsupported("Non-finite ellipse parameters");
    }
    // shortcut: the shape is rebuilt from rounded edge points on the source's 256-step display, so counts can differ slightly.
    ctx.report.push("Ellipse gates are converted approximately; their counts can differ by a few percent");
    return { kind: "ellipse", x: dx, y: dy, cx, cy, rx, ry, angle };
  }

  throw new Unsupported(`Gate shape ${ln} is not supported`);
}

function readSpillover(el: XmlElement): Spillover | undefined {
  const sm = child(el, "spilloverMatrix");
  if (!sm) return undefined;
  const rows = childrenNamed(sm, "spillover");
  if (rows.length === 0) return undefined;
  const params: string[] = [];
  for (const r of rows) {
    const p = attr(r, "parameter");
    if (p !== undefined) params.push(p);
  }
  const n = params.length;
  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const rowVals: number[] = [];
    const rowEl = rows[i]!;
    const coeffs = childrenNamed(rowEl, "coefficient");
    for (let j = 0; j < n; j++) {
      let val = 0;
      if (i === j) val = 1;
      else {
        const c = coeffs.find(c => attr(c, "parameter") === params[j]);
        if (c) {
          const v = num(c, "value");
          if (v !== undefined) val = v;
        }
      }
      rowVals.push(val);
    }
    matrix.push(rowVals);
  }
  return { parameters: params, matrix };
}

export function readWsp(xml: string, openNames: string[]): WspImport {
  const root = parseXml(xml);
  if (localName(root.name) !== "Workspace") {
    throw new Error("This file is not a .wsp workspace");
  }

  const sampleList = child(root, "SampleList");
  if (!sampleList) {
    throw new Error("The workspace lists no samples");
  }
  const samplesEl = childrenNamed(sampleList, "Sample");
  if (samplesEl.length === 0) {
    throw new Error("The workspace lists no samples");
  }

  const samples: string[] = [];
  const sampleData: { el: XmlElement; name: string; kw: Record<string, string> }[] = [];

  for (const s of samplesEl) {
    const kw = keywords(s);
    const name = sampleName(s, kw);
    samples.push(name);
    sampleData.push({ el: s, name, kw });
  }

  let sourceIdx = -1;
  // First match by openNames (name or $FIL)
  for (let i = 0; i < sampleData.length; i++) {
    const sd = sampleData[i]!;
    if (openNames.includes(sd.name) || openNames.includes(sd.kw["$FIL"] ?? "")) {
      sourceIdx = i;
      break;
    }
  }
  // Fallback: first with populations
  if (sourceIdx === -1) {
    for (let i = 0; i < sampleData.length; i++) {
      const sd = sampleData[i]!;
      const sn = child(sd.el, "SampleNode");
      if (sn && nodes(sn).length > 0) {
        sourceIdx = i;
        break;
      }
    }
  }
  // Fallback: first sample
  if (sourceIdx === -1) {
    sourceIdx = 0;
  }

  const sourceSample = sampleData[sourceIdx]!.el;
  const sourceName = sampleData[sourceIdx]!.name;
  const sourceKw = sampleData[sourceIdx]!.kw;

  // Build transforms map
  const transEl = child(sourceSample, "Transformations");
  const transformsMap = new Map<string, XmlElement>();
  if (transEl) {
    for (const t of transEl.children) {
      const paramChild = child(t, "parameter");
      if (paramChild) {
        const paramName = attr(paramChild, "name");
        if (paramName !== undefined) {
          transformsMap.set(paramName, t);
        }
      }
    }
  }

  // Build spillover and matrix params
  const spillover = readSpillover(sourceSample);
  let prefix = "";
  let suffix = "";
  const matrixParams = new Set<string>();
  if (spillover) {
    const sm = child(sourceSample, "spilloverMatrix");
    if (sm) {
      prefix = attr(sm, "prefix") ?? "";
      suffix = attr(sm, "suffix") ?? "";
      for (const p of spillover.parameters) matrixParams.add(p);
    }
  }

  const ctx: Context = {
    transforms: transformsMap,
    kw: sourceKw,
    prefix,
    suffix,
    matrixParams,
    report: [],
    compensated: false,
  };

  // Walk populations
  const sn = child(sourceSample, "SampleNode");
  if (!sn) {
    return { populations: [], scales: {}, spillover, compensated: ctx.compensated, samples, source: sourceName, report: [] };
  }

  const populations: Population[] = [];
  const pathToId = new Map<string, string>();
  const pending: { pop: Population & { gate: BooleanGate }; path: string; deps: string[] }[] = [];
  let idCounter = 1;

  // Pre-order walk, so parents come before children; a node that cannot be converted takes its subtree with it.
  function walk(el: XmlElement, parentId: string | null, pathParts: string[]): void {
    const name = attr(el, "name") ?? "";
    const path = [...pathParts, name].join("/");
    const id = `w${idCounter++}`;
    try {
      const ln = localName(el.name);
      if (ln === "Population") {
        const gateEl = child(el, "Gate");
        if (!gateEl) throw new Unsupported("Missing Gate element");
        populations.push({ id, name, parentId, gate: gateOf(gateEl, ctx) });
      } else {
        const op: BooleanGate["op"] = ln === "AndNode" ? "and" : ln === "OrNode" ? "or" : "not";
        const deps = childrenNamed(child(el, "Dependents") ?? el, "Dependent").map((d) => attr(d, "name") ?? "");
        if (op === "not" ? deps.length !== 1 : deps.length < 2) throw new Unsupported(`an ${op.toUpperCase()} population needs ${op === "not" ? "exactly one input" : "at least two inputs"}`);
        const pop: Population & { gate: BooleanGate } = { id, name, parentId, gate: { kind: "boolean", op, of: [] } };
        populations.push(pop);
        pending.push({ pop, path, deps });
      }
    } catch (e) {
      if (!(e instanceof Unsupported)) throw e;
      ctx.report.push(`${path}: ${e.message}`);
      return;
    }
    pathToId.set(path, id);
    for (const c of nodes(el)) walk(c, id, [...pathParts, name]);
  }
  for (const node of nodes(sn)) walk(node, null, []);

  // Inputs can come later in the tree than the combination, so resolve after the walk.
  const removed = new Set<string>();
  for (const { pop, path, deps } of pending) {
    const ids = deps.map((d) => pathToId.get(d));
    if (ids.every((i) => i !== undefined)) pop.gate.of = ids as string[];
    else {
      ctx.report.push(`${path}: a combined population refers to a population that was not imported`);
      removed.add(pop.id);
    }
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of populations) {
      const gone = (p.parentId !== null && removed.has(p.parentId)) || (p.gate.kind === "boolean" && p.gate.of.some((i) => removed.has(i)));
      if (gone && !removed.has(p.id)) removed.add(p.id), (grew = true);
    }
  }
  const finalPopulations = populations.filter((p) => !removed.has(p.id));

  // Build scales
  const scales: Record<string, TransformSpec> = {};
  let n = 1;
  while (true) {
    const key = `$P${n}N`;
    if (!(key in sourceKw)) break;
    const paramName = sourceKw[key]!;
    // Check if this param has a transform under either name
    const plainEl = transformsMap.get(paramName);
    const compPrefix = prefix || "Comp-";
    const compName = compPrefix + paramName + suffix;
    const compEl = transformsMap.get(compName);

    let scale: TransformSpec | undefined;
    if (ctx.compensated) {
      if (compEl && matrixParams.has(paramName)) {
        scale = specOf(compEl, compName, ctx);
      } else if (plainEl) {
        scale = specOf(plainEl, paramName, ctx);
      }
    } else {
      if (plainEl) {
        scale = specOf(plainEl, paramName, ctx);
      } else if (compEl && matrixParams.has(paramName)) {
        scale = specOf(compEl, compName, ctx);
      }
    }

    if (scale !== undefined) {
      scales[paramName] = scale;
    }
    n++;
  }

  // Check for multiple samples with populations
  let popCountSamples = 0;
  for (const sd of sampleData) {
    const snEl = child(sd.el, "SampleNode");
    if (snEl && nodes(snEl).length > 0) {
      popCountSamples++;
    }
  }
  if (popCountSamples > 1) {
    ctx.report.push(`Gates were read from ${sourceName}; CytoPop applies one gate tree to every sample, so gates adjusted on other samples in the workspace were not imported`);
  }

  return {
    populations: finalPopulations,
    scales,
    spillover,
    compensated: ctx.compensated,
    samples,
    source: sourceName,
    report: [...new Set(ctx.report)],
  };
}
