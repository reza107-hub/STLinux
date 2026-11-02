import { useEffect, useState, type ReactNode } from 'react'
import { AccountForm, AccountsList, HOSTS, SshPanel } from '../components/accounts'
import { Button, Check, Field, Modal, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { errText } from '../lib/format'
import { useApp } from '../lib/store'
import type { FileEntry, FlowConfig, Identity, Refs } from '../lib/types'

type P = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function useRefs(path: string) {
  const [refs, setRefs] = useState<Refs | null>(null)
  useEffect(() => {
    let live = true
    void api.refs(path).then((r) => live && setRefs(r)).catch(() => undefined)
    return () => {
      live = false
    }
  }, [path])
  return refs
}

/** Common shell: runs `fn`, closes on success. */
function useSubmit(label: string, fn: () => Promise<string | void>) {
  const app = useApp()
  return async () => {
    app.closeDialog()
    await app.run(label, fn)
  }
}

function Form({ title, label, submitLabel, disabled, onSubmit, children, danger, width }: {
  title: string
  label?: string
  submitLabel: string
  disabled?: boolean
  onSubmit: () => void
  children: ReactNode
  danger?: boolean
  width?: number
}) {
  const app = useApp()
  void label
  return (
    <Modal
      title={title}
      width={width}
      onClose={app.closeDialog}
      footer={
        <>
          <Button onClick={app.closeDialog}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={disabled} onClick={onSubmit}>{submitLabel}</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (!disabled) onSubmit() }}>{children}</form>
    </Modal>
  )
}

// ---------------------------------------------------------------- simple dialogs

function ErrorDialog({ p }: { p: P }) {
  const app = useApp()
  return (
    <Modal title={str(p.title) || 'Error'} width={560} onClose={app.closeDialog} footer={<Button variant="primary" onClick={app.closeDialog}>OK</Button>}>
      <pre role="alert" className="selectable max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-foreground-strong">{str(p.text)}</pre>
    </Modal>
  )
}

function AboutDialog() {
  const app = useApp()
  return (
    <Modal title="About STLinux" onClose={app.closeDialog} footer={<Button variant="primary" onClick={app.closeDialog}>Close</Button>}>
      <h3 className="mb-1 text-base font-semibold text-foreground-strong">STLinux 0.1.0</h3>
      <p className="mb-2">A Git client for Linux, with a layout inspired by Sourcetree.</p>
      <p className="text-muted">STLinux is an independent project. It is not affiliated with or endorsed by Atlassian. It uses your system Git and OpenSSH.</p>
    </Modal>
  )
}

type Action =
  | { kind: 'delete-branch'; path: string; name: string }
  | { kind: 'delete-remote-branch'; path: string; remote: string; branch: string }
  | { kind: 'delete-tag'; path: string; name: string }
  | { kind: 'drop-stash'; path: string; name: string }
  | { kind: 'checkout'; path: string; target: string }
  | { kind: 'revert'; path: string; sha: string }
  | { kind: 'remove-account'; id: string }
  | { kind: 'forget-key'; path: string }
  | { kind: 'delete-key'; path: string }

