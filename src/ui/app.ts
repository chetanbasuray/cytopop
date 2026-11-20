import { compensate } from "../core/compensation";
import { demoSample } from "../core/demo";
import { FcsError, parseFcs, type FcsFile } from "../core/fcs";
import { quadrants, type Dimension, type Gate } from "../core/gates";
import { channelStats, evaluate, populationStats, toCsv, type Population } from "../core/populations";
import { arcsinh, fromSpec, linear, log, logicle, type TransformSpec } from "../core/transforms";
import { drawAxes, drawDensity, drawGate, drawHistogram, frame, M, type Frame } from "./plot";

type Tool = "none" | "rect" | "polygon" | "ellipse" | "quad" | "range";
const HIST = "__histogram__";
const STORE_KEY = "cytopop.template.v1";

interface Sample {
  id: string;
  name: string;
  file: FcsFile;
  names: string[];
  compensated?: Float32Array[];
}

interface Template {
  populations: Population[];
  scales: Record<string, TransformSpec>;
}

const state = {
  samples: [] as Sample[],
  active: null as string | null,
  populations: [] as Population[],
  scales: {} as Record<string, TransformSpec>,
  parent: null as string | null, // population shown on the plot; null = all events
  x: "",
  y: "",
  tool: "none" as Tool,
  compensate: true,
  statChannel: "",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("plot");
let currentFrame: Frame | null = null;
let draft: { start?: [number, number]; points: [number, number][]; cursor?: [number, number] } = { points: [] };

// ---------- persistence (per-viewer convenience only) ----------
function saveLocal(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ populations: state.populations, scales: state.scales } satisfies Template));
  } catch {
    /* storage unavailable: the template still lives in memory */
  }
}
function loadLocal(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) applyTemplate(JSON.parse(raw) as Template);
  } catch {
    /* ignore corrupt or blocked storage */
  }
}
function applyTemplate(t: Template): void {
  if (!Array.isArray(t.populations) || typeof t.scales !== "object") throw new Error("Not a CytoPop gating template");
  state.populations = t.populations;
  state.scales = { ...state.scales, ...t.scales };
  state.parent = null;
}

// ---------- data helpers ----------
const activeSample = () => state.samples.find((s) => s.id === state.active);

function columns(s: Sample): Float32Array[] {
  if (!state.compensate || !s.file.spillover) return s.file.data;
  s.compensated ??= compensate(s.names, s.file.data, s.file.spillover);
  return s.compensated;
}

function defaultScale(s: Sample, name: string): TransformSpec {
  const p = s.file.parameters.find((q) => q.name === name);
  const range = p?.range && p.range > 1 ? p.range : 262144;
  if (/^(FSC|SSC|Time)/i.test(name)) return { kind: "linear", min: 0, max: range };
  return { kind: "logicle", T: Math.max(range, 1024), W: 0.5, M: 4.5, A: 0 };
}

function scaleFor(name: string): TransformSpec {
  const s = activeSample();
  state.scales[name] ??= s ? defaultScale(s, name) : { kind: "linear", min: 0, max: 262144 };
  return state.scales[name]!;
}

function retarget(spec: TransformSpec, kind: TransformSpec["kind"]): TransformSpec {
  const top = spec.kind === "logicle" ? spec.T : spec.max;
  switch (kind) {
    case "linear": return linear(0, top).spec;
    case "log": return log(1, top).spec;
    case "arcsinh": return arcsinh(150, -1000, top).spec;
    case "logicle": return logicle(top, 0.5, 4.5, 0).spec;
  }
}

function label(s: Sample, name: string): string {
  const p = s.file.parameters.find((q) => q.name === name);
  return p?.label && p.label !== name ? `${name} (${p.label})` : name;
}

const masksCache = new Map<string, Map<string, Uint8Array>>();
function masksFor(s: Sample): Map<string, Uint8Array> {
  const key = `${s.id}|${state.compensate}`;
  let m = masksCache.get(key);
  if (!m) {
    m = evaluate(state.populations, s.names, columns(s));
    masksCache.set(key, m);
  }
  return m;
}
function invalidate(): void {
  masksCache.clear();
  saveLocal();
}

// ---------- rendering ----------
function render(): void {
  renderSamples();
  renderTree();
  renderControls();
  renderPlot();
  renderStats();
}

