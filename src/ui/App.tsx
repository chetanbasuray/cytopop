import { Alert, Box, Snackbar } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoSample } from "../core/demo";
import { FcsError, parseFcs, type FcsFile } from "../core/fcs";
import { percentileOf, splitEdge, withThresholds, type Dimension, type Gate, type Quadrant, type Threshold } from "../core/gates";
import { linkSibling } from "../core/gate-edit";
import { fromSpec } from "../core/transforms";
import { readWsp } from "../core/wsp";
import { writeWsp } from "../core/wsp-write";
import { channelStats, count as eventsIn, DEFAULT_STATS, EMPTY_STATS, compareCounts, evaluate, pathOf, populationStats, splitKeys, STATS, statValues, toCsv, volumeMicrolitres, withOverrides, type ChannelStatKey, type Population, type StatKey } from "../core/populations";
import type { TransformSpec } from "../core/transforms";
import {
  columns, DEMO_NAME, defaultScale, descendants, download, paramLabel, HIST, isTemplate, newId, retarget,
  type Annotations, type Sample, type Template, type TemplateRule, type Tool,
  rangeScale, withDerived,
} from "./model";
import { Footer } from "./Footer";
import { spilloverFor, spilloverFromControls, type ControlEvents } from "../core/compensation";
import type { Spillover } from "../core/fcs";
import { CombineDialog } from "./CombineDialog";
import { ConcatenateDialog } from "./ConcatenateDialog";
import { RulesDialog } from "./RulesDialog";
import { matchRules } from "../core/rules";
import { concatenate } from "../core/concatenate";
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
import { ThresholdDialog } from "./ThresholdDialog";
import { ReportDialog } from "./ReportDialog";
import { PreviewDialog, type Preview } from "./PreviewDialog";
import { SampleTableDialog } from "./SampleTableDialog";
import { GroupsDialog } from "./GroupsDialog";
import { MetadataDialog } from "./MetadataDialog";
import { GridDialog } from "./GridDialog";
import { ControlsDialog, type ControlPick } from "./ControlsDialog";
import type { DerivedParameter } from "../core/formula";
import { StatsPanel } from "./StatsPanel";
import { TopBar } from "./TopBar";

const STORE_KEY = "cytopop.template.v1";
const STATS_KEY = "cytopop.stats.v1";
const RULES_KEY = "cytopop.rules.v1";

const validStatKeys = (raw: unknown): StatKey[] => (Array.isArray(raw) ? STATS.map((s) => s.key).filter((k) => raw.includes(k)) : []);

function loadRules(): TemplateRule[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RULES_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((r): r is TemplateRule => typeof r?.id === "string" && typeof r?.pattern === "string" && isTemplate(r?.template) && Array.isArray(r?.statKeys)) : [];
  } catch {
    return [];
  }
}

function loadStatKeys(): StatKey[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STATS_KEY) ?? "null");
    const keys = validStatKeys(raw);
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

/** Everything a template or workspace load replaces, so the load can be previewed and undone in one step. */
interface Gating {
  populations: Population[];
  scales: Record<string, TransformSpec>;
  spillover: Spillover | undefined;
  derived: DerivedParameter[];
  useComp: boolean;
  groups: Record<string, string>;
  keywordCols: string[];
  annotations: Annotations;
  overrides: Record<string, Record<string, Gate>>;
}

