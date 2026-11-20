import { MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useMemo } from "react";
import { DEFAULT_STATS, STATS, channelStats, type ChannelStats, type PopulationStats, type StatKey } from "../core/populations";
import { paramLabel, type Sample } from "./model";
import { MONO } from "./theme";

const num = { fontFamily: MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" } as const;
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : "–");

export function StatsPanel(props: {
  sample: Sample | undefined;
  cols: Float32Array[] | undefined;
  masks: Map<string, Uint8Array> | undefined;
  stats: PopulationStats[];
  channels: string[];
  onChannels: (c: string[]) => void;
  statKeys: StatKey[];
  onStatKeys: (k: StatKey[]) => void;
}) {
  const { sample, cols, masks, stats, channels, statKeys } = props;

  const rows = useMemo(() => {
    if (!sample || !cols) return [];
    const channelCols = channels.map((ch) => cols[sample.names.indexOf(ch)]);
    const none: ChannelStats = { median: NaN, mean: NaN, geoMean: NaN, sd: NaN, cv: NaN, rsd: NaN, rcv: NaN, p5: NaN, p25: NaN, p75: NaN, p95: NaN };

    return [
      {
        key: "all",
        name: "All events",
        depth: 0,
        count: sample.file.eventCount,
        pp: 100,
        pt: 100,
        c: channelCols.map((col) => (col ? channelStats(col) : none)),
      },
      ...stats.map((p) => ({
        key: p.id,
        name: p.name,
        depth: p.path.split("/").length,
        count: p.count,
        pp: p.percentParent,
        pt: p.percentTotal,
        c: channelCols.map((col) => (col && masks ? channelStats(col, masks.get(p.id)) : none)),
      })),
    ];
  }, [sample, cols, masks, stats, channels]);

  const handleChannelsChange = (newChannels: string[]) => {
    if (newChannels.length === 0) return;
    props.onChannels(newChannels);
  };

  const allStats = statKeys.length === STATS.length;
  const handleStatKeysChange = (picked: (StatKey | "all")[]) => {
    // The toggle row arrives as "all" in the selection; it flips between every statistic and the default set.
    const newKeys = picked.includes("all") ? (allStats ? DEFAULT_STATS : STATS.map((s) => s.key)) : (picked as StatKey[]);
    if (newKeys.length === 0) return;
    const orderedKeys = newKeys.filter((k) => STATS.some((s) => s.key === k)).sort((a, b) => STATS.findIndex((s) => s.key === a) - STATS.findIndex((s) => s.key === b));
    props.onStatKeys(orderedKeys);
  };

  return (
    <Paper sx={{ p: 2, minWidth: 0 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 1 }}>
        <Typography variant="h2" sx={{ color: "text.secondary" }}>Statistics</Typography>
        {sample && (
          <>
            <TextField
              select
              size="small"
              label="Channels"
              value={channels}
              onChange={(e) => handleChannelsChange(e.target.value as unknown as string[])}
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (selected) => (selected as string[]).map((n) => paramLabel(sample, n)).join(", "),
                },
              }}
              sx={{ minWidth: 160, maxWidth: 240 }}
            >
              {sample.names.map((n) => (
                <MenuItem key={n} value={n}>
                  {paramLabel(sample, n)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Statistics"
              value={statKeys}
              onChange={(e) => handleStatKeysChange(e.target.value as unknown as (StatKey | "all")[])}
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (selected) => STATS.filter((s) => (selected as StatKey[]).includes(s.key)).map((s) => s.label).join(", "),
                },
              }}
              sx={{ minWidth: 160, maxWidth: 240 }}
            >
              <MenuItem value="all" divider>
                {allStats ? "Default selection" : "Select all"}
              </MenuItem>
              {STATS.map((s) => (
                <MenuItem key={s.key} value={s.key}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
      </Stack>
      {sample ? (
        <TableContainer>
          <Table size="small" aria-label="Population statistics" sx={{ "& th, & td": { px: 1 }, "& th:first-of-type, & td:first-of-type": { pl: 0 } }}>
            <TableHead>
              {channels.length > 1 ? (
                <>
                  <TableRow>
                    <TableCell colSpan={4} />
                    {channels.map((ch) => (
                      <TableCell key={ch} align="center" colSpan={statKeys.length}>
                        {paramLabel(sample, ch)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell>Population</TableCell>
                    <TableCell align="right">Count</TableCell>
                    <TableCell align="right">% parent</TableCell>
                    <TableCell align="right">% total</TableCell>
                    {channels.map((ch) =>
                      statKeys.map((k) => (
                        <TableCell key={`${ch}-${k}`} align="right">
                          {STATS.find((s) => s.key === k)?.label}
                        </TableCell>
                      ))
                    )}
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell>Population</TableCell>
                  <TableCell align="right">Count</TableCell>
                  <TableCell align="right">% parent</TableCell>
                  <TableCell align="right">% total</TableCell>
                  {statKeys.map((k) => (
                    <TableCell key={k} align="right">
                      {STATS.find((s) => s.key === k)?.label}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key} hover>
                  <TableCell sx={{ "&&": { pl: r.depth * 2 } }}>{r.name}</TableCell>
                  <TableCell align="right" sx={num}>
                    {r.count.toLocaleString()}
                  </TableCell>
                  <TableCell align="right" sx={num}>
                    {fmt(r.pp, 2)}
                  </TableCell>
                  <TableCell align="right" sx={num}>
                    {fmt(r.pt, 2)}
                  </TableCell>
                  {channels.map((ch, chIdx) =>
                    statKeys.map((k) => (
                      <TableCell key={`${r.key}-${ch}-${k}`} align="right" sx={num}>
                        {fmt(r.c[chIdx]![k])}
                      </TableCell>
                    ))
                  )}
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
