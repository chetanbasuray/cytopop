import { expect, test } from "bun:test";
import { globMatch, matchRules } from "../src/core/rules";

test("glob patterns match whole file names, ignoring case", () => {
  expect(globMatch("*_CD4_*.fcs", "day1_CD4_tube2.FCS")).toBe(true);
  expect(globMatch("*_CD4_*.fcs", "day1_CD8_tube2.fcs")).toBe(false);
  expect(globMatch("tube?.fcs", "tube1.fcs")).toBe(true);
  expect(globMatch("tube?.fcs", "tube12.fcs")).toBe(false);
  expect(globMatch("a(1).fcs", "a(1).fcs")).toBe(true);
});

test("a rule applies only when every file matches it and no other", () => {
  const cd4 = { pattern: "*CD4*" }, cd8 = { pattern: "*CD8*" }, any = { pattern: "*.fcs" };
  expect(matchRules(["x_CD4.fcs", "y_CD4.fcs"], [cd4, cd8])).toEqual({ rule: cd4, report: [] });
  expect(matchRules(["x_CD4.fcs", "z.fcs"], [cd4, cd8]).report).toEqual(["z.fcs: matches no rule"]);
  expect(matchRules(["x_CD4.fcs"], [cd4, any]).report).toEqual(["x_CD4.fcs: matches several rules (*CD4*, *.fcs)"]);
  const mixed = matchRules(["x_CD4.fcs", "x_CD8.fcs"], [cd4, cd8]);
  expect(mixed.rule).toBeUndefined();
  expect(mixed.report).toEqual(["x_CD4.fcs: *CD4*", "x_CD8.fcs: *CD8*"]);
});
