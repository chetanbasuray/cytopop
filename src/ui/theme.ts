import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    gate: Palette["primary"];
  }
  interface PaletteOptions {
    gate?: PaletteOptions["primary"];
  }
}

export const MONO = '"Roboto Mono", ui-monospace, monospace';

// Quiet neutral chrome with a deep teal accent; the density plot carries the colour.
// Gates have their own magenta so they never read as the accent.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#00696d", contrastText: "#ffffff" },
        gate: { main: "#c2185b", contrastText: "#ffffff" },
        background: { default: "#f5f7f8", paper: "#ffffff" },
        divider: "rgba(23, 29, 31, 0.10)",
        text: { primary: "#171d1f", secondary: "#4a5457", disabled: "#8a9497" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#7fd3d6", contrastText: "#00373a" },
        gate: { main: "#ff7aa8", contrastText: "#3e0019" },
        background: { default: "#0f1213", paper: "#171b1c" },
        divider: "rgba(222, 228, 229, 0.10)",
        text: { primary: "#dee4e5", secondary: "#a3adb0", disabled: "#6b7578" },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Roboto", system-ui, -apple-system, "Segoe UI", sans-serif',
    button: { textTransform: "none", fontWeight: 500 },
    h1: { fontSize: 20, fontWeight: 500 },
    h2: { fontSize: 14, fontWeight: 500 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { rounded: { borderRadius: 12 } },
    },
    MuiAppBar: { defaultProps: { elevation: 0, color: "inherit" } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiTableCell: { styleOverrides: { root: { whiteSpace: "nowrap" } } },
  },
});
