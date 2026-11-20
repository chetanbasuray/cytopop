import { Alert, Box, Snackbar } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoSample } from "../core/demo";
import { FcsError, parseFcs, type FcsFile } from "../core/fcs";
import type { Dimension, Gate, Quadrant } from "../core/gates";
import { channelStats, evaluate, populationStats, toCsv, type Population } from "../core/populations";
import type { TransformSpec } from "../core/transforms";
import {
  columns, DEMO_NAME, defaultScale, descendants, download, HIST, isTemplate, newId, retarget,
  type Sample, type Template, type Tool,
} from "./model";
import { NameDialog, type Naming } from "./NameDialog";
import { PlotPanel } from "./PlotPanel";
import { Sidebar } from "./Sidebar";
import { StatsPanel } from "./StatsPanel";
import { TopBar } from "./TopBar";

const STORE_KEY = "cytopop.template.v1";

function loadStored(): Template | undefined {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const t: unknown = raw ? JSON.parse(raw) : undefined;
    return isTemplate(t) ? t : undefined;
  } catch {
    return undefined; // storage blocked or corrupt: start empty
  }
}

type Toast = { message: string; severity: "error" | "info" };

export function App() {
  const stored = useMemo(loadStored, []);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [populations, setPopulations] = useState<Population[]>(stored?.populations ?? []);
  const [scales, setScales] = useState<Record<string, TransformSpec>>(stored?.scales ?? {});
  const [parent, setParent] = useState<string | null>(null);
  const [xRaw, setX] = useState("");
  const [yRaw, setY] = useState("");
  const [tool, setTool] = useState<Tool>("none");
  const [useComp, setUseComp] = useState(true);
  const [statRaw, setStatChannel] = useState("");
  const [naming, setNaming] = useState<Naming | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const sample = samples.find((s) => s.id === active);
  const names = sample?.names ?? [];
  const x = names.includes(xRaw) ? xRaw : (names.find((n) => /^FSC-A/i.test(n)) ?? names[0] ?? "");
  const y = yRaw === HIST || names.includes(yRaw) ? yRaw : (names.find((n) => /^SSC-A/i.test(n)) ?? names[1] ?? names[0] ?? "");
  const statChannel = names.includes(statRaw) ? statRaw : x;
  const histogram = y === HIST;

  const scaleFor = useCallback((name: string) => scales[name] ?? defaultScale(sample, name), [scales, sample]);
  const xDim: Dimension = { param: x, scale: scaleFor(x) };
  const yDim: Dimension | null = histogram ? null : { param: y, scale: scaleFor(y) };

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ populations, scales } satisfies Template));
    } catch {
      /* per-viewer convenience only */
    }
  }, [populations, scales]);

  const cols = sample ? columns(sample, useComp) : undefined;
  const evaluated = useMemo(() => {
    if (!sample || !cols) return { masks: undefined, error: undefined };
    try {
      return { masks: evaluate(populations, sample.names, cols), error: undefined };
    } catch (err) {
      return { masks: undefined, error: (err as Error).message };
    }
  }, [sample, cols, populations]);
  const stats = useMemo(
    () => (sample && evaluated.masks ? populationStats(populations, evaluated.masks, sample.file.eventCount) : []),
    [sample, evaluated.masks, populations],
  );

  // ---------- samples ----------
  const addSample = (name: string, file: FcsFile) => {
    const s: Sample = { id: newId("s"), name, file, names: file.parameters.map((p) => p.name) };
    setSamples((prev) => [...prev, s]);
    setActive((a) => a ?? s.id);
  };

  const loadDemo = () => {
    // The demo is deterministic, so a second click selects the loaded copy instead of adding a duplicate.
    const existing = samples.find((s) => s.name === DEMO_NAME);
    if (existing) setActive(existing.id);
    else addSample(DEMO_NAME, demoSample());
  };

  const openFiles = useCallback(async (files: FileList | File[]) => {
    const errors: string[] = [];
    // shortcut: parses on the main thread; move to a Web Worker if very large files freeze the UI.
    for (const file of Array.from(files)) {
      try {
        const parsed = parseFcs(await file.arrayBuffer());
        const s: Sample = { id: newId("s"), name: file.name, file: parsed, names: parsed.parameters.map((p) => p.name) };
        setSamples((prev) => [...prev, s]);
        setActive((a) => a ?? s.id);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof FcsError ? err.message : String(err)}`);
      }
    }
    if (errors.length) setToast({ severity: "error", message: `Could not open ${errors.join("; ")}` });
  }, []);

  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files.length) void openFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openFiles]);

  // ---------- gating ----------
  const pinScales = () => setScales((s) => ({ ...s, [x]: scaleFor(x), ...(histogram ? {} : { [y]: scaleFor(y) }) }));

  const onGate = (gate: Gate) => {
    const fallback = gate.kind === "range" ? `${x}+` : `Gate ${populations.length + 1}`;
    setNaming({ kind: "gate", gate, defaultName: fallback });
  };
  const onQuadrants = (gates: Record<Quadrant, Gate>) => setNaming({ kind: "quad", gates, defaultName: "Q" });

  const confirmName = (name: string) => {
    if (!naming) return;
    if (naming.kind === "gate") {
      setPopulations((p) => [...p, { id: newId(), name, parentId: parent, gate: naming.gate }]);
    } else {
      const label: Record<Quadrant, string> = { "++": `${x}+ ${y}+`, "-+": `${x}- ${y}+`, "--": `${x}- ${y}-`, "+-": `${x}+ ${y}-` };
      const added = (Object.keys(naming.gates) as Quadrant[]).map((k, i) => ({
        id: newId(), name: `${name}${i + 1}: ${label[k]}`, parentId: parent, gate: naming.gates[k],
      }));
      setPopulations((p) => [...p, ...added]);
    }
    pinScales();
    setNaming(null);
  };

  const removePopulation = (id: string) => {
    const doomed = descendants(populations, id);
    setPopulations((p) => p.filter((q) => !doomed.has(q.id)));
    if (parent && doomed.has(parent)) setParent(null);
  };

  const changeY = (value: string) => {
    setY(value);
    if ((value === HIST) !== (tool === "range")) setTool("none");
  };
  const changeScale = (name: string, kind: TransformSpec["kind"]) =>
    setScales((s) => ({ ...s, [name]: retarget(scaleFor(name), kind) }));

  // ---------- templates and export ----------
  const saveTemplate = () =>
    download("cytopop-template.json", JSON.stringify({ populations, scales } satisfies Template, null, 2), "application/json");

  const loadTemplate = async (file: File) => {
    try {
      const t: unknown = JSON.parse(await file.text());
      if (!isTemplate(t)) throw new Error("This file is not a CytoPop gating template");
      setPopulations(t.populations);
      setScales((s) => ({ ...s, ...t.scales }));
      setParent(null);
      setToast({ severity: "info", message: `Loaded ${t.populations.length} populations from ${file.name}` });
    } catch (err) {
      setToast({ severity: "error", message: (err as Error).message });
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    for (const s of samples) {
      const data = columns(s, useComp);
      let masks: Map<string, Uint8Array>;
      try {
        masks = evaluate(populations, s.names, data);
      } catch (err) {
        rows.push([s.name, `Error: ${(err as Error).message}`]);
        continue;
      }
      const col = data[s.names.indexOf(statChannel)];
      const none = { median: NaN, mean: NaN, cv: NaN };
      const all = col ? channelStats(col) : none;
      rows.push([s.name, "All events", s.file.eventCount, 100, 100, all.median, all.mean, all.cv]);
      for (const p of populationStats(populations, masks, s.file.eventCount)) {
        const c = col ? channelStats(col, masks.get(p.id)) : none;
        rows.push([s.name, p.path, p.count, p.percentParent, p.percentTotal, c.median, c.mean, c.cv]);
      }
    }
    const header = ["Sample", "Population", "Count", "% parent", "% total", `Median ${statChannel}`, `Mean ${statChannel}`, `CV % ${statChannel}`];
    download("cytopop-statistics.csv", toCsv(header, rows), "text/csv");
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <input
        ref={fileInput}
        type="file"
        accept=".fcs,.FCS,.lmd"
        multiple
        hidden
        onChange={(e) => {
          const input = e.currentTarget;
          if (input.files) void openFiles(input.files).then(() => (input.value = ""));
        }}
      />
      <TopBar
        onOpen={() => fileInput.current?.click()}
        onExport={exportCsv}
        canExport={samples.length > 0}
        onSaveTemplate={saveTemplate}
        onLoadTemplate={loadTemplate}
      />
      <Box
        component="main"
        sx={{
          display: "grid",
          gap: 2,
          p: { xs: 2, md: 3 },
          maxWidth: 1600,
          mx: "auto",
          gridTemplateColumns: { xs: "1fr", md: "264px minmax(0, 1fr)", xl: "264px auto minmax(0, 1fr)" },
          alignItems: "start",
        }}
      >
        <Sidebar
          samples={samples}
          active={active}
          onSelectSample={setActive}
          onLoadDemo={loadDemo}
          populations={populations}
          stats={stats}
          totalEvents={sample?.file.eventCount}
          parent={parent}
          onSelectPopulation={setParent}
          onRemovePopulation={removePopulation}
        />
        <PlotPanel
          sample={sample}
          cols={cols}
          masks={evaluated.masks}
          error={evaluated.error}
          populations={populations}
          stats={stats}
          parent={parent}
          x={x}
          y={y}
          xDim={xDim}
          yDim={yDim}
          tool={tool}
          useComp={useComp}
          onX={setX}
          onY={changeY}
          onScale={changeScale}
          onTool={setTool}
          onCompensation={setUseComp}
          onGate={onGate}
          onQuadrants={onQuadrants}
          onOpen={() => fileInput.current?.click()}
          onLoadDemo={loadDemo}
        />
        <Box sx={{ gridColumn: { md: "1 / -1", xl: "auto" }, minWidth: 0 }}>
          <StatsPanel
            sample={sample}
            cols={cols}
            masks={evaluated.masks}
            stats={stats}
            channel={statChannel}
            onChannel={setStatChannel}
          />
        </Box>
      </Box>
      <NameDialog naming={naming} onCancel={() => setNaming(null)} onConfirm={confirmName} />
      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.severity === "error" ? 8000 : 4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast?.severity ?? "info"} variant="filled" onClose={() => setToast(null)} sx={{ maxWidth: 560 }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
