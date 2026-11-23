import { useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Stack, Typography, ToggleButtonGroup, ToggleButton } from "@mui/material";

export function ExportDialog(props: {
  open: boolean;
  sampleName: string | undefined;
  populations: { id: string; path: string; count: number }[];
  initial: string;
  compensated: boolean;
  onExport: (populationId: string, format: "csv" | "fcs") => void;
  onClose: () => void;
}) {
  const [populationId, setPopulationId] = useState<string>(props.initial && props.populations.some(p => p.id === props.initial) ? props.initial : "all");
  const [format, setFormat] = useState<"csv" | "fcs">("fcs");

  if (!props.sampleName) {
    return (
      <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Export events</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Open a sample first.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={props.onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Export events</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            select
            label="Population"
            fullWidth
            size="small"
            value={populationId}
            onChange={(e) => setPopulationId(e.target.value)}
          >
            {props.populations.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {`${p.path} (${p.count.toLocaleString()} events)`}
              </MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup exclusive size="small" value={format} onChange={(_, v: "csv" | "fcs" | null) => v && setFormat(v)}>
            <ToggleButton value="fcs">FCS 3.1</ToggleButton>
            <ToggleButton value="csv">CSV</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {`From ${props.sampleName}. ${props.compensated ? "Values are compensated." : "Values are not compensated."} ${format === "fcs" ? "The file keeps the source keywords and records the population." : "One column per channel."}`}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => { props.onExport(populationId, format); props.onClose(); }}>Export</Button>
      </DialogActions>
    </Dialog>
  );
}