export function App() {
  const stored = useMemo(loadStored, []);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const history = useHistory<Population[]>(stored?.populations ?? []);
  const rawPopulations = history.value, setPopulations = history.set;
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
  const [groups, setGroups] = useState<Record<string, string>>(stored?.groups ?? {});
  const [groupFilter, setGroupFilter] = useState("all");
  const [editingGroups, setEditingGroups] = useState(false);
  const [keywordCols, setKeywordCols] = useState<string[]>(stored?.keywordColumns ?? []);
  const [annotations, setAnnotations] = useState<Annotations>(stored?.annotations ?? { columns: [], values: {} });
  const [editingMeta, setEditingMeta] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Record<string, Gate>>>(stored?.overrides ?? {});
  const [adjustOne, setAdjustOne] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [combining, setCombining] = useState(false);
  const [concatenating, setConcatenating] = useState(false);
  const [rules, setRules] = useState<TemplateRule[]>(loadRules);
  const [editingRules, setEditingRules] = useState(false);
  const [justOpened, setJustOpened] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [importReport, setImportReport] = useState<{ title: string; summary: string; lines: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [sampleTableData, setSampleTableData] = useState<{ header: string[]; rows: (string | number)[][] } | null>(null);
  const [pending, setPending] = useState<{ preview: Preview; next: Gating; done: () => void } | null>(null);
  // The last bulk load, so undo and redo restore everything it replaced, not only the gates.
  const bulk = useRef<{ before: Gating; after: Gating } | null>(null);

  for (const s of samples) withDerived(s, derived);
  const groupNames = new Set(Object.values(groups));
  const filter = groupNames.has(groupFilter) ? groupFilter : "all";
  const shownSamples = filter === "all" ? samples : samples.filter((s) => groups[s.name] === filter);
  const groupCol = (s: Sample) => [
    ...(groupNames.size ? [groups[s.name] ?? ""] : []),
    ...keywordCols.map((k) => s.file.keywords[k] ?? ""),
    ...annotations.columns.map((c) => annotations.values[s.name]?.[c] ?? ""),
  ];
  const metaHeader = [...(groupNames.size ? ["Group"] : []), ...keywordCols, ...annotations.columns];
  const details = (s: Sample) => groupCol(s).slice(groupNames.size ? 1 : 0).filter(Boolean).join(" · ");
  // Threshold gates sit at a percentile of a control sample, so they move when the control or its gating changes.
  const populations = useMemo(() => {
    if (!rawPopulations.some((p) => p.gate.kind === "range" ? p.gate.threshold : p.gate.kind === "rectangle" && (p.gate.xThreshold || p.gate.yThreshold))) return rawPopulations;
    const masks = new Map<string, Map<string, Uint8Array> | null>();
    const resolve = (t: Threshold, dim: Dimension) => {
      const s = samples.find((q) => q.name === t.sample);
      if (!s) return undefined;
      const data = columns(s, useComp, editedSpill, derived);
      const col = data[s.names.indexOf(dim.param)];
      if (!col) return undefined;
      if (!masks.has(s.id)) {
        try {
          masks.set(s.id, evaluate(rawPopulations, s.names, data, s.file.parameters.map((q) => q.range)));
        } catch {
          masks.set(s.id, null);
        }
      }
      const mask = t.population === "all" ? undefined : masks.get(s.id)?.get(t.population);
      if (t.population !== "all" && !mask) return undefined;
      return fromSpec(dim.scale).forward(percentileOf(col, mask, t.percentile));
    };
    return rawPopulations.map((p) => {
      if (p.gate.kind !== "range" && p.gate.kind !== "rectangle") return p;
      const gate = withThresholds(p.gate, resolve);
      return gate === p.gate ? p : { ...p, gate };
    });
  }, [rawPopulations, samples, useComp, editedSpill, derived]);
  const [thresholding, setThresholding] = useState<string | null>(null);
  const sample = samples.find((s) => s.id === active);
  const popsFor = (s: Sample) => withOverrides(populations, overrides[s.name]);
  const samplePops = sample ? popsFor(sample) : populations;
  const adjusted = sample ? populations.filter((p) => overrides[sample.name]?.[p.id]).map((p) => p.id) : [];
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
      if (e.key.toLowerCase() === "y" || e.shiftKey) redoAll();
      else undoAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      localStorage.setItem(STORE_KEY, JSON.stringify({ populations, scales, ...(editedSpill ? { spillover: editedSpill } : {}), ...(derived.length ? { derived } : {}), ...(Object.keys(groups).length ? { groups } : {}), ...(keywordCols.length ? { keywordColumns: keywordCols } : {}), ...(annotations.columns.length ? { annotations } : {}), ...(Object.keys(overrides).length ? { overrides } : {}) } satisfies Template));
    } catch {
      /* per-viewer convenience only */
    }
  }, [populations, scales, editedSpill, derived, groups, keywordCols, annotations, overrides]);

  useEffect(() => {
    try {
      localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    } catch {
      /* per-viewer convenience only */
    }
  }, [rules]);

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
      return { masks: evaluate(samplePops, sample.names, cols, sample.file.parameters.map((q) => q.range)), error: undefined };
    } catch (err) {
      return { masks: undefined, error: (err as Error).message };
    }
  }, [sample, cols, samplePops]);
  const stats = useMemo(
    () => (sample && evaluated.masks ? populationStats(samplePops, evaluated.masks, sample.file.eventCount) : []),
    [sample, evaluated.masks, samplePops],
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
    const opened: string[] = [];
    // shortcut: parses on the main thread; move to a Web Worker if very large files freeze the UI.
    for (const file of Array.from(files)) {
      try {
        const bytes = await file.arrayBuffer();
        addSample(file.name, parseFcs(bytes), bytes);
        opened.push(file.name);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof FcsError ? err.message : String(err)}`);
      }
    }
    if (errors.length) setToast({ severity: "error", message: `Could not open ${errors.join("; ")}` });
    if (opened.length) setJustOpened(opened);
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
  const onDivider = (gates: [Gate, Gate], labels: [string, string]) => setNaming({ kind: "split", gates, labels, defaultName: histogram ? x : "Split" });

  const confirmName = (name: string) => {
    if (!naming) return;
    if (naming.kind === "gate") {
      setPopulations((p) => [...p, { id: newId(), name, parentId: parent, gate: naming.gate }]);
    } else if (naming.kind === "split") {
      const [a, b] = naming.gates;
      setPopulations((p) => [...p, { id: newId(), name: `${name} ${naming.labels[0]}`, parentId: parent, gate: a }, { id: newId(), name: `${name} ${naming.labels[1]}`, parentId: parent, gate: b }]);
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

  /** Medians come from the controls' uncompensated events; clean-up gates are evaluated as the user sees them. */
  const calculateSpillover = (detectors: string[], controls: ControlPick[], negative: ControlPick) => {
    const events = (pick: ControlPick): ControlEvents => {
      const s = samples.find((q) => q.id === pick.sampleId);
      if (!s) throw new Error("Choose a sample for every control");
      const base = columns(s, false);
      if (pick.populationId === "all") return { names: s.names, data: base };
      const shown = columns(s, useComp, editedSpill, derived);
      const mask = evaluate(popsFor(s), s.names, shown, s.file.parameters.map((q) => q.range)).get(pick.populationId);
      return { names: s.names, data: base, mask };
    };
    return spilloverFromControls(detectors, controls.map(events), events(negative));
  };

  /** Sets or clears (t undefined) a population's threshold; for quadrants, every quadrant sharing that split moves together. */
  const setThreshold = (id: string, t: Threshold | undefined, axes: ("x" | "y")[]) => {
    setPopulations((all) => {
      const target = all.find((p) => p.id === id);
      if (!target) return all;
      const tg = target.gate;
      if (tg.kind === "range") return all.map((p) => (p.id === id && p.gate.kind === "range" ? { ...p, gate: { ...p.gate, threshold: t } } : p));
      if (tg.kind !== "rectangle") return all;
      const split = (g: Extract<Gate, { kind: "rectangle" }>, axis: "x" | "y") => {
        const e = axis === "x" ? splitEdge(g.xMin, g.xMax) : splitEdge(g.yMin, g.yMax);
        return e && g[`${axis}${e === "min" ? "Min" : "Max"}`];
      };
      return all.map((p) => {
        const g = p.gate;
        if (g.kind !== "rectangle" || p.parentId !== target.parentId || g.x.param !== tg.x.param || g.y.param !== tg.y.param) return p;
        let next = g;
        for (const axis of axes) if (split(g, axis) !== undefined && split(g, axis) === split(tg, axis)) next = { ...next, [`${axis}Threshold`]: t };
        return next === g ? p : { ...p, gate: next };
      });
    });
  };

  /** Saves only the shared gating (no samples, groups, metadata or per-sample adjustments), to reuse on other experiments. */
  const saveGating = () =>
    download("cytopop-gating.json", JSON.stringify({ populations, scales, ...(editedSpill ? { spillover: editedSpill } : {}), ...(derived.length ? { derived } : {}) } satisfies Template, null, 2), "application/json");

  /** Replaces a population's gate. Quadrants, dividers and hinged quadrants that shared the moved edge or point move with it. */
  const editGate = (id: string, gate: Gate) => {
    if (adjustOne && sample) return adjustGate(sample, id, gate);
    setPopulations((all) => {
      const target = populations.find((p) => p.id === id);
      const before = target?.gate;
      if (!target || !before || before.kind === "boolean" || before.kind === "clean") return all;
      return all.map((p) => {
        if (p.id === id) return { ...p, gate };
        if (p.parentId !== target.parentId || p.gate.kind === "boolean" || p.gate.kind === "clean") return p;
        const linked = linkSibling(before, gate, p.gate);
        return linked === p.gate ? p : { ...p, gate: linked };
      });
    });
  };

  /** Stores a gate for one sample only; linked quadrants and dividers are adjusted for that sample too. */
  const adjustGate = (s: Sample, id: string, gate: Gate) => {
    const pops = popsFor(s);
    const target = pops.find((p) => p.id === id);
    const before = target?.gate;
    if (!target || !before || before.kind === "boolean" || before.kind === "clean") return;
    const mine: Record<string, Gate> = { ...overrides[s.name], [id]: gate };
    for (const p of pops) {
      if (p.id === id || p.parentId !== target.parentId || p.gate.kind === "boolean" || p.gate.kind === "clean") continue;
      const linked = linkSibling(before, gate, p.gate);
      if (JSON.stringify(linked) !== JSON.stringify(p.gate)) mine[p.id] = linked;
    }
    setOverrides((o) => ({ ...o, [s.name]: mine }));
  };

  const resetAdjustment = (name: string, id: string) =>
    setOverrides((o) => {
      const mine = Object.fromEntries(Object.entries(o[name] ?? {}).filter(([k]) => k !== id));
      const others = Object.fromEntries(Object.entries(o).filter(([k]) => k !== name));
      return Object.keys(mine).length ? { ...others, [name]: mine } : others;
    });

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
      populations, scales, ...(editedSpill ? { spillover: editedSpill } : {}), ...(derived.length ? { derived } : {}), ...(Object.keys(groups).length ? { groups } : {}), ...(keywordCols.length ? { keywordColumns: keywordCols } : {}), ...(annotations.columns.length ? { annotations } : {}), ...(Object.keys(overrides).length ? { overrides } : {}), samples: samples.map((s) => s.name),
    } satisfies Template, null, 2), "application/json");

  const saveWsp = () => {
    try {
      const skipped: string[] = [];
      const input = samples.filter((s) => s.name !== DEMO_NAME).flatMap((s) => {
        let masks: Map<string, Uint8Array>;
        try {
          masks = evaluate(populations, s.names, columns(s, useComp, editedSpill, derived), s.file.parameters.map((q) => q.range));
        } catch (err) {
          // A sample the gates do not fit (another panel) is left out rather than failing the whole export.
          skipped.push(`${s.name}: not saved; ${(err as Error).message}`);
          return [];
        }
        return [{
          name: s.name,
          file: s.file,
          spillover: spilloverFor(s.file.parameters.map((q) => q.name), s.file.spillover, editedSpill),
          counts: new Map([...masks].map(([id, m]) => [id, eventsIn(m)])),
        }];
      });
      if (!input.length) throw new Error(skipped.length ? "None of the open files fit these gates" : "Open at least one FCS file to save a .wsp workspace");
      const { xml, warnings } = writeWsp({ populations, scales: Object.fromEntries(input.flatMap((s) => s.file.parameters).map((q) => [q.name, scaleFor(q.name)])), compensated: useComp, samples: input });
      download("cytopop-workspace.wsp", xml, "application/xml");
      const lines = [...skipped, ...warnings, ...(Object.keys(overrides).length ? ["Gates adjusted for single samples were saved as the shared gates; save a CytoPop workspace to keep them."] : [])];
      if (lines.length) setImportReport({ title: "Workspace saved with changes", summary: `Saved ${populations.length} populations for ${input.length} samples. Not everything could be saved exactly:`, lines });
    } catch (err) {
      setToast({ severity: "error", message: (err as Error).message });
    }
  };

  const current = (): Gating => ({ populations: rawPopulations, scales, spillover: editedSpill, derived, useComp, groups, keywordCols, annotations, overrides });
  const restore = (g: Gating) => {
    setScales(g.scales);
    setEditedSpill(g.spillover);
    setDerived(g.derived);
    setUseComp(g.useComp);
    setGroups(g.groups);
    setKeywordCols(g.keywordCols);
    setAnnotations(g.annotations);
    setOverrides(g.overrides);
    setParent(null);
  };
  const undoAll = () => {
    if (history.canUndo && bulk.current && rawPopulations === bulk.current.after.populations) restore(bulk.current.before);
    history.undo();
  };
  const redoAll = () => {
    if (bulk.current && history.next === bulk.current.after.populations) restore(bulk.current.after);
    history.redo();
  };
  const applyBulk = (next: Gating, done: () => void) => {
    bulk.current = { before: current(), after: next };
    setPopulations(next.populations);
    restore(next);
    done();
  };

  /** Counts per open sample before and after a load; with nothing to lose (no gates yet) the load applies straight away. */
  const proposeBulk = (title: string, next: Gating, done: () => void) => {
    if (!rawPopulations.length) return applyBulk(next, done);
    const now = current();
    const counts = (g: Gating, s: Sample) => {
      const pops = withOverrides(g.populations, g.overrides[s.name]);
      const copy = withDerived({ ...s }, g.derived); // a copy, so the open sample keeps its own derived columns
      const masks = evaluate(pops, copy.names, columns(copy, g.useComp, g.spillover, g.derived), s.file.parameters.map((q) => q.range));
      return { populations: pops, counts: new Map([...masks].map(([id, m]) => [id, eventsIn(m)])) };
    };
    const errors: string[] = [];
    const rows = samples.flatMap((s) => {
      // A sample the gates do not fit (another panel) counts nothing; only the new gates' misfits are worth reporting.
      const side = (g: Gating) => {
        try {
          return counts(g, s);
        } catch (err) {
          if (g === next) errors.push(`${s.name}: the new gates do not fit; ${(err as Error).message}`);
          return { populations: [], counts: new Map<string, number>() };
        }
      };
      return compareCounts(s.name, side(now), side(next));
    });
    setPending({
      next,
      done,
      preview: {
        title,
        summary: `${next.populations.length} populations will replace the current ${rawPopulations.length}; Undo restores the current gating in one step. ` +
          (samples.length ? `Counts below are for the ${samples.length} open samples.` : "Open samples to see how their counts change."),
        rows,
        errors,
      },
    });
  };

  const loadWsp = (file: File, xml: string) => {
    const w = readWsp(xml, samples.map((s) => s.name));
    const next = { ...current(), populations: w.populations, scales: { ...scales, ...w.scales }, spillover: w.spillover, useComp: w.compensated || useComp, derived: [] };
    proposeBulk(`Load ${file.name}?`, next, () => {
      const missing = w.samples.filter((n) => !samples.some((s) => s.name === n));
      const summary = `Loaded ${w.populations.length} populations from ${file.name}, using the gates of ${w.source}.` +
        (missing.length ? ` Open these files to analyse them: ${missing.join(", ")}` : "");
      if (w.report.length) setImportReport({ title: "Workspace imported with changes", summary, lines: w.report });
      else setToast({ severity: missing.length ? "warning" : "info", message: summary });
    });
  };

  const fromTemplate = (t: Template): Gating => ({
    ...current(),
    populations: t.populations,
    scales: { ...scales, ...t.scales },
    spillover: t.spillover,
    derived: t.derived ?? [],
    ...(t.groups ? { groups: t.groups } : {}),
    ...(t.keywordColumns ? { keywordCols: t.keywordColumns } : {}),
    ...(t.annotations ? { annotations: t.annotations } : {}),
    overrides: t.overrides ?? {}, // a gating template carries only the shared gates
  });

  // Files opened together are gated with the one rule they all match, or the user is told why not.
  useEffect(() => {
    if (!justOpened.length || !rules.length) return;
    const { rule, report } = matchRules(justOpened, rules);
    if (rule) {
      applyBulk(fromTemplate(rule.template), () => {
        const keys = validStatKeys(rule.statKeys);
        if (keys.length) setStatKeys(keys);
        setToast({ severity: "info", message: `Applied the rule ${rule.pattern} to ${justOpened.length} file${justOpened.length === 1 ? "" : "s"}; Undo restores the previous gating` });
      });
    } else {
      setImportReport({ title: "No template rule applied", summary: "Nothing was applied, because the opened files do not all match one rule:", lines: report });
    }
  }, [justOpened]);

  const loadTemplate = async (file: File) => {
    try {
      if (/\.wsp$/i.test(file.name)) return loadWsp(file, await file.text());
      const t: unknown = JSON.parse(await file.text());
      if (!isTemplate(t)) throw new Error("This file is not a CytoPop workspace or gating template");
      const next = fromTemplate(t);
      // Gates refer to parameter names, so opening the listed files again relinks them.
      const missing = (t.samples ?? []).filter((n) => !samples.some((s) => s.name === n));
      proposeBulk(`Load ${file.name}?`, next, () => setToast(missing.length
        ? { severity: "warning", message: `Loaded ${t.populations.length} populations from ${file.name}. Open these files to relink them: ${missing.join(", ")}` }
        : { severity: "info", message: `Loaded ${t.populations.length} populations from ${file.name}` }));
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
        const mask = populationId !== "all" ? evaluate(popsFor(s), s.names, data, s.file.parameters.map((q) => q.range)).get(populationId) : undefined;
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
            masksOf.set(s.id, evaluate(popsFor(s), s.names, data, s.file.parameters.map((q) => q.range)));
          } catch {
            masksOf.set(s.id, undefined);
          }
        }
        mask = masksOf.get(s.id)?.get(pid);
        if (!mask) return [];
      }
      return [{ label: `${s.name} · ${pid === "all" ? "All events" : pathOf(populations, pid)}`, xs, mask }];
    });
  }, [overlayKeys, samples, populations, overrides, useComp, editedSpill, x]);

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

  /** Long statistics rows for the shown samples: Sample, metadata, Population, Count, % parent, % total, statistics. */
  const statTable = () => {
    const rows: (string | number)[][] = [];
    const split = splitKeys(statKeys);
    for (const s of shownSamples) {
      const data = columns(s, useComp, editedSpill, derived);
      let masks: Map<string, Uint8Array>;
      try {
        masks = evaluate(popsFor(s), s.names, data, s.file.parameters.map((q) => q.range));
      } catch (err) {
        rows.push([s.name, ...groupCol(s), `Error: ${(err as Error).message}`]);
        continue;
      }
      const cols = statChannels.map((ch) => data[s.names.indexOf(ch)]);
      const negMask = masks.get(negative);
      const neg = negMask ? cols.map((col) => (col ? channelStats(col, negMask) : EMPTY_STATS)) : undefined;
      const volumeUl = volumeMicrolitres(s.file.keywords);
      const values = (count: number, percentGrandparent: number, mask?: Uint8Array) =>
        statValues(statKeys, { cols, mask, count, percentGrandparent, volumeUl, negative: neg });
      rows.push([s.name, ...groupCol(s), "All events", s.file.eventCount, 100, 100, ...values(s.file.eventCount, NaN)]);
      for (const p of populationStats(popsFor(s), masks, s.file.eventCount)) {
        rows.push([s.name, ...groupCol(s), p.path, p.count, p.percentParent, p.percentTotal, ...values(p.count, p.percentGrandparent, masks.get(p.id))]);
      }
    }
    const header = [
      "Sample", ...metaHeader, "Population", "Count", "% parent", "% total",
      ...split.population.map((k) => STATS.find((st) => st.key === k)!.label),
      ...statChannels.flatMap((ch) => split.channel.map((k) => `${STATS.find((st) => st.key === k)!.label} ${ch}`)),
    ];
    return { header, rows };
  };
  const exportCsv = () => {
    const { header, rows } = statTable();
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
        onSaveWsp={saveWsp}
        onSaveGating={saveGating}
        onSampleTable={() => setSampleTableData(statTable())}
        onLoadTemplate={loadTemplate}
        onRules={() => setEditingRules(true)}
        onCheckSettings={() => setCheckingSettings(true)}
        onClean={() => setCleaning(true)}
        onTrack={() => setTracking(true)}
        onExportEvents={() => setExportingEvents(true)}
        onDerive={() => setDeriving(true)}
        onGrid={() => setGridOpen(true)}
        onControls={() => setControlsOpen(true)}
        canGrid={!!sample}
      />
      <SampleBar
        samples={samples}
        active={active}
        onSelect={setActive}
        onRemove={removeSample}
        onOpen={() => fileInput.current?.click()}
        onLoadDemo={loadDemo}
        groups={groups}
        groupFilter={filter}
        onGroupFilter={(g) => {
          setGroupFilter(g);
          // Keep the plotted sample inside the chosen group.
          const first = samples.find((s) => g === "all" || groups[s.name] === g);
          if (first && !(g === "all" || groups[samples.find((s) => s.id === active)?.name ?? ""] === g)) setActive(first.id);
        }}
        onEditGroups={() => setEditingGroups(true)}
        details={details}
        onEditMetadata={() => setEditingMeta(true)}
        onConcatenate={() => setConcatenating(true)}
      />
      {editingMeta && (
        <MetadataDialog
          samples={samples.filter((s) => s.name !== DEMO_NAME).map((s) => ({ name: s.name, keywords: s.file.keywords }))}
          keywordColumns={keywordCols}
          annotations={annotations}
          onApply={(k, a) => {
            setKeywordCols(k);
            setAnnotations(a);
            setEditingMeta(false);
          }}
          onClose={() => setEditingMeta(false)}
        />
      )}
      {editingGroups && (
        <GroupsDialog
          open
          samples={samples.filter((s) => s.name !== DEMO_NAME).map((s) => s.name)}
          groups={groups}
          onApply={(g) => {
            // Groups of files that are not open (from a loaded workspace) stay as they were.
            setGroups((cur) => ({ ...Object.fromEntries(Object.entries(cur).filter(([n]) => !samples.some((s) => s.name === n))), ...g }));
            setEditingGroups(false);
          }}
          onClose={() => setEditingGroups(false)}
        />
      )}
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
            populations={samplePops}
            stats={stats}
            totalEvents={sample?.file.eventCount}
            parent={parent}
            onSelectPopulation={setParent}
            onRemovePopulation={removePopulation}
            adjusted={adjusted}
            onResetAdjustment={(id) => sample && resetAdjustment(sample.name, id)}
            onThreshold={setThresholding}
            onCombine={() => setCombining(true)}
            onUndo={history.canUndo ? undoAll : undefined}
            onRedo={history.canRedo ? redoAll : undefined}
          />
        </Box>
        <Box sx={{ gridArea: "plot", minWidth: 0 }}>
          <PlotPanel
            sample={sample}
            cols={cols}
            masks={evaluated.masks}
            error={evaluated.error}
            populations={samplePops}
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
            onEditGate={editGate}
            adjustOne={adjustOne}
            onAdjustOne={setAdjustOne}
            onQuadrants={onQuadrants}
            onDivider={onDivider}
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
      {thresholding && (
        <ThresholdDialog
          open
          population={populations.find((p) => p.id === thresholding)}
          samples={samples.map((s) => s.name)}
          initialSample={sample?.name}
          populations={[{ id: "all", path: "All events" }, ...populations.filter((p) => p.id !== thresholding).map((p) => ({ id: p.id, path: pathOf(populations, p.id) }))]}
          onApply={(t, axes) => {
            setThreshold(thresholding, t, axes);
            setThresholding(null);
          }}
          onClose={() => setThresholding(null)}
        />
      )}
      {controlsOpen && sample && (
        <ControlsDialog
          open
          detectors={(editedSpill ?? sample.file.spillover)?.parameters.filter((p) => sample.names.includes(p)) ??
            sample.file.parameters.map((p) => p.name).filter((n) => !/^(FSC|SSC|Time)/i.test(n))}
          label={(n) => paramLabel(sample, n)}
          samples={samples.map((s) => ({ id: s.id, name: s.name }))}
          populations={populations.map((p) => ({ id: p.id, path: pathOf(populations, p.id) }))}
          calculate={calculateSpillover}
          onApply={(spill) => {
            setEditedSpill(spill);
            setUseComp(true);
            setControlsOpen(false);
            setToast({ severity: "info", message: `Applied a spillover matrix calculated from ${spill.parameters.length} controls. Adjust it with the matrix button next to Compensate` });
          }}
          onClose={() => setControlsOpen(false)}
        />
      )}
      {gridOpen && sample && cols && (
        <GridDialog
          open
          title={`${sample.name} · ${parent ? (populations.find((p) => p.id === parent)?.name ?? "") : "All events"}`}
          names={sample.names}
          label={(n) => paramLabel(sample, n)}
          cols={cols}
          mask={parent ? evaluated.masks?.get(parent) : undefined}
          scaleFor={scaleFor}
          onPick={(px, py) => {
            setX(px);
            changeY(py);
            setGridOpen(false);
          }}
          onClose={() => setGridOpen(false)}
        />
      )}
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
      <RulesDialog
        open={editingRules}
        rules={rules}
        canSave={populations.length > 0}
        onAdd={(pattern) => setRules((r) => [...r, {
          id: newId("r"), pattern, statKeys,
          template: { populations, scales, ...(editedSpill ? { spillover: editedSpill } : {}), ...(derived.length ? { derived } : {}) },
        }])}
        onRemove={(id) => setRules((r) => r.filter((x) => x.id !== id))}
        onClose={() => setEditingRules(false)}
      />
      <ConcatenateDialog
        open={concatenating}
        samples={samples}
        onCancel={() => setConcatenating(false)}
        onConfirm={(name, picked) => {
          // Written out as an FCS file so it is kept between sessions like an opened file.
          const joined = concatenate(picked.map((s) => ({ name: s.name, file: s.file })));
          const bytes = eventsFcs(joined, joined.data, pickedEvents(joined.eventCount), false, {});
          const id = newId("s");
          addSample(name, parseFcs(bytes), bytes, id);
          setActive(id);
          setConcatenating(false);
        }}
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
      <SampleTableDialog open={!!sampleTableData} long={sampleTableData} meta={metaHeader.length} onClose={() => setSampleTableData(null)} />
      <ReportDialog report={importReport} onClose={() => setImportReport(null)} />
      <PreviewDialog
        preview={pending?.preview ?? null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) applyBulk(pending.next, pending.done);
          setPending(null);
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
