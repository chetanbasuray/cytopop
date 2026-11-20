import { applyGate, type Gate } from "./gates";

export interface Population {
  id: string;
  name: string;
  parentId: string | null; // null = child of "All events"
  gate: Gate;
}

export interface PopulationStats {
  id: string;
  name: string;
  path: string;
  count: number;
  percentParent: number;
  percentTotal: number;
}

export interface ChannelStats {
  mean: number;
  median: number;
  cv: number; // percent
}

/** Evaluates every population against a sample. Parents are evaluated before children. */
export function evaluate(populations: Population[], names: string[], data: Float32Array[]): Map<string, Uint8Array> {
  const masks = new Map<string, Uint8Array>();
  const byId = new Map(populations.map((p) => [p.id, p]));
  const visit = (p: Population, stack: Set<string>): Uint8Array => {
    const done = masks.get(p.id);
    if (done) return done;
    if (stack.has(p.id)) throw new Error(`Population cycle at ${p.name}`);
    stack.add(p.id);
    const parent = p.parentId === null ? undefined : byId.get(p.parentId);
    if (p.parentId !== null && !parent) throw new Error(`Population ${p.name} has a missing parent`);
    const within = parent ? visit(parent, stack) : undefined;
    const mask = applyGate(p.gate, names, data, within);
    masks.set(p.id, mask);
    return mask;
  };
  for (const p of populations) visit(p, new Set());
  return masks;
}

export function count(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) c += mask[i]!;
  return c;
}

export function pathOf(populations: Population[], id: string): string {
  const byId = new Map(populations.map((p) => [p.id, p]));
  const names: string[] = [];
  for (let p = byId.get(id); p; p = p.parentId === null ? undefined : byId.get(p.parentId)) names.unshift(p.name);
  return names.join("/");
}

export function populationStats(populations: Population[], masks: Map<string, Uint8Array>, total: number): PopulationStats[] {
  return populations.map((p) => {
    const c = count(masks.get(p.id)!);
    const parentCount = p.parentId === null ? total : count(masks.get(p.parentId)!);
    return {
      id: p.id,
      name: p.name,
      path: pathOf(populations, p.id),
      count: c,
      percentParent: parentCount ? (100 * c) / parentCount : 0,
      percentTotal: total ? (100 * c) / total : 0,
    };
  });
}

export function channelStats(values: Float32Array, mask?: Uint8Array): ChannelStats {
  const picked: number[] = [];
  for (let i = 0; i < values.length; i++) if (!mask || mask[i]) picked.push(values[i]!);
  if (picked.length === 0) return { mean: NaN, median: NaN, cv: NaN };
  const mean = picked.reduce((a, b) => a + b, 0) / picked.length;
  picked.sort((a, b) => a - b);
  const mid = picked.length >> 1;
  const median = picked.length % 2 ? picked[mid]! : (picked[mid - 1]! + picked[mid]!) / 2;
  const variance = picked.length > 1 ? picked.reduce((a, b) => a + (b - mean) ** 2, 0) / (picked.length - 1) : 0;
  const cv = mean === 0 ? NaN : (100 * Math.sqrt(variance)) / Math.abs(mean);
  return { mean, median, cv };
}

function csvCell(v: string | number): string {
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : "") : v;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
