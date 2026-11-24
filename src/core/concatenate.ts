import type { FcsFile } from "./fcs";

export const SOURCE = "Source";

/**
 * Joins the events of several files into one, in the channel order of the first, with a "Source" channel holding each event's
 * file number (1 for the first file). Keywords and the spillover matrix come from the first file. Throws when the files do not
 * have the same channels, naming the ones that differ.
 */
export function concatenate(files: { name: string; file: FcsFile }[]): FcsFile {
  if (files.length < 2) throw new Error("Choose at least two samples to concatenate");
  const first = files[0]!.file;
  const names = first.parameters.map((p) => p.name);
  const all = new Set(files.flatMap((f) => f.file.parameters.map((p) => p.name)));
  const differ = [...all].filter((n) => !files.every((f) => f.file.parameters.some((p) => p.name === n)));
  if (differ.length) throw new Error(`The samples do not have the same channels: ${differ.join(", ")}`);
  if (names.includes(SOURCE)) throw new Error(`The samples already have a "${SOURCE}" channel`);

  const eventCount = files.reduce((n, f) => n + f.file.eventCount, 0);
  const data = names.map(() => new Float32Array(eventCount));
  const source = new Float32Array(eventCount);
  let at = 0;
  files.forEach((f, i) => {
    names.forEach((n, c) => data[c]!.set(f.file.data[f.file.parameters.findIndex((p) => p.name === n)]!, at));
    source.fill(i + 1, at, at + f.file.eventCount);
    at += f.file.eventCount;
  });
  const parameters = [
    ...first.parameters.map((p, c) => ({ ...p, range: Math.max(...files.map((f) => f.file.parameters.find((q) => q.name === names[c])!.range)) })),
    { index: names.length + 1, name: SOURCE, range: files.length + 1, bits: 32, amplification: [0, 0] as [number, number], gain: 1 },
  ];
  const keywords = { ...first.keywords, CYTOPOP_SOURCES: files.map((f, i) => `${i + 1}=${f.name}`).join(";") };
  return { ...first, keywords, parameters, eventCount, data: [...data, source] };
}
