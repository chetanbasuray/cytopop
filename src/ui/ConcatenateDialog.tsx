import * as React from "react";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, TextField, Typography } from "@mui/material";
import type { Sample } from "./model";
import { concatenate } from "../core/concatenate";

interface Props {
  open: boolean;
  samples: Sample[];
  onCancel: () => void;
  onConfirm: (name: string, picked: Sample[]) => void;
}

export function ConcatenateDialog({ open, samples, onCancel, onConfirm }: Props) {
  const [name, setName] = React.useState("Concatenated");
  const [pickedIds, setPickedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (open) {
      setName("Concatenated");
      setPickedIds(new Set());
    }
  }, [open]);

  const picked = React.useMemo(() => samples.filter((s) => pickedIds.has(s.id)), [samples, pickedIds]);

  const result = React.useMemo(() => {
    if (picked.length < 2) return null;
    try {
      concatenate(picked.map((s) => ({ name: s.name, file: s.file })));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Unknown error";
    }
  }, [picked]);

  const canConfirm = picked.length >= 2 && !result && name.trim().length > 0;

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Concatenate samples</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Joins the events of the chosen samples into one new sample. A Source channel records which sample each event came from (1 for the first in this list).
        </Typography>
        <FormGroup>
          {samples.map((s) => (
            <FormControlLabel
              key={s.id}
              control={
                <Checkbox
                  checked={pickedIds.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(pickedIds);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setPickedIds(next);
                  }}
                />
              }
              label={s.name}
            />
          ))}
        </FormGroup>
        {result && <Alert severity="error" sx={{ mt: 2 }}>{result}</Alert>}
        <TextField
          fullWidth
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={!canConfirm} onClick={() => onConfirm(name.trim(), picked)}>
          Concatenate
        </Button>
      </DialogActions>
    </Dialog>
  );
}
