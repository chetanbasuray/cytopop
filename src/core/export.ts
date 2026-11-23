import type { FcsFile } from "./fcs";

/** Indices of the events where mask[i] is 1, or every event when mask is undefined. */
export function pickedEvents(n: number, mask?: Uint8Array): Uint32Array {
  if (!mask) return Uint32Array.from({ length: n }, (_, i) => i);
  let count = 0;
  for (let i = 0; i < n; i++) count += mask[i] ? 1 : 0;
  const out = new Uint32Array(count);
  for (let i = 0, k = 0; i < n; i++) if (mask[i]) out[k++] = i;
  return out;
}

/** CSV with parameter names as the header and one row per picked event. */
export function eventsCsv(names: string[], data: Float32Array[], events: Uint32Array): string {
  const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  let out = names.map(quote).join(",") + "\n";
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const row: string[] = [];
    for (let p = 0; p < data.length; p++) row.push(String(data[p]![e]));
    out += row.join(",") + "\n";
  }
  return out;
}

const STRUCTURAL = ["$BEGINDATA", "$ENDDATA", "$BEGINANALYSIS", "$ENDANALYSIS", "$BEGINSTEXT", "$ENDSTEXT", "$NEXTDATA", "$TOT", "$PAR",
  "$BYTEORD", "$DATATYPE", "$MODE"];

/**
 * FCS 3.1 file of the picked events as little-endian 32-bit floats. Source keywords are kept except the structural ones the writer
 * sets itself, per-parameter width, amplification and gain (values are already scaled), and the spillover matrix when the values
 * are compensated. `extra` keywords are added last.
 */
export function eventsFcs(source: FcsFile, data: Float32Array[], events: Uint32Array, compensated: boolean, extra: Record<string, string>): ArrayBuffer {
  const params = source.parameters;
  const drop = new Set(STRUCTURAL);
  if (compensated) ["$SPILLOVER", "SPILL", "$SPILL"].forEach((k) => drop.add(k));
  params.forEach((_, i) => ["B", "E", "G"].forEach((c) => drop.add(`$P${i + 1}${c}`)));
  const kw: Record<string, string> = {};
  for (const [k, v] of Object.entries(source.keywords)) if (!drop.has(k)) kw[k] = v;
  Object.assign(kw, { $BYTEORD: "1,2,3,4", $DATATYPE: "F", $MODE: "L", $NEXTDATA: "0", $TOT: String(events.length), $PAR: String(params.length) });
  params.forEach((p, i) => Object.assign(kw, { [`$P${i + 1}N`]: p.name, [`$P${i + 1}B`]: "32", [`$P${i + 1}E`]: "0,0", [`$P${i + 1}R`]: String(p.range) }));
  Object.assign(kw, extra);

  const dataLength = events.length * params.length * 4;
  const esc = (x: string) => x.replaceAll("|", "||");
  // Data offsets are padded to a fixed width so the TEXT length, and with it the offsets, do not depend on their values.
  const text = (begin: number, end: number) =>
    "|" + Object.entries({ ...kw, $BEGINDATA: String(begin).padStart(20, "0"), $ENDDATA: String(end).padStart(20, "0") })
      .map(([k, v]) => `${esc(k)}|${esc(v)}|`).join("");
  const enc = new TextEncoder();
  const textLength = enc.encode(text(0, 0)).length;
  const textBegin = 58, textEnd = textBegin + textLength - 1, dataBegin = textEnd + 1;
  const dataEnd = dataLength ? dataBegin + dataLength - 1 : dataBegin;
  const textBytes = enc.encode(text(dataBegin, dataEnd));

  const fits = dataEnd <= 99999999; // HEADER offsets have 8 digits; beyond that readers use the keywords
  const off = (n: number) => String(n).padStart(8, " ");
  const header = "FCS3.1    " + off(textBegin) + off(textEnd) + off(fits ? dataBegin : 0) + off(fits ? dataEnd : 0) + off(0) + off(0);

  const out = new ArrayBuffer(dataBegin + dataLength);
  const bytes = new Uint8Array(out);
  bytes.set(enc.encode(header), 0);
  bytes.set(textBytes, textBegin);
  const view = new DataView(out, dataBegin, dataLength);
  let o = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    for (let p = 0; p < params.length; p++, o += 4) view.setFloat32(o, data[p]![e]!, true);
  }
  return out;
}
