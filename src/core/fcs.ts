// Parser for Flow Cytometry Standard (FCS) 2.0, 3.0 and 3.1 list-mode files.

export interface FcsParameter {
  index: number;
  name: string;
  label?: string;
  range: number;
  bits: number;
  amplification: [number, number];
  gain: number;
}

export interface Spillover {
  parameters: string[];
  matrix: number[][];
}

export interface FcsFile {
  version: string;
  keywords: Record<string, string>;
  parameters: FcsParameter[];
  eventCount: number;
  data: Float32Array[];
  spillover?: Spillover;
}

export class FcsError extends Error {
  override name = "FcsError";
}

const ascii = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8");

function headerOffset(bytes: Uint8Array, start: number): number {
  const text = ascii.decode(bytes.subarray(start, start + 8)).trim();
  if (text === "") return 0;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) throw new FcsError(`Bad header offset "${text}" at byte ${start}`);
  return n;
}

export function parseText(segment: Uint8Array): Record<string, string> {
  if (segment.length < 2) throw new FcsError("TEXT segment is empty");
  const text = utf8.decode(segment);
  const delim = text[0]!;
  const tokens: string[] = [];
  let current = "";
  for (let i = 1; i < text.length; i++) {
    const ch = text[i]!;
    if (ch !== delim) {
      current += ch;
      continue;
    }
    if (text[i + 1] === delim && i + 1 < text.length - 1) {
      // Doubled delimiter is a literal delimiter character.
      current += delim;
      i++;
      continue;
    }
    tokens.push(current);
    current = "";
  }
  if (current !== "") tokens.push(current);
  const keywords: Record<string, string> = {};
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    keywords[tokens[i]!.trim().toUpperCase()] = tokens[i + 1]!.trim();
  }
  return keywords;
}

export function parseSpillover(value: string): Spillover {
  const parts = value.split(",").map((s) => s.trim());
  const n = Number(parts[0]);
  if (!Number.isInteger(n) || n <= 0) throw new FcsError(`Bad spillover size "${parts[0]}"`);
  if (parts.length !== 1 + n + n * n) {
    throw new FcsError(`Spillover expects ${1 + n + n * n} values, got ${parts.length}`);
  }
  const parameters = parts.slice(1, 1 + n);
  const values = parts.slice(1 + n).map(Number);
  if (values.some((v) => !Number.isFinite(v))) throw new FcsError("Spillover contains non-numeric values");
  const matrix: number[][] = [];
  for (let r = 0; r < n; r++) matrix.push(values.slice(r * n, r * n + n));
  return { parameters, matrix };
}

function required(keywords: Record<string, string>, key: string): string {
  const v = keywords[key];
  if (v === undefined) throw new FcsError(`Missing required keyword ${key}`);
  return v;
}

function positiveInt(keywords: Record<string, string>, key: string): number {
  const n = Number(required(keywords, key));
  if (!Number.isInteger(n) || n < 0) throw new FcsError(`Keyword ${key} must be a non-negative integer`);
  return n;
}

