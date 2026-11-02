# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

STLinux is a Linux (Ubuntu) clone of Atlassian Sourcetree 3.4.32, rebuilt from analysis of the Windows build. The app is in `app/` (Tauri 2 + Rust backend + React/TypeScript front end). Scope decisions: Git only (no Mercurial), Bitbucket Cloud and Server plus SSH keys, dark theme by default with a light toggle, original layout reproduced closely.

Other top-level folders:
- `docs/ui-spec.md`: the UI spec (sizes, shortcuts, dark colour tokens). Read the matching section before building or changing a screen.
- `reference/decoded-layouts/` (local only, git-ignored, not on GitHub because it is derived from Atlassian's proprietary app): the original screens decoded to text (BAML to outline), plus `labels.json` (original English strings). `reference/tools/` has the extractor and decoder scripts. This is analysis material, not shipped code. It exists only on the original machine.
- `dist/`: built `.deb` output (git-ignored).

Do not copy Atlassian icons, logos or brand text. Icons are Lucide only.

## Commands (run from `app/`)

```
pnpm install
pnpm tauri dev            # run the desktop app (starts Vite on :1420)
pnpm dev                  # front end only; add ?mock (dev builds) for fake data, &fresh for the first-run wizard
pnpm build                # tsc -b && vite build (type check + bundle)
pnpm lint                 # oxlint
pnpm package:deb          # build + rename package to "stlinux" -> ../dist/stlinux_<ver>_amd64.deb
```

Rust (from `app/src-tauri/`; run `source ~/.cargo/env` if cargo is not on PATH):
```
cargo test                          # all tests
cargo test hunk_patch               # one test by name substring
cargo test accounts::               # one module
```

There is no front-end test runner. Rust tests create real temporary Git repos, so they need `git` installed. Use `pnpm package:deb`, not `tauri build`, for the `.deb`: Tauri names the package `st-linux` and the script renames it and adds the `libdbus-1-3` dependency.

## Architecture

**Backend (`app/src-tauri/src/`)**
- `git.rs`: every Git operation shells out to the system `git`. The front end never sends raw git arguments; each `#[tauri::command]` builds its own. Commands are `async` and run through `blocking()` (spawn_blocking). User-supplied refs and URLs pass through `ensure_not_flag` so a value cannot become an option. Network commands add a per-origin `http.<origin>/.extraHeader` auth config from stored accounts (`net_pre`), never global.
- `accounts.rs`: Bitbucket Cloud/Server accounts, SSH keys, remote repo listing. Secrets live in the system keyring (service `stlinux`); the file `~/.config/stlinux/accounts.json` holds only metadata, with a 0600 file fallback if no keyring exists. Removed SSH keys are tracked in `settings.json` (hidden, files kept). Key deletion is confined to real key files directly in `~/.ssh`.
- `lib.rs`: registers all commands. A new command must be added to `generate_handler!` here, to `src/lib/api.ts`, and (if it is a new permission) to `capabilities/default.json`.

**Front end (`app/src/`)**
- `lib/api.ts` is the only place that calls `invoke`. Rust structs use `#[serde(rename_all = "camelCase")]`, and `lib/types.ts` mirrors them by hand. Keep both in sync.
- `lib/store.tsx` (`useApp`): tabs, per-repo view mode, dialogs, toasts, and `run(label, fn)`. All git actions go through `run`: it shows the busy bar, opens an error dialog on failure, and bumps `tick`, which makes `lib/repo.tsx` (`RepoProvider`/`useRepo`) reload summary, refs and status. Do not refetch manually after an action.
- Tabs are `new`, `repo` or `user`; they persist in localStorage. Actions shared by menu, toolbar and shortcuts live in `lib/actions.ts`; shortcuts are in `lib/shortcuts.ts`.
- Screens: `views/` (file-status, history, new-tab, welcome, user, repo-view), `dialogs/index.tsx` (one host switching on `dialog.type`), `components/` (diff-view, sidebar, toolbar, conflict-panel, ui).
- Pure logic that is easy to get wrong: `lib/graph.ts` (commit-graph lanes), `lib/diff.ts` (diff parsing and partial-patch building for hunk and line staging; the reverse flag flips how unselected lines are kept), `lib/conflict.ts` (conflict marker parsing).
- Start flow (`App.tsx` `Gate`): if there is no account and no SSH key and setup was not completed, show the Welcome wizard; otherwise go straight to the tabs.
- `dev-mock.ts` is loaded only in dev with `?mock`; it fakes the Tauri `invoke` layer. Add a handler there when a new command is needed for browser previews.

## Conventions specific to this repo

- Colours are tokens only: defined in `src/global.css` (`:root` light, `.dark` dark, mapped via `@theme inline`). No hardcoded Tailwind colours or hex values in components. Native `select`/inputs are styled globally in `global.css` (WebKitGTK ignores Tailwind colours on native dropdowns).
- Do not define components inside other components' render functions (oxlint `static-components` flags it); use render helper functions or hoist them.
- The title bar is the native one (decided for simplicity); the in-window menu, tab strip and toolbar follow the original.
- Pull requests, blame, interactive rebase, Git LFS screens and OAuth browser sign-in are not built yet.
