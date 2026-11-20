import CropSquare from "@mui/icons-material/CropSquare";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import NearMeOutlined from "@mui/icons-material/NearMeOutlined";
import PanoramaFishEye from "@mui/icons-material/PanoramaFishEye";
import PentagonOutlined from "@mui/icons-material/PentagonOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import Straighten from "@mui/icons-material/Straighten";
import WindowOutlined from "@mui/icons-material/WindowOutlined";
import {
  Alert, Box, Button, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState } from "react";
import { quadrants, type Dimension, type Gate, type Quadrant } from "../core/gates";
import type { Population, PopulationStats } from "../core/populations";
import { fromSpec, type TransformSpec } from "../core/transforms";
import { HIST, paramLabel, sameDim, type Sample, type Tool } from "./model";
import { drawAxes, drawDensity, drawGate, drawHistogram, frame, M, type Frame } from "./plot";

const SCALES: [TransformSpec["kind"], string][] = [["linear", "Linear"], ["log", "Log"], ["logicle", "Logicle"], ["arcsinh", "Arcsinh"]];

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { tool: "none", label: "Pointer", icon: <NearMeOutlined fontSize="small" />, hint: "" },
  { tool: "rect", label: "Rectangle", icon: <CropSquare fontSize="small" />, hint: "Drag to draw a rectangle" },
  { tool: "polygon", label: "Polygon", icon: <PentagonOutlined fontSize="small" />, hint: "Click or tap to add points. Close by selecting the first point or Finish" },
  { tool: "ellipse", label: "Ellipse", icon: <PanoramaFishEye fontSize="small" />, hint: "Drag to draw an ellipse" },
  { tool: "quad", label: "Quadrants", icon: <WindowOutlined fontSize="small" />, hint: "Click or tap to place the quadrant centre" },
  { tool: "range", label: "Range", icon: <Straighten fontSize="small" />, hint: "Drag across the histogram" },
];

type Draft = { start?: [number, number]; points: [number, number][]; cursor?: [number, number] };

