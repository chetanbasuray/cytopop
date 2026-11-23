import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import type { Dimension, Gate } from "../core/gates";
import { fromSpec } from "../core/transforms";

const OPEN = 1e9; // matches the unbounded edges of quadrant gates

/** Builds a range or rectangle gate from typed values, for keyboard and precise gating. Blank bounds are open. */
export function BoundsDialog(props: {
  open: boolean;
  x: Dimension;
  y: Dimension | null;
  label: (param: string) => string;
  onGate: (g: Gate) => void;
  onClose: () => void;
}) {
  const { x, y } = props;
  const [v, setV] = useState({ xMin: "", xMax: "", yMin: "", yMax: "" });
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const bad = (s: string) => s.trim() !== "" && !Number.isFinite(Number(s));
  const pair = (lo: string, hi: string) => {
    const a = num(lo), b = num(hi);
    return a !== undefined && b !== undefined && a >= b;
  };
  const invalid = Object.values(v).some(bad) || pair(v.xMin, v.xMax) || (!!y && pair(v.yMin, v.yMax)) ||
    Object.entries(v).every(([k, s]) => (y || k.startsWith("x") ? s.trim() === "" : true));

  // Gates live in display units, so typed data values go through each axis's scale.
  const unit = (dim: Dimension, s: string, open: number) => {
    const n = num(s);
    return n === undefined ? open : fromSpec(dim.scale).forward(n);
  };
  const create = () => {
    const [xMin, xMax] = [unit(x, v.xMin, -OPEN), unit(x, v.xMax, OPEN)];
    props.onGate(y
      ? { kind: "rectangle", x, y, xMin, xMax, yMin: unit(y, v.yMin, -OPEN), yMax: unit(y, v.yMax, OPEN) }
      : { kind: "range", x, min: xMin, max: xMax });
  };
  const field = (key: keyof typeof v, label: string) => (
    <TextField
      size="small"
      label={label}
      value={v[key]}
      onChange={(e) => setV((cur) => ({ ...cur, [key]: e.target.value }))}
      error={bad(v[key])}
      slotProps={{ htmlInput: { inputMode: "decimal" } }}
      sx={{ flex: 1 }}
    />
  );

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { component: "form", onSubmit: (e: React.FormEvent) => (e.preventDefault(), !invalid && create()) } }}
    >
      <DialogTitle>Gate from values</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Type bounds in the parameters' own units. Leave a bound blank to keep that side open.
        </Typography>
        <Stack sx={{ gap: 2 }}>
          <Stack direction="row" sx={{ gap: 1 }}>
            {field("xMin", `${props.label(x.param)} from`)}
            {field("xMax", "to")}
          </Stack>
          {y && (
            <Stack direction="row" sx={{ gap: 1 }}>
              {field("yMin", `${props.label(y.param)} from`)}
              {field("yMax", "to")}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={invalid}>Create gate</Button>
      </DialogActions>
    </Dialog>
  );
}
