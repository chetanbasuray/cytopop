import { compensate, isSpillover, spilloverFor } from "../core/compensation";
import type { Spillover } from "../core/fcs";
import type { FcsFile } from "../core/fcs";
import type { Dimension } from "../core/gates";
import type { Population } from "../core/populations";
import { evaluateFormula, isDerivedParameter, parseFormula, type DerivedParameter } from "../core/formula";
import { arcsinh, hyperlog, linear, log, logicle, type TransformSpec } from "../core/transforms";

export type Tool = "none" | "rect" | "polygon" | "ellipse" | "quad" | "hinge" | "divider" | "range";
export const HIST = "__histogram__";
export const DEMO_NAME = "Demo sample (synthetic)";

export interface Sample {
  id: string;
  name: string;
  file: FcsFile;
  names: string[];
  compensated?: Float32Array[];
  compensatedWith?: string; // JSON of the matrix behind `compensated`
  derivedCols?: { base: Float32Array[]; key: string; all: Float32Array[] };
}

export interface Template {
  populations: Population[];
  scales: Record<string, TransformSpec>;
  spillover?: Spillover; // edited compensation matrix
  samples?: string[]; // file names open when a workspace was saved
  derived?: DerivedParameter[];
  groups?: Record<string, string>; // sample file name to group name
}

export function isTemplate(t: unknown): t is Template {
  return !!t && typeof t === "object" && Array.isArray((t as Template).populations) && typeof (t as Template).scales === "object" &&
    ((t as Template).spillover === undefined || isSpillover((t as Template).spillover)) &&
    ((t as Template).samples === undefined || (Array.isArray((t as Template).samples) && (t as Template).samples!.every((n) => typeof n === "string"))) &&
    ((t as Template).derived === undefined || (Array.isArray((t as Template).derived) && (t as Template).derived!.every(isDerivedParameter))) &&
    ((t as Template).groups === undefined || (!!(t as Template).groups && typeof (t as Template).groups === "object" && Object.values((t as Template).groups!).every((g) => typeof g === "string")));
}

/** Sets a sample's parameter names to its file's parameters followed by the derived ones. */
export function withDerived(s: Sample, derived: DerivedParameter[]): Sample {
  const names = [...s.file.parameters.map((p) => p.name), ...derived.map((d) => d.name)];
  if (names.join("\n") !== s.names.join("\n")) s.names = names; // keep the array stable for memo dependencies
  return s;
}

function baseColumns(s: Sample, useCompensation: boolean, edited?: Spillover): Float32Array[] {
  const names = s.file.parameters.map((p) => p.name);
  const spill = spilloverFor(names, s.file.spillover, edited);
  if (!useCompensation || !spill) return s.file.data;
  const key = JSON.stringify(spill);
  if (s.compensatedWith !== key || !s.compensated) {
    s.compensated = compensate(names, s.file.data, spill);
    s.compensatedWith = key;
  }
  return s.compensated;
}

/** File (optionally compensated) columns, then one column per derived name in `s.names`. */
export function columns(s: Sample, useCompensation: boolean, edited?: Spillover, derived: DerivedParameter[] = []): Float32Array[] {
  const base = baseColumns(s, useCompensation, edited);
  const used = derived.filter((d) => s.names.includes(d.name));
  if (!used.length) return base;
  const key = JSON.stringify(used);
  if (s.derivedCols?.base !== base || s.derivedCols.key !== key) {
    const names = s.file.parameters.map((p) => p.name);
    const cols = [...base];
    for (const d of used) {
      // A sample without a formula's inputs gets an empty (NaN) column, so gates and plots still line up.
      let col: Float32Array;
      try {
        col = evaluateFormula(parseFormula(d.formula, names), names, cols);
      } catch {
        col = new Float32Array(s.file.eventCount).fill(NaN);
      }
      names.push(d.name);
      cols.push(col);
    }
    s.derivedCols = { base, key, all: cols };
  }
  return s.derivedCols.all;
}

/** Linear scale over the middle 99 % of a derived column's finite values, padded by 5 %; ratios have long tails. */
export function rangeScale(col: Float32Array): TransformSpec {
  const v = col.filter(Number.isFinite).sort();
  const at = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]!;
  const [min, max] = v.length ? [at(0.005), at(0.995)] : [0, 1];
  if (!(max > min)) return { kind: "linear", min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.05;
  return { kind: "linear", min: min - pad, max: max + pad };
}

export function defaultScale(s: Sample | undefined, name: string): TransformSpec {
  const p = s?.file.parameters.find((q) => q.name === name);
  const range = p?.range && p.range > 1 ? p.range : 262144;
  if (/^(FSC|SSC|Time)/i.test(name)) return { kind: "linear", min: 0, max: range };
  return { kind: "logicle", T: Math.max(range, 1024), W: 0.5, M: 4.5, A: 0 };
}

export function retarget(spec: TransformSpec, kind: TransformSpec["kind"]): TransformSpec {
  const top = spec.kind === "logicle" || spec.kind === "hyperlog" ? spec.T : spec.max;
  switch (kind) {
    case "linear": return linear(0, top).spec;
    case "log": return log(1, top).spec;
    case "arcsinh": return arcsinh(150, -1000, top).spec;
    case "logicle": return logicle(top, 0.5, 4.5, 0).spec;
    case "hyperlog": return hyperlog(top, 0.5, 4.5, 0).spec;
  }
}

export function paramLabel(s: Sample, name: string): string {
  const p = s.file.parameters.find((q) => q.name === name);
  return p?.label && p.label !== name ? `${name} (${p.label})` : name;
}

export const sameDim = (a: Dimension, b: Dimension | null) =>
  !!b && a.param === b.param && JSON.stringify(a.scale) === JSON.stringify(b.scale);

export function descendants(populations: Population[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of populations) {
      // Boolean populations go with any population they combine.
      const uses = (p.parentId !== null && out.has(p.parentId)) || (p.gate.kind === "boolean" && p.gate.of.some((id) => out.has(id)));
      if (uses && !out.has(p.id)) out.add(p.id), (grew = true);
    }
  }
  return out;
}

let nextId = Date.now();
export const newId = (prefix = "p") => `${prefix}${(nextId++).toString(36)}`;

export function download(name: string, text: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
