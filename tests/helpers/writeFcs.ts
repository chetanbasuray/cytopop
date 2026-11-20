// Minimal FCS 3.1 writer for tests: builds HEADER + TEXT ("|" delimiter) + DATA.

export interface WriteFcsOptions {
  names: string[];
  events: number[][];
  datatype?: "F" | "I";
  bits?: number;
  range?: number;
  byteord?: "1,2,3,4" | "4,3,2,1";
  extra?: Record<string, string>;
}

const pad = (n: number) => String(n).padStart(8, " ");

export function writeFcs(opts: WriteFcsOptions): ArrayBuffer {
  const { names, events, datatype = "F", byteord = "1,2,3,4", extra = {} } = opts;
  const bits = datatype === "F" ? 32 : (opts.bits ?? 16);
  const range = opts.range ?? (datatype === "F" ? 262144 : 2 ** bits);
  const little = byteord === "1,2,3,4";
  const width = bits / 8;

  const data = new ArrayBuffer(events.length * names.length * width);
  const view = new DataView(data);
  let o = 0;
  for (const row of events) {
    for (const v of row) {
      if (datatype === "F") view.setFloat32(o, v, little);
      else if (width === 1) view.setUint8(o, v);
      else if (width === 2) view.setUint16(o, v, little);
      else view.setUint32(o, v, little);
      o += width;
    }
  }

  const kw: Record<string, string> = {
    $BYTEORD: datatype === "I" && width === 2 ? (little ? "1,2" : "2,1") : byteord,
    $DATATYPE: datatype,
    $MODE: "L",
    $NEXTDATA: "0",
    $PAR: String(names.length),
    $TOT: String(events.length),
  };
  names.forEach((n, i) => {
    kw[`$P${i + 1}N`] = n;
    kw[`$P${i + 1}B`] = String(bits);
    kw[`$P${i + 1}R`] = String(range);
    kw[`$P${i + 1}E`] = "0,0";
  });
  Object.assign(kw, extra);

  const esc = (s: string) => s.replaceAll("|", "||");
  const text = "|" + Object.entries(kw).map(([k, v]) => `${esc(k)}|${esc(v)}|`).join("");
  const textBytes = new TextEncoder().encode(text);

  const textBegin = 58;
  const textEnd = textBegin + textBytes.length - 1;
  const dataBegin = textEnd + 1;
  const dataEnd = dataBegin + data.byteLength - 1;
  const header = new TextEncoder().encode(
    "FCS3.1    " + pad(textBegin) + pad(textEnd) + pad(dataBegin) + pad(data.byteLength ? dataEnd : 0) + pad(0) + pad(0),
  );

  const out = new Uint8Array(dataBegin + data.byteLength);
  out.set(header, 0);
  out.set(textBytes, textBegin);
  out.set(new Uint8Array(data), dataBegin);
  return out.buffer;
}