function ConfirmDialog({ p }: { p: P }) {
  const app = useApp()
  const a = p.action as Action
  // After a connection is removed: refresh, and if nothing is left show the welcome screen next time.
  const afterRemoval = async () => {
    await app.reloadStartup()
    const fresh = await api.startup()
    if (fresh.accounts.length === 0 && fresh.sshKeys.length === 0) {
      localStorage.removeItem('stlinux-onboarded')
      app.notify('ok', 'No connections left. The welcome screen will show next time, or use "Run the setup again" in the User tab.')
    }
    return 'Removed'
  }
  const go = async () => {
    app.closeDialog()
    switch (a.kind) {
      case 'delete-branch':
        return void app.run('Delete branch', () => api.deleteBranch(a.path, a.name, true, null))
      case 'delete-remote-branch':
        return void app.run('Delete remote branch', () => api.deleteBranch(a.path, a.branch, false, a.remote))
      case 'delete-tag':
        return void app.run('Delete tag', () => api.tagDelete(a.path, a.name, null))
      case 'drop-stash':
        return void app.run('Delete stash', () => api.stashAction(a.path, a.name, 'drop'))
      case 'checkout':
        return void app.run('Checkout', () => api.checkout(a.path, a.target, false))
      case 'revert':
        return void app.run('Reverse commit', () => api.revertCommit(a.path, a.sha))
      case 'remove-account':
        return void app.run('Remove connection', async () => api.removeAccount(a.id).then(async () => { await afterRemoval() }))
      case 'forget-key':
        return void app.run('Remove connection', async () => api.sshForget(a.path).then(async () => { await afterRemoval() }))
      case 'delete-key':
        return void app.run('Delete key files', async () => api.sshDelete(a.path).then(async () => { await afterRemoval() }))
    }
  }
  return (
    <Modal
      title={str(p.title)}
      onClose={app.closeDialog}
      footer={
        <>
          <Button onClick={app.closeDialog}>Cancel</Button>
          <Button variant={p.danger ? 'danger' : 'primary'} onClick={() => void go()}>{str(p.confirm) || 'OK'}</Button>
        </>
      }
    >
      <p className="whitespace-pre-wrap">{str(p.text)}</p>
    </Modal>
  )
}

// ---------------------------------------------------------------- git dialogs

function BranchDialog({ p }: { p: P }) {
  const path = str(p.path)
  const [name, setName] = useState('')
  const [start, setStart] = useState(str(p.start))
  const [checkout, setCheckout] = useState(true)
  const submit = useSubmit('Create branch', () => api.createBranch(path, name.trim(), start.trim() || null, checkout))
  return (
    <Form title="New branch" submitLabel="Create branch" disabled={!name.trim()} onSubmit={() => void submit()}>
      <Field label="Branch name"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Start from" hint="Leave empty to start from the current commit. A branch, tag or commit id works."><input className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Check checked={checkout} onChange={setCheckout}>Check out the new branch</Check>
    </Form>
  )
}

function MergeDialog({ p }: { p: P }) {
  const path = str(p.path)
  const refs = useRefs(path)
  const [target, setTarget] = useState('')
  const [noFf, setNoFf] = useState(false)
  const options = [...(refs?.local ?? []).filter((b) => !b.current), ...(refs?.remote ?? [])]
  const submit = useSubmit('Merge', () => api.merge(path, target, noFf))
  return (
    <Form title="Merge" submitLabel="Merge" disabled={!target} onSubmit={() => void submit()}>
      <Field label="Merge into the current branch from">
        <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose a branch</option>
          {options.map((b) => (<option key={b.full} value={b.name}>{b.name}</option>))}
        </select>
      </Field>
      <Check checked={noFf} onChange={setNoFf}>Always create a merge commit (no fast-forward)</Check>
    </Form>
  )
}

function PullDialog({ p }: { p: P }) {
  const path = str(p.path)
  const refs = useRefs(path)
  const [remote, setRemote] = useState('')
  const [branch, setBranch] = useState('')
  const [rebase, setRebase] = useState(false)
  const remotes = refs?.remotes ?? []
  const current = refs?.local.find((b) => b.current)
  useEffect(() => {
    if (!refs) return
    const upstream = current?.upstream.split('/')[0]
    setRemote(upstream || refs.remotes[0]?.name || '')
    setBranch(current?.name ?? '')
  }, [refs, current?.upstream, current?.name])
  const remoteBranches = (refs?.remote ?? []).filter((b) => b.name.startsWith(remote + '/')).map((b) => b.name.slice(remote.length + 1))
  const submit = useSubmit('Pull', () => api.pull(path, remote || null, remote ? branch || null : null, rebase))
  return (
    <Form title="Pull" submitLabel="Pull" disabled={remotes.length === 0} onSubmit={() => void submit()}>
      {remotes.length === 0 ? (
        <p className="text-muted">This repository has no remote. Add one in Repository settings.</p>
      ) : (
        <>
          <Field label="Pull from remote">
            <select className={inputCls} value={remote} onChange={(e) => setRemote(e.target.value)}>
              {remotes.map((r) => (<option key={r.name} value={r.name}>{r.name} ({r.url})</option>))}
            </select>
          </Field>
          <Field label="Remote branch to pull">
            <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
              {remoteBranches.map((b) => (<option key={b} value={b}>{b}</option>))}
              {branch && !remoteBranches.includes(branch) && <option value={branch}>{branch}</option>}
            </select>
          </Field>
          <Check checked={rebase} onChange={setRebase}>Rebase instead of merge</Check>
        </>
      )}
    </Form>
  )
}

