import { open } from '@tauri-apps/plugin-dialog'
import { ChevronDown, ChevronRight, FolderPlus, FolderOpen, GitFork, Lock, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Field, Spinner, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { baseName, errText, repoNameFromUrl } from '../lib/format'
import { useApp } from '../lib/store'
import type { CloneOpts, RemoteProbe, RemoteRepo } from '../lib/types'

type Section = 'local' | 'remote' | 'clone'

async function pickFolder(title: string): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false, title })
  return typeof dir === 'string' ? dir : null
}

export default function NewTab() {
  const app = useApp()
  const [section, setSection] = useState<Section>('local')

  useEffect(() => {
    const h = (e: Event) => setSection((e as CustomEvent<Section>).detail)
    window.addEventListener('stlinux:new-tab-section', h)
    return () => window.removeEventListener('stlinux:new-tab-section', h)
  }, [])

  const tabs: [Section, string][] = [['local', 'Local'], ['remote', 'Remote'], ['clone', 'Clone from URL']]
  return (
    <div className="flex h-full flex-col bg-background">
      <div role="tablist" className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-surface px-2">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={section === id} onClick={() => setSection(id)} className={'rounded px-3 py-1 ' + (section === id ? 'bg-selection text-foreground-strong' : 'hover:bg-hover')}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button onClick={async () => { const d = await pickFolder('Add existing repository'); if (d) await app.openRepoPath(d) }}>
            <FolderOpen size={13} /> Add existing...
          </Button>
          <Button onClick={async () => {
            const d = await pickFolder('Choose a folder for the new repository')
            if (!d) return
            try { const info = await api.initRepo(d); await app.openRepoPath(info.path) }
            catch (e) { app.openDialog('error', { title: 'Could not create repository', text: errText(e) }) }
          }}>
            <FolderPlus size={13} /> Create new...
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {section === 'local' && <Local />}
        {section === 'remote' && <Remote />}
        {section === 'clone' && <Clone />}
      </div>
    </div>
  )
}

function Local() {
  const app = useApp()
  const { bookmarks } = app
  if (bookmarks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
        <p className="text-[13px] text-foreground-strong">No repositories yet</p>
        <p>Add a folder that already has a Git repository, create a new one, or clone from Bitbucket.</p>
      </div>
    )
  }
  return (
    <div className="p-4">
      <h2 className="mb-2 font-semibold uppercase tracking-wide text-muted">Recent repositories</h2>
      {bookmarks.map((b) => (
        <div key={b.path} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-hover">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void app.openRepoPath(b.path)}>
            <div className="font-semibold text-foreground-strong">{b.name}</div>
            <div className="truncate text-muted">{b.path}</div>
          </button>
          <button type="button" aria-label={`Remove ${b.name} from the list`} title="Remove from list" onClick={() => app.removeBookmark(b.path)} className="invisible rounded p-1 text-muted hover:text-danger group-hover:visible">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

async function cloneInto(app: ReturnType<typeof useApp>, url: string, parent: string, name: string, opts?: CloneOpts) {
  const dest = `${parent.replace(/\/+$/, '')}/${name}`
  const ok = await app.run('Clone', () => api.cloneRepo(url, dest, opts).then(() => `Cloned into ${dest}`))
  if (ok) await app.openRepoPath(dest)
}

function Remote() {
  const app = useApp()
  const accounts = app.startup?.accounts ?? []
  const hasKeys = (app.startup?.sshKeys.length ?? 0) > 0
  const [acct, setAcct] = useState(accounts[0]?.id ?? '')
  const [repos, setRepos] = useState<RemoteRepo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [useSsh, setUseSsh] = useState(hasKeys)

  useEffect(() => {
    if (!acct) return
    let live = true
    setRepos(null)
    setErr(null)
    api.listRemoteRepos(acct).then((r) => live && setRepos(r)).catch((e) => live && setErr(errText(e)))
    return () => { live = false }
  }, [acct])

  if (accounts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <p>Connect a Bitbucket account to browse your repositories.</p>
        <Button variant="primary" onClick={() => app.openDialog('prefs')}>Open Preferences</Button>
      </div>
    )
  }
  const shown = (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-3">
        <select aria-label="Account" className={inputCls + ' max-w-xs'} value={acct} onChange={(e) => setAcct(e.target.value)}>
          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.kind === 'bitbucket-cloud' ? `Bitbucket Cloud: ${a.username}` : `${a.rootUrl}: ${a.username}`}</option>))}
        </select>
        <input type="search" placeholder="Filter repositories" aria-label="Filter repositories" className={inputCls + ' max-w-xs'} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="accent-primary" checked={useSsh} onChange={(e) => setUseSsh(e.target.checked)} />
          Clone using SSH
        </label>
      </div>
      {err && <p role="alert" className="mb-3 whitespace-pre-wrap rounded border border-danger p-2 text-danger">{err}</p>}
      {!repos && !err && <div className="flex justify-center p-8"><Spinner size={22} /></div>}
      {shown.map((r) => {
        const url = useSsh && r.sshUrl ? r.sshUrl : r.httpsUrl
        return (
          <div key={r.fullName} className="flex items-center gap-3 border-b border-border px-2 py-2">
            <GitFork size={14} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground-strong">
                {r.fullName}
                {r.private && <Lock size={11} className="text-muted" aria-label="Private" />}
              </div>
              {r.description && <div className="truncate text-muted">{r.description}</div>}
            </div>
            <Button disabled={!url} onClick={async () => {
              const parent = await pickFolder(`Choose where to clone ${r.name}`)
              if (parent) await cloneInto(app, url, parent, repoNameFromUrl(url) || r.name)
            }}>Clone...</Button>
          </div>
        )
      })}
      {repos && shown.length === 0 && <p className="p-8 text-center text-muted">No repositories found</p>}
    </div>
  )
}

