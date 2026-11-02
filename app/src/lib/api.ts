import { invoke } from '@tauri-apps/api/core'
import type {
  Account, ChangedFile, Commit, CommitDetails, CommitOpts, FileEntry, FlowConfig,
  Identity, LogOpts, PushOpts, Refs, RemoteRepo, RepoInfo, SshKey, Startup, Summary,
} from './types'

export const inTauri = () => '__TAURI_INTERNALS__' in window

const p = (path: string) => ({ path })

export const api = {
  startup: () => invoke<Startup>('startup'),
  addAccount: (kind: string, rootUrl: string, username: string, secret: string) =>
    invoke<Account>('add_account', { kind, rootUrl, username, secret }),
  removeAccount: (id: string) => invoke<void>('remove_account', { id }),
  listRemoteRepos: (accountId: string) => invoke<RemoteRepo[]>('list_remote_repos', { accountId }),
  sshGenerate: (name: string, comment: string, passphrase: string) =>
    invoke<SshKey>('ssh_generate', { name, comment, passphrase }),
  sshTest: (host: string) => invoke<string>('ssh_test', { host }),
  sshForget: (path: string) => invoke<void>('ssh_forget', { path }),
  sshRestoreHidden: () => invoke<void>('ssh_restore_hidden'),
  sshDelete: (path: string) => invoke<void>('ssh_delete', { path }),
  checkAccount: (id: string) => invoke<string>('check_account', { id }),

  gitVersion: () => invoke<string>('git_version'),
  openRepo: (path: string) => invoke<RepoInfo>('open_repo', p(path)),
  initRepo: (path: string) => invoke<RepoInfo>('init_repo', p(path)),
  cloneRepo: (url: string, dest: string) => invoke<string>('clone_repo', { url, dest }),
  summary: (path: string) => invoke<Summary>('repo_summary', p(path)),
  status: (path: string) => invoke<FileEntry[]>('status', p(path)),
  refs: (path: string) => invoke<Refs>('refs', p(path)),
  log: (path: string, opts: LogOpts) => invoke<Commit[]>('log', { path, opts }),
  commitDetails: (path: string, sha: string) => invoke<CommitDetails>('commit_details', { path, sha }),
  commitFiles: (path: string, sha: string) => invoke<ChangedFile[]>('commit_files', { path, sha }),
  commitDiff: (path: string, sha: string, file: string) =>
    invoke<string>('commit_diff', { path, sha, file }),
  workingDiff: (path: string, file: string, staged: boolean, untracked: boolean) =>
    invoke<string>('working_diff', { path, file, staged, untracked }),
  recentMessages: (path: string) => invoke<string[]>('recent_messages', p(path)),

  stage: (path: string, files: string[]) => invoke<void>('stage', { path, files }),
  unstage: (path: string, files: string[]) => invoke<void>('unstage', { path, files }),
  discard: (path: string, files: string[]) => invoke<void>('discard', { path, files }),
  applyPatch: (path: string, patch: string, cached: boolean, reverse: boolean) =>
    invoke<void>('apply_patch', { path, patch, cached, reverse }),
  commit: (path: string, opts: CommitOpts) => invoke<string>('commit', { path, opts }),

  fetch: (path: string) => invoke<string>('fetch', p(path)),
  pull: (path: string, remote: string | null, branch: string | null, rebase: boolean) =>
    invoke<string>('pull', { path, remote, branch, rebase }),
  push: (path: string, opts: PushOpts) => invoke<string>('push', { path, opts }),

  checkout: (path: string, target: string, trackRemote: boolean) =>
    invoke<string>('checkout', { path, target, trackRemote }),
  createBranch: (path: string, name: string, start: string | null, checkout: boolean) =>
    invoke<string>('create_branch', { path, name, start, checkout }),
  deleteBranch: (path: string, name: string, force: boolean, remote: string | null) =>
    invoke<string>('delete_branch', { path, name, force, remote }),
  merge: (path: string, target: string, noFf: boolean) => invoke<string>('merge', { path, target, noFf }),
  abortOperation: (path: string) => invoke<string>('abort_operation', p(path)),
  rebase: (path: string, onto: string) => invoke<string>('rebase', { path, onto }),
  cherryPick: (path: string, sha: string) => invoke<string>('cherry_pick', { path, sha }),
  revertCommit: (path: string, sha: string) => invoke<string>('revert_commit', { path, sha }),
  reset: (path: string, target: string, mode: string) => invoke<string>('reset', { path, target, mode }),
  tagCreate: (path: string, name: string, sha: string | null, message: string | null) =>
    invoke<string>('tag_create', { path, name, sha, message }),
  tagDelete: (path: string, name: string, remote: string | null) =>
    invoke<string>('tag_delete', { path, name, remote }),
  remoteAdd: (path: string, name: string, url: string) => invoke<void>('remote_add', { path, name, url }),
  remoteRemove: (path: string, name: string) => invoke<void>('remote_remove', { path, name }),

  stashSave: (path: string, message: string, includeUntracked: boolean) =>
    invoke<string>('stash_save', { path, message, includeUntracked }),
  stashAction: (path: string, name: string, action: 'apply' | 'pop' | 'drop') =>
    invoke<string>('stash_action', { path, name, action }),

  flowConfig: (path: string) => invoke<FlowConfig>('flow_config', p(path)),
  flowInit: (path: string, cfg: Omit<FlowConfig, 'initialised'>) => invoke<void>('flow_init', { path, cfg }),
  flowStart: (path: string, kind: string, name: string) => invoke<string>('flow_start', { path, kind, name }),
  flowFinish: (path: string, kind: string, name: string, tagMessage: string | null) =>
    invoke<string>('flow_finish', { path, kind, name, tagMessage }),

  readConflictFile: (path: string, file: string) => invoke<string>('read_conflict_file', { path, file }),
  resolveConflict: (path: string, file: string, mode: 'ours' | 'theirs' | 'content', content: string | null) =>
    invoke<void>('resolve_conflict', { path, file, mode, content }),
  ignoreAdd: (path: string, pattern: string) => invoke<void>('ignore_add', { path, pattern }),
  getIdentity: (path: string | null) => invoke<Identity>('get_identity', { path }),
  setIdentity: (name: string, email: string) => invoke<void>('set_identity', { name, email }),
  openTerminal: (path: string) => invoke<void>('open_terminal', p(path)),
  openInFiles: (path: string) => invoke<void>('open_in_files', p(path)),
}
