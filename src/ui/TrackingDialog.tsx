import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRef } from "react";
import { leveyJennings, type LjChart } from "../core/lj";
import { STATS, type StatKey } from "../core/populations";

export function TrackingDialog(props: {
  open: boolean;
  runs: { name: string; date?: Date }[];
  populations: { id: string; path: string }[];
  channels: { name: string; label: string }[];
  compute: (populationId: string, channel: string, stat: StatKey) => number[];
  onExportCsv: (header: string[], rows: (string | number)[][]) => void;
  onExportSvg: (svg: string) => void;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [populationId, setPopulationId] = React.useState(props.populations[0]?.id ?? "");
  const [channel, setChannel] = React.useState<string>(() => props.channels[0]?.name ?? "");
  const [stat, setStat] = React.useState<StatKey>("median");
  const [baseline, setBaseline] = React.useState<number>(props.runs.length);

  const runs = props.runs;
  const populations = props.populations;
  const channels = props.channels;

  if (runs.length < 2) {
    return (
      <Dialog open={props.open} onClose={props.onClose} maxWidth="lg" fullWidth>
        <DialogTitle>Track a statistic across runs</DialogTitle>
        <Box sx={{ p: 3 }}>
          <Typography variant="body2">Open at least two runs (samples) to track a statistic.</Typography>
        </Box>
        <DialogActions>
          <Button onClick={props.onClose} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  const clampedBaseline = Math.max(2, Math.min(baseline, runs.length));
  const values = props.compute(populationId, channel, stat);
  const chart: LjChart = leveyJennings(values, clampedBaseline);

  const { mean, sd, points } = chart;

  const yDomain = ((): [number, number] => {
    if (!Number.isFinite(sd) || sd === 0) {
      const finite = values.filter(Number.isFinite);
      if (finite.length === 0) return [0, 1];
      const min = Math.min(...finite);
      const max = Math.max(...finite);
      const pad = (max - min) * 0.1 || 1;
      return [min - pad, max + pad];
    }
    // Widen past ±4 SD so out-of-limit points stay inside the frame.
    const finite = values.filter(Number.isFinite);
    const lo = Math.min(mean - 4 * sd, ...finite), hi = Math.max(mean + 4 * sd, ...finite);
    const pad = (hi - lo) * 0.05;
    return [lo - (lo < mean - 4 * sd ? pad : 0), hi + (hi > mean + 4 * sd ? pad : 0)];
  })();

  const [yMin, yMax] = yDomain;
  const xStart = 60;
  const xEnd = 750;
  const yTop = 20;
  const yBottom = 280;

  const toX = (i: number) => xStart + (i / Math.max(1, runs.length - 1)) * (xEnd - xStart);
  const toY = (v: number) => yTop + ((yMax - v) / (yMax - yMin)) * (yBottom - yTop);

  const sdLines = Number.isFinite(sd) && sd > 0
    ? [
        { offset: 0, label: "Mean", color: "#555", stroke: "solid" },
        { offset: 1, label: "+1 SD", color: "#999", stroke: "dashed" },
        { offset: -1, label: "-1 SD", color: "#999", stroke: "dashed" },
        { offset: 2, label: "+2 SD", color: "#e0a000", stroke: "dashed" },
        { offset: -2, label: "-2 SD", color: "#e0a000", stroke: "dashed" },
        { offset: 3, label: "+3 SD", color: "#d32f2f", stroke: "dashed" },
        { offset: -3, label: "-3 SD", color: "#d32f2f", stroke: "dashed" },
      ]
    : [];

  const polylinePoints = points
    .map((p, i) => Number.isFinite(p.value) ? `${toX(i)},${toY(p.value)}` : null)
    .filter(Boolean);

  const warnCount = points.filter(p => p.flag === "warn").length;
  const failCount = points.filter(p => p.flag === "fail").length;

  const csvRows = runs.map((run, i) => {
    const p = points[i]!;
    return [
      run.name,
      run.date?.toISOString() ?? "",
      Number.isFinite(p.value) ? p.value : "",
      Number.isFinite(p.z) ? p.z : "",
      p.flag,
    ];
  });

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Track a statistic across runs</DialogTitle>
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap" }}>
          <TextField
            select
            label="Population"
            value={populationId}
            onChange={(e) => setPopulationId(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
          >
            {populations.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.path}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            size="small"
            sx={{ minWidth: 160 }}
          >
            {channels.map((c) => (
              <MenuItem key={c.name} value={c.name}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Statistic"
            value={stat}
            onChange={(e) => setStat(e.target.value as StatKey)}
            size="small"
          >
            {STATS.map((s) => (
              <MenuItem key={s.key} value={s.key}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="number"
            label="Baseline runs"
            value={baseline}
            onChange={(e) => setBaseline(Number(e.target.value))}
            size="small"
            sx={{ width: 130 }}
            slotProps={{ htmlInput: { min: 2, max: runs.length } }}
            helperText="Limits come from the first N runs"
          />
        </Stack>

        <svg
          ref={svgRef}
          viewBox="0 0 800 320"
          width="100%"
          xmlns="http://www.w3.org/2000/svg"
          style={{ fontFamily: "sans-serif", fontSize: 11, borderRadius: 4 }}
        >
          <rect width="800" height="320" fill="#fff" />
          {sdLines.map((line) => {
            const y = toY(mean + line.offset * sd);
            return (
              <g key={line.label}>
                <line x1={xStart} y1={y} x2={xEnd} y2={y} stroke={line.color} strokeDasharray={line.stroke === "dashed" ? "4,4" : ""} />
                <text x={56} y={y + 4} textAnchor="end" fill={line.color}>
                  {line.label}
                </text>
              </g>
            );
          })}

          {polylinePoints.length > 1 && (
            <polyline points={polylinePoints.join(" ")} stroke="#1976d2" fill="none" />
          )}

          {points.map((p, i) => {
            if (!Number.isFinite(p.value)) return null;
            const run = runs[i]!;
            const x = toX(i);
            const y = toY(p.value);
            const color = p.flag === "fail" ? "#d32f2f" : p.flag === "warn" ? "#e0a000" : "#1976d2";
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={4} fill={color} />
                <title>{`${run.name}: ${p.value.toPrecision(4)}`}</title>
                <text x={x} y={300} textAnchor="middle" fontSize={10}>
                  {run.date ? run.date.toISOString().slice(0, 10) : String(i + 1)}
                </text>
              </g>
            );
          })}

          {clampedBaseline < runs.length && (
            <line x1={toX(clampedBaseline - 1)} y1={yTop} x2={toX(clampedBaseline - 1)} y2={yBottom} stroke="#bbb" strokeDasharray="4,4" />
          )}
        </svg>

        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
          {Number.isFinite(sd) && sd > 0
            ? `Mean ${mean.toPrecision(4)}, SD ${sd.toPrecision(3)}. ${warnCount} beyond 2 SD, ${failCount} beyond 3 SD.`
            : "Not enough baseline values for limits."}
        </Typography>
      </Box>
      <DialogActions>
        <Button onClick={() => props.onExportCsv(["Run", "Date", "Value", "SD from mean", "Flag"], csvRows)}>
          Export CSV
        </Button>
        <Button onClick={() => svgRef.current && props.onExportSvg(svgRef.current.outerHTML)}>
          Download SVG
        </Button>
        <Button onClick={props.onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
