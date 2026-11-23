import { Alert, Box, Snackbar } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoSample } from "../core/demo";
import { FcsError, parseFcs, type FcsFile } from "../core/fcs";
import type { Dimension, Gate, Quadrant } from "../core/gates";
import { channelStats, DEFAULT_STATS, evaluate, populationStats, STATS, toCsv, type Population, type StatKey } from "../core/populations";
import type { TransformSpec } from "../core/transforms";
import {
  columns, DEMO_NAME, defaultScale, descendants, download, paramLabel, HIST, isTemplate, newId, retarget,
  type Sample, type Template, type Tool,
} from "./model";
import { Footer } from "./Footer";
import { spilloverFor } from "../core/compensation";
import type { Spillover } from "../core/fcs";
import { CombineDialog } from "./CombineDialog";
import { MatrixDialog } from "./MatrixDialog";
import { SettingsDialog } from "./SettingsDialog";
import { compareSettings } from "../core/qc";
import { NameDialog, type Naming } from "./NameDialog";
import { PlotPanel } from "./PlotPanel";
import { Populations } from "./Populations";
import { SampleBar } from "./SampleBar";
import { StatsPanel } from "./StatsPanel";
import { TopBar } from "./TopBar";

const STORE_KEY = "cytopop.template.v1";
const STATS_KEY = "cytopop.stats.v1";

