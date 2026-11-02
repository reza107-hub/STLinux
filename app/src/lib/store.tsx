import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from './api'
import { baseName, errText } from './format'
import type { Startup } from './types'

export type Tab = { id: string; kind: 'new' | 'repo' | 'user'; path?: string; name: string }
export type ViewMode = 'status' | 'history' | 'search'
export type Dialog = { type: string; props?: Record<string, unknown> } | null
export type Toast = { id: number; kind: 'ok' | 'error'; text: string }

type AppState = {
  tabs: Tab[]
  selectedId: string
  selectTab: (id: string) => void
  closeTab: (id: string) => void
  closeOthers: (id: string) => void
  closeAll: () => void
  moveTab: (from: number, to: number) => void
  newTab: () => void
  openUserTab: () => void
  openRepoPath: (path: string) => Promise<boolean>
  views: Record<string, ViewMode>
  setView: (path: string, v: ViewMode) => void
  dialog: Dialog
  openDialog: (type: string, props?: Record<string, unknown>) => void
  closeDialog: () => void
  toasts: Toast[]
  notify: (kind: Toast['kind'], text: string) => void
  busy: string | null
  /** run an async git action: shows busy state, reports errors, refreshes */
  run: (label: string, fn: () => Promise<string | void>, opts?: { quiet?: boolean }) => Promise<boolean>
  tick: number
  bump: () => void
  startup: Startup | null
  reloadStartup: () => Promise<void>
  bookmarks: { path: string; name: string }[]
  removeBookmark: (path: string) => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

const TABS_KEY = 'stlinux-tabs'
const BOOKMARKS_KEY = 'stlinux-bookmarks'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

let seq = 1
const newId = () => `t${Date.now().toString(36)}${seq++}`

export function AppProvider({ children }: { children: ReactNode }) {
  const saved = readJson<{ tabs: Tab[]; selectedId: string } | null>(TABS_KEY, null)
  const [tabs, setTabs] = useState<Tab[]>(
    saved?.tabs?.length ? saved.tabs : [{ id: newId(), kind: 'new', name: 'New tab' }],
  )
  const [selectedId, setSelectedId] = useState(saved?.selectedId ?? '')
  const [views, setViews] = useState<Record<string, ViewMode>>({})
  const [dialog, setDialog] = useState<Dialog>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [startup, setStartup] = useState<Startup | null>(null)
  const [bookmarks, setBookmarks] = useState(() =>
    readJson<{ path: string; name: string }[]>(BOOKMARKS_KEY, []),
  )
  const busyCount = useRef(0)

  const sel = tabs.some((t) => t.id === selectedId) ? selectedId : tabs[0].id

  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs, selectedId: sel }))
  }, [tabs, sel])

  useEffect(() => {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
  }, [bookmarks])

  const reloadStartup = useCallback(async () => {
    setStartup(await api.startup())
  }, [])

  const notify = useCallback((kind: Toast['kind'], text: string) => {
    const id = seq++
    setToasts((t) => [...t.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000)
  }, [])

  const bump = useCallback(() => setTick((t) => t + 1), [])

  const closeDialog = useCallback(() => setDialog(null), [])
  const openDialog = useCallback((type: string, props?: Record<string, unknown>) => {
    setDialog({ type, props })
  }, [])

  const run = useCallback<AppState['run']>(
    async (label, fn, opts) => {
      busyCount.current++
      setBusy(label)
      try {
        const out = await fn()
        if (!opts?.quiet) {
          const first = typeof out === 'string' ? out.split('\n').filter(Boolean).pop() : ''
          notify('ok', first ? `${label}: ${first}` : `${label}: done`)
        }
        return true
      } catch (e) {
        setDialog({ type: 'error', props: { title: `${label} failed`, text: errText(e) } })
        return false
      } finally {
        busyCount.current--
        if (busyCount.current === 0) setBusy(null)
        setTick((t) => t + 1)
      }
    },
    [notify],
  )

  const selectTab = useCallback((id: string) => setSelectedId(id), [])

  const closeTab = useCallback(
    (id: string) => {
      setTabs((cur) => {
        const next = cur.filter((t) => t.id !== id)
        if (next.length === 0) {
          const fresh: Tab = { id: newId(), kind: 'new', name: 'New tab' }
          setSelectedId(fresh.id)
          return [fresh]
        }
        if (id === sel) {
          const i = cur.findIndex((t) => t.id === id)
          setSelectedId(next[Math.min(i, next.length - 1)].id)
        }
        return next
      })
    },
    [sel],
  )

  const closeOthers = useCallback((id: string) => {
    setTabs((cur) => cur.filter((t) => t.id === id))
    setSelectedId(id)
  }, [])

  const closeAll = useCallback(() => {
    const fresh: Tab = { id: newId(), kind: 'new', name: 'New tab' }
    setTabs([fresh])
    setSelectedId(fresh.id)
  }, [])

  const moveTab = useCallback((from: number, to: number) => {
    setTabs((cur) => {
      if (from === to || from < 0 || to < 0 || from >= cur.length || to >= cur.length) return cur
      const copy = cur.slice()
      const [t] = copy.splice(from, 1)
      copy.splice(to, 0, t)
      return copy
    })
  }, [])

  const newTab = useCallback(() => {
    const t: Tab = { id: newId(), kind: 'new', name: 'New tab' }
    setTabs((cur) => [...cur, t])
    setSelectedId(t.id)
  }, [])

  const openUserTab = useCallback(() => {
    const existing = tabs.find((t) => t.kind === 'user')
    if (existing) {
      setSelectedId(existing.id)
      return
    }
    const t: Tab = { id: newId(), kind: 'user', name: 'User' }
    setTabs((cur) => [...cur, t])
    setSelectedId(t.id)
  }, [tabs])

  const openRepoPath = useCallback(
    async (path: string) => {
      try {
        const info = await api.openRepo(path)
        setBookmarks((b) => [
          { path: info.path, name: info.name },
          ...b.filter((x) => x.path !== info.path),
        ].slice(0, 50))
        setTabs((cur) => {
          const existing = cur.find((t) => t.path === info.path)
          if (existing) {
            setSelectedId(existing.id)
            return cur
          }
          // reuse the current "new tab" when it is selected
          const current = cur.find((t) => t.id === sel)
          const tab: Tab = {
            id: current?.kind === 'new' ? current.id : newId(),
            kind: 'repo',
            path: info.path,
            name: info.name || baseName(info.path),
          }
          setSelectedId(tab.id)
          return current?.kind === 'new' ? cur.map((t) => (t.id === current.id ? tab : t)) : [...cur, tab]
        })
        return true
      } catch (e) {
        setDialog({ type: 'error', props: { title: 'Could not open repository', text: errText(e) } })
        return false
      }
    },
    [sel],
  )

  const setView = useCallback((path: string, v: ViewMode) => {
    setViews((cur) => ({ ...cur, [path]: v }))
  }, [])

  const removeBookmark = useCallback((path: string) => {
    setBookmarks((b) => b.filter((x) => x.path !== path))
  }, [])

  const value = useMemo<AppState>(
    () => ({
      tabs, selectedId: sel, selectTab, closeTab, closeOthers, closeAll, moveTab, newTab, openUserTab,
      openRepoPath, views, setView, dialog, openDialog, closeDialog, toasts, notify, busy, run,
      tick, bump, startup, reloadStartup, bookmarks, removeBookmark,
    }),
    [tabs, sel, selectTab, closeTab, closeOthers, closeAll, moveTab, newTab, openUserTab, openRepoPath, views,
      setView, dialog, openDialog, closeDialog, toasts, notify, busy, run, tick, bump, startup,
      reloadStartup, bookmarks, removeBookmark],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
