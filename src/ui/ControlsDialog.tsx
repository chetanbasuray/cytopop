import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { useState } from "react";
import type { Spillover } from "../core/fcs";
import { MONO } from "./theme";

export interface ControlPick {
  sampleId: string;
  populationId: string; // clean-up population, or "all"
}

/** Assigns single-stain controls to detectors, calculates the spillover matrix and previews it before it is applied. */
export function ControlsDialog(props: {
  open: boolean;
  detectors: string[]; // fluorescence detectors of the active sample
  label: (param: string) => string;
  samples: { id: string; name: string }[];
  populations: { id: string; path: string }[];
  calculate: (detectors: string[], controls: ControlPick[], negative: ControlPick) => Spillover; // throws with a readable message
  onApply: (spill: Spillover) => void;
  onClose: () => void;
}) {
  const { detectors, samples, populations } = props;
  // Guess controls from file names that mention a detector, such as "FITC.fcs" for FITC-A.
  const guess = (d: string) => samples.find((s) => s.name.toLowerCase().includes(d.replace(/-[AHW]$/i, "").toLowerCase()))?.id ?? "none";
  const [controls, setControls] = useState<Record<string, ControlPick>>(() =>
    Object.fromEntries(detectors.map((d) => [d, { sampleId: guess(d), populationId: "all" }])));
  const [negative, setNegative] = useState<ControlPick>(() => ({
    sampleId: samples.find((s) => /unstain|negative|blank/i.test(s.name))?.id ?? samples[0]?.id ?? "", populationId: "all",
  }));
  const [result, setResult] = useState<Spillover | null>(null);
  const [error, setError] = useState("");

  const used = detectors.filter((d) => controls[d]?.sampleId !== "none");
  const pick = (value: ControlPick, onChange: (v: ControlPick) => void, withNone: boolean) => (
    <>
      <TableCell>
        <TextField select size="small" fullWidth value={value.sampleId} onChange={(e) => (onChange({ ...value, sampleId: e.target.value }), setResult(null))} slotProps={{ htmlInput: { "aria-label": "Sample" } }}>
          {withNone && <MenuItem value="none">Not used</MenuItem>}
          {samples.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
      </TableCell>
      <TableCell>
        <TextField select size="small" fullWidth value={value.populationId} disabled={value.sampleId === "none"} onChange={(e) => (onChange({ ...value, populationId: e.target.value }), setResult(null))} slotProps={{ htmlInput: { "aria-label": "Clean-up population" } }}>
          <MenuItem value="all">All events</MenuItem>
          {populations.map((p) => <MenuItem key={p.id} value={p.id}>{p.path}</MenuItem>)}
        </TextField>
      </TableCell>
    </>
  );

  const run = () => {
    try {
      setResult(props.calculate(used, used.map((d) => controls[d]!), negative));
      setError("");
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
      <DialogTitle>Compensation from single-stain controls</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Open the controls as samples, then pick one per detector and a negative (unstained or universal negative). Clean-up populations,
          such as singlets, limit which events count. Positive events are those brighter than 99.5 % of the negative on the control's own detector.
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Detector</TableCell>
                <TableCell>Control sample</TableCell>
                <TableCell>Clean-up population</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detectors.map((d) => (
                <TableRow key={d}>
                  <TableCell>{props.label(d)}</TableCell>
                  {pick(controls[d]!, (v) => setControls((c) => ({ ...c, [d]: v })), true)}
                </TableRow>
              ))}
              <TableRow>
                <TableCell sx={{ fontWeight: 500 }}>Negative</TableCell>
                {pick(negative, setNegative, false)}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {result && (
          <Stack sx={{ mt: 2, gap: 1 }}>
            <Typography variant="body2">Spillover (%): how much each dye (row) shows up in each detector (column)</Typography>
            <TableContainer>
              <Table size="small" aria-label="Calculated spillover matrix">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    {result.parameters.map((p) => <TableCell key={p} align="right">{props.label(p)}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.matrix.map((row, i) => (
                    <TableRow key={result.parameters[i]}>
                      <TableCell>{props.label(result.parameters[i]!)}</TableCell>
                      {row.map((v, j) => (
                        <TableCell key={j} align="right" sx={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{(v * 100).toFixed(2)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button onClick={run} disabled={used.length < 2 || !negative.sampleId}>Calculate</Button>
        <Button variant="contained" disabled={!result} onClick={() => result && props.onApply(result)}>Apply matrix</Button>
      </DialogActions>
    </Dialog>
  );
}
