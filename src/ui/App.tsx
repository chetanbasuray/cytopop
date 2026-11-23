import { Alert, Box, Snackbar } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoSample } from "../core/demo";
import { FcsError, parseFcs, type FcsFile } from "../core/fcs";
import type { Dimension, Gate, Quadrant } from "../core/gates";
import { channelStats, DEFAULT_STATS, EMPTY_STATS, evaluate, pathOf, populationStats, splitKeys, STATS, statValues, toCsv, volumeMicrolitres, type ChannelStatKey, type Population, type StatKey } from "../core/populations";
import type { TransformSpec } from "../core/transforms";
import {
  columns, DEMO_NAME, defaultScale, descendants, download, paramLabel, HIST, isTemplate, newId, retarget,
  type Sample, type Template, type Tool,
  rangeScale, withDerived,
} from "./model";
import { Footer } from "./Footer";
import { spilloverFor } from "../core/compensation";
import type { Spillover } from "../core/fcs";
import { CombineDialog } from "./CombineDialog";
import { MatrixDialog } from "./MatrixDialog";
import { SettingsDialog } from "./SettingsDialog";
import { CleaningDialog } from "./CleaningDialog";
import { TrackingDialog } from "./TrackingDialog";
import { ExportDialog } from "./ExportDialog";
import { eventsCsv, eventsFcs, pickedEvents } from "../core/export";
import { runDate } from "../core/lj";
import { cleaned, compareSettings } from "../core/qc";
import { NameDialog, type Naming } from "./NameDialog";
import { useHistory } from "./history";
import { forgetFile, keepFile, keptFiles, storageMessage } from "./storage";
import { PlotPanel } from "./PlotPanel";
import { Populations } from "./Populations";
import { SampleBar } from "./SampleBar";
import { DerivedDialog } from "./DerivedDialog";
import type { DerivedParameter } from "../core/formula";
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

type Toast = { message: string; severity: "error" | "warning" | "info" };

