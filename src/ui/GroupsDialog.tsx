import { Autocomplete, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";

export function GroupsDialog(props: {
  open: boolean;
  samples: string[];
  groups: Record<string, string>;
  onApply: (groups: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...props.groups }));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("");

  const distinctGroups = Array.from(new Set(Object.values(draft).filter(Boolean))).sort();

  const toggleRow = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === props.samples.length) setSelected(new Set());
    else setSelected(new Set(props.samples));
  };

  const assignToSelected = (value: string) => {
    const trimmed = value.trim();
    const next = { ...draft };
    for (const name of selected) {
      if (trimmed === "") delete next[name];
      else next[name] = trimmed;
    }
    setDraft(next);
  };

  const handleApply = () => {
    const result: Record<string, string> = {};
    for (const name of props.samples) {
      const val = draft[name]?.trim();
      if (val !== undefined && val !== "") {
        result[name] = val;
      }
    }
    props.onApply(result);
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Sample groups</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Put controls, compensation tubes and test samples into groups to filter the sample bar and the statistics export. Leave a group blank to keep a sample ungrouped.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 2 }}>
          <Autocomplete
            freeSolo
            size="small"
            options={distinctGroups}
            inputValue={bulk}
            onInputChange={(_e, v) => setBulk(v)}
            renderInput={(params) => (
              <TextField {...params} label="Group for selected samples" slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": "Group for selected samples" } }} />
            )}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            disabled={selected.size === 0}
            onClick={() => assignToSelected(bulk)}
          >
            Assign to selected
          </Button>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox"><Checkbox indeterminate={selected.size > 0 && selected.size < props.samples.length} checked={props.samples.length > 0 && selected.size === props.samples.length} onChange={toggleAll} /></TableCell>
              <TableCell>Sample</TableCell>
              <TableCell>Group</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {props.samples.map((name) => (
              <TableRow key={name}>
                <TableCell padding="checkbox"><Checkbox checked={selected.has(name)} onChange={() => toggleRow(name)} /></TableCell>
                <TableCell>{name}</TableCell>
                <TableCell>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={distinctGroups}
                    inputValue={draft[name] ?? ""}
                    onInputChange={(_e, v) => {
                      const next = { ...draft };
                      if (v === "") delete next[name];
                      else next[name] = v;
                      setDraft(next);
                    }}
                    renderInput={(params) => <TextField {...params} size="small" slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": `Group for ${name}` } }} />}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleApply}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
