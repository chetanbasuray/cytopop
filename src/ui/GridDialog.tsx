import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { fromSpec, type TransformSpec } from "../core/transforms";
import { pairImage, units } from "./plot";

const CELL = 88; // CSS px per cell
const G = 64; // density bins per side
const SAMPLE = 50_000; // events per pair; enough for the shape, keeps 20 parameters quick

export function GridDialog(props: {
  open: boolean;
  title: string; // sample and population shown
  names: string[];
  label: (param: string) => string;
  cols: Float32Array[];
  mask: Uint8Array | undefined;
  scaleFor: (param: string) => TransformSpec;
  onPick: (x: string, y: string) => void;
  onClose: () => void;
}) {
  const { names, cols, mask, scaleFor } = props;
  const [included, setIncluded] = useState(() => names.filter((n) => !/^time$/i.test(n)));
  const shown = names.filter((n) => included.includes(n));
  const [grid, setGrid] = useState<HTMLDivElement | null>(null); // state, not a ref: the dialog mounts its content a render late

  // Transform each parameter once; every pair reuses the result.
  const step = Math.max(1, Math.ceil((cols[0]?.length ?? 0) / SAMPLE));
  const unitCols = useMemo(
    () => new Map(shown.map((n) => [n, units(cols[names.indexOf(n)]!, fromSpec(scaleFor(n)), mask, step)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown.join("\n"), cols, mask, step, scaleFor],
  );

  // Draws cells in 12 ms batches so the dialog stays responsive while the grid fills in.
  useEffect(() => {
    const canvases = [...(grid?.querySelectorAll<HTMLCanvasElement>("canvas[data-x]") ?? [])];
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = new OffscreenCanvas(G, G);
    const tick = () => {
      const end = performance.now() + 12;
      while (i < canvases.length && performance.now() < end) {
        const c = canvases[i++]!;
        const us = unitCols.get(c.dataset.x!);
        const vs = unitCols.get(c.dataset.y!);
        if (!us || !vs) continue;
        off.getContext("2d")!.putImageData(pairImage(us, vs, G), 0, 0);
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, c.width, c.height);
      }
      if (i < canvases.length) timer = setTimeout(tick, 0);
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [unitCols, grid]);

  const px = Math.round(CELL * (window.devicePixelRatio || 1));
  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="xl" fullWidth>
      <DialogTitle>All parameter pairs</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          {props.title}. Select a plot to open that pair in the main plot.
        </Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", columnGap: 1, mb: 2 }}>
          {names.map((n) => (
            <FormControlLabel
              key={n}
              control={<Checkbox size="small" checked={included.includes(n)} onChange={(e) => setIncluded((cur) => (e.target.checked ? [...cur, n] : cur.filter((q) => q !== n)))} />}
              label={<Typography variant="body2">{props.label(n)}</Typography>}
            />
          ))}
        </Stack>
        {shown.length < 2 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Include at least two parameters</Typography>
        ) : (
          <Box sx={{ overflow: "auto" }}>
            <Box ref={setGrid} sx={{ display: "grid", gridTemplateColumns: `auto repeat(${shown.length - 1}, ${CELL}px)`, gap: 0.5, width: "max-content" }}>
              {shown.slice(1).map((yName, row) => (
                <Box key={yName} sx={{ display: "contents" }}>
                  <Typography variant="caption" sx={{ alignSelf: "center", justifySelf: "end", pr: 1, maxWidth: 140 }} noWrap title={props.label(yName)}>
                    {props.label(yName)}
                  </Typography>
                  {shown.slice(0, shown.length - 1).map((xName, col) =>
                    col <= row ? (
                      <Box
                        key={xName}
                        component="button"
                        type="button"
                        title={`${props.label(xName)} × ${props.label(yName)}`}
                        aria-label={`Open ${props.label(xName)} against ${props.label(yName)}`}
                        onClick={() => props.onPick(xName, yName)}
                        sx={{ p: 0, border: 1, borderColor: "divider", bgcolor: "background.paper", cursor: "pointer", width: CELL, height: CELL, "&:hover, &:focus-visible": { borderColor: "primary.main" } }}
                      >
                        <canvas data-x={xName} data-y={yName} width={px} height={px} style={{ width: CELL - 2, height: CELL - 2, display: "block" }} />
                      </Box>
                    ) : (
                      <Box key={xName} />
                    ),
                  )}
                </Box>
              ))}
              <Box />
              {shown.slice(0, shown.length - 1).map((xName) => (
                <Typography key={xName} variant="caption" noWrap title={props.label(xName)} sx={{ width: CELL, textAlign: "center" }}>
                  {props.label(xName)}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={props.onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
