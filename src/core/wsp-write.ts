// Writer for .wsp workspace files, the counterpart of wsp.ts. Gate coordinates are written as raw data values.

import type { FcsFile, Spillover } from "./fcs";
import type { Dimension, Gate } from "./gates";
import type { Population } from "./populations";
import { fromSpec, type TransformSpec } from "./transforms";
import { writeXml, type XmlElement } from "./xml";

export interface WspSampleInput {
  name: string; // file name
  file: FcsFile;
  spillover?: Spillover; // matrix used for this sample when compensating
  counts: Map<string, number>; // population id to event count in this sample
}

export interface WspExportInput {
  populations: Population[]; // with thresholds already resolved
  scales: Record<string, TransformSpec>; // per parameter; parameters without one get linear 0..$PnR
  compensated: boolean;
  samples: WspSampleInput[];
}

const PREFIX = "Comp-";
const OPEN = 1e8; // edges at or beyond this are unbounded (quadrants use ±1e9)
const NS = {
  "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
  "xmlns:gating": "http://www.isac-net.org/std/Gating-ML/v2.0/gating",
  "xmlns:transforms": "http://www.isac-net.org/std/Gating-ML/v2.0/transformations",
  "xmlns:data-type": "http://www.isac-net.org/std/Gating-ML/v2.0/datatypes",
};

/** Thrown while converting one population; becomes a warning and skips that population and its descendants. */
class Unsupported extends Error {}

/** Shorthand element builder. */
function el(name: string, attrs: Record<string, string | number> = {}, children: XmlElement[] = []): XmlElement {
  const strAttrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    strAttrs[k] = String(v);
  }
  return { name, attrs: strAttrs, children, text: "" };
}

/** Transform element for one parameter name as written (plain or "Comp-" name). */
function transformEl(spec: TransformSpec, name: string, warnings: string[]): XmlElement {
  const paramChild = el("data-type:parameter", { "data-type:name": name });
  if (spec.kind === "linear") {
    return el(
      "transforms:linear",
      { "transforms:minRange": spec.min, "transforms:maxRange": spec.max, gain: "1" },
      [paramChild]
    );
  }
  if (spec.kind === "log") {
    const decades = Math.log10(spec.max / spec.min);
    return el(
      "transforms:log",
      { "transforms:offset": spec.min, "transforms:decades": decades },
      [paramChild]
    );
  }
  if (spec.kind === "logicle") {
    return el(
      "transforms:logicle",
      { "transforms:length": "256", "transforms:T": spec.T, "transforms:W": spec.W, "transforms:M": spec.M, "transforms:A": spec.A },
      [paramChild]
    );
  }
  if (spec.kind === "arcsinh") {
    const c = spec.cofactor;
    const max = spec.max;
    const min = spec.min;
    const M = Math.asinh(max / c) / Math.LN10;
    const A = min >= 0 ? 0 : Math.asinh(-min / c) / Math.LN10;
    return el(
      "transforms:fasinh",
      { "transforms:length": "256", "transforms:maxRange": max, "transforms:T": max, "transforms:M": M, "transforms:A": A, "transforms:W": "0" },
      [paramChild]
    );
  }
  if (spec.kind === "hyperlog") {
    warnings.push(`${name}: hyperlog scale saved as logicle`);
    return el(
      "transforms:logicle",
      { "transforms:length": "256", "transforms:T": spec.T, "transforms:W": spec.W, "transforms:M": spec.M, "transforms:A": spec.A },
      [paramChild]
    );
  }
  const never: never = spec;
  throw new Unsupported(`Unknown transform ${JSON.stringify(never)}`);
}

/** Gate dimension element; `value` holds the raw min/max to write (omit open edges). */
function dimensionEl(name: string, min?: number, max?: number): XmlElement {
  const attrs: Record<string, string | number> = {};
  if (min !== undefined) attrs["gating:min"] = min;
  if (max !== undefined) attrs["gating:max"] = max;
  return el("gating:dimension", attrs, [el("data-type:fcs-dimension", { "data-type:name": name })]);
}

function vertexEl(x: number, y: number): XmlElement {
  return el(
    "gating:vertex",
    {},
    [
      el("gating:coordinate", { "data-type:value": x }),
      el("gating:coordinate", { "data-type:value": y }),
    ]
  );
}

