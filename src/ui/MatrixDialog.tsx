import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { Spillover } from "../core/fcs";
import { invert } from "../core/compensation";

export function MatrixDialog(props: {
  open: boolean;
  spill: Spillover | undefined;
  edited: boolean;
  label: (param: string) => string;
  onChange: (spill: Spillover) => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const { open, spill, edited, label, onChange, onRestore, onClose } = props;

  const [texts, setTexts] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resync, setResync] = useState(0);

  // Re-read the matrix only on open and restore; re-reading after every edit would eat half-typed input like "0.".
  useEffect(() => {
    if (open && spill) {
      setTexts(spill.matrix.map((row) => row.map(String)));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resync]);

  if (!spill) return null;

  const handleRestore = () => {
    onRestore();
    setResync((n) => n + 1);
  };

  const handleChange = (rowIndex: number, colIndex: number, value: string) => {
    setTexts((prev) => {
      const next = prev.map((r) => [...r]);
      next[rowIndex]![colIndex] = value;
      return next;
    });

    const numValue = Number(value);
    if (value.trim() === "" || !Number.isFinite(numValue)) {
      setError(null);
      return;
    }

    const newMatrix = spill.matrix.map((row, rIdx) =>
      row.map((cell, cIdx) => (rIdx === rowIndex && cIdx === colIndex ? numValue : cell))
    );

    try {
      invert(newMatrix);
      onChange({ ...spill, matrix: newMatrix });
      setError(null);
    } catch {
      setError("This matrix cannot be inverted");
    }
  };

  const detectors = spill.parameters;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Compensation matrix
        {edited && (
          <Typography variant="caption" sx={{ ml: 1, color: "text.secondary" }}>
            Edited copy
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Spillover of each row's detector into each column's detector, as a fraction. Changes apply immediately.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                {detectors.map((d) => (
                  <TableCell key={d}>{label(d)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {detectors.map((rowDet, rIdx) => (
                <TableRow key={rowDet}>
                  <TableCell component="th" scope="row">
                    {label(rowDet)}
                  </TableCell>
                  {detectors.map((colDet, cIdx) => {
                    const isDiagonal = rIdx === cIdx;
                    const text = texts[rIdx]?.[cIdx] ?? "";

                    if (isDiagonal) {
                      return <TableCell key={colDet}>{spill.matrix[rIdx]?.[cIdx]}</TableCell>;
                    }

                    return (
                      <TableCell key={colDet} sx={{ px: 0.5 }}>
                      <TextField
                        size="small"
                        type="number"
                        value={text}
                        onChange={(e) => handleChange(rIdx, cIdx, e.target.value)}
                        slotProps={{
                          htmlInput: {
                            step: 0.001,
                            "aria-label": `${label(rowDet)} into ${label(colDet)}`,
                          },
                        }}
                        sx={{ width: 88 }}
                      />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleRestore} disabled={!edited}>
          Restore file matrix
        </Button>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
