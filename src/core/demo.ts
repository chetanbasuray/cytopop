import type { FcsFile, FcsParameter } from "./fcs";

/** Synthetic blood-like sample (debris, lymphocytes with CD4/CD8 T cells, monocytes) with FITC→PE spillover. */
export function demoSample(events = 50000, seed = 7): FcsFile {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const normal = (mu: number, sd: number) => mu + sd * Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  const names = ["FSC-A", "SSC-A", "CD3 FITC", "CD4 PE", "CD8 APC"];
  const data = names.map(() => new Float32Array(events));
  const spill = 0.15; // FITC into PE
  for (let e = 0; e < events; e++) {
    const r = rand();
    let fsc: number, ssc: number, cd3 = normal(80, 60), cd4 = normal(60, 50), cd8 = normal(60, 50);
    if (r < 0.15) {
      fsc = Math.abs(normal(12000, 8000));
      ssc = Math.abs(normal(8000, 6000));
    } else if (r < 0.8) {
      fsc = normal(60000, 7000);
      ssc = normal(20000, 4000);
      if (rand() < 0.7) {
        cd3 = Math.exp(normal(Math.log(6000), 0.35));
        if (rand() < 0.62) cd4 = Math.exp(normal(Math.log(9000), 0.3));
        else cd8 = Math.exp(normal(Math.log(12000), 0.3));
      }
    } else {
      fsc = normal(110000, 12000);
      ssc = normal(70000, 12000);
      cd4 = Math.exp(normal(Math.log(1500), 0.4));
    }
    const row = [fsc, ssc, cd3, cd4 + spill * cd3, cd8];
    row.forEach((v, p) => (data[p]![e] = v));
  }
  const parameters: FcsParameter[] = names.map((name, i) => ({ index: i + 1, name, range: 262144, bits: 32, amplification: [0, 0], gain: 1 }));
  return {
    version: "FCS3.1",
    keywords: { $FIL: "demo-sample.fcs", $TOT: String(events), $PAR: String(names.length) },
    parameters,
    eventCount: events,
    data,
    spillover: {
      parameters: ["CD3 FITC", "CD4 PE", "CD8 APC"],
      matrix: [[1, spill, 0], [0, 1, 0], [0, 0, 1]],
    },
  };
}
