export type RepoInfo = { path: string; name: string; branch: string; detached: boolean }
export type Summary = {
  branch: string
  detached: boolean
  pending: number
  ahead: number
  behind: number
  hasUpstream: boolean
  hasRemote: boolean
  merging: boolean
  rebasing: boolean
}
export type FileEntry = {
  path: string
  orig: string | null
  index: string
  worktree: string
  conflicted: boolean
}
export type Branch = {
  name: string
  full: string
  upstream: string
  ahead: number
  behind: number
  current: boolean
  sha: string
}
export type Stash = { name: string; message: string; sha: string }
export type Remote = { name: string; url: string }
export type Refs = {
  local: Branch[]
  remote: Branch[]
  tags: Branch[]
  stashes: Stash[]
  remotes: Remote[]
  submodules: string[]
}
export type Commit = {
  sha: string
  parents: string[]
  author: string
  email: string
  date: number
  refs: string[]
  subject: string
}
export type CommitDetails = {
  sha: string
  parents: string[]
  author: string
  email: string
  date: number
  committer: string
  committerEmail: string
  committerDate: number
  message: string
}
export type ChangedFile = { status: string; path: string; orig: string | null }
export type LogOpts = {
  limit: number
  skip: number
  all: boolean
  branches: string[]
  topo: boolean
  searchKind?: string | null
  query?: string | null
}
export type CommitOpts = {
  message: string
  amend: boolean
  noVerify: boolean
  signoff: boolean
  author?: string | null
}
export type PushOpts = {
  remote: string
  branch: string
  remoteBranch?: string | null
  tags: boolean
  setUpstream: boolean
  force: boolean
}
export type Account = { id: string; kind: string; rootUrl: string; username: string }
export type SshKey = { name: string; path: string; publicKey: string; fingerprint: string }
export type Startup = { accounts: Account[]; sshKeys: SshKey[]; hiddenKeys: number; agentHasKeys: boolean }
export type RemoteRepo = {
  name: string
  fullName: string
  description: string
  httpsUrl: string
  sshUrl: string
  private: boolean
  updated: string
}
export type FlowConfig = {
  initialised: boolean
  master: string
  develop: string
  feature: string
  release: string
  hotfix: string
  versionTag: string
}
export type Identity = { name: string; email: string }
