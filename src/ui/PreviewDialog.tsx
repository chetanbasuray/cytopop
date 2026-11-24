import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { CountChange } from "../core/populations";

export interface Preview { title: string; summary: string; rows: CountChange[]; errors: string[] }
/** Shows what a bulk gating change will do to the open samples and lets the user confirm or cancel. */
export function PreviewDialog(props: { preview: Preview | null; onConfirm: () => void; onCancel: () => void }) {
  const p = props.preview;
  if (!p) return null;
  return (
    <Dialog open onClose={props.onCancel} maxWidth="md" fullWidth>
      <DialogTitle>{p.title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>{p.summary}</Typography>
        {p.errors.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <List dense disablePadding>
              {p.errors.map((e, i) => (
                <ListItem key={i} disableGutters>
                  <ListItemText primary={e} slotProps={{ primary: { variant: "body2" } }} />
                </ListItem>
              ))}
            </List>
          </Alert>
        )}
        {p.rows.length === 0 ? (
          <Typography variant="body2">No counts change in the open samples.</Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Sample</TableCell>
                  <TableCell>Population</TableCell>
                  <TableCell align="right">Before</TableCell>
                  <TableCell align="right">After</TableCell>
                  <TableCell align="right">Change</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {p.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.sample}</TableCell>
                    <TableCell>{r.path}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.before !== undefined ? r.before.toLocaleString() : "\u2014"}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.after !== undefined ? r.after.toLocaleString() : "\u2014"}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {r.before === undefined ? "New" : r.after === undefined ? "Removed" : (r.after - r.before) >= 0 ? `+${(r.after - r.before).toLocaleString()}` : `\u2212${Math.abs(r.after - r.before).toLocaleString()}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button variant="contained" onClick={props.onConfirm}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
