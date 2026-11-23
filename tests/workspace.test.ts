import { expect, test } from "bun:test";
import { isTemplate } from "../src/ui/model";

test("workspaces may list sample names; older templates without them still load", () => {
  expect(isTemplate({ populations: [], scales: {} })).toBe(true);
  expect(isTemplate({ populations: [], scales: {}, samples: ["a.fcs", "b.fcs"] })).toBe(true);
  expect(isTemplate({ populations: [], scales: {}, samples: "a.fcs" })).toBe(false);
  expect(isTemplate({ populations: [], scales: {}, samples: [1] })).toBe(false);
});

test("workspaces may carry sample groups as file name to group name", () => {
  expect(isTemplate({ populations: [], scales: {}, groups: { "a.fcs": "Controls" } })).toBe(true);
  expect(isTemplate({ populations: [], scales: {}, groups: { "a.fcs": 3 } })).toBe(false);
});