function loadStatKeys(): StatKey[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STATS_KEY) ?? "null");
    const keys = Array.isArray(raw) ? STATS.map((s) => s.key).filter((k) => raw.includes(k)) : [];
    return keys.length ? keys : DEFAULT_STATS;
  } catch {
    return DEFAULT_STATS;
  }
}

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
  const [editedSpill, setEditedSpill] = useState<Spillover | undefined>(stored?.spillover);
  const [editingMatrix, setEditingMatrix] = useState(false);
  const [checkingSettings, setCheckingSettings] = useState(false);
  const [statRaw, setStatChannels] = useState<string[]>([]);
  const [statKeys, setStatKeys] = useState<StatKey[]>(loadStatKeys);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [combining, setCombining] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const sample = samples.find((s) => s.id === active);
  const names = sample?.names ?? [];
  const x = names.includes(xRaw) ? xRaw : (names.find((n) => /^FSC-A/i.test(n)) ?? names[0] ?? "");
  const y = yRaw === HIST || names.includes(yRaw) ? yRaw : (names.find((n) => /^SSC-A/i.test(n)) ?? names[1] ?? names[0] ?? "");
  const kept = statRaw.filter((n) => names.includes(n));
  const statChannels = kept.length ? kept : [x];
  const histogram = y === HIST;

  const scaleFor = useCallback((name: string) => scales[name] ?? defaultScale(sample, name), [scales, sample]);
  const xDim: Dimension = { param: x, scale: scaleFor(x) };
  const yDim: Dimension | null = histogram ? null : { param: y, scale: scaleFor(y) };

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ populations, scales, ...(editedSpill ? { spillover: editedSpill } : {}) } satisfies Template));
    } catch {
      /* per-viewer convenience only */
    }
  }, [populations, scales, editedSpill]);

  useEffect(() => {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(statKeys));
    } catch {
      /* per-viewer convenience only */
    }
  }, [statKeys]);

  const cols = sample ? columns(sample, useComp, editedSpill) : undefined;
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
    download("cytopop-template.json", JSON.stringify({ populations, scales, ...(editedSpill ? { spillover: editedSpill } : {}) } satisfies Template, null, 2), "application/json");

  const loadTemplate = async (file: File) => {
    try {
      const t: unknown = JSON.parse(await file.text());
      if (!isTemplate(t)) throw new Error("This file is not a CytoPop gating template");
      setPopulations(t.populations);
      setScales((s) => ({ ...s, ...t.scales }));
      setEditedSpill(t.spillover);
      setParent(null);
      setToast({ severity: "info", message: `Loaded ${t.populations.length} populations from ${file.name}` });
    } catch (err) {
      setToast({ severity: "error", message: (err as Error).message });
    }
  };

  const settingRows = checkingSettings ? compareSettings(samples.map((s) => s.file)) : [];
  // Parameters behind the current axes, gates and statistics: differences there change results.
  const usedParams = new Set([x, ...(histogram ? [] : [y]), ...statChannels, ...populations.flatMap((p) =>
    p.gate.kind === "boolean" ? [] : p.gate.kind === "range" ? [p.gate.x.param] : [p.gate.x.param, p.gate.y.param])]);
  const exportSettings = () =>
    download("cytopop-settings.csv", toCsv(["Parameter", "Setting", ...samples.map((s) => s.name)],
      settingRows.map((r) => [r.parameter ?? "Sample", r.setting, ...r.values.map((v) => (v === undefined ? "" : r.setting === "Spillover matrix" ? "present" : v))])), "text/csv");

  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    const picked = STATS.filter((st) => statKeys.includes(st.key));
    for (const s of samples) {
      const data = columns(s, useComp, editedSpill);
      let masks: Map<string, Uint8Array>;
      try {
        masks = evaluate(populations, s.names, data);
      } catch (err) {
        rows.push([s.name, `Error: ${(err as Error).message}`]);
        continue;
      }
      const values = (mask?: Uint8Array) =>
        statChannels.flatMap((ch) => {
          const col = data[s.names.indexOf(ch)];
          const c = col ? channelStats(col, mask) : undefined;
          return picked.map((st) => (c ? c[st.key] : NaN));
        });
      rows.push([s.name, "All events", s.file.eventCount, 100, 100, ...values()]);
      for (const p of populationStats(populations, masks, s.file.eventCount)) {
        rows.push([s.name, p.path, p.count, p.percentParent, p.percentTotal, ...values(masks.get(p.id))]);
      }
    }
    const header = [
      "Sample", "Population", "Count", "% parent", "% total",
      ...statChannels.flatMap((ch) => picked.map((st) => `${st.label} ${ch}`)),
    ];
    download("cytopop-statistics.csv", toCsv(header, rows), "text/csv");
  };

  const status = sample && {
    sample: sample.name,
    population: parent ? (populations.find((p) => p.id === parent)?.name ?? "") : "All events",
    shown: parent ? (stats.find((s) => s.id === parent)?.count ?? 0) : sample.file.eventCount,
    total: sample.file.eventCount,
  };

  return (
    <Box
      sx={(t) => ({
        minHeight: "100dvh", display: "flex", flexDirection: "column", bgcolor: "background.default",
        // Laptop and wider: the app fills the window and each column scrolls on its own.
        [t.breakpoints.up("lg")]: { height: "100dvh" },
      })}
    >
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
        onExport={exportCsv}
        canExport={samples.length > 0}
        onSaveTemplate={saveTemplate}
        onLoadTemplate={loadTemplate}
        onCheckSettings={() => setCheckingSettings(true)}
      />
      <SampleBar
        samples={samples}
        active={active}
        onSelect={setActive}
        onOpen={() => fileInput.current?.click()}
        onLoadDemo={loadDemo}
      />
      <Box
        component="main"
        sx={(t) => ({
          flex: 1,
          display: "grid",
          gap: 2,
          p: { xs: 2, md: 3 },
          alignItems: "start",
          gridTemplateAreas: { xs: '"plot" "pops" "stats"', sm: '"pops plot" "stats stats"' },
          gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "200px minmax(0, 1fr)", md: "240px minmax(0, 1fr)" },
          // One block per breakpoint: a second up("lg") key would replace this one, not merge with it.
          [t.breakpoints.up("lg")]: {
            gridTemplateAreas: '"pops plot stats"',
            gridTemplateColumns: "240px minmax(0, 1fr) minmax(0, 1fr)",
            minHeight: 0,
            alignItems: "stretch",
            "& > *": { minHeight: 0, overflow: "auto" },
          },
        })}
      >
        <Box sx={{ gridArea: "pops", minWidth: 0 }}>
          <Populations
            populations={populations}
            stats={stats}
            totalEvents={sample?.file.eventCount}
            parent={parent}
            onSelectPopulation={setParent}
            onRemovePopulation={removePopulation}
            onCombine={() => setCombining(true)}
          />
        </Box>
        <Box sx={{ gridArea: "plot", minWidth: 0 }}>
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
            onScaleSpec={(name, spec) => setScales((s) => ({ ...s, [name]: spec }))}
            scaleDefaults={(name, kind) => retarget(defaultScale(sample, name), kind)}
            onTool={setTool}
            onCompensation={setUseComp}
            spill={sample ? spilloverFor(sample.names, sample.file.spillover, editedSpill) : undefined}
            onEditMatrix={() => setEditingMatrix(true)}
            onGate={onGate}
            onQuadrants={onQuadrants}
            onOpen={() => fileInput.current?.click()}
            onLoadDemo={loadDemo}
          />
        </Box>
        <Box sx={{ gridArea: "stats", minWidth: 0 }}>
          <StatsPanel
            sample={sample}
            cols={cols}
            masks={evaluated.masks}
            stats={stats}
            channels={statChannels}
            onChannels={setStatChannels}
            statKeys={statKeys}
            onStatKeys={setStatKeys}
          />
        </Box>
      </Box>
      <Footer status={status} />
      <NameDialog naming={naming} onCancel={() => setNaming(null)} onConfirm={confirmName} />
      <SettingsDialog
        open={checkingSettings}
        sampleNames={samples.map((s) => s.name)}
        rows={settingRows}
        used={usedParams}
        label={(n) => (sample ? paramLabel(sample, n) : n)}
        onExport={exportSettings}
        onClose={() => setCheckingSettings(false)}
      />
      <MatrixDialog
        open={editingMatrix}
        spill={sample ? spilloverFor(sample.names, sample.file.spillover, editedSpill) : undefined}
        edited={!!sample && !!editedSpill && spilloverFor(sample.names, sample.file.spillover, editedSpill) === editedSpill}
        label={(n) => (sample ? paramLabel(sample, n) : n)}
        onChange={setEditedSpill}
        onRestore={() => setEditedSpill(undefined)}
        onClose={() => setEditingMatrix(false)}
      />
      <CombineDialog
        open={combining}
        populations={populations}
        onCancel={() => setCombining(false)}
        onConfirm={(name, op, of) => {
          setPopulations((p) => [...p, { id: newId(), name, parentId: parent, gate: { kind: "boolean", op, of } }]);
          setCombining(false);
        }}
      />
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
