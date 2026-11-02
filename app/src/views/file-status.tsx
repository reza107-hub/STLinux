import { Clock, FileText, Minus, Plus, Search as SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConflictPanel from '../components/conflict-panel'
import DiffView, { type DiffMode } from '../components/diff-view'
import { Button, Check, ContextMenu, Splitter, type MenuItem } from '../components/ui'
import { api } from '../lib/api'
import { initials } from '../lib/format'
import { useRepo } from '../lib/repo'
import { useApp } from '../lib/store'
import type { FileEntry, Identity } from '../lib/types'

type Section = 'staged' | 'unstaged'
type Sel = { section: Section; path: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  M: { label: 'Modified', cls: 'text-info' },
  A: { label: 'Added', cls: 'text-success' },
  D: { label: 'Deleted', cls: 'text-danger' },
  R: { label: 'Renamed', cls: 'text-warning' },
  C: { label: 'Copied', cls: 'text-warning' },
  T: { label: 'Type changed', cls: 'text-warning' },
  '?': { label: 'Untracked', cls: 'text-muted' },
  U: { label: 'Conflicted', cls: 'text-danger' },
}

function letter(e: FileEntry, section: Section): string {
  if (e.conflicted) return 'U'
  return section === 'staged' ? e.index : e.worktree
}

type Filter = 'all' | 'modified' | 'untracked' | 'conflicted'

export default function FileStatus() {
  const app = useApp()
  const { path, files, summary } = useRepo()
  const [sel, setSel] = useState<Sel[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [diff, setDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [boxHeight, setBoxHeight] = useState(150)
  const [listWidth, setListWidth] = useState(340)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const dragBase = useRef(0)
  const lastClicked = useRef<Sel | null>(null)

  const q = query.trim().toLowerCase()
  const visible = useCallback(
    (e: FileEntry, section: Section) => {
      if (q && !e.path.toLowerCase().includes(q)) return false
      const l = letter(e, section)
      if (filter === 'modified') return l === 'M'
      if (filter === 'untracked') return l === '?'
      if (filter === 'conflicted') return e.conflicted
      return true
    },
    [filter, q],
  )

  const staged = useMemo(
    () => files.filter((f) => f.index !== ' ' && f.index !== '?' && !f.conflicted && visible(f, 'staged')),
    [files, visible],
  )
  const unstaged = useMemo(
    () => files.filter((f) => (f.worktree !== ' ' || f.conflicted) && visible(f, 'unstaged')),
    [files, visible],
  )

  // drop selections for files that no longer exist
  useEffect(() => {
    setSel((cur) =>
      cur.filter((s) => (s.section === 'staged' ? staged : unstaged).some((f) => f.path === s.path)),
    )
  }, [staged, unstaged])

  const first = sel[0]
  const firstEntry = first ? files.find((f) => f.path === first.path) : undefined
  const mode: DiffMode = !first
    ? 'unstaged'
    : first.section === 'staged'
      ? 'staged'
      : firstEntry?.worktree === '?'
        ? 'untracked'
        : 'unstaged'

  useEffect(() => {
    if (!first || !firstEntry || sel.length !== 1 || firstEntry.conflicted) {
      setDiff(null)
      return
    }
    let live = true
    setDiffLoading(true)
    api
      .workingDiff(path, first.path, mode === 'staged', mode === 'untracked')
      .then((d) => live && setDiff(d))
      .catch((e) => live && setDiff(`Could not load diff: ${String(e)}`))
      .finally(() => live && setDiffLoading(false))
    return () => {
      live = false
    }
    // files array identity changes on every refresh, which reloads the diff
  }, [path, first, firstEntry, mode, sel.length])

  const click = (e: React.MouseEvent, section: Section, f: FileEntry, list: FileEntry[]) => {
    const item: Sel = { section, path: f.path }
    if (e.shiftKey && lastClicked.current?.section === section) {
      const a = list.findIndex((x) => x.path === lastClicked.current!.path)
      const b = list.findIndex((x) => x.path === f.path)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSel(list.slice(lo, hi + 1).map((x) => ({ section, path: x.path })))
    } else if (e.ctrlKey || e.metaKey) {
      setSel((cur) =>
        cur.some((s) => s.section === section && s.path === f.path)
          ? cur.filter((s) => !(s.section === section && s.path === f.path))
          : [...cur.filter((s) => s.section === section), item],
      )
      lastClicked.current = item
    } else {
      setSel([item])
      lastClicked.current = item
    }
  }

  const stagePaths = (paths: string[]) => void app.run('Stage', () => api.stage(path, paths).then(() => ''), { quiet: true })
  const unstagePaths = (paths: string[]) => void app.run('Unstage', () => api.unstage(path, paths).then(() => ''), { quiet: true })

  const selectedPaths = (section: Section) => sel.filter((s) => s.section === section).map((s) => s.path)

  const menuFor = (e: React.MouseEvent, section: Section, f: FileEntry) => {
    e.preventDefault()
    const inSel = sel.some((s) => s.section === section && s.path === f.path)
    const paths = inSel ? selectedPaths(section) : [f.path]
    if (!inSel) setSel([{ section, path: f.path }])
    const items: MenuItem[] =
      section === 'staged'
        ? [{ label: 'Unstage', onClick: () => unstagePaths(paths) }]
        : [{ label: 'Stage', onClick: () => stagePaths(paths) }]
    if (f.conflicted) {
      items.unshift(
        { label: 'Resolve using mine', onClick: () => void app.run('Resolve', () => api.resolveConflict(path, f.path, 'ours', null).then(() => 'Used mine')) },
        { label: 'Resolve using theirs', onClick: () => void app.run('Resolve', () => api.resolveConflict(path, f.path, 'theirs', null).then(() => 'Used theirs')) },
      )
    }
    items.push(
      { separator: true },
      {
        label: 'Discard changes...',
        onClick: () => app.openDialog('discard', { path, files: paths }),
      },
      { separator: true },
      {
        label: 'Ignore...',
        onClick: () => app.openDialog('ignore', { path, file: f.path }),
      },
    )
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const allVisibleStaged = unstaged.length === 0 && staged.length > 0
  const toggleAll = () => {
    if (unstaged.length > 0) stagePaths(unstaged.map((f) => f.path))
    else unstagePaths(staged.map((f) => f.path))
  }

  // external request: stage everything and focus the message box
  useEffect(() => {
    const h = () => {
      const paths = files.filter((f) => f.worktree !== ' ' || f.conflicted).map((f) => f.path)
      if (paths.length) stagePaths(paths)
      document.getElementById('commit-message')?.focus()
    }
    window.addEventListener('stlinux:stage-all-and-focus', h)
    return () => window.removeEventListener('stlinux:stage-all-and-focus', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, path])

  const row = (f: FileEntry, section: Section, list: FileEntry[]) => {
    const l = letter(f, section)
    const st = STATUS[l] ?? { label: l, cls: 'text-muted' }
    const active = sel.some((s) => s.section === section && s.path === f.path)
    const slash = f.path.lastIndexOf('/')
    const dir = slash >= 0 ? f.path.slice(0, slash + 1) : ''
    const name = slash >= 0 ? f.path.slice(slash + 1) : f.path
    return (
      <div
        key={section + f.path}
        role="option"
        aria-selected={active}
        onClick={(e) => click(e, section, f, list)}
        onContextMenu={(e) => menuFor(e, section, f)}
        className={'flex h-6 cursor-default items-center gap-2 px-2 ' + (active ? 'bg-selection text-foreground-strong' : 'hover:bg-hover')}
      >
        <input
          type="checkbox"
          aria-label={section === 'staged' ? `Unstage ${f.path}` : `Stage ${f.path}`}
          className="size-3.5 accent-primary"
          checked={section === 'staged'}
          onClick={(e) => e.stopPropagation()}
          onChange={() => (section === 'staged' ? unstagePaths([f.path]) : stagePaths([f.path]))}
        />
        <span title={st.label} className={'w-4 shrink-0 text-center font-mono font-bold ' + st.cls}>
          {l}
        </span>
        <FileText size={13} className="shrink-0 text-muted" />
        <span className="min-w-0 truncate" title={f.path}>
          <span className="text-muted">{dir}</span>
          {name}
          {f.orig && <span className="text-muted"> (from {f.orig})</span>}
        </span>
      </div>
    )
  }

  const header = (title: string, count: number, action?: React.ReactNode) => (
    <div key={title} className="flex h-6 items-center justify-between border-y border-border bg-surface px-2 font-semibold uppercase tracking-wide text-muted">
      <span>
        {title} ({count})
      </span>
      {action}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* scope bar */}
      <div className="flex h-[29px] shrink-0 items-center gap-2 border-b border-border bg-surface px-1.5">
        <input
          type="checkbox"
          aria-label="Stage all or unstage all"
          className="size-3.5 accent-primary"
          checked={allVisibleStaged}
          disabled={staged.length + unstaged.length === 0}
          onChange={toggleAll}
        />
        <select
          aria-label="Show only"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="h-6 rounded border border-border bg-background px-1 text-foreground-strong"
        >
          <option value="all">Show all</option>
          <option value="modified">Modified only</option>
          <option value="untracked">Untracked only</option>
          <option value="conflicted">Conflicted only</option>
        </select>
        <span className="font-semibold">
          ({staged.length}/{staged.length + unstaged.length} files)
        </span>
        {summary?.merging && (
          <span className="rounded bg-warning px-2 text-primary-foreground">Merge in progress</span>
        )}
        <div className="relative ml-auto">
          <SearchIcon size={12} className="pointer-events-none absolute left-2 top-1.5 text-muted" />
          <input
            type="search"
            aria-label="Search files"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-6 w-[250px] rounded border border-border bg-background pl-7 pr-2 text-foreground-strong placeholder:text-muted"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div style={{ width: listWidth }} className="flex min-w-[100px] shrink-0 flex-col overflow-auto" role="listbox" aria-multiselectable>
          {header(
            'Staged files',
            staged.length,
            staged.length > 0 && (
                <button type="button" title="Unstage all" aria-label="Unstage all" className="rounded p-0.5 hover:bg-hover" onClick={() => unstagePaths(staged.map((f) => f.path))}>
                  <Minus size={12} />
                </button>
              ),
          )}
          {staged.map((f) => row(f, 'staged', staged))}
          {header(
            'Unstaged files',
            unstaged.length,
            unstaged.length > 0 && (
                <button type="button" title="Stage all" aria-label="Stage all" className="rounded p-0.5 hover:bg-hover" onClick={() => stagePaths(unstaged.map((f) => f.path))}>
                  <Plus size={12} />
                </button>
              ),
          )}
          {unstaged.map((f) => row(f, 'unstaged', unstaged))}
          {files.length === 0 && (
            <div className="p-6 text-center text-muted">Working copy is clean. Nothing to commit.</div>
          )}
        </div>
        <Splitter
          dir="col"
          onStart={() => (dragBase.current = listWidth)}
          onDrag={(d) => setListWidth(Math.max(120, Math.min(700, dragBase.current + d)))}
        />
        <div className="min-w-[100px] flex-1">
          {sel.length === 1 && firstEntry?.conflicted ? (
            <ConflictPanel key={firstEntry.path} repoPath={path} file={firstEntry.path} />
          ) : (
            <DiffView repoPath={path} diff={sel.length === 1 ? diff : null} loading={diffLoading} mode={mode} fileLabel={first?.path} />
          )}
        </div>
      </div>

      <HeightSplitter value={boxHeight} onChange={setBoxHeight} />
      <CommitBox height={boxHeight} stagedCount={staged.length} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

function HeightSplitter({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const base = useRef(0)
  return (
    <Splitter
      dir="row"
      onStart={() => (base.current = value)}
      onDrag={(d) => onChange(Math.max(100, Math.min(300, base.current - d)))}
    />
  )
}

function CommitBox({ height, stagedCount }: { height: number; stagedCount: number }) {
  const app = useApp()
  const { path, summary } = useRepo()
  const draftKey = `stlinux-draft:${path}`
  const authorKey = `stlinux-author:${path}`
  const [message, setMessage] = useState(() => localStorage.getItem(draftKey) ?? '')
  const [amend, setAmend] = useState(false)
  const [noVerify, setNoVerify] = useState(false)
  const [signoff, setSignoff] = useState(false)
  const [pushNow, setPushNow] = useState(false)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [alt, setAlt] = useState<Identity | null>(() => {
    try {
      const raw = localStorage.getItem(authorKey)
      return raw ? (JSON.parse(raw) as Identity) : null
    } catch {
      return null
    }
  })
  const [authorOpen, setAuthorOpen] = useState(false)
  const [optsOpen, setOptsOpen] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    void api.getIdentity(path).then(setIdentity).catch(() => setIdentity({ name: '', email: '' }))
  }, [path])

  useEffect(() => {
    localStorage.setItem(draftKey, message)
  }, [message, draftKey])

  useEffect(() => {
    if (alt) localStorage.setItem(authorKey, JSON.stringify(alt))
    else localStorage.removeItem(authorKey)
  }, [alt, authorKey])

  const toggleAmend = async (v: boolean) => {
    setAmend(v)
    if (v && !message.trim()) {
      const msgs = await api.recentMessages(path).catch(() => [])
      if (msgs[0]) setMessage(msgs[0])
    }
  }

  const authorString = alt && alt.name ? `${alt.name} <${alt.email}>` : null
  const display = alt && alt.name ? alt : identity
  const canCommit = (stagedCount > 0 || amend) && (message.trim().length > 0 || amend)

  const commit = async () => {
    if (!canCommit) return
    const ok = await app.run('Commit', () =>
      api.commit(path, { message, amend, noVerify, signoff, author: authorString }),
    )
    if (!ok) return
    setMessage('')
    setAmend(false)
    if (pushNow) {
      const remote = summary?.hasUpstream ? 'origin' : 'origin'
      await app.run('Push', () =>
        api.push(path, {
          remote,
          branch: summary?.branch ?? 'HEAD',
          tags: false,
          setUpstream: !summary?.hasUpstream,
          force: false,
        }),
      )
    }
  }

  return (
    <div style={{ height }} className="shrink-0 bg-surface p-2.5">
      <div className="grid h-full grid-cols-[30px_1fr] grid-rows-[auto_1fr_auto]">
        <div className="relative">
          <button
            type="button"
            aria-label="Choose commit author"
            title="Commit author"
            onClick={() => setAuthorOpen((o) => !o)}
            className="flex size-[25px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
          >
            {initials(display?.name || '?')}
          </button>
          {authorOpen && (
            <div className="absolute bottom-full left-0 z-30 mb-1 w-[300px] rounded border border-border bg-surface-raised p-2 shadow-xl">
              <label className="flex items-center gap-2">
                <input type="radio" name="author" checked={!alt} onChange={() => setAlt(null)} />
                Use default author
              </label>
              <div className="my-1 ml-5 text-muted">
                {identity?.name || 'No name set'} &lt;{identity?.email || 'no email'}&gt;
              </div>
              <label className="flex items-center gap-2">
                <input type="radio" name="author" checked={!!alt} onChange={() => setAlt(alt ?? { name: identity?.name ?? '', email: identity?.email ?? '' })} />
                Use alternative author
              </label>
              {alt && (
                <div className="ml-5 mt-1 grid grid-cols-[auto_1fr] items-center gap-x-1 gap-y-2">
                  <span className="text-right">Name:</span>
                  <input className="h-6 rounded border border-border bg-background px-2 text-foreground-strong" value={alt.name} onChange={(e) => setAlt({ ...alt, name: e.target.value })} />
                  <span className="text-right">Email:</span>
                  <input className="h-6 rounded border border-border bg-background px-2 text-foreground-strong" value={alt.email} onChange={(e) => setAlt({ ...alt, email: e.target.value })} />
                </div>
              )}
              <div className="mt-2 flex justify-end">
                <Button variant="primary" onClick={() => setAuthorOpen(false)}>OK</Button>
              </div>
            </div>
          )}
        </div>

        <div className="mb-1 flex items-center justify-between">
          <span className="truncate text-muted">
            {display?.name ? `${display.name} <${display.email}>` : 'Set your name and email in Preferences'}
          </span>
          <div className="relative flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous commit messages"
              title="Previous commit messages"
              className="flex h-6 w-7 items-center justify-center rounded border border-border hover:bg-hover"
              onClick={async () => {
                if (!histOpen) setHistory(await api.recentMessages(path).catch(() => []))
                setHistOpen((o) => !o)
                setOptsOpen(false)
              }}
            >
              <Clock size={13} />
            </button>
            <button
              type="button"
              className="h-6 rounded border border-border px-2 hover:bg-hover"
              onClick={() => {
                setOptsOpen((o) => !o)
                setHistOpen(false)
              }}
            >
              Commit options...
            </button>
            {histOpen && (
              <div className="absolute right-0 top-7 z-30 max-h-48 w-72 overflow-auto rounded border border-border bg-surface-raised py-1 shadow-xl">
                {history.length === 0 && <div className="px-3 py-1 text-muted">No previous messages</div>}
                {history.map((m, i) => (
                  <button key={i} type="button" className="block w-full truncate px-3 py-1 text-left hover:bg-hover" title={m} onClick={() => { setMessage(m); setHistOpen(false) }}>
                    {m.split('\n')[0]}
                  </button>
                ))}
              </div>
            )}
            {optsOpen && (
              <div className="absolute right-0 top-7 z-30 w-56 rounded border border-border bg-surface-raised p-2 shadow-xl">
                <div className="space-y-1.5">
                  <Check checked={amend} onChange={(v) => void toggleAmend(v)}>Amend latest commit</Check>
                  <Check checked={noVerify} onChange={setNoVerify}>Bypass commit hooks</Check>
                  <Check checked={signoff} onChange={setSignoff}>Sign off</Check>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="col-start-2 row-start-2 min-h-0">
          <textarea
            id="commit-message"
            aria-label="Commit message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void commit()
            }}
            spellCheck
            placeholder="Commit message (Ctrl+Enter to commit)"
            className="h-full min-h-[25px] w-full resize-none rounded border border-border bg-background p-1.5 text-foreground-strong placeholder:text-muted"
          />
        </div>

        <div className="col-start-2 row-start-3 mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-7">
            <Check checked={pushNow} onChange={setPushNow} disabled={!summary?.hasRemote}>
              Push changes immediately to origin
            </Check>
            <Check checked={amend} onChange={(v) => void toggleAmend(v)}>Amend latest commit</Check>
          </div>
          <Button variant="primary" disabled={!canCommit} onClick={() => void commit()}>
            Commit
          </Button>
        </div>
      </div>
    </div>
  )
}