function renderSamples(): void {
  const ul = $("samples");
  ul.replaceChildren(
    ...state.samples.map((s) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-current", String(s.id === state.active));
      b.innerHTML = `<span></span><span class="count">${s.file.eventCount.toLocaleString()}</span>`;
      b.firstElementChild!.textContent = s.name;
      b.onclick = () => {
        state.active = s.id;
        render();
      };
      li.append(b);
      return li;
    }),
  );
  $("samples-empty").hidden = state.samples.length > 0;
}

function renderTree(): void {
  const s = activeSample();
  const masks = s ? safeMasks(s) : undefined;
  const total = s?.file.eventCount ?? 0;
  const stats = s && masks ? populationStats(state.populations, masks, total) : [];
  const node = (id: string | null, name: string, pct: string): HTMLLIElement => {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "row";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "node";
    b.setAttribute("aria-current", String(state.parent === id));
    b.innerHTML = `<span></span><span class="count">${pct}</span>`;
    b.firstElementChild!.textContent = name;
    b.onclick = () => {
      state.parent = id;
      render();
    };
    row.append(b);
    if (id) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.textContent = "×";
      del.setAttribute("aria-label", `Delete ${name} and its children`);
      del.onclick = () => removePopulation(id);
      row.append(del);
    }
    li.append(row);
    const kids = state.populations.filter((p) => p.parentId === id);
    if (kids.length) {
      const ul = document.createElement("ul");
      for (const k of kids) {
        const st = stats.find((x) => x.id === k.id);
        ul.append(node(k.id, k.name, st ? `${st.percentParent.toFixed(1)}%` : ""));
      }
      li.append(ul);
    }
    return li;
  };
  $("populations").replaceChildren(node(null, "All events", total ? total.toLocaleString() : ""));
}

function safeMasks(s: Sample): Map<string, Uint8Array> | undefined {
  try {
    return masksFor(s);
  } catch (err) {
    $("plot-title").textContent = `Gating error: ${(err as Error).message}`;
    return undefined;
  }
}

function fillSelect(sel: HTMLSelectElement, options: [string, string][], value: string): void {
  sel.replaceChildren(...options.map(([v, t]) => new Option(t, v, false, v === value)));
}

const SCALE_OPTIONS: [TransformSpec["kind"], string][] = [["linear", "Linear"], ["log", "Log"], ["logicle", "Logicle"], ["arcsinh", "Arcsinh"]];

function renderControls(): void {
  const s = activeSample();
  const names = s?.names ?? [];
  if (s && !names.includes(state.x)) state.x = names.find((n) => /^FSC-A/i.test(n)) ?? names[0] ?? "";
  if (s && state.y !== HIST && !names.includes(state.y)) state.y = names.find((n) => /^SSC-A/i.test(n)) ?? names[1] ?? names[0] ?? "";
  if (s && !names.includes(state.statChannel)) state.statChannel = state.x;
  const opts = names.map((n): [string, string] => [n, s ? label(s, n) : n]);
  fillSelect($("x-param"), opts, state.x);
  fillSelect($("y-param"), [[HIST, "Histogram"], ...opts], state.y);
  fillSelect($("stat-channel"), opts, state.statChannel);
  fillSelect($("x-scale"), SCALE_OPTIONS, state.x ? scaleFor(state.x).kind : "linear");
  fillSelect($("y-scale"), SCALE_OPTIONS, state.y && state.y !== HIST ? scaleFor(state.y).kind : "linear");
  ($("y-scale") as HTMLSelectElement).disabled = state.y === HIST;
  $<HTMLInputElement>("compensate").disabled = !s?.file.spillover;
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => {
    const t = b.dataset.tool as Tool;
    b.setAttribute("aria-pressed", String(t === state.tool));
    b.disabled = !s || (state.y === HIST ? !["none", "range"].includes(t) : t === "range");
  });
  const hints: Record<Tool, string> = {
    none: "",
    rect: "Drag to draw a rectangle.",
    polygon: "Click to add points; double-click or click the first point to close. Esc cancels.",
    ellipse: "Drag to draw an ellipse.",
    quad: "Click to place the quadrant centre.",
    range: "Drag across the histogram.",
  };
  $("tool-hint").textContent = hints[state.tool];
}