function PushDialog({ p }: { p: P }) {
  const path = str(p.path)
  const refs = useRefs(path)
  const [remote, setRemote] = useState('')
  const [branch, setBranch] = useState('')
  const [remoteBranch, setRemoteBranch] = useState('')
  const [tags, setTags] = useState(false)
  const [track, setTrack] = useState(true)
  const [force, setForce] = useState(false)
  const remotes = refs?.remotes ?? []
  useEffect(() => {
    if (!refs) return
    const cur = refs.local.find((b) => b.current)
    setBranch(cur?.name ?? '')
    setRemoteBranch(cur?.upstream ? cur.upstream.split('/').slice(1).join('/') : (cur?.name ?? ''))
    setRemote(cur?.upstream.split('/')[0] || refs.remotes.find((r) => r.name === 'origin')?.name || refs.remotes[0]?.name || '')
    setTrack(!cur?.upstream)
  }, [refs])
  const submit = useSubmit('Push', () => api.push(path, { remote, branch, remoteBranch: remoteBranch || null, tags, setUpstream: track, force }))
  return (
    <Form title="Push" submitLabel="Push" disabled={!remote || !branch} onSubmit={() => void submit()}>
      {remotes.length === 0 ? (
        <p className="text-muted">This repository has no remote. Add one in Repository settings.</p>
      ) : (
        <>
          <Field label="Push to remote">
            <select className={inputCls} value={remote} onChange={(e) => setRemote(e.target.value)}>
              {remotes.map((r) => (<option key={r.name} value={r.name}>{r.name} ({r.url})</option>))}
            </select>
          </Field>
          <Field label="Local branch to push">
            <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
              {(refs?.local ?? []).map((b) => (<option key={b.full} value={b.name}>{b.name}</option>))}
            </select>
          </Field>
          <Field label="Remote branch name"><input className={inputCls} value={remoteBranch} onChange={(e) => setRemoteBranch(e.target.value)} /></Field>
          <div className="space-y-1.5">
            <Check checked={track} onChange={setTrack}>Track the remote branch</Check>
            <Check checked={tags} onChange={setTags}>Push all tags</Check>
            <Check checked={force} onChange={setForce}>Force push (with lease, safer)</Check>
          </div>
        </>
      )}
    </Form>
  )
}

function StashDialog({ p }: { p: P }) {
  const path = str(p.path)
  const [msg, setMsg] = useState('')
  const [untracked, setUntracked] = useState(true)
  const submit = useSubmit('Stash', () => api.stashSave(path, msg, untracked))
  return (
    <Form title="Stash changes" submitLabel="Stash" onSubmit={() => void submit()}>
      <Field label="Message (optional)"><input autoFocus className={inputCls} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
      <Check checked={untracked} onChange={setUntracked}>Include untracked files</Check>
    </Form>
  )
}

function TagDialog({ p }: { p: P }) {
  const path = str(p.path)
  const [name, setName] = useState('')
  const [sha, setSha] = useState(str(p.sha))
  const [msg, setMsg] = useState('')
  const submit = useSubmit('Create tag', () => api.tagCreate(path, name.trim(), sha.trim() || null, msg || null))
  return (
    <Form title="Add tag" submitLabel="Add tag" disabled={!name.trim()} onSubmit={() => void submit()}>
      <Field label="Tag name"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Commit" hint="Leave empty to tag the current commit."><input className={inputCls} value={sha} onChange={(e) => setSha(e.target.value)} /></Field>
      <Field label="Message (makes it an annotated tag)"><input className={inputCls} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
    </Form>
  )
}

