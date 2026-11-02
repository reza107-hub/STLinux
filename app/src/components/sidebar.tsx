import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FolderGit2,
  GitBranch,
  Globe,
  History,
  Package,
  Search,
  Tag,
  Archive,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useRepo } from '../lib/repo'
import { useApp, type ViewMode } from '../lib/store'
import type { Branch } from '../lib/types'
import { baseName } from '../lib/format'
import { ContextMenu, type MenuItem } from './ui'

const VIEWS: { id: ViewMode; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'status', label: 'File Status', hint: 'Ctrl+1', icon: FileDiff },
  { id: 'history', label: 'History', hint: 'Ctrl+2', icon: History },
  { id: 'search', label: 'Search', hint: 'Ctrl+3', icon: Search },
]


function Section({ name, icon: Icon, count, isOpen, onToggle, children }: {
  name: string
  icon: LucideIcon
  count: number
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-6 w-full items-center gap-1 rounded px-1 text-left hover:bg-hover"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className="text-muted" />
        <span className="font-semibold uppercase tracking-wide text-muted">{name}</span>
        <span className="ml-auto text-muted">{count}</span>
      </button>
      {isOpen && <div className="pl-3">{children}</div>}
    </div>
  )
}

function BranchRow({ b, label, onCheckout, onMenu }: {
  b: Branch
  label?: string
  onCheckout: () => void
  onMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      role="treeitem"
      aria-selected={b.current}
      tabIndex={0}
      onDoubleClick={() => !b.current && onCheckout()}
      onContextMenu={onMenu}
      title={b.upstream ? `${b.name} tracks ${b.upstream}` : b.name}
      className={'flex h-6 cursor-default items-center gap-1.5 rounded px-1.5 hover:bg-hover ' + (b.current ? 'font-semibold text-foreground-strong' : '')}
    >
      {b.current ? <Check size={12} className="text-success" /> : <GitBranch size={12} className="text-muted" />}
      <span className="truncate">{label ?? b.name}</span>
      {(b.ahead > 0 || b.behind > 0) && (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-muted">
          {b.behind > 0 && (<span className="flex items-center"><ArrowDown size={10} />{b.behind}</span>)}
          {b.ahead > 0 && (<span className="flex items-center"><ArrowUp size={10} />{b.ahead}</span>)}
        </span>
      )}
    </div>
  )
}

type Menu = { x: number; y: number; items: MenuItem[] } | null

