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

test("workspaces may carry keyword columns and annotation columns", () => {
  const annotations = { columns: ["Donor", "Day"], values: { "a.fcs": { Donor: "D1", Day: "3" } } };
  expect(isTemplate({ populations: [], scales: {}, keywordColumns: ["$WELLID"], annotations })).toBe(true);
  expect(isTemplate({ populations: [], scales: {}, keywordColumns: "$WELLID" })).toBe(false);
  expect(isTemplate({ populations: [], scales: {}, annotations: { columns: ["Donor"], values: { "a.fcs": { Donor: 1 } } } })).toBe(false);
  expect(isTemplate({ populations: [], scales: {}, annotations: { values: {} } })).toBe(false);
});

test("workspaces may carry per-sample gate adjustments", () => {
  const gate = { kind: "range", x: { param: "FSC-A", scale: { kind: "linear", min: 0, max: 1 } }, min: 0.2, max: 0.8 };
  expect(isTemplate({ populations: [], scales: {}, overrides: { "a.fcs": { p1: gate } } })).toBe(true);
  expect(isTemplate({ populations: [], scales: {}, overrides: { "a.fcs": { p1: "wide" } } })).toBe(false);
  expect(isTemplate({ populations: [], scales: {}, overrides: { "a.fcs": [] } })).toBe(false);
});

test("workspaces may carry keyword edits as file name to keyword to value", () => {
  expect(isTemplate({ populations: [], scales: {}, keywordEdits: { "a.fcs": { CONDITION: "Stim" } } })).toBe(true);
  expect(isTemplate({ populations: [], scales: {}, keywordEdits: { "a.fcs": { CONDITION: 1 } } })).toBe(false);
  expect(isTemplate({ populations: [], scales: {}, keywordEdits: [] })).toBe(false);
});
