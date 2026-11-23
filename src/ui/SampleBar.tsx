import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import LabelOutlined from "@mui/icons-material/LabelOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import { Box, Button, Chip, MenuItem, TextField, Typography } from "@mui/material";
import type { Sample } from "./model";
import { COARSE, MONO } from "./theme";

export function SampleBar(props: {
  samples: Sample[];
  active: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: () => void;
  onLoadDemo: () => void;
  groups: Record<string, string>;
  groupFilter: string;
  onGroupFilter: (g: string) => void;
  onEditGroups: () => void;
}) {
  const distinctGroups = Array.from(new Set(Object.values(props.groups).filter(Boolean))).sort();
  const hasGroups = distinctGroups.length > 0;

  let filterValue = props.groupFilter;
  if (filterValue !== "all" && !distinctGroups.includes(filterValue)) {
    filterValue = "all";
  }

  const filteredSamples = props.samples.filter((s) => {
    if (filterValue === "all") return true;
    return props.groups[s.name] === filterValue;
  });

  return (
    <Box
      component="nav"
      aria-label="Samples"
      sx={{
        display: "flex", alignItems: "center", gap: 1, px: { xs: 2, md: 3 }, py: 1,
        borderBottom: 1, borderColor: "divider", bgcolor: "background.paper",
      }}
    >
      <Typography variant="h2" sx={{ color: "text.secondary", flex: "none", display: { xs: "none", sm: "block" } }}>
        Samples
      </Typography>
      {hasGroups && (
        <TextField
          select
          size="small"
          label="Group"
          value={filterValue}
          onChange={(e) => props.onGroupFilter(e.target.value)}
          sx={{ minWidth: 160, flex: "none" }}
          slotProps={{ htmlInput: { "aria-label": "Group filter" } }}
        >
          <MenuItem value="all">All samples</MenuItem>
          {distinctGroups.map((g) => (
            <MenuItem key={g} value={g}>{g}</MenuItem>
          ))}
        </TextField>
      )}
      <Button
        startIcon={<LabelOutlined />}
        onClick={props.onEditGroups}
        disabled={props.samples.length === 0}
        sx={{ flex: "none", whiteSpace: "nowrap" }}
      >
        Groups
      </Button>
      <Box sx={{ display: "flex", gap: 1, overflowX: "auto", flex: 1, minWidth: 0, py: 0.5 }}>
        {filteredSamples.length > 0 ? (
          filteredSamples.map((s) => {
            const selected = s.id === props.active;
            const group = props.groups[s.name];
            return (
              <Chip
                key={s.id}
                title={s.name}
                aria-pressed={selected}
                onClick={() => props.onSelect(s.id)}
                onDelete={() => props.onRemove(s.id)}
                color={selected ? "primary" : "default"}
                variant={selected ? "filled" : "outlined"}
                label={
                  <>
                    {s.name}
                    {group && (
                      <Box component="span" sx={{ fontSize: 12, opacity: 0.7, ml: 1 }}>
                        {group}
                      </Box>
                    )}
                    <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, ml: 1, opacity: 0.8 }}>
                      {s.file.eventCount.toLocaleString()}
                    </Box>
                  </>
                }
                sx={{ maxWidth: 280, flex: "none", [COARSE]: { height: 44 } }}
              />
            );
          })
        ) : (
          <Typography variant="body2" noWrap sx={{ color: "text.secondary" }}>
            {props.samples.length > 0 && hasGroups ? "No samples in this group" : "Open or drop .fcs files. They stay on this computer"}
          </Typography>
        )}
      </Box>
      <Button startIcon={<ScienceOutlined />} onClick={props.onLoadDemo} sx={{ flex: "none", whiteSpace: "nowrap" }}>
        Demo
      </Button>
      <Button variant="contained" startIcon={<FolderOpenOutlined />} onClick={props.onOpen} sx={{ flex: "none", whiteSpace: "nowrap" }}>
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Open FCS files</Box>
        <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>Open</Box>
      </Button>
    </Box>
  );
}
