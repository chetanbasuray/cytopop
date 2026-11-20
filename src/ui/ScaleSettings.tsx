import { useState } from "react";
import {
  Button,
  IconButton,
  Popover,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import TuneOutlined from "@mui/icons-material/TuneOutlined";

import type { TransformSpec } from "../core/transforms";

export function ScaleSettings(props: {
  label: string;
  spec: TransformSpec;
  defaults: TransformSpec;
  onChange: (spec: TransformSpec) => void;
  disabled?: boolean;
}) {
  const { spec } = props;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const isDisabled = props.disabled || spec.kind === "linear" || spec.kind === "log";

  return (
    <>
      <Tooltip title={`${props.label} settings`}>
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          disabled={isDisabled}
          aria-label={`${props.label} settings`}
        >
          <TuneOutlined />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Stack spacing={2} sx={{ p: 2, width: 280 }}>
          <Typography variant="subtitle2">{props.label} settings</Typography>

          {spec.kind === "logicle" && (
            <>
              <Stack spacing={1}>
                <Typography variant="caption">Positive decades</Typography>
                <Slider
                  aria-label="Positive decades"
                  value={spec.M}
                  min={2}
                  max={7}
                  step={0.1}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v: number) => +v.toFixed(2)}
                  onChange={(_, val) => {
                    const newM = Number(val);
                    let newW = spec.W;
                    if (newW > newM / 2) newW = newM / 2;
                    let newA = spec.A;
                    const minA = -newW;
                    const maxA = newM - 2 * newW;
                    if (newA < minA) newA = minA;
                    if (newA > maxA) newA = maxA;
                    props.onChange({ kind: "logicle", T: spec.T, W: newW, M: newM, A: newA });
                  }}
                />
              </Stack>

              <Stack spacing={1}>
                <Typography variant="caption">Negative decades</Typography>
                <Slider
                  aria-label="Negative decades"
                  value={spec.W}
                  min={0}
                  max={Math.min(2, spec.M / 2)}
                  step={0.05}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v: number) => +v.toFixed(2)}
                  onChange={(_, val) => {
                    const newW = Number(val);
                    let newA = spec.A;
                    const minA = -newW;
                    const maxA = spec.M - 2 * newW;
                    if (newA < minA) newA = minA;
                    if (newA > maxA) newA = maxA;
                    props.onChange({ kind: "logicle", T: spec.T, W: newW, M: spec.M, A: newA });
                  }}
                />
              </Stack>

              <TextField
                type="number"
                size="small"
                label="Top of scale"
                value={spec.T}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isNaN(val) && val >= 1) {
                    props.onChange({ kind: "logicle", T: val, W: spec.W, M: spec.M, A: spec.A });
                  }
                }}
              />
            </>
          )}

          {spec.kind === "arcsinh" && (
            <>
              <TextField
                type="number"
                size="small"
                label="Cofactor"
                value={spec.cofactor}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isNaN(val) && val > 0) {
                    props.onChange({ kind: "arcsinh", cofactor: val, min: spec.min, max: spec.max });
                  }
                }}
              />
              <TextField
                type="number"
                size="small"
                label="Minimum"
                value={spec.min}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isNaN(val) && val < spec.max) {
                    props.onChange({ kind: "arcsinh", cofactor: spec.cofactor, min: val, max: spec.max });
                  }
                }}
              />
              <TextField
                type="number"
                size="small"
                label="Maximum"
                value={spec.max}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isNaN(val) && val > spec.min) {
                    props.onChange({ kind: "arcsinh", cofactor: spec.cofactor, min: spec.min, max: val });
                  }
                }}
              />
            </>
          )}

          <Button size="small" onClick={() => props.onChange(props.defaults)}>
            Reset to defaults
          </Button>
        </Stack>
      </Popover>
    </>
  );
}
