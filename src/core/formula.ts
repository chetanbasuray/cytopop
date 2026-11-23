export class FormulaError extends Error {}

/** A parameter computed per event from a formula over other parameters. */
export interface DerivedParameter {
  name: string;
  formula: string;
}

export type Expr =
  | { kind: "num"; value: number }
  | { kind: "param"; name: string }
  | { kind: "neg"; arg: Expr }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { kind: "call"; fn: Fn; arg: Expr };

type Fn = "abs" | "sqrt" | "ln" | "log10";
const FNS: Record<Fn, (x: number) => number> = { abs: Math.abs, sqrt: Math.sqrt, ln: Math.log, log10: Math.log10 };
const ALIASES: Record<string, string> = { "×": "*", "÷": "/", "−": "-" };

/** Parses `[FITC-A] / [PE-A]`, `abs(FSC_H - 2)` and the like. Names with dashes or spaces go in brackets. */
export function parseFormula(src: string, names: string[]): Expr {
  let i = 0;
  const peek = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
    const c = src[i];
    return c === undefined ? undefined : (ALIASES[c] ?? c);
  };
  const unexpected = (): never => {
    const c = peek();
    throw new FormulaError(c === undefined ? "The formula ends too early" : `Unexpected "${src[i]}" at position ${i + 1}`);
  };
  const param = (name: string): Expr => {
    if (!names.includes(name)) throw new FormulaError(`Unknown parameter "${name}"`);
    return { kind: "param", name };
  };
  const expect = (c: string) => {
    if (peek() !== c) throw new FormulaError("Missing closing bracket");
    i++;
  };

  const primary = (): Expr => {
    const c = peek();
    if (c === "(") {
      i++;
      const e = expr();
      expect(")");
      return e;
    }
    if (c === "[") {
      const end = src.indexOf("]", i);
      if (end < 0) throw new FormulaError("Missing closing bracket");
      const name = src.slice(i + 1, end).trim();
      i = end + 1;
      return param(name);
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (c !== undefined && num) {
      i += num[0].length;
      return { kind: "num", value: Number(num[0]) };
    }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (c !== undefined && id) {
      i += id[0].length;
      if (peek() !== "(") return param(id[0]);
      const fn = id[0].toLowerCase();
      if (!(fn in FNS)) throw new FormulaError(`Unknown function "${id[0]}"`);
      i++;
      const arg = expr();
      expect(")");
      return { kind: "call", fn: fn as Fn, arg };
    }
    return unexpected();
  };
  const unary = (): Expr => {
    if (peek() === "-") {
      i++;
      return { kind: "neg", arg: unary() };
    }
    return primary();
  };
  const chain = (ops: string, next: () => Expr) => (): Expr => {
    let left = next();
    for (let op = peek(); op !== undefined && ops.includes(op); op = peek()) {
      i++;
      left = { kind: "bin", op: op as "+" | "-" | "*" | "/", left, right: next() };
    }
    return left;
  };
  const term = chain("*/", unary);
  const expr = chain("+-", term);

  if (peek() === undefined) throw new FormulaError("Enter a formula");
  const e = expr();
  if (peek() !== undefined) unexpected();
  return e;
}

/** Distinct parameter names a formula uses, in first-use order. */
export function inputs(e: Expr, out: string[] = []): string[] {
  if (e.kind === "param" && !out.includes(e.name)) out.push(e.name);
  else if (e.kind === "neg" || e.kind === "call") inputs(e.arg, out);
  else if (e.kind === "bin") inputs(e.right, inputs(e.left, out));
  return out;
}

/** One value per event; undefined results (division by zero, sqrt or log of a negative) become NaN. */
export function evaluateFormula(e: Expr, names: string[], data: Float32Array[]): Float32Array {
  const compile = (e: Expr): ((i: number) => number) => {
    switch (e.kind) {
      case "num": {
        const v = e.value;
        return () => v;
      }
      case "param": {
        const col = data[names.indexOf(e.name)];
        if (!col) throw new FormulaError(`Unknown parameter "${e.name}"`);
        return (i) => col[i]!;
      }
      case "neg": {
        const a = compile(e.arg);
        return (i) => -a(i);
      }
      case "call": {
        const a = compile(e.arg);
        const f = FNS[e.fn];
        return (i) => f(a(i));
      }
      case "bin": {
        const l = compile(e.left);
        const r = compile(e.right);
        if (e.op === "+") return (i) => l(i) + r(i);
        if (e.op === "-") return (i) => l(i) - r(i);
        if (e.op === "*") return (i) => l(i) * r(i);
        return (i) => l(i) / r(i);
      }
    }
  };
  const f = compile(e);
  const out = new Float32Array(data[0]?.length ?? 0);
  for (let i = 0; i < out.length; i++) {
    const v = f(i);
    out[i] = Number.isFinite(v) ? v : NaN;
  }
  return out;
}

export function isDerivedParameter(v: unknown): v is DerivedParameter {
  return !!v && typeof v === "object" && typeof (v as DerivedParameter).name === "string" && (v as DerivedParameter).name !== "" &&
    typeof (v as DerivedParameter).formula === "string";
}
