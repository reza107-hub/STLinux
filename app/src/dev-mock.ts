// Development preview only (open http://localhost:1420/?mock in a browser).
// Provides fake backend data so the UI can be inspected without the desktop shell.
// This file is only imported when import.meta.env.DEV is true.

const FRESH = new URLSearchParams(location.search).has('fresh')
const T = Math.floor(Date.now() / 1000)
const authors = ['Ava Chen', 'Liam Novak', 'Sofia Reyes', 'Noah Kim']
const subjects = [
  'Add commit graph rendering', 'Fix staging of renamed files', 'Wire up push dialog', 'Refactor diff parser',
  'Improve sidebar filter', 'Update dependencies', 'Handle empty repositories', 'Add Bitbucket Server support',
  'Polish toolbar badges', 'Write tests for hunk staging', 'Fix merge conflict banner', 'Add SSH key detection',
]

function makeCommits() {
  const out = []
  let n = 0
  const sha = (i: number) => (i * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(5)
  for (let i = 0; i < 60; i++) {
    const parents = i === 59 ? [] : [sha(i + 1)]
    // a side branch that merges back every so often
    if (i % 9 === 3 && i + 4 < 59) parents.push(sha(i + 4))
    out.push({
      sha: sha(i),
      parents,
      author: authors[i % authors.length],
      email: 'dev@example.com',
      date: T - i * 7200,
      refs: i === 0 ? ['HEAD -> main', 'origin/main'] : i === 5 ? ['tag: v0.3.0'] : i === 12 ? ['origin/feature/ssh'] : [],
      subject: subjects[n++ % subjects.length],
    })
  }
  return out
}
const COMMITS = makeCommits()

const DIFF = `diff --git a/src/app.ts b/src/app.ts
index 83db48f..bf2a3c1 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,8 +1,10 @@
 import { start } from './start'
+import { log } from './log'

 export function main() {
-  start()
+  log('starting')
+  start({ verbose: true })
 }

 export const VERSION = '1.0.0'
@@ -20,6 +22,7 @@ export function stop() {
   cleanup()
 }

+// added later
 export default main
`

const refs = {
  local: [
    { name: 'main', full: 'refs/heads/main', upstream: 'origin/main', ahead: 2, behind: 1, current: true, sha: COMMITS[0].sha },
    { name: 'develop', full: 'refs/heads/develop', upstream: '', ahead: 0, behind: 0, current: false, sha: COMMITS[3].sha },
    { name: 'feature/ssh', full: 'refs/heads/feature/ssh', upstream: 'origin/feature/ssh', ahead: 0, behind: 0, current: false, sha: COMMITS[12].sha },
  ],
  remote: [
    { name: 'origin/main', full: 'refs/remotes/origin/main', upstream: '', ahead: 0, behind: 0, current: false, sha: COMMITS[0].sha },
    { name: 'origin/feature/ssh', full: 'refs/remotes/origin/feature/ssh', upstream: '', ahead: 0, behind: 0, current: false, sha: COMMITS[12].sha },
  ],
  tags: [{ name: 'v0.3.0', full: 'refs/tags/v0.3.0', upstream: '', ahead: 0, behind: 0, current: false, sha: COMMITS[5].sha }],
  stashes: [{ name: 'stash@{0}', message: 'WIP on main: sidebar', sha: COMMITS[2].sha }],
  remotes: [{ name: 'origin', url: 'git@bitbucket.org:team/stlinux.git' }],
  submodules: [],
}

const files = [
  { path: 'src/merge.ts', orig: null, index: 'U', worktree: 'U', conflicted: true },
  { path: 'src/app.ts', orig: null, index: 'M', worktree: ' ', conflicted: false },
  { path: 'src/components/toolbar.tsx', orig: null, index: ' ', worktree: 'M', conflicted: false },
  { path: 'src/lib/old-name.ts', orig: 'src/lib/legacy.ts', index: 'R', worktree: ' ', conflicted: false },
  { path: 'docs/notes.md', orig: null, index: ' ', worktree: '?', conflicted: false },
  { path: 'src/removed.ts', orig: null, index: ' ', worktree: 'D', conflicted: false },
]

const handlers: Record<string, (a: Record<string, unknown>) => unknown> = {
  check_account: (a) => (String(a.id).includes('server') ? Promise.reject('The server rejected the saved token (HTTP 401). Log in again.') : 'Connected as Ava Chen'),
  startup: () => FRESH ? ({ accounts: [], hiddenKeys: 0, sshKeys: [], agentHasKeys: false }) : ({ accounts: [{ id: 'bitbucket-cloud:ava@example.com', kind: 'bitbucket-cloud', rootUrl: 'https://bitbucket.org', username: 'ava@example.com' }, { id: 'bitbucket-server:x:ava', kind: 'bitbucket-server', rootUrl: 'https://git.example.com', username: 'ava' }], hiddenKeys: 1, sshKeys: [{ name: 'id_ed25519', path: '/home/demo/.ssh/id_ed25519', publicKey: 'ssh-ed25519 AAAA demo', fingerprint: '256 SHA256:abc demo (ED25519)' }], agentHasKeys: true }),
  git_version: () => 'git version 2.53.0',
  open_repo: (a) => ({ path: a.path, name: String(a.path).split('/').pop(), branch: 'main', detached: false }),
  repo_summary: () => ({ branch: 'main', detached: false, pending: files.length, ahead: 2, behind: 1, hasUpstream: true, hasRemote: true, merging: false, rebasing: false }),
  status: () => files,
  refs: () => refs,
  log: (a) => {
    const o = a.opts as { skip: number; query?: string }
    if (o.skip > 0) return []
    return o.query ? COMMITS.filter((c) => c.subject.toLowerCase().includes(String(o.query).toLowerCase())) : COMMITS
  },
  commit_details: (a) => {
    const c = COMMITS.find((x) => x.sha === a.sha) ?? COMMITS[0]
    return { sha: c.sha, parents: c.parents, author: c.author, email: c.email, date: c.date, committer: c.author, committerEmail: c.email, committerDate: c.date, message: `${c.subject}\n\nThis explains the change in a bit more detail so the body\nof the commit message can be checked.` }
  },
  commit_files: () => [
    { status: 'M', path: 'src/app.ts', orig: null },
    { status: 'A', path: 'src/components/new-panel.tsx', orig: null },
    { status: 'D', path: 'src/old.ts', orig: null },
  ],
  commit_diff: () => DIFF,
  working_diff: () => DIFF,
  read_conflict_file: () => `import { a } from './a'\n<<<<<<< HEAD\nconst mode = 'fast'\n=======\nconst mode = 'safe'\n>>>>>>> feature/ssh\n\nexport function run() {\n<<<<<<< HEAD\n  return a(mode)\n||||||| base\n  return a()\n=======\n  return a(mode, true)\n>>>>>>> feature/ssh\n}\n`,
  get_identity: () => ({ name: 'Ava Chen', email: 'ava@example.com' }),
  recent_messages: () => ['Fix staging of renamed files', 'Add commit graph rendering'],
  list_remote_repos: () => [
    { name: 'stlinux', fullName: 'team/stlinux', description: 'A Git client for Linux', httpsUrl: 'https://bitbucket.org/team/stlinux.git', sshUrl: 'git@bitbucket.org:team/stlinux.git', private: true, updated: '' },
  ],
  flow_config: () => ({ initialised: false, master: 'main', develop: 'develop', feature: 'feature/', release: 'release/', hotfix: 'hotfix/', versionTag: '' }),
}

type Internals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  transformCallback: (cb: unknown) => number
  metadata: unknown
}

;(window as unknown as { __TAURI_INTERNALS__: Internals }).__TAURI_INTERNALS__ = {
  invoke: async (cmd, args = {}) => {
    if (cmd === 'plugin:dialog|open') return '/home/demo/projects'
    const h = handlers[cmd]
    return h ? h(args) : ''
  },
  transformCallback: () => 0,
  metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
}

if (FRESH) localStorage.removeItem('stlinux-onboarded')
else localStorage.setItem('stlinux-onboarded', '1')
if (!localStorage.getItem('stlinux-tabs') || new URLSearchParams(location.search).has('reset')) {
  localStorage.setItem(
    'stlinux-tabs',
    JSON.stringify({
      tabs: [
        { id: 'a', kind: 'repo', path: '/home/demo/stlinux', name: 'stlinux' },
        { id: 'b', kind: 'repo', path: '/home/demo/api-server', name: 'api-server' },
      ],
      selectedId: 'a',
    }),
  )
}
