# AGENTS.md

Guidance for AI agents (and humans) contributing to **CytoPop**, browser-based flow cytometry analysis: open FCS
files, compensate, gate populations, export statistics. The users are lab scientists, some on tablets. It is in beta.

## Golden rules

1. **The PR title is the release.** PRs are squash-merged, so the title becomes the commit on `main`, and
   semantic-release reads it on every push to `main`. The `PR Title` check enforces
   [Conventional Commits](https://www.conventionalcommits.org/).
2. **Describe features by what they do.** Name no commercial or competing cytometry product anywhere in the repo:
   code, comments, docs, commits, PRs, issues.
3. **Clean-room only.** Build from open standards (the FCS specifications, published transforms such as logicle) and
   code under a compatible open-source license, credited in `NOTICE`. A project without a license can be read for
   ideas; its code stays out.
4. **Versions come from git tags.** `package.json` `version` stays `0.0.0-development`; release notes live on GitHub
   Releases.
5. **New dependencies are pinned and at least two weeks old.** Pick the newest version published two or more weeks ago.

## Commit type and release

| Type | Release |
|---|---|
| `feat:`, `fix:`, or breaking (`feat!:`, `BREAKING CHANGE:` footer) | next beta, `v0.1.0-beta.N`, with desktop apps attached |
| `docs:`, `ci:`, `chore:`, `test:`, `refactor:`, `style:`, `perf:` | none |

While CytoPop is in beta, breaking changes stay on the 0.x line. Leaving beta means releasing from the `stable`
branch; only the owner decides that.

"Breaking" for users means a saved gating template (`localStorage` key `cytopop.template.v1`, or an exported template
file) stops loading or produces different gates, or the same file and gates give different statistics. Keep old
templates loading: `applyGate` in `src/core/gates.ts` already treats `null` rectangle edges from beta.1 as unbounded.

## Pull requests

- Branch from `main`; `main` accepts squash-merged PRs only.
- Required to merge: `test` (typecheck, tests, build, icon generation) and `PR Title`.
- Leave merging to the owner.

## Code layout and conventions

- `src/core` is pure TypeScript with no DOM or React: parsing, compensation, transforms, gates, population stats.
  Every behaviour change there comes with a test in `tests/`.
- `src/ui` is React with Material UI. Colours come from the theme (`src/ui/theme.ts`); canvas drawing in
  `src/ui/plot.ts` reads them through `--mui-palette-*` CSS variables, so both colour schemes stay correct.
- Gates are stored in display units (0 to 1 after the axis transform). Keep stored numbers finite: JSON turns
  `Infinity` into `null`, which is why quadrants use ±1e9.
- Touch is a first-class input: interactive controls are at least 44 px on coarse pointers, and gating works with a
  finger. Check a UI change at phone (375 px) and tablet widths as well as desktop.
- `src/ui/icon.svg` is the single source for the favicon and the desktop icons; `bun run icons` renders the
  desktop icons in CI, and they are never committed.

## Local development

```bash
bun install
bun run dev        # dev server with hot reload
bun test
bun run typecheck
bun run build      # static site in dist/
```
