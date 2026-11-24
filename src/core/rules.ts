/** `*` matches any run of characters and `?` one character; case is ignored, as file systems often do. */
export function globMatch(pattern: string, name: string): boolean {
  const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + pattern.split("*").map((p) => p.split("?").map(esc).join(".")).join(".*") + "$", "i").test(name);
}

/**
 * The one rule every file matches, or the report of why there is none: files matching no rule, several rules, or different
 * rules. Nothing is applied unless all files agree, because the gating is shared by every open sample.
 */
export function matchRules<R extends { pattern: string }>(names: string[], rules: R[]): { rule?: R; report: string[] } {
  const hits = names.map((n) => ({ n, of: rules.filter((r) => globMatch(r.pattern, n)) }));
  const report = hits.flatMap(({ n, of }) =>
    of.length === 0 ? [`${n}: matches no rule`] : of.length > 1 ? [`${n}: matches several rules (${of.map((r) => r.pattern).join(", ")})`] : []);
  if (report.length) return { report };
  const distinct = new Set(hits.map((h) => h.of[0]));
  if (distinct.size > 1) return { report: hits.map(({ n, of }) => `${n}: ${of[0]!.pattern}`) };
  return { rule: hits[0]?.of[0], report: [] };
}
