# STLinux UI Spec (from SourceTree 3.4.32, dark mode first)

Source: decoded layouts in `reference/decoded-layouts/`. Sizes are in WPF device-independent pixels (1 dip = 1 CSS px).
Labels are in `reference/decoded-layouts/labels.json` (1157 English strings).
Observed = read directly from the shipped layout files. Design = our choice, not in the original.

## 1. Rules for the build

- Tauri 2 + React + TypeScript + Tailwind. Server-first where possible (global rules apply).
- No hardcoded colours. All colours are tokens in `global.css` (`@theme inline`, `:root` for light, `.dark` for dark). Dark is the default.
- Icons: Lucide only. Do not copy Atlassian PNGs. Map each original icon slot to a Lucide icon (section 9).
- Do not reuse Atlassian logos, names or strings that are brand text. Use STLinux name and logo.

## 2. Window shell (Observed)

| Item | Value |
|---|---|
| Window title | "STLinux" (original: "Sourcetree") |
| Min size | 600 x 518 |
| Chrome | Custom title bar, 29px high, replaces the system bar |
| Title bar content | Logo 20x20 at left margin 8, then main menu at left margin 36 |
| Below title bar | Repo tab strip, then the repo panel |
| Right panel | Bookmarks sidebar: 350 wide (min 200, max 700), 4px splitter, toggled open/closed |
| Splitter | 4px, 1px left border, soft shadow (opacity 0.07) |

## 3. Main menu (Observed commands)

Menu command set (from the window command table): Clone/New, Open, Close Tab, Next/Prev Tab, Refresh, Preferences, Repository Settings, Commit All/Selected, Stash, Discard, Push, Pull, Fetch, Checkout, Branch, Merge, Rebase, Interactive Rebase, Cherry-pick, Reverse commit, Reset, Tag, Archive, Create/Apply Patch, Blame, Log Selected, External Diff, Add/Remove, Ignore, Add Submodule, Git Flow (init, start/finish feature, release, hotfix), Git LFS (init, tracking, pull, fetch, checkout, prune), Abort Merge, Continue/Abort Rebase, Open in Explorer (use "Open in file manager" on Linux), About, Release Notes.

## 3a. Keyboard shortcuts (Observed)

| Keys | Action |
|---|---|
| Ctrl+N | Clone / new repo |
| Ctrl+O | Open repo |
| Ctrl+W | Close tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab (original has these two mixed; use standard order) |
| F5 | Refresh |
| Ctrl+1 / Ctrl+2 / Ctrl+3 | File Status / History / Search |
| Ctrl+, | Preferences |
| Ctrl+Shift+, | Repository settings |
| Alt+Shift+R | Refresh remote status |
| Ctrl+Shift+C | Commit all |
| Alt+Shift+C | Commit selected |
| Ctrl+Shift+S | Stash |
| Ctrl+Shift+R | Discard selected |
| Ctrl+Shift+D | Draft commit |
| Ctrl+Shift+P | Push |
| Ctrl+Shift+L | Pull |
| Ctrl+Shift+F | Fetch |
| Ctrl+Shift+U | Checkout |
| Ctrl+D | External diff (history context menu) |

Linux note: Ctrl+Shift+C and Ctrl+Shift+P can clash with the terminal and desktop. Make all shortcuts rebindable.

## 4. Repo tab strip (Observed)

- Draggable, re-orderable tabs. Adjacent tab offset 3px.
- Strip has a 1px top border. Background uses the surface token.
- Each tab has a close button. It shows on hover and on the selected tab.
- Tab context menu: Close Tab, Close All Tabs, Close All But This.
- Tab states: static, hover, selected. Selected tab merges into the content (its bottom border is hidden).

## 5. Toolbar (Observed)

Order, left to right (separators marked `|`):

`Commit | Pull, Push, Fetch | Branch, Merge | Stash | Discard, Tag, Git Flow, (View remote), Terminal, File manager, Settings`

| Item | Value |
|---|---|
| Button | min width 48, icon above label |
| Icon | 32 x 32, dark and light variants |
| Label | margin 3,0, centred |
| Separator | margin 12,0,12,0 |
| Badge | min width 20, padding 3,0, radius 5, 1px border, text 10 semibold, white on accent |
| Badge on Commit | count of modified files (hidden when 0) |
| Badge on Pull | incoming commit count (hidden when 0) |
| Badge on Push | outgoing commit count (hidden when 0) |
| Overflow | Fetch, Branch, Merge, Stash, Discard, Tag collapse into an overflow menu as needed |
| Tooltips | Bold label + "(Ctrl+1)" on Commit, plus the pending file count |

