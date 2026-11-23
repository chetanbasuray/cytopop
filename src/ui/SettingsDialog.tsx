import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { SettingRow } from "../core/qc";

export function SettingsDialog(props: {
  open: boolean;
  sampleNames: string[];
  rows: SettingRow[];
  used: Set<string>;
  label: (param: string) => string;
  onExport: () => void;
  onClose: () => void;
}) {
  const { open, sampleNames, rows, used, label, onExport, onClose } = props;
  const [showMatching, setShowMatching] = useState(false);

  const differsCount = rows.filter((r) => r.differs).length;
  const filteredRows = rows.filter((r) => showMatching || r.differs);
  const inUse = (r: SettingRow) => !!r.parameter && used.has(r.parameter);
  const sortedRows = [...filteredRows.filter(inUse), ...filteredRows.filter((r) => !inUse(r))];

  const hasSamples = sampleNames.length >= 2;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Settings across samples</DialogTitle>
      <DialogContent>
        {!hasSamples ? (
          <Typography variant="body2">Open at least two samples to compare their settings.</Typography>
        ) : (
          <>
            <Box sx={{ mb: 2 }}>
              {differsCount === 0 ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  All recorded settings match across the open samples.
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {differsCount} settings differ. Rows marked In use affect the current analysis.
                </Typography>
              )}
            </Box>
            <FormControlLabel
              control={<Switch checked={showMatching} onChange={(e) => setShowMatching(e.target.checked)} />}
              label="Show matching settings too"
            />
            <TableContainer sx={{ maxHeight: "60vh" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Parameter</TableCell>
                    <TableCell>Setting</TableCell>
                    {sampleNames.map((name) => (
                      <TableCell key={name}>{name}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        {row.parameter ? label(row.parameter) : "Sample"}
                        {row.parameter && used.has(row.parameter) && row.differs && (
                          <Chip label="In use" size="small" sx={{ ml: 1 }} />
                        )}
                      </TableCell>
                      <TableCell>{row.setting}</TableCell>
                      {row.values.map((val, i) => (
                        <TableCell key={i} sx={{ fontWeight: row.differs ? 600 : undefined }}>
                          {row.setting === "Spillover matrix" && val ? "present" : val ?? "–"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onExport} disabled={!hasSamples}>Export CSV</Button>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
