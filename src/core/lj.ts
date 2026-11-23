/** Acquisition time from $DATE ("dd-mmm-yyyy") and $BTIM ("hh:mm:ss[.cc]"), read as UTC. */
export function runDate(keywords: Record<string, string>): Date | undefined {
  const d = /^(\d{1,2})-([a-z]{3})-(\d{4})$/i.exec(keywords.$DATE?.trim() ?? "");
  if (!d) return undefined;
  const month = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(d[2]!.toLowerCase()) / 3;
  if (!Number.isInteger(month)) return undefined;
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(keywords.$BTIM?.trim() ?? "");
  return new Date(Date.UTC(+d[3]!, month, +d[1]!, t ? +t[1]! : 0, t ? +t[2]! : 0, t?.[3] ? +t[3] : 0));
}

export type LjFlag = "ok" | "warn" | "fail";
export interface LjChart {
  mean: number;
  sd: number;
  points: { value: number; z: number; flag: LjFlag }[];
}

/**
 * Levey-Jennings limits: mean and SD from the first `baseline` finite values, then each value's distance in SDs.
 * Beyond 2 SD warns, beyond 3 SD fails. Non-finite values get z NaN and flag "ok" so they are skipped, not failed.
 */
export function leveyJennings(values: number[], baseline = values.length): LjChart {
  const base = values.slice(0, baseline).filter(Number.isFinite);
  const mean = base.reduce((a, v) => a + v, 0) / base.length;
  const sd = base.length > 1 ? Math.sqrt(base.reduce((a, v) => a + (v - mean) ** 2, 0) / (base.length - 1)) : NaN;
  const points = values.map((value) => {
    const z = (value - mean) / sd;
    const flag: LjFlag = !Number.isFinite(z) ? "ok" : Math.abs(z) > 3 ? "fail" : Math.abs(z) > 2 ? "warn" : "ok";
    return { value, z, flag };
  });
  return { mean, sd, points };
}