function dims(): { x: Dimension; y: Dimension | null } {
  return {
    x: { param: state.x, scale: scaleFor(state.x) },
    y: state.y === HIST ? null : { param: state.y, scale: scaleFor(state.y) },
  };
}

const sameDim = (a: Dimension, b: Dimension | null) => !!b && a.param === b.param && JSON.stringify(a.scale) === JSON.stringify(b.scale);

function renderPlot(): void {
  const f = frame(canvas);
  currentFrame = f;
  const s = activeSample();
  const title = $("plot-title");
  if (!s || !state.x) {
    title.textContent = "No sample loaded.";
    return;
  }
  const masks = safeMasks(s);
  const cols = columns(s);
  const mask = state.parent ? masks?.get(state.parent) : undefined;
  const { x, y } = dims();
  const xt = fromSpec(x.scale);
  const xs = cols[s.names.indexOf(x.param)]!;
  if (y) {
    const yt = fromSpec(y.scale);
    drawDensity(f, xs, cols[s.names.indexOf(y.param)]!, xt, yt, mask);
    drawAxes(f, xt, yt, label(s, x.param), label(s, y.param));
  } else {
    drawHistogram(f, xs, xt, mask);
    drawAxes(f, xt, null, label(s, x.param), "Count");
  }
  const stats = masks ? populationStats(state.populations, masks, s.file.eventCount) : [];
  for (const p of state.populations.filter((q) => q.parentId === state.parent)) {
    const g = p.gate;
    const fits = g.kind === "range" ? !y && sameDim(g.x, x) : sameDim(g.x, x) && sameDim(g.y, y);
    if (!fits) continue;
    const pct = stats.find((st) => st.id === p.id)?.percentParent;
    drawGate(f, g, `${p.name}${pct === undefined ? "" : ` ${pct.toFixed(1)}%`}`);
  }
  const preview = previewGate();
  if (preview) drawGate(f, preview, "", true);
  const parentName = state.parent ? state.populations.find((p) => p.id === state.parent)?.name : "All events";
  const n = mask ? mask.reduce((a, b) => a + b, 0) : s.file.eventCount;
  title.textContent = `${s.name} · ${parentName} · ${n.toLocaleString()} events`;
}

function renderStats(): void {
  const s = activeSample();
  const body = $("stats-body");
  if (!s) {
    body.replaceChildren();
    return;
  }
  const masks = safeMasks(s);
  if (!masks) return;
  const col = columns(s)[s.names.indexOf(state.statChannel)];
  const rows = [
    { name: "All events", count: s.file.eventCount, pp: 100, pt: 100, mask: undefined as Uint8Array | undefined },
    ...populationStats(state.populations, masks, s.file.eventCount).map((p) => ({
      name: p.path, count: p.count, pp: p.percentParent, pt: p.percentTotal, mask: masks.get(p.id),
    })),
  ];
  const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : "–");
  body.replaceChildren(
    ...rows.map((r) => {
      const c = col ? channelStats(col, r.mask) : { mean: NaN, median: NaN, cv: NaN };
      const tr = document.createElement("tr");
      for (const v of [r.name, r.count.toLocaleString(), fmt(r.pp, 2), fmt(r.pt, 2), fmt(c.median), fmt(c.mean), fmt(c.cv)]) {
        const td = document.createElement("td");
        td.textContent = v;
        tr.append(td);
      }
      return tr;
    }),
  );
}

// ---------- gating interaction ----------
function toUnits(ev: PointerEvent | MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  const scale = 520 / r.width;
  const f = currentFrame!;
  const px = (ev.clientX - r.left) * scale;
  const py = (ev.clientY - r.top) * scale;
  return [(px - M.left) / f.w, 1 - (py - M.top) / f.h];
}

