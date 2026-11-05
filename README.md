# STLinux: Sourcetree for Linux (free, open-source Git GUI)

**STLinux is an open-source Git client for Linux (Ubuntu and Debian) that looks and works like Atlassian Sourcetree.** Atlassian has never released Sourcetree for Linux. STLinux fills that gap with a native desktop app built on Tauri, Rust and React.

If you searched for *"Sourcetree for Linux"*, *"Sourcetree alternative for Ubuntu"* or *"Git GUI for Linux like Sourcetree"*, this project is for you.

> **Not affiliated with Atlassian.** STLinux is an independent, community project. "Sourcetree" and "Bitbucket" are trademarks of Atlassian. They are used here only to describe what this app is similar to. No Atlassian code, icons, logos or brand text are included.

## How it was made

STLinux was built by **reverse engineering Sourcetree 3.4.32 (Windows build) using Reverse Engineer Anything (REA)**. The shipped screens were decoded into text outlines, and the layout, sizes, shortcuts and labels were rebuilt from that analysis. The code itself is a fresh, original implementation. Only the UI structure was studied, and nothing was copied.

## Open source

STLinux is free and open source under the [MIT License](LICENSE). You can use it, change it and share it. Pull requests are welcome.

## Features

- **Git only.** Every action runs the system `git`, so it behaves like the command line.
- **Tabs** for several repositories, with a Sourcetree-style menu and toolbar.
- **File status:** stage and unstage files, hunks and single lines. Commit and amend.
- **History:** commit graph, search by message, author, content or file, and a multi-select branch filter that includes remote branches.
- **Branches and more:** checkout, branch, merge, rebase, cherry-pick, reset, tags, stash, fetch, pull and push.
- **Conflict resolution** panel for merges.
- **Bitbucket Cloud and Bitbucket Server** accounts, plus **SSH key** management. Secrets are stored in the system keyring.
- **Dark theme by default**, with a light theme toggle.

**Not built yet:** pull requests, blame, interactive rebase, Git LFS screens and OAuth browser sign-in.

## Install (Ubuntu / Debian)

Build the `.deb` package (see below), then:

```bash
sudo dpkg -i dist/stlinux_*_amd64.deb
```

To update, build the new package and run the same command. Your settings in `~/.config/stlinux/` are kept.

## Build from source

You need `git`, [Node.js](https://nodejs.org), [pnpm](https://pnpm.io), [Rust](https://rustup.rs) and the [Tauri Linux prerequisites](https://tauri.app/start/prerequisites/#linux).

```bash
cd app
pnpm install
pnpm tauri dev        # run the app in development
pnpm build            # type check and bundle the front end
pnpm package:deb      # build the .deb into ../dist/
```

Run the Rust tests from `app/src-tauri/` with `cargo test`.

## Project layout

| Folder | What it holds |
|---|---|
| `app/` | The application: Tauri 2, Rust backend and React/TypeScript front end |
| `docs/ui-spec.md` | UI spec: sizes, shortcuts and dark colour tokens |

## Keywords

Sourcetree for Linux, Sourcetree Ubuntu, Sourcetree alternative Linux, Git GUI Linux, Git client Ubuntu, open source Git GUI, Bitbucket client Linux, Tauri Git client.