type Probe = { state: 'idle' } | { state: 'checking' } | { state: 'ok'; info: RemoteProbe } | { state: 'error'; text: string }

function Clone() {
  const app = useApp()
  const [url, setUrl] = useState('')
  const [parent, setParent] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [probe, setProbe] = useState<Probe>({ state: 'idle' })
  const [showDetails, setShowDetails] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [branch, setBranch] = useState('')
  const [depth, setDepth] = useState('')
  const [recurse, setRecurse] = useState(false)
  const [noHardlinks, setNoHardlinks] = useState(false)

  useEffect(() => {
    if (!nameTouched) setName(repoNameFromUrl(url))
  }, [url, nameTouched])

  const check = async () => {
    const u = url.trim()
    if (!u) { setProbe({ state: 'idle' }); return }
    setProbe({ state: 'checking' })
    setShowDetails(false)
    setBranch('')
    try { setProbe({ state: 'ok', info: await api.probeRemote(u) }) }
    catch (e) { setProbe({ state: 'error', text: errText(e) }) }
  }

  const depthNum = depth.trim() === '' ? undefined : Number(depth)
  const depthBad = depthNum !== undefined && (!Number.isInteger(depthNum) || depthNum < 1)
  const ready = probe.state === 'ok'
  const submit = () => cloneInto(app, url.trim(), parent, name.trim(), {
    branch: branch || undefined,
    depth: depthBad ? undefined : depthNum,
    recurseSubmodules: recurse,
    noHardlinks,
  })

  return (
    <form className="mx-auto max-w-xl p-6" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <Field label="Source Path / URL" hint="For example git@bitbucket.org:team/repo.git or https://bitbucket.org/team/repo.git">
        <input autoFocus className={inputCls} value={url} onChange={(e) => { setUrl(e.target.value); setProbe({ state: 'idle' }) }} onBlur={() => { if (probe.state === 'idle') void check() }} />
      </Field>
      <div className="-mt-1 mb-3 flex min-h-5 items-center gap-2 text-muted">
        {probe.state === 'checking' && <><Spinner size={12} /> Checking source...</>}
        {probe.state === 'ok' && <span>Repository Type: Git ({probe.info.branches.length} {probe.info.branches.length === 1 ? 'branch' : 'branches'})</span>}
        {probe.state === 'error' && (
          <>
            <span className="text-danger">Could not read this source.</span>
            <button type="button" className="underline hover:text-foreground-strong" onClick={() => setShowDetails((v) => !v)}>Details...</button>
          </>
        )}
      </div>
      {probe.state === 'error' && showDetails && <p role="alert" className="mb-3 whitespace-pre-wrap rounded border border-danger p-2 text-danger">{probe.text}</p>}
      <Field label="Destination folder">
        <div className="flex gap-2">
          <input className={inputCls} value={parent} onChange={(e) => setParent(e.target.value)} placeholder="/home/you/projects" />
          <Button onClick={async () => { const d = await pickFolder('Choose destination folder'); if (d) setParent(d) }}>Browse...</Button>
        </div>
      </Field>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true) }} />
      </Field>
      <div className="mb-3">
        <button type="button" aria-expanded={advanced} disabled={probe.state === 'checking'} onClick={() => setAdvanced((v) => !v)} className="flex items-center gap-1 text-muted hover:text-foreground-strong disabled:opacity-50">
          {advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Advanced Options
        </button>
        {advanced && !ready && <p className="mt-2 text-muted">Advanced options will appear once the clone source has been checked successfully.</p>}
        {advanced && probe.state === 'ok' && (
          <div className="mt-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Checkout branch">
                <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
                  <option value="">{probe.info.defaultBranch ? `Default (${probe.info.defaultBranch})` : 'Default'}</option>
                  {probe.info.branches.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
              </Field>
              <Field label="Clone depth" hint={depthBad ? 'Enter a whole number, 1 or more' : undefined}>
                <input className={inputCls} inputMode="numeric" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="Full history" />
              </Field>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={recurse} onChange={(e) => setRecurse(e.target.checked)} /> Recurse submodules</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={noHardlinks} onChange={(e) => setNoHardlinks(e.target.checked)} /> No hardlinks</label>
            </div>
          </div>
        )}
      </div>
      {parent && name && <p className="mb-3 text-muted">Will clone into {parent.replace(/\/+$/, '')}/{name || baseName(url)}</p>}
      <Button variant="primary" type="submit" disabled={!url.trim() || !parent.trim() || !name.trim() || depthBad || probe.state === 'checking' || !!app.busy}>
        {app.busy ? <Spinner size={12} /> : null} Clone
      </Button>
    </form>
  )
}