function ResetDialog({ p }: { p: P }) {
  const path = str(p.path)
  const sha = str(p.sha)
  const [mode, setMode] = useState('mixed')
  const submit = useSubmit('Reset', () => api.reset(path, sha, mode))
  return (
    <Form title="Reset current branch" submitLabel="Reset" danger={mode === 'hard'} onSubmit={() => void submit()}>
      <p className="mb-3">Move the current branch to <span className="font-mono">{sha.slice(0, 7)}</span>.</p>
      {[
        ['soft', 'Soft', 'Keep all changes staged.'],
        ['mixed', 'Mixed', 'Keep changes in your files, but unstaged.'],
        ['hard', 'Hard', 'Throw away all changes. This cannot be undone.'],
      ].map(([v, t, d]) => (
        <label key={v} className="mb-2 flex cursor-pointer items-start gap-2">
          <input type="radio" name="mode" className="mt-0.5" checked={mode === v} onChange={() => setMode(v)} />
          <span><span className="font-semibold text-foreground-strong">{t}</span><br /><span className="text-muted">{d}</span></span>
        </label>
      ))}
    </Form>
  )
}

function DiscardDialog({ p }: { p: P }) {
  const path = str(p.path)
  const all = p.all === true
  const [files, setFiles] = useState<string[]>(Array.isArray(p.files) ? (p.files as string[]) : [])
  const [loading, setLoading] = useState(all)
  useEffect(() => {
    if (!all) return
    void api.status(path).then((s: FileEntry[]) => setFiles(s.map((f) => f.path))).finally(() => setLoading(false))
  }, [all, path])
  const submit = useSubmit('Discard', () => api.discard(path, files).then(() => ''))
  return (
    <Form title="Discard changes" submitLabel={`Discard ${files.length} file${files.length === 1 ? '' : 's'}`} danger disabled={loading || files.length === 0} onSubmit={() => void submit()} width={500}>
      <p className="mb-2">These changes will be lost for good. Untracked files will be deleted.</p>
      <div className="max-h-48 overflow-auto rounded border border-border bg-background p-2 font-mono text-[12px]">
        {files.length === 0 && !loading ? 'Nothing to discard' : files.map((f) => <div key={f}>{f}</div>)}
      </div>
    </Form>
  )
}

function IgnoreDialog({ p }: { p: P }) {
  const path = str(p.path)
  const file = str(p.file)
  const ext = file.includes('.') ? file.slice(file.lastIndexOf('.')) : ''
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : ''
  const options = [
    { id: file, label: `Ignore this file: ${file}` },
    ...(ext ? [{ id: `*${ext}`, label: `Ignore all ${ext} files: *${ext}` }] : []),
    ...(dir ? [{ id: dir, label: `Ignore this folder: ${dir}` }] : []),
  ]
  const [pick, setPick] = useState(options[0].id)
  const submit = useSubmit('Ignore', () => api.ignoreAdd(path, pick).then(() => 'Added to .gitignore'))
  return (
    <Form title="Ignore files" submitLabel="Add to .gitignore" onSubmit={() => void submit()} width={500}>
      {options.map((o) => (
        <label key={o.id} className="mb-2 flex cursor-pointer items-center gap-2">
          <input type="radio" name="ignore" checked={pick === o.id} onChange={() => setPick(o.id)} />
          <span className="truncate">{o.label}</span>
        </label>
      ))}
      <p className="text-muted">If the file is already tracked, it stays tracked. Remove it from the index first.</p>
    </Form>
  )
}

