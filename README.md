# CytoPop

> **Beta.** CytoPop is early software. Expect rough edges, missing features and breaking changes between
> releases. Check results against your usual workflow before relying on them for publication or clinical work.

CytoPop is a flow cytometry analysis tool that runs entirely in your browser or as a desktop app. Open FCS files,
compensate, draw gates, build a population hierarchy and export statistics. Your data never leaves your computer:
there is no server, and files are read locally.

**Use it in the browser:** https://chetanbasuray.github.io/cytopop/
**Desktop apps** (macOS, Windows, Linux) are attached to each [release](https://github.com/chetanbasuray/cytopop/releases).

## Features

- Open FCS 2.0, 3.0 and 3.1 list-mode files (float, double and integer data, log amplification, gain).
- Compensation from the spillover matrix stored in the file, toggled on or off.
- Axis scales: linear, log, logicle (biexponential) and arcsinh, set per channel.
- Density dot plots and histograms.
- Gates: rectangle, polygon, ellipse, quadrants and range (histogram).
- Population hierarchy: gate inside any population; every gate applies to all loaded samples.
- Statistics per population: count, % of parent, % of total, and median, mean and CV of any channel.
- Export statistics for all samples to CSV.
- Save and load gating templates (JSON) to reuse the same gates across experiments.
- A built-in synthetic demo sample to try things out without data.

## Roadmap

Ideas under consideration, roughly in order: batch figure layouts, back-gating overlays, sample groups,
importing Gating-ML 2.0, dimensionality reduction (UMAP, t-SNE) and clustering (FlowSOM), and compensation
matrix editing. Requests and feedback are welcome as [issues](https://github.com/chetanbasuray/cytopop/issues).

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev        # local dev server with hot reload
bun test           # unit tests
bun run typecheck  # TypeScript strict mode
bun run build      # static web build in dist/
```

The code is split into `src/core` (file parsing, compensation, scales, gates, statistics; no DOM, fully tested)
and `src/ui` (the browser interface). Desktop apps are built by CI with [Pake](https://github.com/tw93/Pake)
from the same static build.

## Contributing

Contributions are welcome. Open an issue to discuss larger changes first, keep `src/core` covered by tests, and make
sure `bun test`, `bun run typecheck` and `bun run build` pass. By contributing you agree that your contribution is
licensed under the Apache License 2.0, as stated in section 5 of the license.

## License

Copyright 2026 Chetan Basuray. Licensed under the [Apache License 2.0](LICENSE). If you redistribute CytoPop or
software built on it, include the [NOTICE](NOTICE) file as the license requires.
