import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { errText } from './format'
import { useApp } from './store'
import type { FileEntry, Refs, Summary } from './types'

export type RepoData = {
  path: string
  summary: Summary | null
  refs: Refs | null
  files: FileEntry[]
  error: string | null
  loading: boolean
}

const Ctx = createContext<RepoData | null>(null)

export function useRepo(): RepoData {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRepo outside provider')
  return v
}

export function RepoProvider({ path, children }: { path: string; children: ReactNode }) {
  const { tick, bump } = useApp()
  const [data, setData] = useState<RepoData>({
    path, summary: null, refs: null, files: [], error: null, loading: true,
  })
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const [summary, refs, files] = await Promise.all([api.summary(path), api.refs(path), api.status(path)])
      if (mine === seq.current) setData({ path, summary, refs, files, error: null, loading: false })
    } catch (e) {
      if (mine === seq.current) setData((d) => ({ ...d, path, error: errText(e), loading: false }))
    }
  }, [path])

  useEffect(() => {
    void load()
  }, [load, tick])

  // refresh when the window regains focus (files may have changed outside)
  useEffect(() => {
    const onFocus = () => bump()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [bump])

  return <Ctx.Provider value={data.path === path ? data : { ...data, path, loading: true }}>{children}</Ctx.Provider>
}
