export interface AnnotationImport {
  columns: string[];
  values: Record<string, Record<string, string>>;
  unmatched: string[];
}

export function parseCsv(text: string): string[][] {
  let start = 0;
  if (text.charCodeAt(0) === 0xfeff) start = 1;

  const rows: string[][] = [];
  let i = start;
  while (i < text.length) {
    const row: string[] = [];
    let field = "";
    let inQuotes = false;

    while (true) {
      if (i >= text.length) {
        break;
      }
      if (inQuotes) {
        if (text[i] === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          field += text[i];
          i++;
        }
      } else {
        if (text[i] === '"') {
          inQuotes = true;
          i++;
        } else if (text[i] === ",") {
          row.push(field);
          field = "";
          i++;
        } else if (text[i] === "\r") {
          if (i + 1 < text.length && text[i + 1] === "\n") i += 2;
          else i++;
          break;
        } else if (text[i] === "\n") {
          i++;
          break;
        } else {
          field += text[i];
          i++;
        }
      }
    }

    row.push(field);
    const trimmed = row.map((c) => c.trim());
    if (trimmed.length > 0 && trimmed.some((c) => c !== "")) {
      rows.push(trimmed);
    }
  }

  return rows;
}

export function wellOf(keywords: Record<string, string>): string | undefined {
  const candidates = ["$WELLID", "WELL ID", "WELLID", "WELL"];
  for (const key of candidates) {
    const val = keywords[key];
    if (val !== undefined && val.trim() !== "") return val.trim();
  }
  return undefined;
}

export function readAnnotations(
  csv: string,
  samples: { name: string; keywords: Record<string, string> }[]
): AnnotationImport {
  const [header, ...body] = parseCsv(csv);
  if (!header || header.length < 2) throw new Error("The CSV needs a header row and at least one column besides the key");
  const columns = header.flatMap((name, index) => (index > 0 && name !== "" ? [{ name, index }] : []));
  const stem = (name: string) => name.toLowerCase().replace(/\.fcs$/, "");

  const values: Record<string, Record<string, string>> = {};
  const unmatched = new Set<string>();
  for (const row of body) {
    const key = row[0]?.toLowerCase() ?? "";
    if (key === "") continue;
    // File name matches win; the well id is only a fallback.
    let hits = samples.filter((s) => s.name.toLowerCase() === key || stem(s.name) === key);
    if (hits.length === 0) hits = samples.filter((s) => wellOf(s.keywords)?.toLowerCase() === key);
    if (hits.length === 0) unmatched.add(row[0]!);
    for (const s of hits) {
      const target = (values[s.name] ??= {});
      for (const col of columns) {
        const cell = row[col.index];
        if (cell) target[col.name] = cell;
      }
    }
  }
  return { columns: columns.map((c) => c.name), values, unmatched: [...unmatched] };
}
