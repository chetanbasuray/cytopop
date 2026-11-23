import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Typography } from "@mui/material";

/** Lists what an import could not convert, so nothing is dropped silently. */
export function ReportDialog(props: { report: { title: string; summary: string; lines: string[] } | null; onClose: () => void }) {
  const r = props.report;
  return (
    <Dialog open={!!r} onClose={props.onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{r?.title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>{r?.summary}</Typography>
        <List dense disablePadding>
          {r?.lines.map((line) => (
            <ListItem key={line} disableGutters>
              <ListItemText primary={line} slotProps={{ primary: { variant: "body2" } }} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={props.onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