export function App() {
  const stored = useMemo(loadStored, []);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const history = useHistory<Population[]>(stored?.populations ?? []);
  const populations = history.value, setPopulations = history.set;
  const [scales, setScales] = useState<Record<string, TransformSpec>>(stored?.scales ?? {});
  const [parent, setParent] = useState<string | null>(null);
  const [xRaw, setX] = useState("");
  const [yRaw, setY] = useState("");
  const [tool, setTool] = useState<Tool>("none");
  const [useComp, setUseComp] = useState(true);
  const [editedSpill, setEditedSpill] = useState<Spillover | undefined>(stored?.spillover);
  const [editingMatrix, setEditingMatrix] = useState(false);
  const [checkingSettings, setCheckingSettings] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [exportingEvents, setExportingEvents] = useState(false);
  const [overlayKeys, setOverlayKeys] = useState<string[]>([]);
  const [statRaw, setStatChannels] = useState<string[]>([]);
  const [statKeys, setStatKeys] = useState<StatKey[]>(loadStatKeys);
  const [negative, setNegative] = useState("none");
  const [derived, setDerived] = useState<DerivedParameter[]>(stored?.derived ?? []);
  const [deriving, setDeriving] = useState(false);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [combining, setCombining] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  for (const s of samples) withDerived(s, derived);
  const sample = samples.find((s) => s.id === active);
  const names = sample?.names ?? [];
  const x = names.includes(xRaw) ? xRaw : (names.find((n) => /^FSC-A/i.test(n)) ?? names[0] ?? "");
  const y = yRaw === HIST || names.includes(yRaw) ? yRaw : (names.find((n) => /^SSC-A/i.test(n)) ?? names[1] ?? names[0] ?? "");
  const kept = statRaw.filter((n) => names.includes(n));
  const statChannels = kept.length ? kept : [x];
  const histogram = y === HIST;

  // Undo can remove the selected population; fall back to All events.
  useEffect(() => {
    if (parent && !populations.some((p) => p.id === parent)) setParent(null);
  }, [parent, populations]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" && e.key.toLowerCase() !== "y") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // keep text undo in fields
      e.preventDefault();
      if (e.key.toLowerCase() === "y" || e.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history.undo, history.redo]);

  const scaleFor = useCallback((name: string) => {
    const set = scales[name];
    if (set) return set;
    const i = sample && sample.file.parameters.length <= sample.names.indexOf(name) ? sample.names.indexOf(name) : -1;
    return i >= 0 ? rangeScale(columns(sample!, useComp, editedSpill, derived)[i]!) : defaultScale(sample, name);
  }, [scales, sample, useComp, editedSpill, derived]);
  const xDim: Dimension = { param: x, scale: scaleFor(x) };
  const yDim: Dimension | null = histogram ? null : { param: y, scale: scaleFor(y) };

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ populations, scales, ...(editedSpill ? { spillover: editedSpill } : {}), ...(derived.length ? { derived } : {}) } satisfies Template));
    } catch {
      /* per-viewer convenience only */
    }
  }, [populations, scales, editedSpill, derived]);

  useEffect(() => {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(statKeys));
    } catch {
      /* per-viewer convenience only */
    }
  }, [statKeys]);

  const cols = sample ? columns(sample, useComp, editedSpill, derived) : undefined;
  const evaluated = useMemo(() => {
    if (!sample || !cols) return { masks: undefined, error: undefined };
    try {
      return { masks: evaluate(populations, sample.names, cols, sample.file.parameters.map((q) => q.range)), error: undefined };
    } catch (err) {
      return { masks: undefined, error: (err as Error).message };
    }
  }, [sample, cols, populations]);
  const stats = useMemo(
    () => (sample && evaluated.masks ? populationStats(populations, evaluated.masks, sample.file.eventCount) : []),
    [sample, evaluated.masks, populations],
  );

  // ---------- samples ----------
  const addSample = (name: string, file: FcsFile, bytes?: ArrayBuffer, id = newId("s"), keep = true) => {
    const s: Sample = { id, name, file, names: file.parameters.map((p) => p.name) };
    setSamples((prev) => [...prev, s]);
    setActive((a) => a ?? s.id);
    if (keep) keepFile({ id, name, bytes }).catch((err) => setToast({ severity: "warning", message: storageMessage(name, err) }));
  };

  const removeSample = (id: string) => {
    setSamples((prev) => {
      const rest = prev.filter((s) => s.id !== id);
      setActive((a) => (a === id ? (rest[0]?.id ?? null) : a));
      return rest;
    });
    forgetFile(id).catch(() => undefined);
  };

  // Reopen the samples kept from the last session, once.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    keptFiles()
      .then((kept) => {
        for (const k of kept) {
          try {
            addSample(k.name, k.bytes ? parseFcs(k.bytes) : demoSample(), k.bytes, k.id, false);
          } catch {
            forgetFile(k.id).catch(() => undefined);
          }
        }
      })
      .catch(() => undefined); // no IndexedDB (private window): start empty
  }, []);

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
        const bytes = await file.arrayBuffer();
        addSample(file.name, parseFcs(bytes), bytes);
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
    download("cytopop-workspace.json", JSON.stringify({
      populations, scales, ...(editedSpill ? { spillover: editedSpill } : {}), ...(derived.length ? { derived } : {}), samples: samples.map((s) => s.name),
    } satisfies Template, null, 2), "application/json");

  const loadTemplate = async (file: File) => {
    try {
      const t: unknown = JSON.parse(await file.text());
      if (!isTemplate(t)) throw new Error("This file is not a CytoPop workspace or gating template");
      setPopulations(t.populations);
      setScales((s) => ({ ...s, ...t.scales }));
      setEditedSpill(t.spillover);
      setDerived(t.derived ?? []);
      setParent(null);
      // Gates refer to parameter names, so opening the listed files again relinks them.
      const missing = (t.samples ?? []).filter((n) => !samples.some((s) => s.name === n));
      setToast(missing.length
        ? { severity: "warning", message: `Loaded ${t.populations.length} populations from ${file.name}. Open these files to relink them: ${missing.join(", ")}` }
        : { severity: "info", message: `Loaded ${t.populations.length} populations from ${file.name}` });
    } catch (err) {
      setToast({ severity: "error", message: (err as Error).message });
    }
  };

  const cleaningRows = cleaning ? samples.map((s) => ({ name: s.name, report: cleaned(s.names, columns(s, useComp, editedSpill, derived), s.file.parameters.map((q) => q.range)).report })) : [];
  // Runs in acquisition order; files without $DATE keep their open order after the dated ones.
  const runs = tracking
    ? samples.map((s) => ({ s, date: runDate(s.file.keywords) }))
        .sort((a, b) => (a.date && b.date ? +a.date - +b.date : a.date ? -1 : b.date ? 1 : 0))
    : [];
  const trackValues = (populationId: string, channel: string, stat: ChannelStatKey) =>
    runs.map(({ s }) => {
      const data = columns(s, useComp, editedSpill, derived);
      const col = data[s.names.indexOf(channel)];
      if (!col) return NaN;
      try {
        const mask = populationId !== "all" ? evaluate(populations, s.names, data, s.file.parameters.map((q) => q.range)).get(populationId) : undefined;
        return channelStats(col, mask)[stat];
      } catch {
        return NaN;
      }
    });
  // Histogram overlays: other samples and populations drawn as extra lines; keys are "sampleId|populationId".
  const overlayOptions = histogram
    ? samples.flatMap((s) => [{ id: "all", path: "All events" }, ...populations.map((p) => ({ id: p.id, path: pathOf(populations, p.id) }))]
        .map((p) => ({ key: `${s.id}|${p.id}`, label: `${s.name} · ${p.path}` })))
        .filter((o) => o.key !== `${active}|${parent ?? "all"}`)
    : [];
  const overlayLayers = useMemo(() => {
    const masksOf = new Map<string, Map<string, Uint8Array> | undefined>();
    return overlayKeys.flatMap((key) => {
      const [sid, pid] = key.split("|");
      const s = samples.find((q) => q.id === sid);
      if (!s || !pid) return [];
      const data = columns(s, useComp, editedSpill, derived);
      const xs = data[s.names.indexOf(x)];
      if (!xs) return [];
      let mask: Uint8Array | undefined;
      if (pid !== "all") {
        if (!masksOf.has(s.id)) {
          try {
            masksOf.set(s.id, evaluate(populations, s.names, data, s.file.parameters.map((q) => q.range)));
          } catch {
            masksOf.set(s.id, undefined);
          }
        }
        mask = masksOf.get(s.id)?.get(pid);
        if (!mask) return [];
      }
      return [{ label: `${s.name} · ${pid === "all" ? "All events" : pathOf(populations, pid)}`, xs, mask }];
    });
  }, [overlayKeys, samples, populations, useComp, editedSpill, x]);

  const exportEvents = (populationId: string, format: "csv" | "fcs") => {
    if (!sample || !cols) return;
    const mask = populationId === "all" ? undefined : evaluated.masks?.get(populationId);
    if (populationId !== "all" && !mask) return;
    const events = pickedEvents(sample.file.eventCount, mask);
    const path = populationId === "all" ? "All events" : pathOf(populations, populationId);
    const base = `${sample.name.replace(/\.fcs$/i, "")}-${path.replace(/[^\w-]+/g, "_")}`;
    const compensated = useComp && !!spilloverFor(sample.names, sample.file.spillover, editedSpill);
    if (format === "csv") download(`${base}.csv`, eventsCsv(sample.names.map((n) => paramLabel(sample, n)), cols, events), "text/csv");
    else download(`${base}.fcs`, eventsFcs(sample.file, cols, events, compensated, {
      CYTOPOP_SOURCE: sample.name, CYTOPOP_POPULATION: path, CYTOPOP_COMPENSATED: compensated ? "yes" : "no",
    }), "application/vnd.isac.fcs");
  };
  const cleanApplied = populations.some((p) => p.gate.kind === "clean");
  const addStable = () => {
    // Existing top-level gates move under Stable events, so the flagged events drop out of the analysis.
    const stable = newId(), flagged = newId();
    setPopulations((ps) => [
      { id: stable, name: "Stable events", parentId: null, gate: { kind: "clean" } },
      { id: flagged, name: "Flagged events", parentId: null, gate: { kind: "boolean", op: "not", of: [stable] } },
      ...ps.map((p) => (p.parentId === null ? { ...p, parentId: stable } : p)),
    ]);
  };
  const settingRows = checkingSettings ? compareSettings(samples.map((s) => s.file)) : [];
  // Parameters behind the current axes, gates and statistics: differences there change results.
  const usedParams = new Set([x, ...(histogram ? [] : [y]), ...statChannels, ...populations.flatMap((p) =>
    p.gate.kind === "boolean" || p.gate.kind === "clean" ? [] : p.gate.kind === "range" ? [p.gate.x.param] : [p.gate.x.param, p.gate.y.param])]);
  const exportSettings = () =>
    download("cytopop-settings.csv", toCsv(["Parameter", "Setting", ...samples.map((s) => s.name)],
      settingRows.map((r) => [r.parameter ?? "Sample", r.setting, ...r.values.map((v) => (v === undefined ? "" : r.setting === "Spillover matrix" ? "present" : v))])), "text/csv");

  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    const split = splitKeys(statKeys);
    for (const s of samples) {
      const data = columns(s, useComp, editedSpill, derived);
      let masks: Map<string, Uint8Array>;
      try {
        masks = evaluate(populations, s.names, data, s.file.parameters.map((q) => q.range));
      } catch (err) {
        rows.push([s.name, `Error: ${(err as Error).message}`]);
        continue;
      }
      const cols = statChannels.map((ch) => data[s.names.indexOf(ch)]);
      const negMask = masks.get(negative);
      const neg = negMask ? cols.map((col) => (col ? channelStats(col, negMask) : EMPTY_STATS)) : undefined;
      const volumeUl = volumeMicrolitres(s.file.keywords);
      const values = (count: number, percentGrandparent: number, mask?: Uint8Array) =>
        statValues(statKeys, { cols, mask, count, percentGrandparent, volumeUl, negative: neg });
      rows.push([s.name, "All events", s.file.eventCount, 100, 100, ...values(s.file.eventCount, NaN)]);
      for (const p of populationStats(populations, masks, s.file.eventCount)) {
        rows.push([s.name, p.path, p.count, p.percentParent, p.percentTotal, ...values(p.count, p.percentGrandparent, masks.get(p.id))]);
      }
    }
    const header = [
      "Sample", "Population", "Count", "% parent", "% total",
      ...split.population.map((k) => STATS.find((st) => st.key === k)!.label),
      ...statChannels.flatMap((ch) => split.channel.map((k) => `${STATS.find((st) => st.key === k)!.label} ${ch}`)),
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
        onClean={() => setCleaning(true)}
        onTrack={() => setTracking(true)}
        onExportEvents={() => setExportingEvents(true)}
        onDerive={() => setDeriving(true)}
      />
      <SampleBar
        samples={samples}
        active={active}
        onSelect={setActive}
        onRemove={removeSample}
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
            onUndo={history.canUndo ? history.undo : undefined}
            onRedo={history.canRedo ? history.redo : undefined}
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
            overlayOptions={overlayOptions}
            overlayKeys={overlayKeys}
            onOverlayKeys={setOverlayKeys}
            overlayLayers={overlayLayers}
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
            negative={negative}
            onNegative={setNegative}
            volumeUl={sample && volumeMicrolitres(sample.file.keywords)}
          />
        </Box>
      </Box>
      <Footer status={status} />
      <NameDialog naming={naming} onCancel={() => setNaming(null)} onConfirm={confirmName} />
      <CleaningDialog open={cleaning} rows={cleaningRows} applied={cleanApplied} onApply={addStable} onClose={() => setCleaning(false)} />
      {deriving && (
        <DerivedDialog
          open
          derived={derived}
          names={sample?.file.parameters.map((p) => p.name) ?? []}
          onChange={setDerived}
          onClose={() => setDeriving(false)}
        />
      )}
      {exportingEvents && (
        <ExportDialog
          open
          sampleName={sample?.name}
          populations={[{ id: "all", path: "All events", count: sample?.file.eventCount ?? 0 },
            ...stats.map((p) => ({ id: p.id, path: p.path, count: p.count }))]}
          initial={parent ?? "all"}
          compensated={useComp && !!sample && !!spilloverFor(sample.names, sample.file.spillover, editedSpill)}
          onExport={exportEvents}
          onClose={() => setExportingEvents(false)}
        />
      )}
      {tracking && (
        <TrackingDialog
          open
          runs={runs.map(({ s, date }) => ({ name: s.name, date }))}
          populations={[{ id: "all", path: "All events" }, ...populations.map((p) => ({ id: p.id, path: pathOf(populations, p.id) }))]}
          channels={(sample?.names ?? []).map((n) => ({ name: n, label: paramLabel(sample!, n) }))}
          compute={trackValues}
          onExportCsv={(header, rows) => download("cytopop-tracking.csv", toCsv(header, rows), "text/csv")}
          onExportSvg={(svg) => download("cytopop-tracking.svg", svg, "image/svg+xml")}
          onClose={() => setTracking(false)}
        />
      )}
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