/** Gate element holding the converted shape. `dimName` gives the written parameter name (compensated or not). */
function gateEl(gate: Gate, id: number, dimName: (d: Dimension) => string): XmlElement {
  const idAttr = `ID${id}`;
  // Open edges are omitted; the others are written as raw values.
  const raw = (dim: Dimension, v: number): number | undefined => {
    if (v <= -OPEN || v >= OPEN) return undefined;
    const r = fromSpec(dim.scale).inverse(v);
    if (!Number.isFinite(r)) throw new Unsupported("a gate edge is outside its scale");
    return r;
  };
  if (gate.kind === "range") {
    const shape = el("gating:RectangleGate", { eventsInside: "1" }, [dimensionEl(dimName(gate.x), raw(gate.x, gate.min), raw(gate.x, gate.max))]);
    return el("Gate", { "gating:id": idAttr }, [shape]);
  }
  if (gate.kind === "rectangle") {
    const shape = el("gating:RectangleGate", { eventsInside: "1" }, [
      dimensionEl(dimName(gate.x), raw(gate.x, gate.xMin), raw(gate.x, gate.xMax)),
      dimensionEl(dimName(gate.y), raw(gate.y, gate.yMin), raw(gate.y, gate.yMax)),
    ]);
    return el("Gate", { "gating:id": idAttr }, [shape]);
  }
  if (gate.kind === "polygon") {
    const tx = fromSpec(gate.x.scale);
    const ty = fromSpec(gate.y.scale);
    const dNameX = dimName(gate.x);
    const dNameY = dimName(gate.y);
    const vertices: XmlElement[] = [];
    for (const [x, y] of gate.points) {
      const xRaw = tx.inverse(x);
      const yRaw = ty.inverse(y);
      if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) throw new Unsupported("a gate edge is outside its scale");
      vertices.push(vertexEl(xRaw, yRaw));
    }
    return el(
      "Gate",
      { "gating:id": idAttr },
      [el("gating:PolygonGate", { eventsInside: "1", quadId: "-1", gateResolution: "256" }, [dimensionEl(dNameX), dimensionEl(dNameY), ...vertices])]
    );
  }
  if (gate.kind === "ellipse") {
    const tx = fromSpec(gate.x.scale);
    const ty = fromSpec(gate.y.scale);
    const dNameX = dimName(gate.x);
    const dNameY = dimName(gate.y);
    const vertices: XmlElement[] = [];
    for (let k = 0; k < 64; k++) {
      const t = (2 * Math.PI * k) / 64;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      const cosA = Math.cos(gate.angle);
      const sinA = Math.sin(gate.angle);
      const xDisp = gate.cx + gate.rx * cosT * cosA - gate.ry * sinT * sinA;
      const yDisp = gate.cy + gate.rx * cosT * sinA + gate.ry * sinT * cosA;
      const xRaw = tx.inverse(xDisp);
      const yRaw = ty.inverse(yDisp);
      if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) throw new Unsupported("a gate edge is outside its scale");
      vertices.push(vertexEl(xRaw, yRaw));
    }
    return el(
      "Gate",
      { "gating:id": idAttr },
      [el("gating:PolygonGate", { eventsInside: "1", quadId: "-1", gateResolution: "256" }, [dimensionEl(dNameX), dimensionEl(dNameY), ...vertices])]
    );
  }
  const never: never = gate;
  throw new Unsupported(`Unknown gate ${JSON.stringify(never)}`);
}

