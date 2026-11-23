import type { FcsFile } from "./fcs";

/** One instrument setting across samples. `values[i]` belongs to the i-th file; undefined means not recorded. */
export interface SettingRow {
  setting: string;
  parameter?: string;
  values: (string | undefined)[];
  differs: boolean;
}

const fmt = (v: number) => String(+v.toPrecision(6));

/**
 * Lists instrument settings side by side for several files: the cytometer, the spillover matrix, and per
 * parameter its presence, range, voltage, gain and amplification. Rows whose values are not all equal are
 * marked `differs`; a setting missing from one file but present in another counts as a difference.
 */
export function compareSettings(files: FcsFile[]): SettingRow[] {
  const rows: SettingRow[] = [];
  const push = (setting: string, values: (string | undefined)[], parameter?: string) =>
    rows.push({ setting, ...(parameter ? { parameter } : {}), values, differs: new Set(values).size > 1 });

  push("Cytometer", files.map((f) => f.keywords["$CYT"]));
  push("Cytometer serial number", files.map((f) => f.keywords["$CYTSN"]));
  push("Spillover matrix", files.map((f) => (f.spillover ? JSON.stringify(f.spillover) : undefined)));

  const names = [...new Set(files.flatMap((f) => f.parameters.map((p) => p.name)))];
  for (const name of names) {
    const params = files.map((f) => f.parameters.find((p) => p.name === name));
    push("Recorded", params.map((p) => (p ? "yes" : "no")), name);
    push("Range", params.map((p) => (p ? fmt(p.range) : undefined)), name);
    push("Voltage", params.map((p, i) => (p ? files[i]!.keywords[`$P${p.index}V`] : undefined)), name);
    push("Gain", params.map((p) => (p ? fmt(p.gain) : undefined)), name);
    push("Amplification", params.map((p) => (p ? p.amplification.map(fmt).join(", ") : undefined)), name);
  }
  return rows;
}

export interface CleaningReport {
  timeParameter?: string; // undefined when the file has no time parameter: nothing is flagged
  total: number;
  flagged: number;
  rate: number; // events in time bins with a flow-rate surge or drop
  signal: number; // events in time bins where a channel's median shifted
  saturated: number; // events piled up at a channel's maximum
}

const median = (a: ArrayLike<number>): number => {
  const s = Float64Array.from(a).sort();
  const n = s.length;
  return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};
const mad = (a: ArrayLike<number>, m: number): number => 1.4826 * median(Array.from(a, (v) => Math.abs(v - m)));

export function findTime(names: string[]): number {
  return names.findIndex((n) => /^time$/i.test(n.trim()));
}

/**
 * Flags events recorded while acquisition was unstable. Time is cut into `bins` equal slices; a slice is
 * flagged when its event count, or the median of any channel, is more than `k` robust SDs from the typical
 * slice. Events piled up at a channel's top value (more than 0.1% of events, with the top value within 1% of
 * the channel's recorded range) are flagged as saturated; without a range nothing counts as saturated. Returns 1 for stable events and 0 for flagged ones.
 */
export function flagUnstable(names: string[], data: Float32Array[], ranges: (number | undefined)[] = [], bins = 100, k = 4): { stable: Uint8Array; report: CleaningReport } {
  const n = data[0]?.length ?? 0;
  const stable = new Uint8Array(n).fill(1);
  const ti = findTime(names);
  if (ti < 0 || n === 0) return { stable, report: { total: n, flagged: 0, rate: 0, signal: 0, saturated: 0 } };
  const time = data[ti]!;
  let tmin = Infinity, tmax = -Infinity;
  for (let e = 0; e < n; e++) { tmin = Math.min(tmin, time[e]!); tmax = Math.max(tmax, time[e]!); }
  const width = (tmax - tmin) / bins || 1;
  const bin = new Uint16Array(n);
  const counts = new Float64Array(bins);
  for (let e = 0; e < n; e++) { const b = Math.min(bins - 1, Math.floor((time[e]! - tmin) / width)); bin[e] = b; counts[b]!++; }

  // Flow rate: a Poisson floor keeps ordinary counting noise from being flagged.
  const badRate = new Uint8Array(bins);
  const cm = median(counts);
  const cs = Math.max(mad(counts, cm), Math.sqrt(cm));
  counts.forEach((c, b) => { if (Math.abs(c - cm) > k * cs) badRate[b] = 1; });

  // Signal: per channel, compare each slice's median with the typical slice median.
  const badSignal = new Uint8Array(bins);
  const saturatedAt = new Float64Array(data.length).fill(NaN);
  data.forEach((col, p) => {
    if (p === ti) return;
    const perBin: number[][] = Array.from({ length: bins }, () => []);
    let top = -Infinity, atTop = 0;
    for (let e = 0; e < n; e++) {
      perBin[bin[e]!]!.push(col[e]!);
      if (col[e]! > top) { top = col[e]!; atTop = 1; } else if (col[e]! === top) atTop++;
    }
    const range = ranges[p];
    if (atTop > 0.001 * n && range && top >= 0.99 * range) saturatedAt[p] = top;
    const meds = perBin.map((v) => (v.length ? median(v) : NaN)).filter((v) => !Number.isNaN(v));
    const mm = median(meds);
    const overall = mad(col.length > 20000 ? col.filter((_, i) => i % Math.ceil(col.length / 20000) === 0) : col, median(col));
    const ms = Math.max(mad(meds, mm), 0.1 * overall, 1e-9);
    perBin.forEach((v, b) => { if (v.length && Math.abs(median(v) - mm) > k * ms) badSignal[b] = 1; });
  });

  const report: CleaningReport = { timeParameter: names[ti]!, total: n, flagged: 0, rate: 0, signal: 0, saturated: 0 };
  for (let e = 0; e < n; e++) {
    const b = bin[e]!;
    let sat = false;
    for (let p = 0; p < data.length; p++) if (data[p]![e] === saturatedAt[p]) sat = true;
    if (badRate[b]) report.rate++;
    if (badSignal[b]) report.signal++;
    if (sat) report.saturated++;
    if (badRate[b] || badSignal[b] || sat) { stable[e] = 0; report.flagged++; }
  }
  return { stable, report };
}

const cache = new WeakMap<Float32Array[], ReturnType<typeof flagUnstable>>();
/** flagUnstable with default settings, cached per data array so re-evaluating populations stays cheap. */
export function cleaned(names: string[], data: Float32Array[], ranges: (number | undefined)[] = []): ReturnType<typeof flagUnstable> {
  let r = cache.get(data);
  if (!r) cache.set(data, (r = flagUnstable(names, data, ranges)));
  return r;
}
