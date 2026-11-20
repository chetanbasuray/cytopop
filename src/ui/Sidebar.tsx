import DeleteOutline from "@mui/icons-material/DeleteOutlineOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import { Box, Button, IconButton, List, ListItemButton, ListItemText, Paper, Tooltip, Typography } from "@mui/material";
import type { Population, PopulationStats } from "../core/populations";
import type { Sample } from "./model";
import { MONO } from "./theme";

const rowSx = { borderRadius: 2, minHeight: 36, py: 0.5, px: 1.5 } as const;
const countSx = { fontFamily: MONO, fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" } as const;

export function Sidebar(props: {
  samples: Sample[];
  active: string | null;
  onSelectSample: (id: string) => void;
  onLoadDemo: () => void;
  populations: Population[];
  stats: PopulationStats[];
  totalEvents: number | undefined;
  parent: string | null;
  onSelectPopulation: (id: string | null) => void;
  onRemovePopulation: (id: string) => void;
}) {
  const { populations, stats } = props;

  const node = (id: string | null, name: string, figure: string, depth: number): React.ReactNode => {
    const kids = populations.filter((p) => p.parentId === id);
    return (
      <Box component="li" key={id ?? "all"} sx={{ listStyle: "none", minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", "&:hover .del, & .del:focus-visible": { opacity: 1 } }}>
          <ListItemButton
            selected={props.parent === id}
            onClick={() => props.onSelectPopulation(id)}
            sx={{ ...rowSx, pl: 1.5 + depth * 2, gap: 1, minWidth: 0 }}
            title={name}
          >
            {id && <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: 0.5, border: 2, borderColor: "gate.main", flex: "none" }} />}
            <ListItemText primary={name} slotProps={{ primary: { noWrap: true, sx: { fontSize: 14 } } }} sx={{ my: 0, minWidth: 0 }} />
            <Typography component="span" sx={countSx}>{figure}</Typography>
          </ListItemButton>
          {id && (
            <Tooltip title="Delete population and its children">
              <IconButton
                className="del"
                size="small"
                aria-label={`Delete ${name} and its children`}
                onClick={() => props.onRemovePopulation(id)}
                sx={{ ml: 0.5, transition: "opacity 120ms", "@media (hover: hover) and (pointer: fine)": { opacity: 0 } }}
              >
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {kids.length > 0 && (
          <Box component="ul" sx={{ m: 0, mt: 0.5, p: 0, display: "grid", gap: 0.5 }}>
            {kids.map((k) => {
              const st = stats.find((s) => s.id === k.id);
              return node(k.id, k.name, st ? `${st.percentParent.toFixed(1)}%` : "", depth + 1);
            })}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Paper component="aside" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 3 }}>
      <section>
        <Typography variant="h2" sx={{ color: "text.secondary", mb: 1, px: 1.5 }}>Samples</Typography>
        {props.samples.length > 0 ? (
          <List dense disablePadding sx={{ display: "grid", gap: 0.5 }}>
            {props.samples.map((s) => (
              <ListItemButton key={s.id} selected={s.id === props.active} onClick={() => props.onSelectSample(s.id)} sx={{ ...rowSx, gap: 1, minWidth: 0 }} title={s.name}>
                <ListItemText primary={s.name} slotProps={{ primary: { noWrap: true, sx: { fontSize: 14 } } }} sx={{ my: 0, minWidth: 0 }} />
                <Typography component="span" sx={countSx}>{s.file.eventCount.toLocaleString()}</Typography>
              </ListItemButton>
            ))}
          </List>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary", px: 1.5 }}>
            Open or drop .fcs files. They stay on this computer
          </Typography>
        )}
        <Button size="small" startIcon={<ScienceOutlined />} onClick={props.onLoadDemo} sx={{ mt: 1, ml: 0.5 }}>
          Load demo sample
        </Button>
      </section>
      <section>
        <Typography variant="h2" sx={{ color: "text.secondary", mb: 1, px: 1.5 }}>Populations</Typography>
        <Box component="ul" aria-label="Population tree" sx={{ m: 0, p: 0, display: "grid", gap: 0.5 }}>
          {node(null, "All events", props.totalEvents ? props.totalEvents.toLocaleString() : "", 0)}
        </Box>
      </section>
    </Paper>
  );
}
