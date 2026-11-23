import { expect, test } from "bun:test";
import { record, redo, undo, type History } from "../src/ui/history";

test("undo and redo walk the recorded states", () => {
  let h: History<number> = { past: [], present: 0, future: [] };
  h = record(record(h, 1), 2);
  h = undo(h);
  expect(h.present).toBe(1);
  h = undo(undo(h));
  expect(h).toMatchObject({ present: 0, past: [] });
  h = redo(h);
  expect(h.present).toBe(1);
  h = record(h, 5); // a new change drops the redo stack
  expect(h).toMatchObject({ present: 5, future: [] });
  expect(redo(h)).toBe(h);
});

test("unchanged values are not recorded and history is capped", () => {
  let h: History<number> = { past: [], present: 0, future: [] };
  expect(record(h, 0)).toBe(h);
  for (let i = 1; i <= 150; i++) h = record(h, i);
  expect(h.past.length).toBe(100);
  expect(h.past[0]).toBe(50);
});
