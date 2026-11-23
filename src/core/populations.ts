import { applyGate, type Gate } from "./gates";
import { cleaned } from "./qc";

export interface Population {
  id: string;
  name: string;
  parentId: string | null; // null = child of "All events"
  gate: Gate | BooleanGate | CleanGate;
}

/** Events recorded while acquisition was stable (see flagUnstable). */
export interface CleanGate {
  kind: "clean";
}

export type BooleanOp = "and" | "or" | "not";
/** Combines other populations' events; the result is still limited to the population's parent. */
export interface BooleanGate {
  kind: "boolean";
  op: BooleanOp;
  of: string[];
}

function combine(op: BooleanOp, inputs: Uint8Array[], n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (op === "not") out[i] = inputs[0]![i] ? 0 : 1;
    else if (op === "and") out[i] = inputs.every((m) => m[i]) ? 1 : 0;
    else out[i] = inputs.some((m) => m[i]) ? 1 : 0;
  }
  return out;
}

export interface PopulationStats {
  id: string;
  name: string;
  path: string;
  count: number;
  percentParent: number;
  percentTotal: number;
  percentGrandparent: number;
}

export type ChannelStatKey = "median" | "mean" | "geoMean" | "sd" | "cv" | "rsd" | "rcv" | "p5" | "p25" | "p75" | "p95" | "mode" | "hpcv";
export type StatKey = ChannelStatKey | "si" | "pg" | "perUl" | "r";
export const STATS: { key: StatKey; label: string; per: "channel" | "population" }[] = [
  { key: "pg", label: "% grandparent", per: "population" },
  { key: "perUl", label: "Events per µl", per: "population" },
  { key: "r", label: "Pearson r", per: "population" },
  { key: "median", label: "Median", per: "channel" },
  { key: "mean", label: "Mean", per: "channel" },
  { key: "geoMean", label: "Geo. mean", per: "channel" },
  { key: "sd", label: "SD", per: "channel" },
  { key: "cv", label: "CV %", per: "channel" },
  { key: "rsd", label: "Robust SD", per: "channel" },
  { key: "rcv", label: "Robust CV %", per: "channel" },
  { key: "p5", label: "5th pct", per: "channel" },
  { key: "p25", label: "25th pct", per: "channel" },
  { key: "p75", label: "75th pct", per: "channel" },
  { key: "p95", label: "95th pct", per: "channel" },
  { key: "mode", label: "Mode", per: "channel" },
  { key: "hpcv", label: "Half-peak CV %", per: "channel" },
  { key: "si", label: "Stain index", per: "channel" },
];
export const DEFAULT_STATS: StatKey[] = ["median", "mean", "cv"];
export type ChannelStats = Record<ChannelStatKey, number>;

export const EMPTY_STATS: ChannelStats = {
  median: NaN, mean: NaN, geoMean: NaN, sd: NaN, cv: NaN, rsd: NaN, rcv: NaN, p5: NaN, p25: NaN, p75: NaN, p95: NaN, mode: NaN, hpcv: NaN,
};

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
    if ((!mask || mask[i]!) && !Number.isNaN(values[i]!)) {
      picked[n++] = values[i]!; // derived parameters are NaN where undefined (e.g. division by zero)
    }
  }
  if (n === 0) {
    return EMPTY_STATS;
  }
  const sorted = picked.slice(0, n);
  sorted.sort(); // typed arrays sort numerically; a comparator is several times slower

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

  const lo = percentile(sorted, 0.5);
  const hi = percentile(sorted, 99.5);

  let mode: number;
  let hpcv: number;

  if (hi <= lo) {
    mode = median;
    hpcv = NaN;
  } else {
    const bins = 256;
    const binWidth = (hi - lo) / bins;
    const counts = new Uint32Array(bins);
    for (let i = 0; i < n; i++) {
      const v = sorted[i]!;
      if (v >= lo && v <= hi) {
        const b = Math.min(bins - 1, Math.floor((v - lo) / binWidth));
        counts[b]!++;
      }
    }
    const smoothed = new Float64Array(bins);
    for (let i = 0; i < bins; i++) {
      let sum = 0;
      let c = 0;
      if (i > 0) { sum += counts[i - 1]!; c++; }
      sum += counts[i]!; c++;
      if (i < bins - 1) { sum += counts[i + 1]!; c++; }
      smoothed[i] = sum / c;
    }
    let peakIdx = 0;
    let peakVal = smoothed[0]!;
    for (let i = 1; i < bins; i++) {
      if (smoothed[i]! > peakVal) {
        peakVal = smoothed[i]!;
        peakIdx = i;
      }
    }
    mode = lo + (peakIdx + 0.5) * binWidth;
    let left = peakIdx;
    while (left > 0 && smoothed[left - 1]! >= peakVal / 2) left--;
    let right = peakIdx;
    while (right < bins - 1 && smoothed[right + 1]! >= peakVal / 2) right++;
    const fwhm = (right - left + 1) * binWidth;
    hpcv = mode === 0 ? NaN : 100 * (fwhm / 2.3548) / Math.abs(mode);
  }

  return { median, mean, geoMean, sd, cv, rsd, rcv, p5, p25, p75, p95, mode, hpcv };
}