function FlowDialog({ p }: { p: P }) {
  const app = useApp()
  const path = str(p.path)
  const refs = useRefs(path)
  const [cfg, setCfg] = useState<FlowConfig | null>(null)
  const [action, setAction] = useState<'start' | 'finish'>('start')
  const [kind, setKind] = useState<'feature' | 'release' | 'hotfix'>('feature')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void api.flowConfig(path).then(setCfg).catch((e) => setErr(errText(e)))
  }, [path])

  if (!cfg) {
    return <Modal title="Git Flow" onClose={app.closeDialog}>{err ?? 'Loading...'}</Modal>
  }

  if (!cfg.initialised) {
    const set = (k: keyof FlowConfig, v: string) => setCfg({ ...cfg, [k]: v })
    const init = async () => {
      const { initialised, ...rest } = cfg
      void initialised
      app.closeDialog()
      await app.run('Initialise Git Flow', () => api.flowInit(path, rest).then(() => 'Git Flow is ready'))
    }
    return (
      <Form title="Initialise Git Flow" submitLabel="Initialise" onSubmit={() => void init()}>
        <Field label="Production branch"><input className={inputCls} value={cfg.master} onChange={(e) => set('master', e.target.value)} /></Field>
        <Field label="Development branch"><input className={inputCls} value={cfg.develop} onChange={(e) => set('develop', e.target.value)} /></Field>
        <Field label="Feature prefix"><input className={inputCls} value={cfg.feature} onChange={(e) => set('feature', e.target.value)} /></Field>
        <Field label="Release prefix"><input className={inputCls} value={cfg.release} onChange={(e) => set('release', e.target.value)} /></Field>
        <Field label="Hotfix prefix"><input className={inputCls} value={cfg.hotfix} onChange={(e) => set('hotfix', e.target.value)} /></Field>
        <Field label="Version tag prefix"><input className={inputCls} value={cfg.versionTag} onChange={(e) => set('versionTag', e.target.value)} /></Field>
      </Form>
    )
  }

  const prefix = cfg[kind]
  const existing = (refs?.local ?? []).filter((b) => b.name.startsWith(prefix)).map((b) => b.name.slice(prefix.length))
  const go = async () => {
    app.closeDialog()
    await app.run(`${action === 'start' ? 'Start' : 'Finish'} ${kind}`, () =>
      action === 'start' ? api.flowStart(path, kind, name.trim()) : api.flowFinish(path, kind, name.trim(), null),
    )
  }
  return (
    <Form title="Git Flow" submitLabel={action === 'start' ? 'Start' : 'Finish'} disabled={!name.trim()} onSubmit={() => void go()}>
      <div className="mb-3 flex gap-2">
        {(['start', 'finish'] as const).map((a) => (
          <Button key={a} variant={action === a ? 'primary' : 'secondary'} onClick={() => { setAction(a); setName('') }}>{a === 'start' ? 'Start new' : 'Finish'}</Button>
        ))}
      </div>
      <Field label="Type">
        <select className={inputCls} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setName('') }}>
          <option value="feature">Feature</option>
          <option value="release">Release</option>
          <option value="hotfix">Hotfix</option>
        </select>
      </Field>
      {action === 'start' ? (
        <Field label={`Name (branch will be ${prefix}...)`}><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      ) : (
        <Field label="Branch to finish">
          <select className={inputCls} value={name} onChange={(e) => setName(e.target.value)}>
            <option value="">Choose</option>
            {existing.map((n) => (<option key={n} value={n}>{prefix}{n}</option>))}
          </select>
        </Field>
      )}
    </Form>
  )
}