function previewGate(): Gate | null {
  const { x, y } = dims();
  const c = draft.cursor;
  if (!c) return null;
  if (state.tool === "range" && draft.start) return { kind: "range", x, min: Math.min(draft.start[0], c[0]), max: Math.max(draft.start[0], c[0]) };
  if (!y) return null;
  if (state.tool === "rect" && draft.start) {
    const [u0, v0] = draft.start;
    return { kind: "rectangle", x, y, xMin: Math.min(u0, c[0]), xMax: Math.max(u0, c[0]), yMin: Math.min(v0, c[1]), yMax: Math.max(v0, c[1]) };
  }
  if (state.tool === "ellipse" && draft.start) {
    const [u0, v0] = draft.start;
    return { kind: "ellipse", x, y, cx: (u0 + c[0]) / 2, cy: (v0 + c[1]) / 2, rx: Math.abs(c[0] - u0) / 2, ry: Math.abs(c[1] - v0) / 2, angle: 0 };
  }
  if (state.tool === "polygon" && draft.points.length) return { kind: "polygon", x, y, points: [...draft.points, c] };
  return null;
}

let nextId = Date.now();
const newId = () => `p${(nextId++).toString(36)}`;

function addPopulation(gate: Gate, fallback: string): void {
  const name = window.prompt("Population name", fallback)?.trim();
  if (!name) return;
  state.populations.push({ id: newId(), name, parentId: state.parent, gate });
  invalidate();
  render();
}

function removePopulation(id: string): void {
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of state.populations) if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) doomed.add(p.id), (grew = true);
  }
  state.populations = state.populations.filter((p) => !doomed.has(p.id));
  if (state.parent && doomed.has(state.parent)) state.parent = null;
  invalidate();
  render();
}

function finishDraft(): void {
  const g = previewGate();
  draft = { points: [] };
  if (!g) return renderPlot();
  const tooSmall =
    (g.kind === "rectangle" && (g.xMax - g.xMin < 0.005 || g.yMax - g.yMin < 0.005)) ||
    (g.kind === "ellipse" && (g.rx < 0.003 || g.ry < 0.003)) ||
    (g.kind === "range" && g.max - g.min < 0.003) ||
    (g.kind === "polygon" && g.points.length < 3);
  if (tooSmall) return renderPlot();
  if (g.kind === "polygon") g.points.pop(); // drop the trailing cursor point
  addPopulation(g, g.kind === "range" ? `${state.x}+` : `Gate ${state.populations.length + 1}`);
}

canvas.addEventListener("pointerdown", (ev) => {
  if (!activeSample() || state.tool === "none") return;
  const p = toUnits(ev);
  if (state.tool === "quad") {
    const { x, y } = dims();
    if (!y) return;
    const q = quadrants(x, y, p[0], p[1]);
    const base = window.prompt("Quadrant name prefix", "Q")?.trim();
    if (base === undefined) return;
    const names: Record<keyof typeof q, string> = { "++": `${x.param}+ ${y.param}+`, "-+": `${x.param}- ${y.param}+`, "--": `${x.param}- ${y.param}-`, "+-": `${x.param}+ ${y.param}-` };
    (Object.keys(q) as (keyof typeof q)[]).forEach((k, i) => {
      state.populations.push({ id: newId(), name: `${base}${i + 1}: ${names[k]}`, parentId: state.parent, gate: q[k] });
    });
    invalidate();
    render();
    return;
  }
  if (state.tool === "polygon") {
    const first = draft.points[0];
    const f = currentFrame!;
    if (first && draft.points.length >= 3 && Math.hypot((first[0] - p[0]) * f.w, (first[1] - p[1]) * f.h) < 8) {
      draft.cursor = first;
      return finishDraft();
    }
    draft.points.push(p);
    draft.cursor = p;
    renderPlot();
    return;
  }
  canvas.setPointerCapture(ev.pointerId);
  draft = { start: p, points: [], cursor: p };
});

canvas.addEventListener("pointermove", (ev) => {
  if (state.tool === "none" || (!draft.start && !draft.points.length)) return;
  draft.cursor = toUnits(ev);
  renderPlot();
});

canvas.addEventListener("pointerup", () => {
  if (draft.start) finishDraft();
});

canvas.addEventListener("dblclick", () => {
  if (state.tool === "polygon" && draft.points.length >= 3) {
    draft.points.pop(); // the second click of the double-click added a duplicate point
    draft.cursor = draft.points[draft.points.length - 1];
    finishDraft();
  }
});

window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    draft = { points: [] };
    renderPlot();
  }
});