export function PlotPanel(props: {
  sample: Sample | undefined;
  cols: Float32Array[] | undefined;
  masks: Map<string, Uint8Array> | undefined;
  error: string | undefined;
  populations: Population[];
  stats: PopulationStats[];
  parent: string | null;
  x: string;
  y: string;
  xDim: Dimension;
  yDim: Dimension | null;
  tool: Tool;
  useComp: boolean;
  onX: (v: string) => void;
  onY: (v: string) => void;
  onScale: (param: string, kind: TransformSpec["kind"]) => void;
  onTool: (t: Tool) => void;
  onCompensation: (on: boolean) => void;
  onGate: (g: Gate) => void;
  onQuadrants: (g: Record<Quadrant, Gate>) => void;
  onOpen: () => void;
  onLoadDemo: () => void;
}) {
  const { sample, cols, masks, populations, stats, parent, xDim, yDim, tool } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(520);
  const [polygonPoints, setPolygonPoints] = useState(0); // mirrors draft.points.length for the Finish/Cancel bar
  const frameRef = useRef<Frame | null>(null);
  const draft = useRef<Draft>({ points: [] });
  const { mode, systemMode } = useColorScheme();
  const scheme = mode === "system" ? systemMode : mode;
  const histogram = yDim === null;

  const previewGate = useCallback((): Gate | null => {
    const d = draft.current;
    const c = d.cursor;
    if (!c) return null;
    if (tool === "range" && d.start) return { kind: "range", x: xDim, min: Math.min(d.start[0], c[0]), max: Math.max(d.start[0], c[0]) };
    if (!yDim) return null;
    if (tool === "rect" && d.start) {
      const [u0, v0] = d.start;
      return { kind: "rectangle", x: xDim, y: yDim, xMin: Math.min(u0, c[0]), xMax: Math.max(u0, c[0]), yMin: Math.min(v0, c[1]), yMax: Math.max(v0, c[1]) };
    }
    if (tool === "ellipse" && d.start) {
      const [u0, v0] = d.start;
      return { kind: "ellipse", x: xDim, y: yDim, cx: (u0 + c[0]) / 2, cy: (v0 + c[1]) / 2, rx: Math.abs(c[0] - u0) / 2, ry: Math.abs(c[1] - v0) / 2, angle: 0 };
    }
    if (tool === "polygon" && d.points.length) return { kind: "polygon", x: xDim, y: yDim, points: [...d.points, c] };
    return null;
  }, [tool, xDim, yDim]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sample || !cols) return;
    const f = frame(canvas, size);
    frameRef.current = f;
    const mask = parent ? masks?.get(parent) : undefined;
    const xt = fromSpec(xDim.scale);
    const xs = cols[sample.names.indexOf(xDim.param)];
    if (!xs) return;
    if (yDim) {
      const yt = fromSpec(yDim.scale);
      const ys = cols[sample.names.indexOf(yDim.param)];
      if (!ys) return;
      drawDensity(f, xs, ys, xt, yt, mask);
      drawAxes(f, xt, yt, paramLabel(sample, xDim.param), paramLabel(sample, yDim.param));
    } else {
      drawHistogram(f, xs, xt, mask);
      drawAxes(f, xt, null, paramLabel(sample, xDim.param), "Count");
    }
    for (const p of populations.filter((q) => q.parentId === parent)) {
      const g = p.gate;
      const fits = g.kind === "range" ? !yDim && sameDim(g.x, xDim) : sameDim(g.x, xDim) && sameDim(g.y, yDim);
      if (!fits) continue;
      const pct = stats.find((s) => s.id === p.id)?.percentParent;
      drawGate(f, g, `${p.name}${pct === undefined ? "" : ` ${pct.toFixed(1)}%`}`);
    }
    const preview = previewGate();
    if (preview) drawGate(f, preview, "", true);
    // xDim/yDim are rebuilt every render, so compare them by value via their JSON.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, cols, masks, parent, populations, stats, previewGate, size, JSON.stringify(xDim), JSON.stringify(yDim)]);

  // The plot is square and follows the panel width, between 320 and 680 CSS px.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Also cap by the viewport height left below the plot's top (minus footer and padding), so it fits without scrolling.
    const fit = (w: number) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (w > 0) setSize(Math.max(320, Math.min(680, Math.floor(w), Math.floor(window.innerHeight - top - 72))));
    };
    const refit = () => fit(el.clientWidth);
    refit(); // measure now; observer callbacks only arrive once the page renders a frame
    const ro = new ResizeObserver(([entry]) => fit(entry?.contentRect.width ?? 0));
    ro.observe(el);
    window.addEventListener("resize", refit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", refit);
    };
  }, [sample]);

  useEffect(() => {
    draw();
  }, [draw, scheme]);

  useEffect(() => {
    draft.current = { points: [] };
    setPolygonPoints(0);
    draw();
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        draft.current = { points: [] };
    setPolygonPoints(0);
        draw();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draw]);

  const toUnits = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const canvas = canvasRef.current!;
    const f = frameRef.current!;
    const r = canvas.getBoundingClientRect();
    const scale = size / r.width;
    return [((e.clientX - r.left) * scale - M.left) / f.w, 1 - ((e.clientY - r.top) * scale - M.top) / f.h];
  };

  const finish = () => {
    const g = previewGate();
    draft.current = { points: [] };
    setPolygonPoints(0);
    const tooSmall =
      !g ||
      (g.kind === "rectangle" && (g.xMax - g.xMin < 0.005 || g.yMax - g.yMin < 0.005)) ||
      (g.kind === "ellipse" && (g.rx < 0.003 || g.ry < 0.003)) ||
      (g.kind === "range" && g.max - g.min < 0.003) ||
      (g.kind === "polygon" && g.points.length < 4);
    draw();
    if (tooSmall || !g) return;
    if (g.kind === "polygon") g.points.pop(); // drop the trailing cursor point
    props.onGate(g);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sample || tool === "none") return;
    const p = toUnits(e);
    if (tool === "quad") {
      if (yDim) props.onQuadrants(quadrants(xDim, yDim, p[0], p[1]));
      return;
    }
    if (tool === "polygon") {
      const d = draft.current;
      const first = d.points[0];
      const f = frameRef.current!;
      // Fingers need a bigger target than a mouse to hit the first point.
      const reach = e.pointerType === "mouse" ? 8 : 24;
      if (first && d.points.length >= 3 && Math.hypot((first[0] - p[0]) * f.w, (first[1] - p[1]) * f.h) < reach) {
        d.cursor = first;
        return finish();
      }
      d.points.push(p);
      d.cursor = p;
      setPolygonPoints(d.points.length);
      draw();
      return;
    }
    draft.current = { start: p, points: [], cursor: p };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety (keeps the drag when leaving the canvas); drawing works without it */
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = draft.current;
    if (tool === "none" || (!d.start && !d.points.length)) return;
    d.cursor = toUnits(e);
    draw();
  };

  const finishPolygon = () => {
    const d = draft.current;
    if (d.points.length < 3) return;
    d.cursor = d.points[0]; // same as closing on the first point; finish() drops this trailing cursor
    finish();
  };
  const cancelDraft = () => {
    draft.current = { points: [] };
    setPolygonPoints(0);
    draw();
  };

  const onDoubleClick = () => {
    const d = draft.current;
    if (tool === "polygon" && d.points.length >= 3) {
      d.points.pop(); // the second click of the double-click added a duplicate point
      d.cursor = d.points[d.points.length - 1];
      finish();
    }
  };

  if (!sample) {
    return (
      <Paper sx={{ p: 4, minHeight: 480, display: "grid", placeItems: "center", textAlign: "center" }}>
        <Stack spacing={2} sx={{ alignItems: "center", maxWidth: 360 }}>
          <Typography variant="h2" component="p" sx={{ fontSize: 18 }}>Open a sample to start gating</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            CytoPop reads FCS 2.0, 3.0 and 3.1 files locally. Nothing is uploaded
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" startIcon={<FolderOpenOutlined />} onClick={props.onOpen}>Open FCS files</Button>
            <Button startIcon={<ScienceOutlined />} onClick={props.onLoadDemo}>Try the demo</Button>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  const names = sample.names;
  const parentName = parent ? populations.find((p) => p.id === parent)?.name : "All events";
  const hint = TOOLS.find((t) => t.tool === tool)?.hint;
  const select = (label: string, value: string, onChange: (v: string) => void, options: [string, string][], disabled = false) => (
    <TextField select size="small" label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 112 }}>
      {options.map(([v, t]) => <MenuItem key={v} value={v}>{t}</MenuItem>)}
    </TextField>
  );
  const params = names.map((n): [string, string] => [n, paramLabel(sample, n)]);

  return (
    <Paper sx={{ p: 2, minWidth: 0 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        {select("X axis", props.x, props.onX, params)}
        {select("X scale", xDim.scale.kind, (v) => props.onScale(props.x, v as TransformSpec["kind"]), SCALES)}
        {select("Y axis", props.y, props.onY, [[HIST, "Histogram"], ...params])}
        {select("Y scale", yDim?.scale.kind ?? "linear", (v) => props.onScale(props.y, v as TransformSpec["kind"]), SCALES, histogram)}
        <Tooltip title={sample.file.spillover ? "Apply the spillover matrix stored in the file" : "This file has no spillover matrix"}>
          <FormControlLabel
            sx={{ ml: 0.5 }}
            control={<Switch checked={props.useComp && !!sample.file.spillover} disabled={!sample.file.spillover} onChange={(e) => props.onCompensation(e.target.checked)} />}
            label="Compensate"
          />
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5, flexWrap: "wrap" }} useFlexGap>
        <ToggleButtonGroup size="small" exclusive value={tool} onChange={(_, v: Tool | null) => v && props.onTool(v)} aria-label="Gate tools">
          {TOOLS.map((t) => {
            const disabled = histogram ? !["none", "range"].includes(t.tool) : t.tool === "range";
            return (
              <ToggleButton key={t.tool} value={t.tool} aria-label={t.label} disabled={disabled} sx={{ px: 1.25 }}>
                <Tooltip title={t.label}><Box component="span" sx={{ display: "inline-flex" }}>{t.icon}</Box></Tooltip>
              </ToggleButton>
            );
          })}
        </ToggleButtonGroup>
        <Typography variant="caption" sx={{ color: "text.secondary", flex: "1 1 160px" }}>{hint}</Typography>
        {tool === "polygon" && polygonPoints > 0 && (
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={cancelDraft}>Cancel</Button>
            <Button size="small" variant="contained" disabled={polygonPoints < 3} onClick={finishPolygon}>
              Finish
            </Button>
          </Stack>
        )}
      </Stack>
      {props.error && <Alert severity="error" sx={{ mb: 1.5 }}>Gating error: {props.error}</Alert>}
      <Box ref={wrapRef} sx={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        aria-label={`${histogram ? "Histogram" : "Density plot"} of ${parentName}`}
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => draft.current.start && finish()}
        onDoubleClick={onDoubleClick}
        onPointerCancel={cancelDraft}
        style={{ display: "block", maxWidth: "100%", height: "auto", touchAction: tool === "none" ? "pan-x pan-y pinch-zoom" : "none", cursor: tool === "none" ? "default" : "crosshair" }}
      />
      </Box>
    </Paper>
  );
}