export default function Sidebar({ width }: { width: number }) {
  const app = useApp()
  const { path, summary, refs } = useRepo()
  const view = app.views[path] ?? 'status'
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({ Branches: true, Tags: false, Remotes: true })
  const [menu, setMenu] = useState<Menu>(null)
  const q = filter.trim().toLowerCase()
  const isOpen = (name: string) => (q ? true : !!open[name])
  const toggle = (name: string) => setOpen((o) => ({ ...o, [name]: !o[name] }))
  const match = (s: string) => !q || s.toLowerCase().includes(q)
  const current = summary?.branch ?? ''

  const act = (label: string, fn: () => Promise<string | void>) => void app.run(label, fn)

  const branchMenu = (b: Branch, remote: boolean): MenuItem[] => [
    {
      label: remote ? `Checkout ${b.name}` : `Checkout ${b.name}`,
      disabled: !remote && b.current,
      onClick: () => act('Checkout', () => api.checkout(path, b.name, remote)),
    },
    {
      label: `Merge ${b.name} into ${current || 'current'}`,
      disabled: b.current,
      onClick: () => act('Merge', () => api.merge(path, b.name, false)),
    },
    {
      label: `Rebase ${current || 'current'} onto ${b.name}`,
      disabled: b.current,
      onClick: () => act('Rebase', () => api.rebase(path, b.name)),
    },
    { separator: true },
    {
      label: 'New branch from here...',
      onClick: () => app.openDialog('branch', { path, start: b.name }),
    },
    {
      label: remote ? 'Delete remote branch...' : 'Delete branch...',
      disabled: !remote && b.current,
      onClick: () =>
        app.openDialog('confirm', {
          title: 'Delete branch',
          text: remote
            ? `Delete ${b.name} on the remote? This cannot be undone.`
            : `Delete local branch ${b.name}? Unmerged work on it will be lost.`,
          confirm: 'Delete',
          danger: true,
          action: remote
            ? { kind: 'delete-remote-branch', path, remote: b.name.split('/')[0], branch: b.name.split('/').slice(1).join('/') }
            : { kind: 'delete-branch', path, name: b.name },
        }),
    },
  ]

  const show = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const remotesWithBranches = useMemo(() => {
    const map = new Map<string, Branch[]>()
    for (const r of refs?.remotes ?? []) map.set(r.name.split('/')[0], [])
    for (const b of refs?.remote ?? []) {
      const rn = b.name.split('/')[0]
      map.set(rn, [...(map.get(rn) ?? []), b])
    }
    for (const r of refs?.remotes ?? []) if (!map.has(r.name)) map.set(r.name, [])
    return [...map.entries()]
  }, [refs])

  const locals = (refs?.local ?? []).filter((b) => match(b.name))
  const tags = (refs?.tags ?? []).filter((b) => match(b.name))
  const stashes = (refs?.stashes ?? []).filter((s) => match(s.message))
  const subs = (refs?.submodules ?? []).filter((s) => match(s))

  return (
    <aside style={{ width }} className="flex h-full min-w-[146px] shrink-0 flex-col bg-surface">
      <div className="h-3 shrink-0" />
      <div className="px-[9px] pr-[17px]">
        <div className="ml-5 flex h-4 items-center gap-1 text-[12.5px] font-bold uppercase text-foreground-strong">
          <FolderGit2 size={18} className="shrink-0" />
          <span className="truncate pl-1">{baseName(path)}</span>
        </div>
        <div className="mt-2 flex flex-col" role="radiogroup" aria-label="Workspace view">
          {VIEWS.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === view}
              title={`${label} (${hint})`}
              onClick={() => app.setView(path, id)}
              className={
                'flex h-6 items-center gap-2 rounded pl-5 text-left ' +
                (id === view ? 'bg-selection text-foreground-strong' : 'hover:bg-hover')
              }
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {id === 'status' && (summary?.pending ?? 0) > 0 && (
                <span className="mr-1 text-muted">{summary?.pending}</span>
              )}
            </button>
          ))}
        </div>
        <div className="my-2 h-px bg-border" />
      </div>
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter branches, tags, remotes, submodules"
        title="Type here to filter the list of BRANCHES, TAGS, REMOTES, SUBMODULES and STASHES"
        placeholder="Filter"
        className="mb-2 ml-2.5 mr-5 mt-1 h-6 shrink-0 rounded border border-border bg-background px-2 text-foreground-strong placeholder:text-muted"
      />
      <div role="tree" className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        <Section name="Branches" icon={GitBranch} count={locals.length} isOpen={isOpen('Branches')} onToggle={() => toggle('Branches')}>
          {locals.map((b) => (<BranchRow key={b.full} b={b} onCheckout={() => act('Checkout', () => api.checkout(path, b.name, false))} onMenu={(e) => show(e, branchMenu(b, false))} />))}
          {!locals.length && <div className="px-2 py-1 text-muted">None</div>}
        </Section>
        <Section name="Tags" icon={Tag} count={tags.length} isOpen={isOpen('Tags')} onToggle={() => toggle('Tags')}>
          {tags.map((t) => (
            <div
              key={t.full}
              onContextMenu={(e) =>
                show(e, [
                  { label: `Checkout ${t.name}`, onClick: () => act('Checkout', () => api.checkout(path, t.name, false)) },
                  { label: 'Create branch here...', onClick: () => app.openDialog('branch', { path, start: t.name }) },
                  { separator: true },
                  {
                    label: 'Delete tag...',
                    onClick: () =>
                      app.openDialog('confirm', {
                        title: 'Delete tag',
                        text: `Delete tag ${t.name}?`,
                        confirm: 'Delete',
                        danger: true,
                        action: { kind: 'delete-tag', path, name: t.name },
                      }),
                  },
                ])
              }
              className="flex h-6 items-center gap-1.5 rounded px-1.5 hover:bg-hover"
            >
              <Tag size={12} className="text-muted" />
              <span className="truncate">{t.name}</span>
            </div>
          ))}
          {!tags.length && <div className="px-2 py-1 text-muted">None</div>}
        </Section>
        <Section name="Remotes" icon={Globe} count={remotesWithBranches.length} isOpen={isOpen('Remotes')} onToggle={() => toggle('Remotes')}>
          {remotesWithBranches.map(([rn, bs]) => {
            const shown = bs.filter((b) => match(b.name))
            return (
              <div key={rn}>
                <div className="flex h-6 items-center gap-1.5 px-1.5 font-semibold text-foreground-strong">
                  <Globe size={12} className="text-muted" />
                  {rn}
                </div>
                <div className="pl-3">
                  {shown.map((b) => (
                    <BranchRow key={b.full} b={b} label={b.name.slice(rn.length + 1)} onCheckout={() => act('Checkout', () => api.checkout(path, b.name, true))} onMenu={(e) => show(e, branchMenu(b, true))} />
                  ))}
                </div>
              </div>
            )
          })}
          {!remotesWithBranches.length && <div className="px-2 py-1 text-muted">No remotes</div>}
        </Section>
        <Section name="Stashes" icon={Archive} count={stashes.length} isOpen={isOpen('Stashes')} onToggle={() => toggle('Stashes')}>
          {stashes.map((s) => (
            <div
              key={s.name}
              title={s.message}
              onContextMenu={(e) =>
                show(e, [
                  { label: 'Apply stash', onClick: () => act('Apply stash', () => api.stashAction(path, s.name, 'apply')) },
                  { label: 'Pop stash', onClick: () => act('Pop stash', () => api.stashAction(path, s.name, 'pop')) },
                  { separator: true },
                  {
                    label: 'Delete stash...',
                    onClick: () =>
                      app.openDialog('confirm', {
                        title: 'Delete stash',
                        text: `Delete ${s.name}: ${s.message}?`,
                        confirm: 'Delete',
                        danger: true,
                        action: { kind: 'drop-stash', path, name: s.name },
                      }),
                  },
                ])
              }
              className="flex h-6 items-center gap-1.5 rounded px-1.5 hover:bg-hover"
            >
              <Archive size={12} className="text-muted" />
              <span className="truncate">{s.message}</span>
            </div>
          ))}
          {!stashes.length && <div className="px-2 py-1 text-muted">None</div>}
        </Section>
        {subs.length > 0 && (
          <Section name="Submodules" icon={Package} count={subs.length} isOpen={isOpen('Submodules')} onToggle={() => toggle('Submodules')}>
            {subs.map((s) => (
              <div key={s} className="flex h-6 items-center gap-1.5 rounded px-1.5 hover:bg-hover">
                <Package size={12} className="text-muted" />
                <span className="truncate">{s}</span>
              </div>
            ))}
          </Section>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  )
}