// ---------- controls ----------
document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) =>
  b.addEventListener("click", () => {
    state.tool = b.dataset.tool as Tool;
    draft = { points: [] };
    render();
  }),
);

$<HTMLSelectElement>("x-param").onchange = (e) => {
  state.x = (e.target as HTMLSelectElement).value;
  render();
};
$<HTMLSelectElement>("y-param").onchange = (e) => {
  state.y = (e.target as HTMLSelectElement).value;
  if (state.y === HIST && state.tool !== "range") state.tool = "none";
  if (state.y !== HIST && state.tool === "range") state.tool = "none";
  render();
};
const onScale = (axis: "x" | "y") => (e: Event) => {
  const name = state[axis];
  state.scales[name] = retarget(scaleFor(name), (e.target as HTMLSelectElement).value as TransformSpec["kind"]);
  saveLocal();
  render();
};
$<HTMLSelectElement>("x-scale").onchange = onScale("x");
$<HTMLSelectElement>("y-scale").onchange = onScale("y");
$<HTMLSelectElement>("stat-channel").onchange = (e) => {
  state.statChannel = (e.target as HTMLSelectElement).value;
  renderStats();
};
$<HTMLInputElement>("compensate").onchange = (e) => {
  state.compensate = (e.target as HTMLInputElement).checked;
  masksCache.clear();
  render();
};

// ---------- files ----------
function addSample(name: string, file: FcsFile): void {
  const id = `s${state.samples.length}-${Date.now()}`;
  state.samples.push({ id, name, file, names: file.parameters.map((p) => p.name) });
  state.active ??= id;
}

const DEMO_NAME = "Demo sample (synthetic)";
$("load-demo").onclick = () => {
  // The demo is deterministic, so a second click selects the loaded copy instead of adding a duplicate.
  const existing = state.samples.find((s) => s.name === DEMO_NAME);
  if (existing) state.active = existing.id;
  else addSample(DEMO_NAME, demoSample());
  render();
};

async function openFiles(files: FileList | File[]): Promise<void> {
  const errors: string[] = [];
  // shortcut: parses on the main thread; move to a Web Worker if very large files freeze the UI.
  for (const file of Array.from(files)) {
    try {
      const parsed = parseFcs(await file.arrayBuffer());
      addSample(file.name, parsed);
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof FcsError ? err.message : String(err)}`);
    }
  }
  if (errors.length) window.alert(`Some files could not be opened:\n\n${errors.join("\n")}`);
  render();
}

$<HTMLInputElement>("file-input").onchange = (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files) void openFiles(input.files).then(() => (input.value = ""));
};
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files.length) void openFiles(e.dataTransfer.files);
});

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("save-template").onclick = () =>
  download("cytopop-template.json", JSON.stringify({ populations: state.populations, scales: state.scales }, null, 2), "application/json");

$<HTMLInputElement>("load-template").onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    applyTemplate(JSON.parse(await file.text()) as Template);
    invalidate();
    render();
  } catch (err) {
    window.alert(`Could not load template: ${(err as Error).message}`);
  }
  input.value = "";
};

$("export-csv").onclick = () => {
  if (!state.samples.length) return;
  const channel = state.statChannel;
  const rows: (string | number)[][] = [];
  for (const s of state.samples) {
    let masks: Map<string, Uint8Array>;
    try {
      masks = masksFor(s);
    } catch (err) {
      rows.push([s.name, `Error: ${(err as Error).message}`]);
      continue;
    }
    const col = columns(s)[s.names.indexOf(channel)];
    const all = col ? channelStats(col) : { median: NaN, mean: NaN, cv: NaN };
    rows.push([s.name, "All events", s.file.eventCount, 100, 100, all.median, all.mean, all.cv]);
    for (const p of populationStats(state.populations, masks, s.file.eventCount)) {
      const c = col ? channelStats(col, masks.get(p.id)) : { median: NaN, mean: NaN, cv: NaN };
      rows.push([s.name, p.path, p.count, p.percentParent, p.percentTotal, c.median, c.mean, c.cv]);
    }
  }
  download(
    "cytopop-statistics.csv",
    toCsv(["Sample", "Population", "Count", "% parent", "% total", `Median ${channel}`, `Mean ${channel}`, `CV % ${channel}`], rows),
    "text/csv",
  );
};

loadLocal();
render();