Labels: Commit, Pull, Push, Fetch, Branch, Merge, Stash, Discard, Tag, Git Flow, Remote, Terminal, Explorer, Settings.

## 6. Left sidebar (Observed)

- Panel margin 9,0,17,0. Top 12px row, with a 4px progress bar shown while refreshing.
- Header: workspace icon 20 x 18 (left margin 20), then workspace name in UPPERCASE, Segoe UI SemiBold 12.5, bold, height 16, padding-left 4. Use a Linux font (Inter or system UI semibold).
- Three radio rows, left margin of text 45, group name = repo name:
  - File Status (Ctrl+1), shows pending file count
  - History (Ctrl+2)
  - Search (Ctrl+3)
- Separator.
- Filter box, margin 10,5,20,0. Placeholder: "Type here to filter the list of BRANCHES, TAGS, REMOTES, SUBMODULES and SUBTREES". Updates 700 ms after typing stops.
- Virtualised tree below it: padding 8,0,8,12, no border, no background. Sections: Branches, Tags, Remotes, Stashes, Submodules, Subtrees. Each node has a name and an annotation badge (ahead/behind counts). Selected row uses the tree-selected token. Expand state is saved.

## 7. History view (Observed)

Layout rows: scope bar 26, log list (*), 1px, detail pane (*), with a draggable splitter (4px hit area).

Scope bar (height 26, margin 2,0,2,0):
- Left: branch filter combo, "Show Remote Branches" checkbox, order combo (Date Order, Ancestor Order).
- Right: author filter box (width 150, margin 10,2,20,2, placeholder "Author Name"), then "Jump to:" toggle that opens a 200px popup (max height 250) with "Commit..." and a list of jump targets.

Log columns:

| Column | Width | Notes |
|---|---|---|
| Graph | 80 (min 50) | Commit graph cell |
| Description | flexible (min 50) | 9x9 circle marker for current branch (margin right 6), label chips, first line of message. Tooltip shows labels and message. |
| Modified files | auto | Optional column |
| Date | 115 (min 50) | Format "d MMM yyyy H:mm" |
| Author | 110 (min 50) | |
| Commit | min 60 | Short SHA |

- Busy bar (height 28) with a 16px spinner and a Cancel button appears while a commit is loading.
- Row context menu: Checkout, Merge..., Rebase..., Tag..., Archive..., Branch..., Interactive rebase from here, Reset to commit, Reverse commit..., Create Patch..., Cherry-pick, Copy SHA to Clipboard, External Diff (Ctrl+D), Custom Actions.
- Multi-select is allowed when more than one commit is selected for actions.

## 8. File Status view (Observed)

Rows: changes area (*, min 100), splitter, commit box (128 high, max 300).

Changes area (grid, 29px scope bar + content):
- Scope bar: select-all checkbox (margin 5,0,4,0), filter combo ("Show only" list, "Sort by" list), file list view mode combo (flat, tree, etc.), "(N/M files)" counter in semibold, search box (min width 250, margin 4,0).
- Columns: file list (*, min 32), 1px divider with a 9px hit-area splitter, diff panel (*, min 100).
- Empty state: two decorative arrow images at the bottom (308x212 left, 280x234 right). We will draw our own.
- Loading: 32x32 spinner centred.

Commit box (padding 10):
- Left column 30 wide: author avatar 25x25. Click opens a popup (min width 300): "Use default author" (shows name and email with an edit button 19x15) or "Use alternative author" (Name and Email fields). OK button (primary).
- Top line: author description at left. At right: previous-messages history combo (width 29, clock icon 14x14) and "Commit options..." combo.
- Commit options: Amend latest commit, Bypass commit hooks, Sign off, Create Pull Request.
- Message box: min height 25, padding 2, wraps, spell check, guide line.
- Bottom row (margin top 5): "Push changes immediately to origin" checkbox, "Amend latest commit" checkbox (margin left 30), then the Commit button at right (secondary style, enabled only when valid).

## 9. Diff panel

