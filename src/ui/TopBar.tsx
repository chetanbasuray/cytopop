import BrightnessAutoOutlined from "@mui/icons-material/BrightnessAutoOutlined";
import Check from "@mui/icons-material/Check";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import FileOpenOutlined from "@mui/icons-material/FileOpenOutlined";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import {
  AppBar, Box, Button, Chip, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { useRef, useState } from "react";
import iconUrl from "./icon.svg";

type Mode = "system" | "light" | "dark";
const MODES: { mode: Mode; label: string; icon: React.ReactNode }[] = [
  { mode: "system", label: "System", icon: <BrightnessAutoOutlined fontSize="small" /> },
  { mode: "light", label: "Light", icon: <LightModeOutlined fontSize="small" /> },
  { mode: "dark", label: "Dark", icon: <DarkModeOutlined fontSize="small" /> },
];

function ThemeMenu() {
  const { mode, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = MODES.find((m) => m.mode === (mode ?? "system")) ?? MODES[0]!;
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
  onOpen: () => void;
  onExport: () => void;
  canExport: boolean;
  onSaveTemplate: () => void;
  onLoadTemplate: (file: File) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  return (
    <AppBar position="sticky" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
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
        <Button variant="contained" startIcon={<FolderOpenOutlined />} onClick={props.onOpen} sx={{ whiteSpace: "nowrap" }}>
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Open FCS files</Box>
          <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>Open</Box>
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
            <ListItemText>Save gating template</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              templateInput.current?.click();
              setAnchor(null);
            }}
          >
            <ListItemIcon><FileOpenOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Load gating template</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem component="a" href="https://github.com/chetanbasuray/cytopop/issues" target="_blank" rel="noreferrer">
            <ListItemText inset>Send feedback</ListItemText>
          </MenuItem>
        </Menu>
        <input
          ref={templateInput}
          type="file"
          accept=".json"
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