/** Builds the Subpopulations tree for one sample. */
function tree(populations: Population[], counts: Map<string, number>, dimName: (d: Dimension) => string, warnings: string[]): XmlElement {
  const byId = new Map(populations.map((p) => [p.id, p]));
  const childrenOf = new Map<string, Population[]>();
  for (const p of populations) {
    const key = p.parentId ?? "";
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(p);
  }

  let gateCounter = 0;

  // Decide up front what can be written: booleans may refer to populations later in the list, so repeat until stable.
  const pathOf = (p: Population): string => (p.parentId && byId.get(p.parentId) ? `${pathOf(byId.get(p.parentId)!)}/` : "") + p.name;
  const skipped = new Set<string>();
  const skip = (p: Population, why: string) => (skipped.add(p.id), warnings.push(`${pathOf(p)}: ${why}`));
  for (let grew = true; grew; ) {
    const before = skipped.size;
    for (const p of populations) {
      if (skipped.has(p.id)) continue;
      const g = p.gate;
      if (p.parentId && (skipped.has(p.parentId) || !byId.has(p.parentId))) skipped.add(p.id);
      else if (g.kind === "clean") skip(p, "clean-up gates cannot be saved in a .wsp workspace");
      else if (g.kind === "boolean") {
        if (g.of.some((i) => skipped.has(i) || !byId.has(i))) skip(p, "a combined population uses a population that could not be saved");
      } else {
        try {
          gateEl(g, 0, dimName);
        } catch (e) {
          if (!(e instanceof Unsupported)) throw e;
          skip(p, e.message);
        }
      }
    }
    grew = skipped.size > before;
  }

  function buildNode(id: string, pathParts: string[]): XmlElement | null {
    if (skipped.has(id)) return null;

    const pop = byId.get(id)!;
    const name = pop.name;
    if (name.includes("/")) {
      warnings.push(`${[...pathParts, name].join("/")}: names with "/" may not open correctly in other software`);
    }
    const path = [...pathParts, name].join("/");

    const g = pop.gate;
    if (g.kind === "clean") return null; // already reported by the pre-pass

    try {
      if (g.kind === "boolean") {
        const op = g.op === "and" ? "AndNode" : g.op === "or" ? "OrNode" : "NotNode";
        const countVal = counts.get(id) ?? 0;
        const nodeEl = el(op, { name, annotation: "", owningGroup: "", count: countVal });
        const deps: XmlElement[] = [];
        for (const depId of g.of) {
          const depPop = byId.get(depId);
          if (!depPop) continue;
          const depPathParts: string[] = [];
          let curr: Population | undefined = depPop;
          while (curr) {
            depPathParts.unshift(curr.name);
            curr = curr.parentId ? byId.get(curr.parentId) : undefined;
          }
          deps.push(el("Dependent", { name: depPathParts.join("/") }));
        }
        nodeEl.children.push(el("Dependents", {}, deps));
        const kids = childrenOf.get(id) ?? [];
        if (kids.length > 0) {
          const subEls: XmlElement[] = [];
          for (const k of kids) {
            const childNode = buildNode(k.id, [...pathParts, name]);
            if (childNode) subEls.push(childNode);
          }
          nodeEl.children.push(el("Subpopulations", {}, subEls));
        }
        return nodeEl;
      }

      const gateId = ++gateCounter;
      const finalGateEl = gateEl(g, gateId, dimName);
      const countVal = counts.get(id) ?? 0;
      const popEl = el("Population", { name, annotation: "", owningGroup: "", count: countVal });
      const graphEl = el("Graph", { type: "Pseudocolor" });
      graphEl.children.push(el("Axis", { dimension: "x", name: dimName(g.x) }));
      if (g.kind === "rectangle" || g.kind === "polygon" || g.kind === "ellipse") {
        graphEl.children.push(el("Axis", { dimension: "y", name: dimName(g.y) }));
      }
      popEl.children.push(graphEl);
      popEl.children.push(finalGateEl);

      if (g.kind === "ellipse") {
        warnings.push("Ellipse gates are saved as 64-point polygons");
      }

      const kids = childrenOf.get(id) ?? [];
      if (kids.length > 0) {
        const subEls: XmlElement[] = [];
        for (const k of kids) {
          const childNode = buildNode(k.id, [...pathParts, name]);
          if (childNode) subEls.push(childNode);
        }
        popEl.children.push(el("Subpopulations", {}, subEls));
      }
      return popEl;
    } catch (e) {
      if (e instanceof Unsupported) {
        warnings.push(`${path}: ${e.message}`);
        return null;
      }
      throw e;
    }
  }

  const roots: XmlElement[] = [];
  for (const p of populations) {
    if (p.parentId === null) {
      const node = buildNode(p.id, []);
      if (node) roots.push(node);
    }
  }
  return el("Subpopulations", {}, roots);
}

