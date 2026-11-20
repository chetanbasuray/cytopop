import { MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useMemo } from "react";
import { channelStats, type PopulationStats } from "../core/populations";
import { paramLabel, type Sample } from "./model";
import { MONO } from "./theme";

const num = { fontFamily: MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" } as const;
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : "–");

export function StatsPanel(props: {
  sample: Sample | undefined;
  cols: Float32Array[] | undefined;
  masks: Map<string, Uint8Array> | undefined;
  stats: PopulationStats[];
  channel: string;
  onChannel: (c: string) => void;
}) {
  const { sample, cols, masks, stats, channel } = props;
  const rows = useMemo(() => {
    if (!sample || !cols) return [];
    const col = cols[sample.names.indexOf(channel)];
    const none = { mean: NaN, median: NaN, cv: NaN };
    return [
      { key: "all", name: "All events", depth: 0, count: sample.file.eventCount, pp: 100, pt: 100, c: col ? channelStats(col) : none },
      ...stats.map((p) => ({
        key: p.id,
        name: p.name,
        depth: p.path.split("/").length,
        count: p.count,
        pp: p.percentParent,
        pt: p.percentTotal,
        c: col && masks ? channelStats(col, masks.get(p.id)) : none,
      })),
    ];
  }, [sample, cols, masks, stats, channel]);

  return (
    <Paper sx={{ p: 2, minWidth: 0 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 1 }}>
        <Typography variant="h2" sx={{ color: "text.secondary" }}>Statistics</Typography>
        {sample && (
          <TextField select size="small" label="Channel" value={channel} onChange={(e) => props.onChannel(e.target.value)} sx={{ minWidth: 160 }}>
            {sample.names.map((n) => <MenuItem key={n} value={n}>{paramLabel(sample, n)}</MenuItem>)}
          </TextField>
        )}
      </Stack>
      {sample ? (
        <TableContainer>
          <Table size="small" aria-label="Population statistics">
            <TableHead>
              <TableRow>
                <TableCell>Population</TableCell>
                <TableCell align="right">Count</TableCell>
                <TableCell align="right">% parent</TableCell>
                <TableCell align="right">% total</TableCell>
                <TableCell align="right">Median</TableCell>
                <TableCell align="right">Mean</TableCell>
                <TableCell align="right">CV %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key} hover>
                  <TableCell sx={{ pl: 2 + r.depth * 2 }}>{r.name}</TableCell>
                  <TableCell align="right" sx={num}>{r.count.toLocaleString()}</TableCell>
                  <TableCell align="right" sx={num}>{fmt(r.pp, 2)}</TableCell>
                  <TableCell align="right" sx={num}>{fmt(r.pt, 2)}</TableCell>
                  <TableCell align="right" sx={num}>{fmt(r.c.median)}</TableCell>
                  <TableCell align="right" sx={num}>{fmt(r.c.mean)}</TableCell>
                  <TableCell align="right" sx={num}>{fmt(r.c.cv)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>Statistics appear once a sample is open</Typography>
      )}
    </Paper>
  );
}
