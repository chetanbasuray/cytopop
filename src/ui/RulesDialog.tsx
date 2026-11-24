import React, { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, List, ListItem, ListItemText, IconButton, TextField, Button, Box } from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import type { TemplateRule } from "./model";
import { MONO } from "./theme";

interface RulesDialogProps {
  open: boolean;
  rules: TemplateRule[];
  canSave: boolean;
  onAdd: (pattern: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function RulesDialog({ open, rules, canSave, onAdd, onRemove, onClose }: RulesDialogProps) {
  const [pattern, setPattern] = useState("");

  useEffect(() => {
    if (open) {
      setPattern("");
    }
  }, [open]);

  const handleAdd = () => {
    const trimmed = pattern.trim();
    if (!trimmed || !canSave) return;
    onAdd(trimmed);
    setPattern("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleAdd();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Template rules</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          When every file you open matches one rule, its gates and statistics are applied by themselves. Use * for any characters and ? for one character, for example *_CD4_*.fcs.
        </Typography>

        {rules.length > 0 ? (
          <List dense>
            {rules.map((rule) => (
              <ListItem key={rule.id} secondaryAction={
                <IconButton edge="end" aria-label={`Remove rule ${rule.pattern}`} onClick={() => onRemove(rule.id)}>
                  <DeleteOutlined />
                </IconButton>
              }>
                <ListItemText
                  primary={rule.pattern}
                  slotProps={{ primary: { sx: { fontFamily: MONO } } }}
                  secondary={`${rule.template.populations.length} populations, ${rule.statKeys.length} statistics`}
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary">No rules yet.</Typography>
        )}

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="File name pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button onClick={handleAdd} sx={{ flex: "none", whiteSpace: "nowrap" }} disabled={!canSave || !pattern.trim()}>
            Save current gating as rule
          </Button>
        </Box>

        {!canSave && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Draw some gates first; the rule saves the current gating.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
