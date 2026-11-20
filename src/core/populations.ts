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

export type StatKey = "median" | "mean" | "geoMean" | "sd" | "cv" | "rsd" | "rcv" | "p5" | "p25" | "p75" | "p95";
export const STATS: { key: StatKey; label: string }[] = [
  { key: "median", label: "Median" },
  { key: "mean", label: "Mean" },
  { key: "geoMean", label: "Geo. mean" },
  { key: "sd", label: "SD" },
  { key: "cv", label: "CV %" },
  { key: "rsd", label: "Robust SD" },
  { key: "rcv", label: "Robust CV %" },
  { key: "p5", label: "5th pct" },
  { key: "p25", label: "25th pct" },
  { key: "p75", label: "75th pct" },
  { key: "p95", label: "95th pct" },
];
export const DEFAULT_STATS: StatKey[] = ["median", "mean", "cv"];
export type ChannelStats = Record<StatKey, number>;

function percentile(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pos = (n - 1) * (p / 100);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

export function channelStats(values: Float32Array, mask?: Uint8Array): ChannelStats {
  const nTotal = values.length;
  const picked = new Float64Array(nTotal);
  let n = 0;
  for (let i = 0; i < nTotal; i++) {
    if (!mask || mask[i]!) {
      picked[n++] = values[i]!;
    }
  }
  if (n === 0) {
    return {
      median: NaN, mean: NaN, geoMean: NaN, sd: NaN, cv: NaN, rsd: NaN, rcv: NaN, p5: NaN, p25: NaN, p75: NaN, p95: NaN,
    };
  }
  const sorted = picked.slice(0, n);
  sorted.sort((a, b) => a - b);

  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const mid = n >> 1;
  const median = n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;

  let variance = 0;
  if (n > 1) {
    for (let i = 0; i < n; i++) {
      const d = sorted[i]! - mean;
      variance += d * d;
    }
    variance /= n - 1;
  }
  const sd = Math.sqrt(variance);

  const cv = mean === 0 ? NaN : (100 * sd) / Math.abs(mean);

  let geoMean = NaN;
  let sumLn = 0;
  let posCount = 0;
  for (let i = 0; i < n; i++) {
    const v = sorted[i]!;
    if (v > 0) {
      sumLn += Math.log(v);
      posCount++;
    }
  }
  if (posCount > 0) {
    geoMean = Math.exp(sumLn / posCount);
  }

  const p5 = percentile(sorted, 5);
  const p25 = percentile(sorted, 25);
  const p75 = percentile(sorted, 75);
  const p95 = percentile(sorted, 95);

  const p84_13 = percentile(sorted, 84.13);
  const p15_87 = percentile(sorted, 15.87);
  const rsd = (p84_13 - p15_87) / 2;

  const rcv = median === 0 ? NaN : (100 * rsd) / Math.abs(median);

  return { median, mean, geoMean, sd, cv, rsd, rcv, p5, p25, p75, p95 };
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

function csvCell(v: string | number): string {
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : "") : v;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
