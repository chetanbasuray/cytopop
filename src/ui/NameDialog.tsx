import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useEffect, useState } from "react";
import type { Gate, Quadrant } from "../core/gates";

export type Naming =
  | { kind: "gate"; gate: Gate; defaultName: string }
  | { kind: "quad"; gates: Record<Quadrant, Gate>; defaultName: string }
  | { kind: "split"; gates: [Gate, Gate]; labels: [string, string]; defaultName: string };

export function NameDialog(props: { naming: Naming | null; onCancel: () => void; onConfirm: (name: string) => void }) {
  const { naming, onCancel, onConfirm } = props;
  const [value, setValue] = useState("");
  useEffect(() => {
    if (naming) setValue(naming.defaultName);
  }, [naming]);
  const quad = naming?.kind === "quad";
  const split = naming?.kind === "split" ? naming : undefined;
  const name = value.trim();

  return (
    <Dialog
      open={!!naming}
      onClose={onCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          component: "form",
          onSubmit: (e: React.FormEvent) => {
            e.preventDefault();
            if (name) onConfirm(name);
          },
        },
      }}
    >
      <DialogTitle>{quad ? "Name the quadrants" : split ? "Name the two populations" : "Name the population"}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={quad || split ? "Prefix" : "Name"}
          helperText={quad ? "Quadrants are named Prefix1 to Prefix4 with their marker signs" : split ? `Named “${name} ${split.labels[0]}” and “${name} ${split.labels[1]}”` : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={!name}>
          {quad ? "Add quadrants" : split ? "Add populations" : "Add population"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
