import { Autocomplete, Button, IconButton, MenuItem, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import { alpha, useTheme } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import { sampleTable, tallTable, toCsv } from "../core/populations";
import { download } from "./model";
import { MONO } from "./theme";

const num = { fontFamily: MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" } as const;
const sticky = { position: "sticky", left: 0, bgcolor: "background.paper" } as const;
const SELECTIONS_KEY = "cytopop.statSelections.v1";
type Selection = { name: string; populations: string[]; measures: string[] };
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
function loadSelections(): Selection[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SELECTIONS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is Selection => typeof x?.name === "string" && strings(x.populations) && strings(x.measures)) : [];
  } catch {
    return [];
  }
}
const EMPTY = { header: [] as string[], rows: [] as (string | number)[][] };

/** Shows a statistics table with every sample as a row so conditions can be compared. */
export function SampleTableDialog(props: {
  open: boolean;
  onClose: () => void;
  long: { header: string[]; rows: (string | number)[][] } | null;
  meta: number;
}) {
  const theme = useTheme();
  const long = props.long ?? EMPTY;
  const popCol = 1 + props.meta;
  const populationChoices = useMemo(
    () => [...new Set(long.rows.map((r) => String(r[popCol] ?? "")).filter((v) => v && !v.startsWith("Error:")))],
    [long, popCol],
  );
  const measureChoices = useMemo(() => long.header.slice(popCol + 1), [long, popCol]);
  const [populations, setPopulations] = useState<string[] | null>(null); // null: every population but All events
  const [measures, setMeasures] = useState<string[]>(["% parent"]);
  const [heat, setHeat] = useState(false);
  const [layout, setLayout] = useState<"wide" | "tall">("wide");
  const [selections, setSelections] = useState(loadSelections);
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(SELECTIONS_KEY, JSON.stringify(selections));
    } catch {
      // shortcut: a full or blocked storage keeps selections for this session only
    }
  }, [selections]);
  const save = () => {
    const n = name.trim();
    setSelections((all) => [...all.filter((x) => x.name !== n), { name: n, populations: shownPops, measures: shownMeasures }]);
    setName("");
  };

  const shownPops = (populations ?? populationChoices.filter((p) => p !== "All events")).filter((p) => populationChoices.includes(p));
  const shownMeasures = measures.filter((m) => measureChoices.includes(m));
  const table = useMemo(
    () => (shownPops.length && shownMeasures.length ? sampleTable(long, props.meta, shownPops, shownMeasures) : null),
    [long, props.meta, shownPops.join("\n"), shownMeasures.join("\n")], // joined so a new array with the same choices keeps the table
  );
  // Each statistic column gets its own scale, so outliers stand out within that column.
  const ranges = useMemo(() => table?.header.map((_, c) => {
    const vs = table.rows.map((r) => r[c]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return { min: Math.min(...vs), max: Math.max(...vs) };
  }), [table]);

  const cell = (v: string | number, c: number) => {
    if (c <= props.meta) return { text: String(v), sx: c === 0 ? { ...sticky, zIndex: 1 } : {} };
    const finite = typeof v === "number" && Number.isFinite(v);
    const r = ranges?.[c];
    const t = finite && r && r.max > r.min ? (v - r.min) / (r.max - r.min) : 0;
    return {
      text: finite ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "–", // 3 decimals, as in the CSV
      sx: { ...num, ...(heat && finite ? { bgcolor: alpha(theme.palette.primary.main, 0.08 + 0.5 * t) } : {}) },
    };
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Statistics by sample</DialogTitle>
      <DialogContent>
        <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap", mb: 2, pt: 1 }}>
          <Autocomplete
            multiple
            size="small"
            options={populationChoices}
            value={shownPops}
            onChange={(_e, v) => setPopulations(v)}
            disableCloseOnSelect
            limitTags={3}
            sx={{ minWidth: 280, flex: 1 }}
            renderInput={(params) => <TextField {...params} label="Populations" />}
          />
          <Autocomplete
            multiple
            size="small"
            options={measureChoices}
            value={shownMeasures}
            onChange={(_e, v) => setMeasures(v)}
            disableCloseOnSelect
            limitTags={3}
            sx={{ minWidth: 280, flex: 1 }}
            renderInput={(params) => <TextField {...params} label="Statistics" />}
          />
          <FormControlLabel control={<Switch checked={heat} onChange={(_e, v) => setHeat(v)} />} label="Heat map" />
        </Stack>
        <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          <TextField
            select
            size="small"
            label="Saved selection"
            value=""
            onChange={(e) => {
              const sel = selections.find((x) => x.name === e.target.value);
              if (sel) { setPopulations(sel.populations); setMeasures(sel.measures); }
            }}
            sx={{ minWidth: 220 }}
            disabled={!selections.length}
          >
            {selections.map((x) => (
              <MenuItem key={x.name} value={x.name} sx={{ justifyContent: "space-between", gap: 1 }}>
                {x.name}
                <Tooltip title="Delete selection">
                  <IconButton size="small" aria-label={`Delete ${x.name}`} onClick={(e) => { e.stopPropagation(); setSelections((all) => all.filter((y) => y.name !== x.name)); }}>
                    <DeleteOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Selection name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && table) save(); }} />
          <Button disabled={!name.trim() || !table} onClick={save}>Save selection</Button>
        </Stack>
        {!table ? (
          <Typography variant="body2">Choose at least one population and one statistic.</Typography>
        ) : (
          <TableContainer sx={{ maxHeight: "60vh" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {table.header.map((h, c) => (
                    <TableCell key={c} align={c > props.meta ? "right" : "left"} sx={c === 0 ? { ...sticky, zIndex: 3 } : {}}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {table.rows.map((row, r) => (
                  <TableRow key={r}>
                    {row.map((v, c) => {
                      const { text, sx } = cell(v, c);
                      return <TableCell key={c} align={c > props.meta ? "right" : "left"} sx={sx}>{text}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <ToggleButtonGroup size="small" exclusive value={layout} onChange={(_e, v) => v && setLayout(v)} aria-label="Export layout" sx={{ mr: "auto" }}>
          <ToggleButton value="wide" title="One row per sample, a column per population and statistic">Wide</ToggleButton>
          <ToggleButton value="tall" title="One row per sample, population and statistic">Tall</ToggleButton>
        </ToggleButtonGroup>
        <Button
          disabled={!table}
          onClick={() => {
            const t = layout === "wide" ? table : tallTable(long, props.meta, shownPops, shownMeasures);
            if (t) download(`cytopop-samples-${layout}.csv`, toCsv(t.header, t.rows), "text/csv");
          }}
        >
          Export CSV
        </Button>
        <Button variant="contained" onClick={props.onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
