# CytoPop

> **Beta.** CytoPop is early software. Expect rough edges, missing features and breaking changes between
> releases. Check results against your usual workflow before relying on them for publication or clinical work.

CytoPop is a flow cytometry analysis tool that runs entirely in your browser or as a desktop app. Open FCS files,
compensate, draw gates, build a population hierarchy and export statistics. Your data never leaves your computer:
there is no server, and files are read locally.

**Use it in the browser:** https://chetanbasuray.github.io/cytopop/
**Desktop apps** (macOS, Windows, Linux) are attached to each [release](https://github.com/chetanbasuray/cytopop/releases).

## System requirements

| | Supported | Download |
|---|---|---|
| Browser | Current Chrome, Edge, Firefox or Safari | Nothing to install |
| macOS | macOS 11 Big Sur or newer, Apple Silicon and Intel | `CytoPop.dmg` (one app for both chips) |
| Windows | Windows 10 or 11 | `CytoPop.msi` |
| Linux | Ubuntu 24.04 or newer, or another Debian-based distribution of the same age | `cytopop.deb` |

Older systems may open the desktop app but show a broken page, because the app draws its window with the system's
own web engine. If that happens, use the browser version in a current browser.

The desktop apps are not signed yet, so the first launch shows a warning:

- **macOS:** "cannot be opened because it is from an unidentified developer". Right-click CytoPop in Applications,
  choose Open, then Open again. Or allow it under System Settings › Privacy & Security.
- **Windows:** "Windows protected your PC". Select More info, then Run anyway.

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
- Light and dark themes that follow your system setting, or pick one from the theme menu.

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
and `src/ui` (the browser interface, built with React and Material UI). Desktop apps are built by CI with [Pake](https://github.com/tw93/Pake)
from the same static build.

## Contributing

Contributions are welcome. Open an issue to discuss larger changes first, keep `src/core` covered by tests, and make
sure `bun test`, `bun run typecheck` and `bun run build` pass. By contributing you agree that your contribution is
licensed under the Apache License 2.0, as stated in section 5 of the license.

Pull requests are squash-merged, so the PR title becomes the commit on `main` and must follow
[Conventional Commits](https://www.conventionalcommits.org/). Releases are automatic: a merge with a `feat:` or `fix:`
title publishes the next beta (`v0.1.0-beta.N`) with desktop apps attached. Other types such as `docs:`, `ci:` or
`chore:` release nothing. Never set the version in `package.json` by hand; it comes from the git tags.

## License

Copyright 2026 Chetan Basuray. Licensed under the [Apache License 2.0](LICENSE). If you redistribute CytoPop or
software built on it, include the [NOTICE](NOTICE) file as the license requires.
