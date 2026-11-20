import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { BooleanOp, Population } from "../core/populations";

export function CombineDialog(props: {
  open: boolean;
  populations: Population[];
  onCancel: () => void;
  onConfirm: (name: string, op: BooleanOp, of: string[]) => void;
}) {
  const { open, populations, onCancel, onConfirm } = props;
  const [op, setOp] = useState<BooleanOp>("and");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [userEditedName, setUserEditedName] = useState(false);

  useEffect(() => {
    if (open) {
      setOp("and");
      setSelectedIds([]);
      setName("");
      setUserEditedName(false);
    }
  }, [open]);

  useEffect(() => {
    if (!userEditedName && selectedIds.length > 0) {
      const names = selectedIds.map((id) => populations.find((p) => p.id === id)?.name || "").filter(Boolean);
      if (op === "not" && names.length === 1) {
        setName(`NOT ${names[0]}`);
      } else if (names.length >= 2) {
        setName(names.join(op === "and" ? " AND " : " OR "));
      }
    }
  }, [op, selectedIds, populations, userEditedName]);

  const handleOperatorChange = (_event: React.MouseEvent<HTMLElement>, newOp: BooleanOp | null) => {
    if (!newOp) return;
    setOp(newOp);
    if (newOp === "not" && selectedIds.length > 1) {
      setSelectedIds(selectedIds.slice(0, 1));
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserEditedName(true);
    setName(e.target.value);
  };

  const trimmedName = name.trim();
  const isValid =
    op === "not" ? selectedIds.length === 1 : selectedIds.length >= 2;
  const isSubmitDisabled = !trimmedName || !isValid;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          component: "form",
          onSubmit: (e: React.FormEvent) => {
            e.preventDefault();
            if (!isSubmitDisabled) onConfirm(trimmedName, op, selectedIds);
          },
        },
      }}
    >
      <DialogTitle>Combine populations</DialogTitle>
      <DialogContent>
        <ToggleButtonGroup
          exclusive
          value={op}
          onChange={handleOperatorChange}
          size="small"
          aria-label="Operator"
          fullWidth
          sx={{ mb: 2 }}
        >
          <ToggleButton value="and">AND</ToggleButton>
          <ToggleButton value="or">OR</ToggleButton>
          <ToggleButton value="not">NOT</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          select
          fullWidth
          margin="dense"
          label="Populations"
          value={op === "not" ? (selectedIds[0] ?? "") : selectedIds}
          onChange={(e) => {
            const v = e.target.value as string | string[];
            setSelectedIds(Array.isArray(v) ? v : [v]);
          }}
          slotProps={{
            select: {
              multiple: op !== "not",
              renderValue: (selected) => {
                const ids = Array.isArray(selected) ? selected : [selected].filter(Boolean);
                const names = ids.map((id) => populations.find((p) => p.id === id)?.name || "").filter(Boolean);
                return names.join(", ");
              },
            },
          }}
        >
          {populations.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>

        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
          {op === "and" && "Events in every chosen population"}
          {op === "or" && "Events in any chosen population"}
          {op === "not" && "Events outside the chosen population"}
        </Typography>

        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Name"
          value={name}
          onChange={handleNameChange}
          onFocus={(e) => e.target.select()}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={isSubmitDisabled}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
