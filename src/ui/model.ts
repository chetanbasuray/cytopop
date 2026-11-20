import { compensate } from "../core/compensation";
import type { FcsFile } from "../core/fcs";
import type { Dimension } from "../core/gates";
import type { Population } from "../core/populations";
import { arcsinh, linear, log, logicle, type TransformSpec } from "../core/transforms";

export type Tool = "none" | "rect" | "polygon" | "ellipse" | "quad" | "range";
export const HIST = "__histogram__";
export const DEMO_NAME = "Demo sample (synthetic)";

export interface Sample {
  id: string;
  name: string;
  file: FcsFile;
  names: string[];
  compensated?: Float32Array[];
}

export interface Template {
  populations: Population[];
  scales: Record<string, TransformSpec>;
}

export function isTemplate(t: unknown): t is Template {
  return !!t && typeof t === "object" && Array.isArray((t as Template).populations) && typeof (t as Template).scales === "object";
}

export function columns(s: Sample, useCompensation: boolean): Float32Array[] {
  if (!useCompensation || !s.file.spillover) return s.file.data;
  s.compensated ??= compensate(s.names, s.file.data, s.file.spillover);
  return s.compensated;
}

export function defaultScale(s: Sample | undefined, name: string): TransformSpec {
  const p = s?.file.parameters.find((q) => q.name === name);
  const range = p?.range && p.range > 1 ? p.range : 262144;
  if (/^(FSC|SSC|Time)/i.test(name)) return { kind: "linear", min: 0, max: range };
  return { kind: "logicle", T: Math.max(range, 1024), W: 0.5, M: 4.5, A: 0 };
}

export function retarget(spec: TransformSpec, kind: TransformSpec["kind"]): TransformSpec {
  const top = spec.kind === "logicle" ? spec.T : spec.max;
  switch (kind) {
    case "linear": return linear(0, top).spec;
    case "log": return log(1, top).spec;
    case "arcsinh": return arcsinh(150, -1000, top).spec;
    case "logicle": return logicle(top, 0.5, 4.5, 0).spec;
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

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
