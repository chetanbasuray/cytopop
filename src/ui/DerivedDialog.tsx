import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemText, Stack, TextField, Typography,
} from "@mui/material";
import { useState } from "react";
import { parseFormula, type DerivedParameter } from "../core/formula";
import { MONO } from "./theme";

export function DerivedDialog(props: {
  open: boolean;
  derived: DerivedParameter[];
  names: string[]; // the active sample's own parameters
  onChange: (d: DerivedParameter[]) => void;
  onClose: () => void;
}) {
  const { derived, names } = props;
  const [name, setName] = useState("");
  const [formula, setFormula] = useState("");
  // Formulas may use earlier derived parameters, so they are checked against both.
  const known = [...names, ...derived.map((d) => d.name)];

  let error = "";
  if (!names.length) error = "Open a sample to check formulas against its parameters";
  else if (formula.trim()) {
    try {
      parseFormula(formula, known);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const nameError = known.includes(name.trim()) ? "A parameter with this name already exists" : "";
  const canAdd = !!name.trim() && !!formula.trim() && !error && !nameError;

  const add = () => {
    props.onChange([...derived, { name: name.trim(), formula: formula.trim() }]);
    setName("");
    setFormula("");
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Derived parameters</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Compute a parameter for every event with + − × ÷, abs, sqrt, ln and log10. Put names with dashes or spaces in brackets, for
          example [FITC-A] / [PE-A]. Undefined results such as division by zero are left out of plots and statistics.
        </Typography>
        {derived.length > 0 && (
          <List dense sx={{ mb: 2 }}>
            {derived.map((d, i) => (
              <ListItem
                key={d.name}
                disableGutters
                secondaryAction={
                  <IconButton edge="end" aria-label={`Remove ${d.name}`} onClick={() => props.onChange(derived.filter((_, j) => j !== i))}>
                    <DeleteOutlined fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText primary={d.name} secondary={d.formula} slotProps={{ secondary: { sx: { fontFamily: MONO } } }} />
              </ListItem>
            ))}
          </List>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2, alignItems: "flex-start" }}>
          <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!!nameError} helperText={nameError || " "} sx={{ minWidth: 140 }} />
          <TextField
            size="small"
            label="Formula"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canAdd && add()}
            error={!!error && !!formula.trim()}
            helperText={error || " "}
            fullWidth
            slotProps={{ htmlInput: { style: { fontFamily: MONO }, spellCheck: false } }}
          />
          <Button variant="outlined" onClick={add} disabled={!canAdd} sx={{ flexShrink: 0 }}>Add</Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={props.onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
