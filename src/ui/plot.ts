import { binGrid, logLevels, marchingSquares, probabilityLevels, smooth } from "../core/contour";
import type { Gate } from "../core/gates";
import type { Transform } from "../core/transforms";

export const M = { left: 60, right: 14, top: 14, bottom: 46 };

export interface Frame {
  ctx: CanvasRenderingContext2D;
  w: number; // plot area in CSS px
  h: number;
}

export function frame(canvas: HTMLCanvasElement, size: number): Frame {
  const css = size;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = css * dpr;
  canvas.height = css * dpr;
  canvas.style.width = `${css}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);
  return { ctx, w: css - M.left - M.right, h: css - M.top - M.bottom };
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Perceptually ordered ramp (dark blue to yellow), interpolated.
const RAMP = [
  [48, 18, 59], [50, 101, 234], [27, 207, 212], [97, 252, 108], [210, 233, 53], [254, 155, 45], [217, 56, 6],
];
function ramp(t: number): [number, number, number] {
  const x = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(x), RAMP.length - 2);
  const f = x - i;
  const a = RAMP[i]!;
  const b = RAMP[i + 1]!;
  return [a[0]! + (b[0]! - a[0]!) * f, a[1]! + (b[1]! - a[1]!) * f, a[2]! + (b[2]! - a[2]!) * f];
}

// Plots draw at most this many events, evenly spaced through the file; gates and statistics always use every event.
// A million points already fill a 220×220 density grid, and transforming more makes large files freeze the page.
const DRAW_LIMIT = 1_000_000;
const drawStep = (n: number) => Math.max(1, Math.ceil(n / DRAW_LIMIT));

export function drawDensity(f: Frame, xs: Float32Array, ys: Float32Array, xt: Transform, yt: Transform, mask?: Uint8Array): void {
  const G = 220;
  const bins = new Uint32Array(G * G);
  let max = 0;
  const step = drawStep(xs.length);
  for (let e = 0; e < xs.length; e += step) {
    if (mask && !mask[e]) continue;
    const u = xt.forward(xs[e]!);
    const v = yt.forward(ys[e]!);
    if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) continue;
    const k = Math.floor((1 - v) * G) * G + Math.floor(u * G);
    const c = ++bins[k]!;
    if (c > max) max = c;
  }
  const img = new ImageData(G, G);
  const logMax = Math.log1p(max);
  for (let k = 0; k < bins.length; k++) {
    const c = bins[k]!;
    if (!c) continue;
    const [r, g, b] = ramp(Math.log1p(c) / logMax);
    img.data.set([r, g, b, 255], k * 4);
  }
  const off = new OffscreenCanvas(G, G);
  off.getContext("2d")!.putImageData(img, 0, 0);
  f.ctx.imageSmoothingEnabled = false;
  f.ctx.drawImage(off, M.left, M.top, f.w, f.h);
}

export type PlotStyle = "density" | "dot" | "contour5" | "contour10" | "contour2" | "contourLog";
export const PLOT_STYLES: [PlotStyle, string][] = [
  ["density", "Density"], ["dot", "Dots"], ["contour5", "Contour 5%"], ["contour10", "Contour 10%"],
  ["contour2", "Contour 2%"], ["contourLog", "Contour log"],
];

/** Plot-area coordinates (0..1, v up) of the events to draw, after the mask and the draw limit. */
function plotted(xs: Float32Array, ys: Float32Array, xt: Transform, yt: Transform, mask?: Uint8Array) {
  const step = drawStep(xs.length);
  const us: number[] = [], vs: number[] = [];
  for (let e = 0; e < xs.length; e += step) {
    if (mask && !mask[e]) continue;
    const u = xt.forward(xs[e]!), v = yt.forward(ys[e]!);
    if (u >= 0 && u < 1 && v >= 0 && v < 1) { us.push(u); vs.push(v); }
  }
  return { us, vs };
}

/** One pixel per event in the theme's text colour; `keep` filters events (contour outliers). */
function dots(f: Frame, us: number[], vs: number[], keep: (k: number) => boolean = () => true, alpha = 1, color = "--mui-palette-text-primary"): void {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(f.w * dpr)), H = Math.max(1, Math.round(f.h * dpr));
  const img = new ImageData(W, H);
  for (let k = 0; k < us.length; k++) {
    if (!keep(k)) continue;
    const x = Math.min(W - 1, Math.floor(us[k]! * W)), y = Math.min(H - 1, Math.floor((1 - vs[k]!) * H));
    img.data[(y * W + x) * 4 + 3] = 255;
  }
  const off = new OffscreenCanvas(W, H);
  const o = off.getContext("2d")!;
  o.putImageData(img, 0, 0);
  // Tint the opaque pixels with the text colour, so dots follow the light and dark theme.
  o.globalCompositeOperation = "source-in";
  o.fillStyle = css(color);
  o.fillRect(0, 0, W, H);
  f.ctx.globalAlpha = alpha;
  f.ctx.drawImage(off, M.left, M.top, f.w, f.h);
  f.ctx.globalAlpha = 1;
}

/** Fades what is drawn so far, so a highlighted population stands out. */
export function dim(f: Frame): void {
  f.ctx.globalAlpha = 0.65;
  f.ctx.fillStyle = css("--mui-palette-background-paper");
  f.ctx.fillRect(M.left, M.top, f.w, f.h);
  f.ctx.globalAlpha = 1;
}

/** Backgating: a population's events in the highlight colour, over a plot already dimmed by the caller. */
export function drawHighlight(f: Frame, xs: Float32Array, ys: Float32Array, xt: Transform, yt: Transform, mask: Uint8Array): void {
  const { us, vs } = plotted(xs, ys, xt, yt, mask);
  dots(f, us, vs, undefined, 1, "--mui-palette-highlight-main");
}

export function drawDots(f: Frame, xs: Float32Array, ys: Float32Array, xt: Transform, yt: Transform, mask?: Uint8Array): void {
  const { us, vs } = plotted(xs, ys, xt, yt, mask);
  dots(f, us, vs);
}

/** Contour lines of the smoothed density, with events outside the lowest contour drawn as faint dots. */
export function drawContour(f: Frame, xs: Float32Array, ys: Float32Array, xt: Transform, yt: Transform, style: PlotStyle, mask?: Uint8Array): void {
  const G = 128;
  const { us, vs } = plotted(xs, ys, xt, yt, mask);
  const grid = smooth(binGrid(us, vs, G), G);
  const levels = style === "contourLog" ? logLevels(grid) : probabilityLevels(grid, style === "contour10" ? 0.1 : style === "contour2" ? 0.02 : 0.05);
  const lowest = levels[0] ?? Infinity;
  const cell = (k: number) => grid[Math.min(G - 1, Math.floor(vs[k]! * G)) * G + Math.min(G - 1, Math.floor(us[k]! * G))]!;
  dots(f, us, vs, (k) => cell(k) < lowest, 0.5);
  const { ctx } = f;
  // Grid point x sits at the centre of cell x.
  const px = (x: number) => M.left + ((x + 0.5) / G) * f.w, py = (y: number) => M.top + (1 - (y + 0.5) / G) * f.h;
  ctx.strokeStyle = css("--mui-palette-text-primary");
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const level of levels) {
    const seg = marchingSquares(grid, G, level);
    for (let k = 0; k < seg.length; k += 4) {
      ctx.moveTo(px(seg[k]!), py(seg[k + 1]!));
      ctx.lineTo(px(seg[k + 2]!), py(seg[k + 3]!));
    }
  }
  ctx.stroke();
}

/** Returns the tallest bin, so a highlighted subset can be drawn on the same scale (`opts.max`). */
export function drawHistogram(f: Frame, xs: Float32Array, xt: Transform, mask?: Uint8Array, opts: { max?: number; color?: string } = {}): number {
  const B = 256;
  const bins = new Uint32Array(B);
  const step = drawStep(xs.length);
  for (let e = 0; e < xs.length; e += step) {
    if (mask && !mask[e]) continue;
    const u = xt.forward(xs[e]!);
    if (u >= 0 && u < 1) bins[Math.floor(u * B)]!++;
  }
  const max = opts.max ?? Math.max(1, ...bins);
  const { ctx } = f;
  ctx.beginPath();
  ctx.moveTo(M.left, M.top + f.h);
  bins.forEach((c, i) => ctx.lineTo(M.left + (i / B) * f.w, M.top + f.h - (c / max) * f.h * 0.95));
  ctx.lineTo(M.left + f.w, M.top + f.h);
  ctx.closePath();
  const accent = css(opts.color ?? "--mui-palette-primary-main");
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  return max;
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) => String(n).split("").map((d) => SUP[Number(d)]).join("");

function ticks(t: Transform): { v: number; label: string }[] {
  if (t.spec.kind === "linear") {
    const { min, max } = t.spec;
    const step = Math.pow(10, Math.floor(Math.log10((max - min) / 4)));
    const nice = [1, 2, 5, 10].map((m) => m * step).find((s) => (max - min) / s <= 6) ?? step * 10;
    const out = [];
    for (let v = Math.ceil(min / nice) * nice; v <= max; v += nice) {
      out.push({ v, label: Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(+v.toFixed(2)) });
    }
    return out;
  }
  const out = [{ v: 0, label: "0" }];
  for (let k = 1; k <= 7; k++) {
    out.push({ v: Math.pow(10, k), label: `10${sup(k)}` }, { v: -Math.pow(10, k), label: `-10${sup(k)}` });
  }
  return out;
}

export function drawAxes(f: Frame, xt: Transform, yt: Transform | null, xLabel: string, yLabel: string): void {
  const { ctx, w, h } = f;
  ctx.strokeStyle = css("--mui-palette-divider");
  ctx.fillStyle = css("--mui-palette-text-secondary");
  ctx.lineWidth = 1;
  ctx.strokeRect(M.left + 0.5, M.top + 0.5, w, h);
  ctx.font = "11px Roboto, system-ui, sans-serif";
  const place = (t: Transform, horizontal: boolean) => {
    let last = -Infinity;
    for (const { v, label } of ticks(t).sort((a, b) => t.forward(a.v) - t.forward(b.v))) {
      const u = t.forward(v);
      if (!(u >= 0 && u <= 1)) continue;
      const px = horizontal ? M.left + u * w : M.top + (1 - u) * h;
      if (Math.abs(px - last) < 22) continue;
      last = px;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(px, M.top + h);
        ctx.lineTo(px, M.top + h + 4);
        ctx.textAlign = "center";
        ctx.fillText(label, px, M.top + h + 16);
      } else {
        ctx.moveTo(M.left - 4, px);
        ctx.lineTo(M.left, px);
        ctx.textAlign = "right";
        ctx.fillText(label, M.left - 6, px + 4);
      }
      ctx.stroke();
    }
  };
  place(xt, true);
  if (yt) place(yt, false);
  ctx.fillStyle = css("--mui-palette-text-primary");
  ctx.textAlign = "center";
  ctx.font = "12px Roboto, system-ui, sans-serif";
  ctx.fillText(xLabel, M.left + w / 2, M.top + h + 38);
  ctx.save();
  ctx.translate(14, M.top + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

export const toPx = (f: Frame, u: number, v: number): [number, number] => [M.left + u * f.w, M.top + (1 - v) * f.h];
const clamp = (u: number) => Math.min(Math.max(u, 0), 1);

export function drawGate(f: Frame, gate: Gate, label: string, preview = false): void {
  const { ctx } = f;
  ctx.save();
  ctx.beginPath();
  ctx.rect(M.left, M.top, f.w, f.h);
  ctx.clip();
  ctx.strokeStyle = css("--mui-palette-gate-main");
  ctx.lineWidth = 1.5;
  if (preview) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  let anchor: [number, number];
  switch (gate.kind) {
    case "range": {
      const [x0] = toPx(f, clamp(gate.min), 0);
      const [x1] = toPx(f, clamp(gate.max), 0);
      const y = M.top + f.h * 0.12;
      ctx.moveTo(x0, M.top);
      ctx.lineTo(x0, M.top + f.h);
      ctx.moveTo(x1, M.top);
      ctx.lineTo(x1, M.top + f.h);
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      anchor = [(x0 + x1) / 2, y - 6];
      break;
    }
    case "rectangle": {
      const [x0, y0] = toPx(f, clamp(gate.xMin), clamp(gate.yMax));
      const [x1, y1] = toPx(f, clamp(gate.xMax), clamp(gate.yMin));
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      anchor = [(x0 + x1) / 2, y0 + 14];
      break;
    }
    case "polygon": {
      gate.points.forEach(([u, v], i) => {
        const [x, y] = toPx(f, u, v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (!preview) ctx.closePath();
      const [u0, v0] = gate.points[0] ?? [0, 0];
      anchor = toPx(f, u0, v0);
      break;
    }
    case "ellipse": {
      const [cx, cy] = toPx(f, gate.cx, gate.cy);
      ctx.ellipse(cx, cy, gate.rx * f.w, gate.ry * f.h, -gate.angle, 0, Math.PI * 2);
      anchor = [cx, cy];
      break;
    }
  }
  ctx.stroke();
  if (label) {
    ctx.font = "500 12px Roboto, system-ui, sans-serif";
    ctx.textAlign = "center";
    const half = ctx.measureText(label).width / 2 + 4;
    const ax = Math.min(Math.max(anchor[0], M.left + half), M.left + f.w - half);
    const ay = Math.min(Math.max(anchor[1], M.top + 14), M.top + f.h - 6);
    // Halo in the panel colour keeps the label readable over dense events.
    ctx.setLineDash([]);
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = css("--mui-palette-background-paper");
    ctx.strokeText(label, ax, ay);
    ctx.fillStyle = css("--mui-palette-gate-main");
    ctx.fillText(label, ax, ay);
  }
  ctx.restore();
}