function readParameters(keywords: Record<string, string>, count: number): FcsParameter[] {
  const params: FcsParameter[] = [];
  for (let i = 1; i <= count; i++) {
    const name = required(keywords, `$P${i}N`);
    const bits = Number(required(keywords, `$P${i}B`));
    const range = Number(required(keywords, `$P${i}R`));
    const [f1 = 0, f2 = 0] = (keywords[`$P${i}E`] ?? "0,0").split(",").map(Number);
    const gain = Number(keywords[`$P${i}G`] ?? "1");
    const label = keywords[`$P${i}S`];
    params.push({
      index: i,
      name,
      ...(label ? { label } : {}),
      range,
      bits,
      amplification: [f1, f2],
      gain: Number.isFinite(gain) && gain > 0 ? gain : 1,
    });
  }
  return params;
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

export function parseFcs(buffer: ArrayBuffer): FcsFile {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 58) throw new FcsError("File is too short to be FCS");
  const version = ascii.decode(bytes.subarray(0, 6));
  if (!version.startsWith("FCS")) throw new FcsError("Not an FCS file (missing FCS magic)");

  const textBegin = headerOffset(bytes, 10);
  const textEnd = headerOffset(bytes, 18);
  if (textEnd < textBegin || textEnd >= bytes.length) throw new FcsError("TEXT segment offsets are out of range");
  const keywords = parseText(bytes.subarray(textBegin, textEnd + 1));

  let dataBegin = headerOffset(bytes, 26);
  let dataEnd = headerOffset(bytes, 34);
  if (dataBegin === 0 && dataEnd === 0) {
    dataBegin = Number(keywords["$BEGINDATA"] ?? 0);
    dataEnd = Number(keywords["$ENDDATA"] ?? 0);
  }

  const mode = keywords["$MODE"];
  if (mode !== undefined && mode.toUpperCase() !== "L") throw new FcsError(`Unsupported $MODE ${mode}; only list mode (L) is supported`);

  const eventCount = positiveInt(keywords, "$TOT");
  const paramCount = positiveInt(keywords, "$PAR");
  const datatype = required(keywords, "$DATATYPE").toUpperCase();
  const byteord = required(keywords, "$BYTEORD").replace(/\s/g, "");
  let littleEndian: boolean;
  if (byteord === "1,2,3,4" || byteord === "1,2") littleEndian = true;
  else if (byteord === "4,3,2,1" || byteord === "2,1") littleEndian = false;
  else throw new FcsError(`Unsupported $BYTEORD ${byteord}`);

  const parameters = readParameters(keywords, paramCount);

  let widths: number[];
  if (datatype === "F") widths = parameters.map(() => 4);
  else if (datatype === "D") widths = parameters.map(() => 8);
  else if (datatype === "I") {
    widths = parameters.map((p) => {
      if (p.bits !== 8 && p.bits !== 16 && p.bits !== 32) throw new FcsError(`Unsupported integer width ${p.bits} for ${p.name}`);
      return p.bits / 8;
    });
  } else throw new FcsError(`Unsupported $DATATYPE ${datatype}`);

  const eventWidth = widths.reduce((a, b) => a + b, 0);
  const needed = eventWidth * eventCount;
  if (dataBegin + needed > bytes.length || (needed > 0 && dataEnd < dataBegin)) {
    throw new FcsError("DATA segment is truncated or out of range");
  }

  const view = new DataView(buffer, dataBegin, needed);
  const data = parameters.map(() => new Float32Array(eventCount));
  const masks = parameters.map((p) => (datatype === "I" && isPowerOfTwo(p.range) ? p.range - 1 : -1));

  let offset = 0;
  for (let e = 0; e < eventCount; e++) {
    for (let p = 0; p < paramCount; p++) {
      const w = widths[p]!;
      let raw: number;
      if (datatype === "F") raw = view.getFloat32(offset, littleEndian);
      else if (datatype === "D") raw = view.getFloat64(offset, littleEndian);
      else {
        raw = w === 1 ? view.getUint8(offset) : w === 2 ? view.getUint16(offset, littleEndian) : view.getUint32(offset, littleEndian);
        const mask = masks[p]!;
        if (mask >= 0) raw = (raw & mask) >>> 0;
      }
      data[p]![e] = raw;
      offset += w;
    }
  }

  parameters.forEach((p, i) => {
    const column = data[i]!;
    const [f1, f2] = p.amplification;
    if (f1 > 0 && datatype === "I") {
      const scale = f2 === 0 ? 1 : f2;
      for (let e = 0; e < eventCount; e++) column[e] = Math.pow(10, (f1 * column[e]!) / p.range) * scale;
    } else if (p.gain !== 1) {
      for (let e = 0; e < eventCount; e++) column[e] = column[e]! / p.gain;
    }
  });

  const spillText = keywords["$SPILLOVER"] ?? keywords["SPILL"] ?? keywords["$SPILL"];
  const spillover = spillText ? parseSpillover(spillText) : undefined;

  return { version, keywords, parameters, eventCount, data, ...(spillover ? { spillover } : {}) };
}
