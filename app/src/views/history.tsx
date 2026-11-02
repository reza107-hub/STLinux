import { FileText, Search as SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DiffView from '../components/diff-view'
import { Button, ContextMenu, Spinner, Splitter, type MenuItem } from '../components/ui'
import { api } from '../lib/api'
import { formatDate, shortSha, errText } from '../lib/format'
import { layoutGraph, type GraphRow } from '../lib/graph'
import { useRepo } from '../lib/repo'
import { useApp } from '../lib/store'
import type { ChangedFile, Commit, CommitDetails } from '../lib/types'

const ROW_H = 24
const PAGE = 400
const LANE_W = 12

const STATUS_CLS: Record<string, string> = {
  M: 'text-info',
  A: 'text-success',
  D: 'text-danger',
  R: 'text-warning',
  C: 'text-warning',
}

function GraphCell({ row, width }: { row: GraphRow; width: number }) {
  const x = (lane: number) => lane * LANE_W + LANE_W / 2 + 2
  const col = (c: number) => `var(--graph-${(c % 6) + 1})`
  const mid = ROW_H / 2
  return (
    <svg width={width} height={ROW_H} className="block shrink-0" aria-hidden>
      {row.top.map((s, i) => (
        <path key={'t' + i} d={`M${x(s.from)} 0 L${x(s.to)} ${mid}`} stroke={col(s.color)} strokeWidth="1.6" fill="none" />
      ))}
      {row.bottom.map((s, i) => (
        <path key={'b' + i} d={`M${x(s.from)} ${mid} L${x(s.to)} ${ROW_H}`} stroke={col(s.color)} strokeWidth="1.6" fill="none" />
      ))}
      <circle cx={x(row.lane)} cy={mid} r="4" fill={col(row.color)} stroke="var(--background)" strokeWidth="1.5" />
    </svg>
  )
}

function RefChips({ refs }: { refs: string[] }) {
  return (
    <>
      {refs.map((r) => {
        const isTag = r.startsWith('tag: ')
        const head = r.startsWith('HEAD -> ')
        const label = isTag ? r.slice(5) : head ? r.slice(8) : r
        const remote = !isTag && !head && label.includes('/')
        const cls = isTag
          ? 'border-warning text-warning'
          : head
            ? 'border-primary bg-selection text-primary font-semibold'
            : remote
              ? 'border-border text-muted'
              : 'border-success text-success'
        if (r === 'HEAD') return null
        return (
          <span key={r} className={'mr-1 shrink-0 rounded border px-1 leading-[16px] ' + cls}>
            {label}
          </span>
        )
      })}
    </>
  )
}

type ListProps = {
  commits: Commit[]
  graph: GraphRow[] | null
  graphWidth: number
  selected: string | null
  onSelect: (sha: string) => void
  onContext: (e: React.MouseEvent, c: Commit) => void
  header?: React.ReactNode
  footer?: React.ReactNode
  currentBranch: string
  scrollTo?: string | null
}

function CommitList({ commits, graph, graphWidth, selected, onSelect, onContext, header, footer, currentBranch, scrollTo }: ListProps) {
  const box = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const [h, setH] = useState(400)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.clientHeight))
    ro.observe(el)
    setH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!scrollTo || !box.current) return
    const i = commits.findIndex((c) => c.sha === scrollTo)
    if (i >= 0) box.current.scrollTop = Math.max(0, i * ROW_H - h / 2)
  }, [scrollTo, commits, h])

  const start = Math.max(0, Math.floor(top / ROW_H) - 6)
  const end = Math.min(commits.length, Math.ceil((top + h) / ROW_H) + 6)

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = commits.findIndex((c) => c.sha === selected)
    const n = Math.max(0, Math.min(commits.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    if (commits[n]) {
      onSelect(commits[n].sha)
      const el = box.current
      if (el) {
        if (n * ROW_H < el.scrollTop) el.scrollTop = n * ROW_H
        else if ((n + 1) * ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = (n + 1) * ROW_H - el.clientHeight
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-6 shrink-0 items-center border-b border-border bg-surface font-semibold text-muted">
        <div style={{ width: graph ? graphWidth : 0 }} className="shrink-0 pl-2">{graph ? 'Graph' : ''}</div>
        <div className="min-w-0 flex-1 px-2">Description</div>
        <div className="w-[135px] shrink-0 px-2">Date</div>
        <div className="w-[110px] shrink-0 px-2">Author</div>
        <div className="w-[70px] shrink-0 px-2">Commit</div>
      </div>
      <div
        ref={box}
        role="listbox"
        tabIndex={0}
        aria-label="Commits"
        onKeyDown={onKey}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto"
      >
        {header}
        <div style={{ height: commits.length * ROW_H, position: 'relative' }}>
          {commits.slice(start, end).map((c, k) => {
            const i = start + k
            const active = c.sha === selected
            const isCurrent = c.refs.some((r) => r === `HEAD -> ${currentBranch}`)
            return (
              <div
                key={c.sha}
                role="option"
                aria-selected={active}
                onClick={() => onSelect(c.sha)}
                onContextMenu={(e) => {
                  onSelect(c.sha)
                  onContext(e, c)
                }}
                style={{ position: 'absolute', top: i * ROW_H, height: ROW_H, left: 0, right: 0 }}
                className={'flex cursor-default items-center ' + (active ? 'bg-selection text-foreground-strong' : 'hover:bg-hover')}
              >
                {graph && <div style={{ width: graphWidth }} className="shrink-0 overflow-hidden"><GraphCell row={graph[i]} width={graphWidth} /></div>}
                <div className="flex min-w-0 flex-1 items-center px-2">
                  {isCurrent && <span className="mr-1.5 size-[9px] shrink-0 rounded-full bg-primary" aria-label="Current branch" />}
                  <RefChips refs={c.refs} />
                  <span className="truncate" title={c.subject}>{c.subject}</span>
                </div>
                <div className="w-[135px] shrink-0 truncate px-2 text-muted">{formatDate(c.date)}</div>
                <div className="w-[110px] shrink-0 truncate px-2" title={`${c.author} <${c.email}>`}>{c.author}</div>
                <div className="w-[70px] shrink-0 px-2 font-mono text-muted">{shortSha(c.sha)}</div>
              </div>
            )
          })}
        </div>
        {footer}
      </div>
    </div>
  )
}

function CommitDetail({ sha }: { sha: string }) {
  const { path } = useRepo()
  const [details, setDetails] = useState<CommitDetails | null>(null)
  const [files, setFiles] = useState<ChangedFile[]>([])
  const [file, setFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [width, setWidth] = useState(300)
  const base = useRef(0)

  useEffect(() => {
    let live = true
    setDetails(null)
    setFiles([])
    setFile(null)
    setDiff(null)
    void Promise.all([api.commitDetails(path, sha), api.commitFiles(path, sha)])
      .then(([d, f]) => {
        if (!live) return
        setDetails(d)
        setFiles(f)
        if (f[0]) setFile(f[0].path)
      })
      .catch((e) => live && setDiff(`Could not load commit: ${errText(e)}`))
    return () => {
      live = false
    }
  }, [path, sha])

  useEffect(() => {
    if (!file) return
    let live = true
    setLoading(true)
    api
      .commitDiff(path, sha, file)
      .then((d) => live && setDiff(d))
      .catch((e) => live && setDiff(`Could not load diff: ${errText(e)}`))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [path, sha, file])

  if (!details) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Spinner size={22} />
      </div>
    )
  }
  const message = details.message.split('\n')
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="selectable shrink-0 border-b border-border bg-surface px-3 py-2">
        <div className="text-[13px] font-semibold text-foreground-strong">{message[0]}</div>
        {message.slice(1).join('\n').trim() && (
          <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap font-sans">{message.slice(1).join('\n').trim()}</pre>
        )}
        <div className="mt-1.5 grid grid-cols-[70px_1fr] gap-x-2 gap-y-0.5 text-muted">
          <span>Commit</span>
          <span className="font-mono text-foreground">{details.sha}</span>
          <span>Author</span>
          <span className="text-foreground">{details.author} &lt;{details.email}&gt; on {formatDate(details.date)}</span>
          {details.parents.length > 0 && (
            <>
              <span>Parents</span>
              <span className="font-mono text-foreground">{details.parents.map(shortSha).join(', ')}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div style={{ width }} className="min-w-[120px] shrink-0 overflow-auto" role="listbox" aria-label="Changed files">
          {files.map((f) => (
            <div
              key={f.path}
              role="option"
              aria-selected={f.path === file}
              onClick={() => setFile(f.path)}
              className={'flex h-6 cursor-default items-center gap-2 px-2 ' + (f.path === file ? 'bg-selection text-foreground-strong' : 'hover:bg-hover')}
            >
              <span className={'w-4 shrink-0 text-center font-mono font-bold ' + (STATUS_CLS[f.status] ?? 'text-muted')}>{f.status}</span>
              <FileText size={13} className="shrink-0 text-muted" />
              <span className="truncate" title={f.path}>{f.path}</span>
            </div>
          ))}
          {files.length === 0 && <div className="p-4 text-muted">No file changes</div>}
        </div>
        <Splitter dir="col" onStart={() => (base.current = width)} onDrag={(d) => setWidth(Math.max(120, Math.min(700, base.current + d)))} />
        <div className="min-w-[100px] flex-1">
          <DiffView repoPath={path} diff={diff} loading={loading} mode="commit" fileLabel={file ?? undefined} />
        </div>
      </div>
    </div>
  )
}

function useCommitMenu() {
  const app = useApp()
  const { path, summary } = useRepo()
  const cur = summary?.branch ?? 'current branch'
  const act = (label: string, fn: () => Promise<string | void>) => void app.run(label, fn)
  return (c: Commit): MenuItem[] => [
    { label: 'Checkout...', onClick: () => app.openDialog('confirm', { title: 'Checkout commit', text: `Check out ${shortSha(c.sha)}? You will be on a detached HEAD.`, confirm: 'Checkout', action: { kind: 'checkout', path, target: c.sha } }) },
    { label: `Merge into ${cur}`, onClick: () => act('Merge', () => api.merge(path, c.sha, false)) },
    { label: `Rebase ${cur} onto this`, onClick: () => act('Rebase', () => api.rebase(path, c.sha)) },
    { separator: true },
    { label: 'Tag...', onClick: () => app.openDialog('tag', { path, sha: c.sha }) },
    { label: 'Branch...', onClick: () => app.openDialog('branch', { path, start: c.sha }) },
    { label: 'Reset current branch to this commit...', onClick: () => app.openDialog('reset', { path, sha: c.sha }) },
    { separator: true },
    { label: 'Reverse commit...', onClick: () => app.openDialog('confirm', { title: 'Reverse commit', text: `Create a new commit that undoes ${shortSha(c.sha)}?`, confirm: 'Reverse', action: { kind: 'revert', path, sha: c.sha } }) },
    { label: 'Cherry-pick', onClick: () => act('Cherry-pick', () => api.cherryPick(path, c.sha)) },
    { separator: true },
    { label: 'Copy SHA to Clipboard', onClick: () => void navigator.clipboard.writeText(c.sha).then(() => app.notify('ok', 'SHA copied')) },
  ]
}

export function HistoryView() {
  const app = useApp()
  const { path, summary, refs } = useRepo()
  const tick = app.tick
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [branch, setBranch] = useState('')
  const [showRemote, setShowRemote] = useState(true)
  const [topo, setTopo] = useState(false)
  const [author, setAuthor] = useState('')
  const [authorQ, setAuthorQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [scrollTo, setScrollTo] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [detailH, setDetailH] = useState(300)
  const base = useRef(0)
  const commitMenu = useCommitMenu()
  const requestId = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setAuthorQ(author), 400)
    return () => clearTimeout(t)
  }, [author])

  const fetchPage = useCallback(
    async (skip: number) => {
      const id = ++requestId.current
      try {
        const rows = await api.log(path, {
          limit: PAGE,
          skip,
          all: !branch && showRemote,
          branch: branch || null,
          topo,
          searchKind: authorQ ? 'author' : null,
          query: authorQ || null,
        })
        if (id !== requestId.current) return
        setCommits((cur) => (skip === 0 ? rows : [...cur, ...rows]))
        setMore(rows.length === PAGE)
      } catch (e) {
        if (id === requestId.current) {
          setCommits([])
          app.notify('error', errText(e))
        }
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, branch, showRemote, topo, authorQ],
  )

  useEffect(() => {
    setLoading(true)
    void fetchPage(0)
  }, [fetchPage, tick])

  const filtered = authorQ !== ''
  const { rows, maxLanes } = useMemo(
    () => (filtered ? { rows: [] as GraphRow[], maxLanes: 0 } : layoutGraph(commits)),
    [commits, filtered],
  )
  const graphWidth = Math.max(80, Math.min(260, maxLanes * LANE_W + 12))
  const pending = summary?.pending ?? 0

  const jumpTargets = [
    ...(refs?.local ?? []).map((b) => ({ name: b.name, sha: b.sha })),
    ...(refs?.tags ?? []).map((t) => ({ name: t.name, sha: t.sha })),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[26px] shrink-0 items-center justify-between border-b border-border bg-surface px-1">
        <div className="flex items-center gap-3">
          <select aria-label="Branch filter" value={branch} onChange={(e) => setBranch(e.target.value)} className="h-5 rounded border border-border bg-background px-1 text-foreground-strong">
            <option value="">All branches</option>
            {(refs?.local ?? []).map((b) => (<option key={b.full} value={b.name}>{b.name}</option>))}
          </select>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-primary" checked={showRemote} disabled={!!branch} onChange={(e) => setShowRemote(e.target.checked)} />
            Show Remote Branches
          </label>
          <select aria-label="Order" value={topo ? 'topo' : 'date'} onChange={(e) => setTopo(e.target.value === 'topo')} className="h-5 rounded border border-border bg-background px-1 text-foreground-strong">
            <option value="date">Date Order</option>
            <option value="topo">Ancestor Order</option>
          </select>
        </div>
        <div className="relative flex items-center gap-2">
          <input type="search" aria-label="Filter by author" placeholder="Author Name" title="Type here to filter the commits by author name" value={author} onChange={(e) => setAuthor(e.target.value)} className="h-5 w-[150px] rounded border border-border bg-background px-2 text-foreground-strong placeholder:text-muted" />
          <button type="button" className="rounded px-1.5 hover:bg-hover" onClick={() => setJumpOpen((o) => !o)}>Jump to:</button>
          {jumpOpen && (
            <div className="absolute right-0 top-6 z-30 max-h-[250px] w-[200px] overflow-auto rounded border border-border bg-surface-raised py-1 shadow-xl">
              <button type="button" className="block h-[22px] w-full px-2 text-left hover:bg-hover" onClick={() => { setJumpOpen(false); if (commits[0]) { setSelected(commits[0].sha); setScrollTo(commits[0].sha) } }}>Latest commit</button>
              <div className="my-1 h-px bg-border" />
              {jumpTargets.map((t) => (
                <button key={t.name} type="button" className="block h-[22px] w-full truncate px-2 text-left hover:bg-hover" onClick={() => {
                  setJumpOpen(false)
                  const hit = commits.find((c) => c.sha === t.sha)
                  if (hit) { setSelected(hit.sha); setScrollTo(hit.sha) }
                  else app.notify('error', 'That commit is not loaded yet. Load more history first.')
                }}>{t.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {loading && commits.length === 0 ? (
          <div className="flex h-full items-center justify-center"><Spinner size={22} /></div>
        ) : (
          <CommitList
            commits={commits}
            graph={filtered ? null : rows}
            graphWidth={graphWidth}
            selected={selected}
            onSelect={setSelected}
            currentBranch={summary?.branch ?? ''}
            scrollTo={scrollTo}
            onContext={(e, c) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, items: commitMenu(c) })
            }}
            header={
              pending > 0 && !filtered ? (
                <button type="button" onClick={() => app.setView(path, 'status')} className="flex h-6 w-full items-center gap-2 border-b border-border px-3 text-left text-foreground-strong hover:bg-hover">
                  <span className="size-[9px] rounded-full border-2 border-primary" />
                  Uncommitted changes ({pending})
                </button>
              ) : null
            }
            footer={
              more ? (
                <div className="flex justify-center py-2">
                  <Button onClick={() => void fetchPage(commits.length)}>Load more commits</Button>
                </div>
              ) : commits.length === 0 ? (
                <div className="p-8 text-center text-muted">No commits to show</div>
              ) : null
            }
          />
        )}
      </div>

      {selected && (
        <>
          <Splitter dir="row" onStart={() => (base.current = detailH)} onDrag={(d) => setDetailH(Math.max(120, Math.min(700, base.current - d)))} />
          <div style={{ height: detailH }} className="shrink-0">
            <CommitDetail sha={selected} />
          </div>
        </>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

export function SearchView() {
  const app = useApp()
  const { path, summary } = useRepo()
  const [kind, setKind] = useState('message')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Commit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [detailH, setDetailH] = useState(300)
  const base = useRef(0)
  const commitMenu = useCommitMenu()

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setSelected(null)
    try {
      setResults(await api.log(path, { limit: 500, skip: 0, all: true, topo: false, searchKind: kind, query: query.trim() }))
    } catch (e) {
      app.notify('error', errText(e))
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[34px] shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
        <select aria-label="Search in" value={kind} onChange={(e) => setKind(e.target.value)} className="h-6 rounded border border-border bg-background px-1 text-foreground-strong">
          <option value="message">Commit message</option>
          <option value="author">Author</option>
          <option value="content">Changed text (pickaxe)</option>
          <option value="file">File path</option>
        </select>
        <div className="relative flex-1">
          <SearchIcon size={12} className="pointer-events-none absolute left-2 top-2 text-muted" />
          <input
            autoFocus
            aria-label="Search text"
            placeholder="Search the history of all branches"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
            className="h-6 w-full rounded border border-border bg-background pl-7 pr-2 text-foreground-strong placeholder:text-muted"
          />
        </div>
        <Button variant="primary" onClick={() => void search()} disabled={!query.trim() || loading}>Search</Button>
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center"><Spinner size={22} /></div>
        ) : results === null ? (
          <div className="flex h-full items-center justify-center text-muted">Enter text and press Enter to search</div>
        ) : (
          <CommitList
            commits={results}
            graph={null}
            graphWidth={0}
            selected={selected}
            onSelect={setSelected}
            currentBranch={summary?.branch ?? ''}
            onContext={(e, c) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, items: commitMenu(c) })
            }}
            footer={results.length === 0 ? <div className="p-8 text-center text-muted">No matches</div> : null}
          />
        )}
      </div>
      {selected && (
        <>
          <Splitter dir="row" onStart={() => (base.current = detailH)} onDrag={(d) => setDetailH(Math.max(120, Math.min(700, base.current - d)))} />
          <div style={{ height: detailH }} className="shrink-0"><CommitDetail sha={selected} /></div>
        </>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}