/** Evaluates every population against a sample. Parents are evaluated before children. */
export function evaluate(populations: Population[], names: string[], data: Float32Array[], ranges: (number | undefined)[] = []): Map<string, Uint8Array> {
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
    const g = p.gate;
    let mask: Uint8Array;
    if (g.kind === "boolean") {
      if (g.op === "not" ? g.of.length !== 1 : g.of.length < 2) throw new Error(`Population ${p.name} has the wrong number of inputs`);
      const inputs = g.of.map((id) => {
        const q = byId.get(id);
        if (!q) throw new Error(`Population ${p.name} uses a missing population`);
        return visit(q, stack);
      });
      mask = combine(g.op, inputs, data[0]?.length ?? 0);
      if (within) for (let i = 0; i < mask.length; i++) mask[i]! &= within[i]!;
    } else if (g.kind === "clean") {
      mask = cleaned(names, data, ranges).stable.slice();
      if (within) for (let i = 0; i < mask.length; i++) mask[i]! &= within[i]!;
    } else mask = applyGate(g, names, data, within);
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
  const byId = new Map(populations.map((p) => [p.id, p]));
  return populations.map((p) => {
    const c = count(masks.get(p.id)!);
    const parentCount = p.parentId === null ? total : count(masks.get(p.parentId)!);
    let grandparentCount: number;
    if (p.parentId === null) {
      grandparentCount = NaN;
    } else {
      const parent = byId.get(p.parentId)!;
      if (parent.parentId === null) {
        grandparentCount = total;
      } else {
        grandparentCount = count(masks.get(parent.parentId)!);
      }
    }
    return {
      id: p.id,
      name: p.name,
      path: pathOf(populations, p.id),
      count: c,
      percentParent: parentCount ? (100 * c) / parentCount : 0,
      percentTotal: total ? (100 * c) / total : 0,
      percentGrandparent: Number.isNaN(grandparentCount) ? NaN : grandparentCount ? (100 * c) / grandparentCount : 0,
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

export function stainIndex(pos: ChannelStats, neg: ChannelStats): number {
  if (neg.rsd === 0 || !Number.isFinite(neg.rsd)) return NaN;
  return (pos.median - neg.median) / (2 * neg.rsd);
}

export function pearson(x: Float32Array, y: Float32Array, mask?: Uint8Array): number {
  const n = x.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!mask || mask[i]!) count++;
  }
  if (count < 2) return NaN;

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    if (!mask || mask[i]!) {
      sumX += x[i]!;
      sumY += y[i]!;
    }
  }
  const meanX = sumX / count;
  const meanY = sumY / count;

  let varX = 0, varY = 0, covXY = 0;
  for (let i = 0; i < n; i++) {
    if (!mask || mask[i]!) {
      const dx = x[i]! - meanX;
      const dy = y[i]! - meanY;
      varX += dx * dx;
      varY += dy * dy;
      covXY += dx * dy;
    }
  }

  if (varX === 0 || varY === 0) return NaN;
  return covXY / Math.sqrt(varX * varY);
}

export function volumeMicrolitres(keywords: Record<string, string>): number | undefined {
  const vol = keywords["$VOL"];
  if (!vol) return undefined;
  const v = Number(vol);
  if (Number.isFinite(v) && v > 0) return v / 1000;
  return undefined;
}

export function splitKeys(keys: StatKey[]): { population: StatKey[]; channel: StatKey[] } {
  const population: StatKey[] = [];
  const channel: StatKey[] = [];
  for (const k of keys) {
    const entry = STATS.find((s) => s.key === k);
    if (!entry) continue;
    if (entry.per === "population") population.push(k);
    else channel.push(k);
  }
  return { population, channel };
}

export function statValues(keys: StatKey[], row: { cols: (Float32Array | undefined)[]; mask?: Uint8Array; count: number; percentGrandparent: number; volumeUl?: number; negative?: ChannelStats[] }): number[] {
  const { population: popKeys, channel: chanKeys } = splitKeys(keys);
  const result: number[] = [];

  for (const k of popKeys) {
    if (k === "pg") result.push(row.percentGrandparent);
    else if (k === "perUl") result.push(row.volumeUl ? row.count / row.volumeUl : NaN);
    else if (k === "r") {
      const cols = row.cols;
      if (cols.length >= 2 && cols[0] && cols[1]) {
        result.push(pearson(cols[0], cols[1], row.mask));
      } else {
        result.push(NaN);
      }
    }
  }

  row.cols.forEach((col, j) => {
    const c = col ? channelStats(col, row.mask) : EMPTY_STATS;
    for (const k of chanKeys) {
      const neg = row.negative?.[j];
      result.push(k === "si" ? (neg ? stainIndex(c, neg) : NaN) : c[k as ChannelStatKey]);
    }
  });
  return result;
}
