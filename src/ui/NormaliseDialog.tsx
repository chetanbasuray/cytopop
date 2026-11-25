import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography, useTheme } from "@mui/material";
import type { Normalisation } from "./model";

type Density = { group: string; reference: string; before: number[]; after: number[] };

interface NormaliseDialogProps {
  open: boolean;
  groups: { name: string; samples: string[] }[];
  channels: string[];
  value: Normalisation | undefined;
  onApply: (n: Normalisation | undefined) => void;
  onClose: () => void;
  preview: (n: Normalisation, channel: string) => Density[];
}

function Curves({ title, data, pick, colours }: { title: string; data: Density[]; pick: (d: Density) => number[]; colours: string[] }) {
  return (
    <Box>
      <svg width="240" height="80" viewBox="0 0 240 80" role="img" aria-label={title}>
        {data.map((d, i) => {
          const v = pick(d);
          const step = 240 / (v.length - 1 || 1);
          return <polyline key={d.group} points={v.map((y, j) => `${j * step},${80 - y * 76}`).join(" ")} fill="none" stroke={colours[i % colours.length]} strokeWidth={1.5} />;
        })}
      </svg>
      <Typography variant="caption" component="div">{title}</Typography>
    </Box>
  );
}

/** Picks the batches, their reference samples and the channels to align, with before/after density previews. */
export function NormaliseDialog({ open, groups, channels, value, onApply, onClose, preview }: NormaliseDialogProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState("");
  const [references, setReferences] = useState<Record<string, string>>({});
  const groupsKey = JSON.stringify(groups);
  const batches = useMemo(() => groups.filter((g) => g.samples.length > 0), [groupsKey]);

  // Reset only when the dialog opens, so edits survive re-renders of the parent.
  useEffect(() => {
    if (!open) return;
    const refs: Record<string, string> = {};
    for (const g of batches) {
      const kept = value?.references[g.name];
      refs[g.name] = kept && g.samples.includes(kept) ? kept : g.samples[0]!;
    }
    setSelected(value?.channels.filter((c) => channels.includes(c)) ?? []);
    setAnchor(value && batches.some((g) => g.name === value.anchor) ? value.anchor : (batches[0]?.name ?? ""));
    setReferences(refs);
  }, [open]);

  const draft = useMemo<Normalisation | undefined>(() => {
    if (!selected.length || !batches.some((g) => g.name === anchor)) return undefined;
    const refs: Record<string, string> = {};
    for (const g of batches) {
      const r = references[g.name];
      if (!r || !g.samples.includes(r)) return undefined;
      refs[g.name] = r;
    }
    return { channels: selected, anchor, references: refs };
  }, [selected, anchor, references, batches]);

  // The data behind `preview` cannot change while this modal is open, so it is left out of the deps.
  const previews = useMemo(() => (draft ? draft.channels.map((ch) => ({ ch, data: preview(draft, ch) })) : []), [draft]);
  const colours = [theme.palette.primary.main, theme.palette.secondary.main, theme.palette.success.main, theme.palette.warning.main, theme.palette.error.main, theme.palette.info.main];
  const ready = batches.length >= 2;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Normalise batches</DialogTitle>
      <DialogContent>
        {!ready ? (
          <Typography variant="body2">Put samples into at least two groups first. Each group is treated as one batch.</Typography>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Each group is one batch. Pick a reference sample in every batch (the same control run each time); its distribution on each chosen channel is mapped onto the anchor batch's reference, and the same mapping is applied to every sample in the batch.
            </Typography>
            <Autocomplete multiple size="small" disableCloseOnSelect options={channels} value={selected} onChange={(_e, v) => setSelected(v)} renderInput={(params) => <TextField {...params} label="Channels" />} />
            <TextField select size="small" label="Anchor batch" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              {batches.map((g) => <MenuItem key={g.name} value={g.name}>{g.name}</MenuItem>)}
            </TextField>
            {batches.map((g) => (
              <TextField key={g.name} select size="small" label={`Reference for ${g.name}`} value={references[g.name] ?? ""} onChange={(e) => setReferences({ ...references, [g.name]: e.target.value })}>
                {g.samples.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            ))}
            {previews.map(({ ch, data }) => (
              <Box key={ch}>
                <Typography variant="subtitle2">{ch}</Typography>
                <Stack direction="row" spacing={2}>
                  <Curves title="Before" data={data} pick={(d) => d.before} colours={colours} />
                  <Curves title="After" data={data} pick={(d) => d.after} colours={colours} />
                </Stack>
                <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", mt: 0.5 }}>
                  {data.map((d, i) => (
                    <Stack key={d.group} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: colours[i % colours.length] }} />
                      <Typography variant="caption">{d.group} ({d.reference})</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {value && <Button onClick={() => onApply(undefined)}>Turn off</Button>}
        <Button onClick={onClose}>{ready ? "Cancel" : "Close"}</Button>
        {ready && <Button variant="contained" disabled={!draft} onClick={() => onApply(draft)}>Apply</Button>}
      </DialogActions>
    </Dialog>
  );
}
