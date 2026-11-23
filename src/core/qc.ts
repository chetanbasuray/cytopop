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