Decoded file: `decoded-layouts/SourceTree.Api.UI.Wpf/view__repo__diffviewpanel.txt` (not yet transcribed here). Transcribe when building the diff screen. Needed modes: unified, side by side, hunk and line stage/unstage/discard, blame, whitespace options.

## 10. Welcome and sign-in (Observed layout, flow is our choice)

Original wizard: 720 x 440, left panel 220 wide in accent colour, margin 20,4,20,20, logo at top, step list with circle/check icons (steps: Install, Account, Preferences). Right content margin 28, bottom button row 40 high with Skip and Next (padding 16,0,16,0).

Account step: heading, paragraph, host picker (icons 50x50, name 14 semibold), "Login to X" progress with a 6px bar, optional Root URL and Username fields for server hosts, Back and Login buttons (min width 96), success page with a medal image and "You are logged in as email".

STLinux start flow (decided with user):
1. On first launch, look for SSH keys in `~/.ssh` (id_ed25519, id_rsa, id_ecdsa) and a running `ssh-agent`.
2. If no account and no key: show the wizard (Bitbucket Cloud, Bitbucket Server, SSH key). No forced registration.
3. If signed in or a key is attached: go straight to the repo tabs.
4. Bitbucket Cloud: OAuth 2.0 in the system browser, or an API token. Bitbucket Server: root URL plus username and a personal access token. SSH: pick or generate a key, show the public key to copy.

## 11. Dark theme tokens (Design)

Original light values (Observed): white `#FFFFFF`, blue `#0052CC`, navy text `#172B4D`, red `#DE350B`, yellow `#FFAB00`, green `#00875A`, cyan `#00A3BF`, light grey `#F0F0F0`, mid grey `#808080`, border grey `#CCCCCC`, badge text white. Original has no dark colour set (only dark icons), so the dark column below is our design.

| Token | Light | Dark |
|---|---|---|
| `--background` | `#FFFFFF` | `#1D2125` |
| `--surface` (panels, tab strip) | `#F4F5F7` | `#22272B` |
| `--surface-raised` (menus, popups) | `#FFFFFF` | `#2C333A` |
| `--titlebar` | `#0052CC` | `#161A1D` |
| `--border` | `#CCCCCC` | `#38414A` |
| `--splitter` | `#D6D6D6` | `#454F59` |
| `--foreground` | `#172B4D` | `#B6C2CF` |
| `--foreground-strong` | `#0C0C0C` | `#DEE4EA` |
| `--muted` | `#808080` | `#8C9BAB` |
| `--primary` (accent, badges, selection) | `#0052CC` | `#579DFF` |
| `--primary-foreground` | `#FFFFFF` | `#101214` |
| `--selection` (tree and log row) | `#DEEBFF` | `#1C2B41` |
| `--hover` | `#EBECF0` | `#2C333A` |
| `--success` | `#00875A` | `#4BCE97` |
| `--danger` | `#DE350B` | `#F87168` |
| `--warning` | `#FFAB00` | `#E2B203` |
| `--info` | `#00A3BF` | `#60C6D2` |
| `--diff-add-bg` | `#E3FCEF` | `#1C3329` |
| `--diff-remove-bg` | `#FFEBE5` | `#42221F` |
| `--diff-hunk-bg` | `#DEEBFF` | `#1C2B41` |

Check contrast (WCAG AA 4.5:1 for text) before finalising.

## 12. Icon slots to map to Lucide

Toolbar: commit, pull, push, fetch, branch, merge, stash, discard, tag, git flow, remote, terminal, folder, settings, refresh.
Sidebar: workspace, branches, tags, remotes, stashes, submodules, subtrees, expand/collapse.
File status: added, modified, deleted, renamed, conflicted, unknown, ignored.
Log: arrow up/down (ahead/behind), tag chip, bookmark chip.
General: close, search, clock, ellipsis, lock, cross, plus.

## 13. Still to decode when building

Preferences (General, Git, Diff, Network, Authentication, Custom Actions), Clone / New tab view, Bookmarks, dialogs (push, pull, fetch, branch, checkout, merge, tag, discard, reset, archive, patch, submodule, LFS, Git Flow, interactive rebase, remote details, repo settings), blame and file log windows, visual merge window, About, Check for updates. All decoded already in `reference/decoded-layouts/`.