function RepoSettingsDialog({ p }: { p: P }) {
  const app = useApp()
  const path = str(p.path)
  const refs = useRefs(path)
  const [name, setName] = useState('origin')
  const [url, setUrl] = useState('')
  const [, setN] = useState(0)
  const [local, setLocal] = useState<Refs | null>(null)
  const list = local ?? refs
  const reload = () => void api.refs(path).then(setLocal)
  const add = async () => {
    try {
      await api.remoteAdd(path, name.trim(), url.trim())
      setUrl('')
      setN((n) => n + 1)
      reload()
      app.bump()
    } catch (e) {
      app.openDialog('error', { title: 'Could not add remote', text: errText(e) })
    }
  }
  return (
    <Modal title="Repository settings" width={560} onClose={app.closeDialog} footer={<Button variant="primary" onClick={app.closeDialog}>Close</Button>}>
      <p className="mb-3 text-muted selectable">{path}</p>
      <h3 className="mb-2 font-semibold text-foreground-strong">Remotes</h3>
      {(list?.remotes ?? []).length === 0 && <p className="mb-2 text-muted">No remotes yet.</p>}
      {(list?.remotes ?? []).map((r) => (
        <div key={r.name} className="mb-1.5 flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5">
          <span className="min-w-0 truncate"><span className="font-semibold text-foreground-strong">{r.name}</span> {r.url}</span>
          <Button className="h-6" onClick={() => void api.remoteRemove(path, r.name).then(() => { reload(); app.bump() })}>Remove</Button>
        </div>
      ))}
      <div className="mt-3 grid grid-cols-[120px_1fr_auto] items-end gap-2">
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="URL"><input className={inputCls} placeholder="git@bitbucket.org:team/repo.git" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        <Button className="mb-3" variant="primary" disabled={!name.trim() || !url.trim()} onClick={() => void add()}>Add</Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- preferences

function PrefsDialog() {
  const app = useApp()
  const [tab, setTab] = useState<'general' | 'accounts' | 'ssh'>('general')
  const [id, setId] = useState<Identity>({ name: '', email: '' })
  const [adding, setAdding] = useState<'bitbucket-cloud' | 'bitbucket-server' | null>(null)
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))

  useEffect(() => {
    void api.getIdentity(null).then(setId).catch(() => undefined)
  }, [])

  const saveId = async () => {
    try {
      await api.setIdentity(id.name, id.email)
      app.notify('ok', 'Name and email saved')
      app.bump()
    } catch (e) {
      app.openDialog('error', { title: 'Could not save', text: errText(e) })
    }
  }

  const tabs = [['general', 'General'], ['accounts', 'Accounts'], ['ssh', 'SSH keys']] as const
  return (
    <Modal title="Preferences" width={600} onClose={app.closeDialog} footer={<Button variant="primary" onClick={app.closeDialog}>Close</Button>}>
      <div role="tablist" className="mb-4 flex gap-1 border-b border-border">
        {tabs.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={'-mb-px border-b-2 px-3 py-1.5 ' + (tab === t ? 'border-primary text-foreground-strong' : 'border-transparent text-muted hover:text-foreground')}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'general' && (
        <div>
          <h3 className="mb-2 font-semibold text-foreground-strong">Default commit author (git global)</h3>
          <Field label="Full name"><input className={inputCls} value={id.name} onChange={(e) => setId({ ...id, name: e.target.value })} /></Field>
          <Field label="Email"><input className={inputCls} value={id.email} onChange={(e) => setId({ ...id, email: e.target.value })} /></Field>
          <Button className="mb-5" variant="primary" onClick={() => void saveId()} disabled={!id.name.trim() || !id.email.trim()}>Save</Button>
          <h3 className="mb-2 font-semibold text-foreground-strong">Appearance</h3>
          <Check checked={dark} onChange={(v) => { setDark(v); document.documentElement.classList.toggle('dark', v); localStorage.setItem('stlinux-theme', v ? 'dark' : 'light') }}>Dark theme</Check>
        </div>
      )}
      {tab === 'accounts' && (
        <div>
          {adding ? (
            <AccountForm kind={adding} onCancel={() => setAdding(null)} onDone={() => { setAdding(null); app.notify('ok', 'Account connected') }} />
          ) : (
            <>
              <AccountsList />
              <div className="flex gap-2">
                {HOSTS.filter((h) => h.id !== 'ssh').map((h) => (
                  <Button key={h.id} onClick={() => setAdding(h.id as 'bitbucket-cloud' | 'bitbucket-server')}>Add {h.name}...</Button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {tab === 'ssh' && <SshPanel />}
    </Modal>
  )
}

// ---------------------------------------------------------------- host

export default function DialogHost() {
  const { dialog } = useApp()
  if (!dialog) return null
  const p = dialog.props ?? {}
  switch (dialog.type) {
    case 'error': return <ErrorDialog p={p} />
    case 'about': return <AboutDialog />
    case 'confirm': return <ConfirmDialog p={p} />
    case 'branch': return <BranchDialog p={p} />
    case 'merge': return <MergeDialog p={p} />
    case 'pull': return <PullDialog p={p} />
    case 'push': return <PushDialog p={p} />
    case 'stash': return <StashDialog p={p} />
    case 'tag': return <TagDialog p={p} />
    case 'reset': return <ResetDialog p={p} />
    case 'discard': return <DiscardDialog p={p} />
    case 'ignore': return <IgnoreDialog p={p} />
    case 'flow': return <FlowDialog p={p} />
    case 'repo-settings': return <RepoSettingsDialog p={p} />
    case 'prefs': return <PrefsDialog />
    default: return null
  }
}
