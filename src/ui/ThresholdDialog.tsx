import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import type { Threshold } from "../core/gates";
import type { Population } from "../core/populations";

/** "≥ 99th pct of Unstained.fcs" for each threshold a gate carries. */
export function thresholdText(gate: Population["gate"]): string {
  const t = (x: Threshold) => `${x.percentile}th pct of ${x.sample}`;
  if (gate.kind === "range") return gate.threshold ? `From ${t(gate.threshold)}` : "";
  if (gate.kind !== "rectangle") return "";
  if (gate.xThreshold && JSON.stringify(gate.xThreshold) === JSON.stringify(gate.yThreshold)) return `At ${t(gate.xThreshold)}`;
  const parts = [gate.xThreshold && `${gate.x.param} at ${t(gate.xThreshold)}`, gate.yThreshold && `${gate.y.param} at ${t(gate.yThreshold)}`];
  return parts.filter(Boolean).join(", ");
}

export function ThresholdDialog(props: {
  open: boolean;
  population: Population | undefined;
  samples: string[];
  initialSample: string | undefined;
  populations: { id: string; path: string }[]; // candidate control populations
  onApply: (t: Threshold | undefined, axes: ("x" | "y")[]) => void;
  onClose: () => void;
}) {
  const gate = props.population?.gate;
  const existing = gate?.kind === "range" ? gate.threshold : gate?.kind === "rectangle" ? (gate.xThreshold ?? gate.yThreshold) : undefined;
  const [sample, setSample] = useState(existing?.sample ?? props.initialSample ?? props.samples[0] ?? "");
  const [population, setPopulation] = useState(existing?.population ?? "all");
  const [percentile, setPercentile] = useState(String(existing?.percentile ?? 99));
  const [axes, setAxes] = useState<"x" | "y" | "both">("both");
  if (!gate || (gate.kind !== "range" && gate.kind !== "rectangle")) return null;

  const p = Number(percentile);
  const valid = !!sample && Number.isFinite(p) && p >= 0 && p <= 100;
  const axisList: ("x" | "y")[] = gate.kind === "range" || axes === "both" ? ["x", "y"] : [axes];
  const pop = props.populations.some((q) => q.id === population) ? population : "all";

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Threshold from a control</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          {gate.kind === "range"
            ? `The lower edge of ${props.population!.name} sits at a percentile of the control.`
            : "The quadrant split sits at a percentile of the control; all four quadrants move together."}
        </Typography>
        <Stack sx={{ gap: 2 }}>
          <TextField select size="small" label="Control sample" value={sample} onChange={(e) => setSample(e.target.value)}>
            {props.samples.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Control population" value={pop} onChange={(e) => setPopulation(e.target.value)}>
            {props.populations.map((q) => <MenuItem key={q.id} value={q.id}>{q.path}</MenuItem>)}
          </TextField>
          <TextField
            size="small"
            label="Percentile"
            type="number"
            value={percentile}
            onChange={(e) => setPercentile(e.target.value)}
            error={!valid && percentile !== ""}
            helperText="99 is common for unstained or FMO controls"
            slotProps={{ htmlInput: { min: 0, max: 100, step: 0.1 } }}
          />
          {gate.kind === "rectangle" && (
            <TextField select size="small" label="Axes" value={axes} onChange={(e) => setAxes(e.target.value as "x" | "y" | "both")}>
              <MenuItem value="both">Both ({gate.x.param} and {gate.y.param})</MenuItem>
              <MenuItem value="x">{gate.x.param} only</MenuItem>
              <MenuItem value="y">{gate.y.param} only</MenuItem>
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {existing && <Button onClick={() => props.onApply(undefined, axisList)} sx={{ mr: "auto" }}>Remove threshold</Button>}
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid} onClick={() => props.onApply({ sample, population: pop, percentile: p }, axisList)}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
