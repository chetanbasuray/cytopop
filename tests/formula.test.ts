import { expect, test } from "bun:test";
import { evaluateFormula, FormulaError, inputs, isDerivedParameter, parseFormula } from "../src/core/formula";

const names = ["FITC-A", "PE-A", "FSC_H"];
const data = [new Float32Array([2, 4, 0]), new Float32Array([1, 0, 0]), new Float32Array([-9, 16, 100])];
const run = (f: string) => Array.from(evaluateFormula(parseFormula(f, names), names, data));

test("operators follow precedence and bracketed names", () => {
  expect(run("[FITC-A] + [PE-A] * 2")).toEqual([4, 4, 0]);
  expect(run("([FITC-A] + [PE-A]) × 2")).toEqual([6, 8, 0]);
  expect(run("−[FITC-A] ÷ 2 - -1")).toEqual([0, -1, 1]);
  expect(run("1.5e1 - .5")).toEqual([14.5, 14.5, 14.5]);
});

test("functions and bare names", () => {
  expect(run("abs(FSC_H)")).toEqual([9, 16, 100]);
  expect(run("SQRT(abs(FSC_H))")).toEqual([3, 4, 10]);
  expect(run("log10(FSC_H)")).toEqual([NaN, Math.fround(Math.log10(16)), 2]);
  expect(run("ln([FITC-A])")[0]).toBeCloseTo(Math.LN2, 6);
});

test("undefined results become NaN, including division by zero", () => {
  expect(run("[FITC-A] / [PE-A]")).toEqual([2, NaN, NaN]);
  expect(run("sqrt(FSC_H)")[0]).toBeNaN();
});

test("inputs lists each parameter once in first-use order", () => {
  expect(inputs(parseFormula("[PE-A] / ([FITC-A] + [PE-A])", names))).toEqual(["PE-A", "FITC-A"]);
});

test("errors explain what is wrong", () => {
  const msg = (f: string) => {
    try {
      parseFormula(f, names);
      return "";
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaError);
      return (e as Error).message;
    }
  };
  expect(msg("  ")).toBe("Enter a formula");
  expect(msg("[APC-A] / 2")).toBe('Unknown parameter "APC-A"');
  expect(msg("exp(FSC_H)")).toBe('Unknown function "exp"');
  expect(msg("([FITC-A] + 1")).toBe("Missing closing bracket");
  expect(msg("[FITC-A")).toBe("Missing closing bracket");
  expect(msg("FSC_H +")).toBe("The formula ends too early");
  expect(msg("FSC_H $ 2")).toBe('Unexpected "$" at position 7');
  expect(msg("FSC_H 2")).toBe('Unexpected "2" at position 7');
  expect(() => evaluateFormula(parseFormula("FSC_H", names), ["X"], data)).toThrow(FormulaError);
});

test("derived parameter records are validated", () => {
  expect(isDerivedParameter({ name: "ratio", formula: "1" })).toBe(true);
  expect(isDerivedParameter({ name: "", formula: "1" })).toBe(false);
  expect(isDerivedParameter(null)).toBe(false);
});
