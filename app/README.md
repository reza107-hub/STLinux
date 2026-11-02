# STLinux

A Git client for Linux with a layout inspired by Sourcetree. Dark theme by default, light theme available.
Built with Tauri 2 (Rust), React, TypeScript and Tailwind. It uses your system `git` and OpenSSH.

STLinux is an independent project. It is not affiliated with or endorsed by Atlassian.

## Features

- Repository tabs (drag to reorder, close, close others), recent repositories list
- File Status: staged and unstaged lists, stage by file, by hunk or by line, discard, ignore, commit box with amend, sign-off, bypass hooks, alternative author, message history
- History: commit graph, branch and author filters, jump to branch or tag, commit details and diffs
- Search: commit message, author, changed text (pickaxe) and file path
- Branches, tags, remotes, stashes and submodules in the sidebar, with right-click actions
- Fetch, pull (merge or rebase), push (track, tags, force with lease)
- Merge, rebase, cherry-pick, reverse commit, reset, tag, stash, Git Flow
- Merge conflicts: banner, conflicted file status, abort
- Clone from URL, browse and clone from Bitbucket Cloud and Bitbucket Server, SSH keys (detect, create, test)
- Keyboard shortcuts that follow the original app (Ctrl+1/2/3, Ctrl+Shift+L/P/F/S, F5, Ctrl+N/O/W)

## Requirements

- Ubuntu 22.04 or newer (or any Linux with WebKitGTK 4.1)
- `git` and `openssh-client`

## Develop

```
sudo apt install build-essential libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev libssl-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
pnpm install
pnpm tauri dev
```

`pnpm dev` alone serves the interface in a browser. Add `?mock` to the URL to use fake data
(development builds only), and `&fresh` to see the first-run wizard.

## Test

```
cd src-tauri && cargo test
```

The tests create temporary Git repositories and exercise the Git engine.

## Build packages

```
pnpm tauri build
```

Packages are written to `src-tauri/target/release/bundle/` (`.deb` and AppImage).

## Accounts and security

- Bitbucket Cloud: your Atlassian email and an API token. Bitbucket Server: root URL, username and a personal access token.
- Tokens are stored in `~/.config/stlinux/accounts.json` with file mode 0600. They are not kept in the OS keyring yet.
- Tokens are sent only to the matching host, as a header scoped to that host, for Git over HTTPS. They are never written into a repository's config.
- SSH uses your normal keys and `ssh-agent`. Keys with a passphrase must be loaded with `ssh-add` first, because STLinux runs SSH in batch mode.

## Known limits

- Bitbucket sign-in uses tokens, not the browser OAuth flow (that needs a registered OAuth consumer).
- No interactive rebase editor, blame view, visual merge tool, Git LFS screens or pull request screens yet.
- Mercurial is not supported.
