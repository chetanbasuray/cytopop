import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import { Box, Button, Chip, Typography } from "@mui/material";
import type { Sample } from "./model";
import { COARSE, MONO } from "./theme";

export function SampleBar(props: {
  samples: Sample[];
  active: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: () => void;
  onLoadDemo: () => void;
}) {
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
      <Box sx={{ display: "flex", gap: 1, overflowX: "auto", flex: 1, minWidth: 0, py: 0.5 }}>
        {props.samples.length > 0 ? (
          props.samples.map((s) => {
            const selected = s.id === props.active;
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
            Open or drop .fcs files. They stay on this computer
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