function sampleEl(s: WspSampleInput, sampleID: number, input: WspExportInput, warnings: string[]): XmlElement {
  const children: XmlElement[] = [];
  children.push(el("DataSet", { uri: "file:" + encodeURI(s.name), sampleID: String(sampleID) }));

  if (input.compensated && s.spillover) {
    const params = s.spillover.parameters;
    const matrix = s.spillover.matrix;
    const paramEls: XmlElement[] = [];
    for (const p of params) {
      paramEls.push(el("data-type:parameter", { "data-type:name": p, userProvidedCompInfix: PREFIX + p }));
    }
    const rowEls: XmlElement[] = [];
    for (let i = 0; i < params.length; i++) {
      const rowParams = params[i]!;
      const coeffEls: XmlElement[] = [];
      for (let j = 0; j < params.length; j++) {
        const colParam = params[j]!;
        const val = matrix[i]![j]!;
        coeffEls.push(el("transforms:coefficient", { "data-type:parameter": colParam, "transforms:value": val }));
      }
      rowEls.push(el("transforms:spillover", { "data-type:parameter": rowParams, userProvidedCompInfix: PREFIX + rowParams }, coeffEls));
    }
    children.push(
      el(
        "transforms:spilloverMatrix",
        { spectral: "0", prefix: PREFIX, suffix: "", name: "CytoPop", editable: "1", status: "FINALIZED", "transforms:id": crypto.randomUUID() },
        [el("data-type:parameters", {}, paramEls), ...rowEls]
      )
    );
  }

  const transChildren: XmlElement[] = [];
  for (const p of s.file.parameters) {
    const paramName = p.name;
    const scale = input.scales[paramName] ?? { kind: "linear" as const, min: 0, max: p.range };
    transChildren.push(transformEl(scale, paramName, warnings));
    if (input.compensated && s.spillover) {
      const isCompensated = s.spillover.parameters.includes(paramName);
      if (isCompensated) {
        const compScale = input.scales[PREFIX + paramName] ?? scale;
        transChildren.push(transformEl(compScale, PREFIX + paramName, warnings));
      }
    }
  }
  children.push(el("Transformations", {}, transChildren));

  const kwEls: XmlElement[] = [];
  for (const [k, v] of Object.entries(s.file.keywords)) {
    kwEls.push(el("Keyword", { name: k, value: v }));
  }
  // Ensure $TOT, $PAR, $PnN, $PnR are present
  if (!s.file.keywords["$TOT"]) {
    kwEls.push(el("Keyword", { name: "$TOT", value: String(s.file.eventCount) }));
  }
  if (!s.file.keywords["$PAR"]) {
    kwEls.push(el("Keyword", { name: "$PAR", value: String(s.file.parameters.length) }));
  }
  for (let i = 1; i <= s.file.parameters.length; i++) {
    const pNameKey = `$P${i}N`;
    const pRangeKey = `$P${i}R`;
    if (!s.file.keywords[pNameKey]) {
      kwEls.push(el("Keyword", { name: pNameKey, value: s.file.parameters[i - 1]!.name }));
    }
    if (!s.file.keywords[pRangeKey]) {
      kwEls.push(el("Keyword", { name: pRangeKey, value: String(s.file.parameters[i - 1]!.range) }));
    }
  }
  children.push(el("Keywords", {}, kwEls));

  const dimName = (d: Dimension) => {
    if (!s.file.parameters.some((p) => p.name === d.param)) {
      throw new Unsupported(`${d.param} is a derived parameter and cannot be saved`);
    }
    if (input.compensated && s.spillover && s.spillover.parameters.includes(d.param)) {
      return PREFIX + d.param;
    }
    return d.param;
  };

  const sampleNodeChildren: XmlElement[] = [tree(input.populations, s.counts, dimName, warnings)];
  children.push(el("SampleNode", { name: s.name, annotation: "", owningGroup: "", count: s.file.eventCount, sampleID: String(sampleID) }, sampleNodeChildren));

  return el("Sample", {}, children);
}

/** Returns the workspace XML and one warning per thing that could not be represented. Warnings are deduplicated. */
export function writeWsp(input: WspExportInput): { xml: string; warnings: string[] } {
  const warnings: string[] = [];
  const sampleEls: XmlElement[] = [];
  for (let i = 0; i < input.samples.length; i++) {
    const s = input.samples[i]!;
    sampleEls.push(sampleEl(s, i + 1, input, warnings));
  }

  const groupNode = el("GroupNode", { name: "All Samples", annotation: "", owningGroup: "All Samples" }, [
    el("Group", { name: "All Samples" }, [
      el("SampleRefs", {}, input.samples.map((_, i) => el("SampleRef", { sampleID: String(i + 1) })))
    ])
  ]);

  const root = el(
    "Workspace",
    { version: "20.0", modDate: new Date().toUTCString(), curGroup: "All Samples", ...NS },
    [
      el("Groups", {}, [groupNode]),
      el("SampleList", {}, sampleEls)
    ]
  );

  return { xml: writeXml(root), warnings: [...new Set(warnings)] };
}
