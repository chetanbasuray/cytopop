import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, Tabs, Tab } from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import { useMemo, useRef, useState } from "react";
import { readAnnotations } from "../core/annotations";

import type { Annotations } from "./model";

export function MetadataDialog(props: {
  samples: { name: string; keywords: Record<string, string> }[];
  keywordColumns: string[];
  annotations: Annotations;
  onApply: (keywordColumns: string[], annotations: Annotations) => void;
  onClose: () => void;
}) {
  const [keywordCols, setKeywordCols] = useState<string[]>(() => [...props.keywordColumns]);
  const [columns, setColumns] = useState<string[]>(() => [...props.annotations.columns]);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() => {
    const copy: Record<string, Record<string, string>> = {};
    for (const sampleName of Object.keys(props.annotations.values)) {
      copy[sampleName] = { ...props.annotations.values[sampleName] };
    }
    return copy;
  });
  const [tab, setTab] = useState(0);
  const [newCol, setNewCol] = useState("");
  const [message, setMessage] = useState<{ type: "info" | "error"; text: string } | null>(null);
  const [selectedSample, setSelectedSample] = useState<string>(() => props.samples[0]?.name ?? "");
  const [filter, setFilter] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const allKeywordOptions = useMemo(() => {
    const excluded = new Set([
      "$BEGINDATA", "$ENDDATA", "$BEGINANALYSIS", "$ENDANALYSIS",
      "$BEGINSTEXT", "$ENDSTEXT", "$NEXTDATA", "SPILL", "$SPILLOVER", "SPILLOVER"
    ]);
    const pattern = /^\$P\d+[A-Z]+$/;
    const set = new Set<string>();
    for (const sample of props.samples) {
      for (const key of Object.keys(sample.keywords)) {
        if (!excluded.has(key) && !pattern.test(key)) {
          set.add(key);
        }
      }
    }
    return Array.from(set).sort();
  }, [props.samples]);

  const canAddColumn = useMemo(() => {
    const trimmed = newCol.trim();
    if (trimmed === "") return false;
    for (const col of columns) {
      if (col === trimmed) return false;
    }
    for (const col of keywordCols) {
      if (col === trimmed) return false;
    }
    return true;
  }, [newCol, columns, keywordCols]);

  const handleAddColumn = () => {
    const trimmed = newCol.trim();
    if (trimmed !== "" && canAddColumn) {
      setColumns((prev) => [...prev, trimmed]);
      setNewCol("");
    }
  };

  const handleRemoveColumn = (name: string) => {
    setColumns((prev) => prev.filter((c) => c !== name));
    setValues((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const sampleName of Object.keys(prev)) {
        next[sampleName] = { ...prev[sampleName] };
        delete next[sampleName][name];
      }
      return next;
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = readAnnotations(text, props.samples);

      setColumns((prev) => {
        const existing = new Set(prev);
        const newCols = result.columns.filter((c) => !existing.has(c));
        return [...prev, ...newCols];
      });

      setValues((prev) => {
        const next: Record<string, Record<string, string>> = {};
        for (const sampleName of Object.keys(prev)) {
          next[sampleName] = { ...prev[sampleName] };
        }
        for (const sampleName of Object.keys(result.values)) {
          if (!next[sampleName]) next[sampleName] = {};
          for (const col of result.columns) {
            const cell = result.values[sampleName]?.[col];
            if (cell !== undefined) {
              next[sampleName][col] = cell;
            }
          }
        }
        return next;
      });

      const newColCount = result.columns.length;
      const matchedSamples = Object.keys(result.values).length;
      let msg = `Imported ${newColCount} columns for ${matchedSamples} samples`;
      if (result.unmatched.length > 0) {
        const shown = result.unmatched.slice(0, 5);
        const rest = result.unmatched.length - 5;
        msg += ` · No sample matched: ${shown.join(", ")}${rest > 0 ? ", …" : ""}`;
      }
      setMessage({ type: "info", text: msg });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
    }

    event.target.value = "";
  };

  const handleApply = () => {
    const finalValues: Record<string, Record<string, string>> = {};
    for (const sampleName of Object.keys(values)) {
      const row: Record<string, string> = {};
      for (const col of columns) {
        const cell = values[sampleName]?.[col];
        if (cell !== undefined && cell.trim() !== "") {
          row[col] = cell.trim();
        }
      }
      if (Object.keys(row).length > 0) {
        finalValues[sampleName] = row;
      }
    }

    props.onApply(keywordCols, { columns, values: finalValues });
  };

  const filteredKeywords = useMemo(() => {
    if (!selectedSample) return [];
    const sample = props.samples.find((s) => s.name === selectedSample);
    if (!sample) return [];
    const lowerFilter = filter.toLowerCase();
    const entries = Object.entries(sample.keywords).filter(([k, v]) =>
      k.toLowerCase().includes(lowerFilter) || v.toLowerCase().includes(lowerFilter)
    );
    return entries.sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedSample, filter, props.samples]);

  if (props.samples.length === 0) {
    return (
      <Dialog open onClose={props.onClose} maxWidth="lg" fullWidth>
        <DialogTitle>Sample metadata</DialogTitle>
        <DialogContent>
          <Typography>Open FCS files to see their keywords.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={props.onClose}>Cancel</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={props.onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Sample metadata</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Columns" />
          <Tab label="Keywords" />
        </Tabs>

        {tab === 0 && (
          <>
            <Autocomplete
              multiple
              size="small"
              options={allKeywordOptions}
              value={keywordCols}
              onChange={(_e, v) => setKeywordCols(v)}
              renderInput={(params) => (
                <TextField {...params} label="FCS keyword columns" slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": "FCS keyword columns" } }} />
              )}
              sx={{ mb: 2 }}
            />

            <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
              <TextField
                size="small"
                value={newCol}
                onChange={(e) => setNewCol(e.target.value)}
                label="New column"
                slotProps={{ htmlInput: { "aria-label": "New column name" } }}
                sx={{ flex: 1 }}
              />
              <Button
                variant="outlined"
                disabled={!canAddColumn}
                onClick={handleAddColumn}
              >
                Add column
              </Button>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                ref={fileInput}
                hidden
              />
              <Button variant="outlined" onClick={() => fileInput.current?.click()}>
                Import CSV
              </Button>
            </Box>

            {message && (
              <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 1 }}>
                {message.text}
              </Alert>
            )}

            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              The first CSV column must hold the file name or the well id.
            </Typography>

            <Box sx={{ overflow: "auto", maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Sample</TableCell>
                    {keywordCols.map((k) => (
                      <TableCell key={k}>{k}</TableCell>
                    ))}
                    {columns.map((c) => (
                      <TableCell key={c}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          {c}
                          <IconButton size="small" onClick={() => handleRemoveColumn(c)} aria-label={`Remove column ${c}`}>
                            <DeleteOutlined />
                          </IconButton>
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {props.samples.map((sample) => (
                    <TableRow key={sample.name}>
                      <TableCell>{sample.name}</TableCell>
                      {keywordCols.map((k) => (
                        <TableCell key={k}>{sample.keywords[k] ?? ""}</TableCell>
                      ))}
                      {columns.map((c) => (
                        <TableCell key={c}>
                          <TextField
                            size="small"
                            variant="standard"
                            value={values[sample.name]?.[c] ?? ""}
                            onChange={(e) => setValues((cur) => ({ ...cur, [sample.name]: { ...cur[sample.name], [c]: e.target.value } }))}
                            slotProps={{ htmlInput: { "aria-label": `${c} for ${sample.name}` } }}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}

        {tab === 1 && (
          <>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <TextField
                select
                size="small"
                label="Sample"
                value={selectedSample}
                onChange={(e) => setSelectedSample(e.target.value)}
                slotProps={{ htmlInput: { "aria-label": "Select sample" } }}
                sx={{ width: 200 }}
              >
                {props.samples.map((s) => (
                  <MenuItem key={s.name} value={s.name}>{s.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                slotProps={{ htmlInput: { "aria-label": "Filter keywords" } }}
                sx={{ flex: 1 }}
              />
            </Box>

            <Box sx={{ overflow: "auto", maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Keyword</TableCell>
                    <TableCell>Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredKeywords.map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell>{k}</TableCell>
                      <TableCell>{v}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleApply}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
