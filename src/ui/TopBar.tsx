import IosShareOutlined from "@mui/icons-material/IosShareOutlined";
import TimelineOutlined from "@mui/icons-material/TimelineOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import FunctionsOutlined from "@mui/icons-material/FunctionsOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import Check from "@mui/icons-material/Check";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import FileOpenOutlined from "@mui/icons-material/FileOpenOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import {
  AppBar, Box, Button, Chip, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { useRef, useState } from "react";
import iconUrl from "./icon.svg";

type Mode = "light" | "dark";
// Until someone picks one, the app follows the system setting; MUI saves the pick in localStorage ("mui-mode").
const MODES: { mode: Mode; label: string; icon: React.ReactNode }[] = [
  { mode: "light", label: "Light", icon: <LightModeOutlined fontSize="small" /> },
  { mode: "dark", label: "Dark", icon: <DarkModeOutlined fontSize="small" /> },
];

function ThemeMenu() {
  const { colorScheme, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = MODES.find((m) => m.mode === colorScheme) ?? MODES[0]!;
  return (
    <>
      <Tooltip title={`Theme: ${current.label}`}>
        <IconButton aria-label="Theme" onClick={(e) => setAnchor(e.currentTarget)}>
          {current.icon}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {MODES.map((m) => (
          <MenuItem
            key={m.mode}
            selected={m.mode === current.mode}
            onClick={() => {
              setMode(m.mode);
              setAnchor(null);
            }}
          >
            <ListItemIcon>{m.icon}</ListItemIcon>
            <ListItemText>{m.label}</ListItemText>
            {m.mode === current.mode && <Check fontSize="small" sx={{ ml: 2 }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export function TopBar(props: {
  onExport: () => void;
  canExport: boolean;
  onSaveTemplate: () => void;
  onSaveWsp: () => void;
  onLoadTemplate: (file: File) => void;
  onCheckSettings: () => void;
  onClean: () => void;
  onTrack: () => void;
  onExportEvents: () => void;
  onDerive: () => void;
  onGrid: () => void;
  onControls: () => void;
  canGrid: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  return (
    <AppBar position="static" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 } }}>
        <Box component="img" src={iconUrl} alt="" sx={{ width: 28, height: 28, display: "block" }} />
        <Typography variant="h1" component="h1">CytoPop</Typography>
        <Chip label="Beta" size="small" variant="outlined" sx={{ height: 20, fontSize: 11, color: "text.secondary" }} />
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          startIcon={<DownloadOutlined />}
          onClick={props.onExport}
          disabled={!props.canExport}
          sx={{ display: { xs: "none", sm: "inline-flex" } }}
        >
          Export CSV
        </Button>
        <ThemeMenu />
        <Tooltip title="More">
          <IconButton aria-label="More actions" onClick={(e) => setAnchor(e.currentTarget)}>
            <MoreVert />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
          <MenuItem
            sx={{ display: { sm: "none" } }}
            disabled={!props.canExport}
            onClick={() => {
              props.onExport();
              setAnchor(null);
            }}
          >
            <ListItemIcon><DownloadOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Export statistics as CSV</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              props.onSaveTemplate();
              setAnchor(null);
            }}
          >
            <ListItemIcon><SaveOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Save workspace</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              props.onSaveWsp();
              setAnchor(null);
            }}
          >
            <ListItemIcon><SaveOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Save as .wsp workspace</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              templateInput.current?.click();
              setAnchor(null);
            }}
          >
            <ListItemIcon><FileOpenOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Open workspace</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              props.onCheckSettings();
              setAnchor(null);
            }}
          >
            <ListItemIcon><FactCheckOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Check settings across samples</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              props.onClean();
              setAnchor(null);
            }}
          >
            <ListItemIcon><CleaningServicesOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Find unstable events</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              props.onTrack();
              setAnchor(null);
            }}
          >
            <ListItemIcon><TimelineOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Track a statistic across runs</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              props.onExportEvents();
              setAnchor(null);
            }}
          >
            <ListItemIcon><IosShareOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Export a population's events</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              props.onDerive();
              setAnchor(null);
            }}
          >
            <ListItemIcon><FunctionsOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Derived parameters</ListItemText>
          </MenuItem>
          <MenuItem
            disabled={!props.canGrid}
            onClick={() => {
              props.onGrid();
              setAnchor(null);
            }}
          >
            <ListItemIcon><GridViewOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>All parameter pairs</ListItemText>
          </MenuItem>
          <MenuItem
            disabled={!props.canGrid}
            onClick={() => {
              props.onControls();
              setAnchor(null);
            }}
          >
            <ListItemIcon><TuneOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Compensation from controls</ListItemText>
          </MenuItem>
        </Menu>
        <input
          ref={templateInput}
          type="file"
          accept=".json,.wsp"
          hidden
          onChange={(e) => {
            const input = e.currentTarget;
            const file = input.files?.[0];
            if (file) props.onLoadTemplate(file);
            input.value = "";
          }}
        />
      </Toolbar>
    </AppBar>
  );
}
