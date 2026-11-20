import { Box, Link } from "@mui/material";
import { MONO } from "./theme";
import { VERSION } from "./version";

export type Status = { sample: string; population: string; shown: number; total: number };

const num = { fontVariantNumeric: "tabular-nums" } as const;

export function Footer({ status }: { status: Status | undefined }) {
  return (
    <Box
      component="footer"
      sx={{
        position: "sticky", bottom: 0, zIndex: 1, display: "flex", alignItems: "center", gap: 2,
        px: { xs: 2, md: 3 }, minHeight: 36, borderTop: 1, borderColor: "divider",
        bgcolor: "background.paper", color: "text.secondary", typography: "body2",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {status ? (
          <>
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              {status.sample} · {status.population} ·{" "}
            </Box>
            <Box component="span" sx={num}>{status.shown.toLocaleString()}</Box> of{" "}
            <Box component="span" sx={num}>{status.total.toLocaleString()}</Box> events
          </>
        ) : (
          "No sample open"
        )}
      </Box>
      <Box component="span" sx={{ fontFamily: MONO, fontSize: 12 }}>{VERSION}</Box>
      <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 2 }}>
        <Link href="https://github.com/chetanbasuray/cytopop/issues" target="_blank" rel="noreferrer" color="inherit">
          Feedback
        </Link>
        <Link href="https://github.com/chetanbasuray/cytopop" target="_blank" rel="noreferrer" color="inherit">
          GitHub
        </Link>
      </Box>
    </Box>
  );
}
