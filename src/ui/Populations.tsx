import PercentOutlined from "@mui/icons-material/PercentOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutlineOutlined";
import Redo from "@mui/icons-material/RedoOutlined";
import Undo from "@mui/icons-material/UndoOutlined";
import { Box, Button, IconButton, ListItemButton, ListItemText, Paper, Tooltip, Typography } from "@mui/material";
import type { Population, PopulationStats } from "../core/populations";
import { splitEdge } from "../core/gates";
import { thresholdText } from "./ThresholdDialog";
import { MONO } from "./theme";

const rowSx = { borderRadius: 2, minHeight: 36, py: 0.5, px: 1.5 } as const;
const countSx = { fontFamily: MONO, fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" } as const;

const canThreshold = (p: Population) =>
  p.gate.kind === "range" || (p.gate.kind === "rectangle" && !!splitEdge(p.gate.xMin, p.gate.xMax) && !!splitEdge(p.gate.yMin, p.gate.yMax));

export function Populations(props: {
  populations: Population[];
  stats: PopulationStats[];
  totalEvents: number | undefined;
  parent: string | null;
  onSelectPopulation: (id: string | null) => void;
  onRemovePopulation: (id: string) => void;
  onThreshold: (id: string) => void;
  onCombine: () => void;
  onUndo?: () => void; // undefined when there is nothing to undo
  onRedo?: () => void;
  adjusted: string[]; // populations whose gate is adjusted for the shown sample
  onResetAdjustment: (id: string) => void;
}) {
  const { populations, stats } = props;

  const node = (id: string | null, name: string, figure: string, depth: number): React.ReactNode => {
    const kids = populations.filter((p) => p.parentId === id);
    const pop = id ? populations.find((p) => p.id === id) : undefined;
    const adjusted = !!id && props.adjusted.includes(id);
    return (
      <Box component="li" key={id ?? "all"} sx={{ listStyle: "none", minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", "&:hover .del, & .del:focus-visible": { opacity: 1 } }}>
          <ListItemButton
            selected={props.parent === id}
            onClick={() => props.onSelectPopulation(id)}
            sx={{ ...rowSx, pl: 1.5 + depth * 2, gap: 1, minWidth: 0 }}
            title={[name, pop && thresholdText(pop.gate), adjusted && "Adjusted for this sample"].filter(Boolean).join(" · ")}
          >
            {id && <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: 0.5, border: 2, borderColor: "gate.main", flex: "none" }} />}
            <ListItemText
              primary={name}
              secondary={[pop && thresholdText(pop.gate), adjusted && "Adjusted for this sample"].filter(Boolean).join(" · ") || undefined}
              slotProps={{ primary: { noWrap: true, sx: { fontSize: 14 } }, secondary: { noWrap: true, sx: { fontSize: 12 } } }}
              sx={{ my: 0, minWidth: 0 }}
            />
            <Typography component="span" sx={countSx}>{figure}</Typography>
          </ListItemButton>
          {pop && canThreshold(pop) && (
            <Tooltip title="Threshold from a control">
              <IconButton
                className="del"
                size="small"
                aria-label={`Set ${name} from a control`}
                onClick={() => props.onThreshold(pop.id)}
                sx={{ ml: 0.5, transition: "opacity 120ms", "@media (hover: hover) and (pointer: fine)": { opacity: 0 } }}
              >
                <PercentOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {id && adjusted && (
            <Tooltip title="Use the shared gate again">
              <IconButton size="small" aria-label={`Reset ${name} to the shared gate`} onClick={() => props.onResetAdjustment(id)} sx={{ ml: 0.5 }}>
                <RestartAltOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
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
    <Paper component="aside" sx={{ p: 2 }}>
      <section>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, px: 1.5 }}>
          <Typography variant="h2" sx={{ color: "text.secondary" }}>Populations</Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Tooltip title="Undo (Ctrl+Z)">
              <span>
                <IconButton size="small" aria-label="Undo" onClick={props.onUndo} disabled={!props.onUndo}><Undo fontSize="small" /></IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Redo (Shift+Ctrl+Z)">
              <span>
                <IconButton size="small" aria-label="Redo" onClick={props.onRedo} disabled={!props.onRedo}><Redo fontSize="small" /></IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Combine populations with AND, OR or NOT">
              <span>
                <Button size="small" onClick={props.onCombine} disabled={populations.length === 0}>Combine</Button>
              </span>
            </Tooltip>
          </Box>
        </Box>
        <Box component="ul" aria-label="Population tree" sx={{ m: 0, p: 0, display: "grid", gap: 0.5 }}>
          {node(null, "All events", props.totalEvents ? props.totalEvents.toLocaleString() : "", 0)}
        </Box>
      </section>
    </Paper>
  );
}
