// Axis scales mapping raw values to display units in [0, 1].

export type TransformSpec =
  | { kind: "linear"; min: number; max: number }
  | { kind: "log"; min: number; max: number }
  | { kind: "arcsinh"; cofactor: number; min: number; max: number }
  | { kind: "logicle"; T: number; W: number; M: number; A: number }
  | { kind: "hyperlog"; T: number; W: number; M: number; A: number };

export interface Transform {
  spec: TransformSpec;
  forward(x: number): number;
  inverse(y: number): number;
}

export function linear(min: number, max: number): Transform {
  const span = max - min || 1;
  return { spec: { kind: "linear", min, max }, forward: (x) => (x - min) / span, inverse: (y) => min + y * span };
}

export function log(min = 1, max = 262144): Transform {
  const lo = Math.log10(Math.max(min, 1e-9));
  const span = Math.log10(max) - lo || 1;
  return {
    spec: { kind: "log", min, max },
    // Non-positive values are pinned to the axis floor.
    forward: (x) => (Math.log10(Math.max(x, min)) - lo) / span,
    inverse: (y) => Math.pow(10, lo + y * span),
  };
}

export function arcsinh(cofactor = 150, min = -1000, max = 262144): Transform {
  const lo = Math.asinh(min / cofactor);
  const span = Math.asinh(max / cofactor) - lo;
  return {
    spec: { kind: "arcsinh", cofactor, min, max },
    forward: (x) => (Math.asinh(x / cofactor) - lo) / span,
    inverse: (y) => Math.sinh(lo + y * span) * cofactor,
  };
}

/**
 * Logicle (Parks, Roederer & Moore 2006) via the Moore & Parks parameterisation.
 * T: top of scale, W: linearisation width in decades, M: total decades, A: extra negative decades.
 */
export function logicle(T = 262144, W = 0.5, M = 4.5, A = 0): Transform {
  if (!(T > 0) || !(M > 0) || W < 0 || W > M / 2 || A < -W || A > M - 2 * W) {
    throw new RangeError("Invalid logicle parameters");
  }
  const w = W / (M + A);
  const x2 = A / (M + A);
  const x1 = x2 + w;
  const x0 = x2 + 2 * w;
  const b = (M + A) * Math.LN10;
  const d = solveD(b, w);
  const ca = Math.exp(x0 * (b + d));
  const mfa = Math.exp(b * x1) - ca / Math.exp(d * x1);
  const a = T / (Math.exp(b) - mfa - ca / Math.exp(d));
  const c = ca * a;
  const f = -mfa * a;

  const inverse = (y: number): number => {
    const negative = y < x1;
    const s = negative ? 2 * x1 - y : y;
    const v = a * Math.exp(b * s) + f - c * Math.exp(-d * s);
    return negative ? -v : v;
  };

  const slope = (y: number): number => {
    const s = y < x1 ? 2 * x1 - y : y;
    return a * b * Math.exp(b * s) + c * d * Math.exp(-d * s);
  };

  const forward = invertMonotone(inverse, slope);

  return { spec: { kind: "logicle", T, W, M, A }, forward, inverse };
}

/**
 * Forward transform from an increasing inverse: a lookup table gives the starting guess, Newton steps refine it,
 * and bisection covers values outside the table.
 */
function invertMonotone(inverse: (y: number) => number, slope: (y: number) => number): (x: number) => number {
  const bisect = (x: number): number => {
    let lo = -1;
    let hi = 1.5;
    while (inverse(lo) > x) lo -= 1;
    while (inverse(hi) < x) hi += 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (inverse(mid) < x) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const N = 4096;
  const yLo = -0.5;
  const yHi = 1.2;
  const tableX = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) tableX[i] = inverse(yLo + ((yHi - yLo) * i) / N);
  return (x: number): number => {
    if (!(x > tableX[0]! && x < tableX[N]!)) return Number.isNaN(x) ? NaN : bisect(x);
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tableX[mid]! <= x) lo = mid;
      else hi = mid;
    }
    const x0 = tableX[lo]!;
    const t = (x - x0) / (tableX[hi]! - x0);
    let y = yLo + ((yHi - yLo) * (lo + t)) / N;
    for (let i = 0; i < 3; i++) y -= (inverse(y) - x) / slope(y);
    return y;
  };
}

/**
 * Hyperlog (Bagwell 2005) in the Gating-ML 2.0 parameterisation, with the same T, W, M and A as logicle.
 * Its inverse is EH(y) = a·e^(b·y) + c·y − f above x1, mirrored as −EH(2·x1 − y) below; the linear term replaces
 * logicle's second exponential.
 */
export function hyperlog(T = 262144, W = 0.5, M = 4.5, A = 0): Transform {
  if (!(T > 0) || !(M > 0) || !(W > 0) || W > M / 2 || A < -W || A > M - 2 * W) {
    throw new RangeError("Invalid hyperlog parameters");
  }
  const w = W / (M + A);
  const x2 = A / (M + A);
  const x1 = x2 + w;
  const x0 = x2 + 2 * w;
  const b = (M + A) * Math.LN10;
  const ca = Math.exp(b * x0) / w;
  const fa = Math.exp(b * x1) + ca * x1;
  const a = T / (Math.exp(b) + ca - fa);
  const c = ca * a;
  const f = fa * a;
  const inverse = (y: number): number => {
    const negative = y < x1;
    const s = negative ? 2 * x1 - y : y;
    const v = a * Math.exp(b * s) + c * s - f;
    return negative ? -v : v;
  };
  const slope = (y: number): number => a * b * Math.exp(b * (y < x1 ? 2 * x1 - y : y)) + c;
  return { spec: { kind: "hyperlog", T, W, M, A }, forward: invertMonotone(inverse, slope), inverse };
}

function solveD(b: number, w: number): number {
  if (w === 0) return b;
  // Root of 2(ln d - ln b) + w(b + d) = 0 on (0, b).
  const g = (d: number) => 2 * (Math.log(d) - Math.log(b)) + w * (b + d);
  let lo = 1e-12;
  let hi = b;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function fromSpec(spec: TransformSpec): Transform {
  switch (spec.kind) {
    case "linear":
      return linear(spec.min, spec.max);
    case "log":
      return log(spec.min, spec.max);
    case "arcsinh":
      return arcsinh(spec.cofactor, spec.min, spec.max);
    case "logicle":
      return logicle(spec.T, spec.W, spec.M, spec.A);
    case "hyperlog":
      return hyperlog(spec.T, spec.W, spec.M, spec.A);
  }
}
