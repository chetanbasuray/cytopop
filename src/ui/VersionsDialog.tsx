import React, { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, List, ListItem, ListItemText, IconButton, TextField, Button, Box } from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import type { GatingVersion } from "./model";

interface VersionsDialogProps {
  open: boolean;
  versions: GatingVersion[];
  canSave: boolean;
  onSave: (name: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function VersionsDialog({ open, versions, canSave, onSave, onRestore, onRemove, onClose }: VersionsDialogProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
    }
  }, [open]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || !canSave) return;
    onSave(trimmed);
    setName("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    }
  };

  const sortedVersions = [...versions].sort((a, b) => new Date(b.saved).getTime() - new Date(a.saved).getTime());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Gating versions</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Save the current gating under a name to try another strategy and come back to it. Restoring shows the effect on counts first, and Undo switches back.
        </Typography>

        {sortedVersions.length > 0 ? (
          <List dense>
            {sortedVersions.map((version) => (
              <ListItem key={version.id} disableGutters>
                <ListItemText
                  primary={version.name}
                  secondary={`${version.template.populations.length} populations, saved ${new Date(version.saved).toLocaleString()}`}
                />
                <Box sx={{ display: "flex", gap: 0.5, flex: "none" }}>
                  <Button size="small" onClick={() => onRestore(version.id)}>Restore</Button>
                  <IconButton edge="end" aria-label={`Delete version ${version.name}`} onClick={() => onRemove(version.id)}>
                    <DeleteOutlined />
                  </IconButton>
                </Box>
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary">No saved versions yet.</Typography>
        )}

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Version name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button onClick={handleSave} sx={{ flex: "none", whiteSpace: "nowrap" }} disabled={!canSave || !name.trim()}>
            Save current gating
          </Button>
        </Box>

        {!canSave && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Draw some gates first.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
