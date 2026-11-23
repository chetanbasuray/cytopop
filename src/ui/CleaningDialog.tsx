import type { CleaningReport } from "../core/qc";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";

export function CleaningDialog(props: {
  open: boolean;
  rows: { name: string; report: CleaningReport }[];
  applied: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const hasTimeParameter = props.rows.some((r) => r.report.timeParameter !== undefined);
  const disabled = props.applied || !hasTimeParameter;

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
      <DialogTitle>Unstable events</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Events recorded during flow-rate surges, signal shifts or detector saturation are flagged over time. Adding the Stable events population puts your gates under it; Flagged events keeps the rest as their own population.
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Sample</TableCell>
              <TableCell>Time parameter</TableCell>
              <TableCell align="right">Events</TableCell>
              <TableCell align="right">Flagged</TableCell>
              <TableCell align="right">Flow rate</TableCell>
              <TableCell align="right">Signal shift</TableCell>
              <TableCell align="right">Saturated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {props.rows.map((row, i) => {
              const report = row.report;
              const pct = report.total ? (100 * report.flagged / report.total).toFixed(1) : "0.0";
              const isBad = Number(pct) > 10;

              return (
                <TableRow key={i}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell sx={{ color: report.timeParameter === undefined ? "warning.main" : "inherit" }}>
                    {report.timeParameter ?? "None, nothing flagged"}
                  </TableCell>
                  <TableCell align="right">{report.total.toLocaleString()}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: isBad ? 600 : "inherit", color: isBad ? "error.main" : "inherit" }}>
                    {report.flagged.toLocaleString()} ({pct}%)
                  </TableCell>
                  <TableCell align="right">{report.rate.toLocaleString()}</TableCell>
                  <TableCell align="right">{report.signal.toLocaleString()}</TableCell>
                  <TableCell align="right">{report.saturated.toLocaleString()}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Close</Button>
        <Button variant="contained" onClick={props.onApply} disabled={disabled}>
          {props.applied ? "Already added" : "Add Stable events population"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
