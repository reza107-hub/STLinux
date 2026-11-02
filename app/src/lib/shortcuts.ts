import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect } from 'react'
import { useActions } from './actions'
import { useApp } from './store'

/** Global keyboard shortcuts. Keys follow the original Windows app. */
export function useShortcuts() {
  const a = useActions()
  const app = useApp()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea, select')
      if (e.key === 'F5') { e.preventDefault(); a.refresh(); return }
      if (!ctrl) return
      const run = (fn: () => void) => { e.preventDefault(); fn() }
      if (e.shiftKey) {
        if (k === 'l') return run(a.pull)
        if (k === 'p') return run(a.push)
        if (k === 'f') return run(a.fetch)
        if (k === 's') return run(a.stash)
        if (k === 'c') return run(a.commitAll)
        if (k === ',' || k === '<') return run(a.repoSettings)
        if (k === 'tab') return run(() => cycle(-1))
        return
      }
      if (typing && k !== '1' && k !== '2' && k !== '3') {
        if (k === 'n' || k === 'o' || k === 'w' || k === ',') { /* allowed below */ } else return
      }
      if (k === 'n') return run(app.newTab)
      if (k === 'o') return run(() => void a.openFolder())
      if (k === 'w') return run(() => app.closeTab(app.selectedId))
      if (k === 'q') return run(() => void getCurrentWindow().close())
      if (k === ',') return run(a.preferences)
      if (k === '1') return run(() => a.view('status'))
      if (k === '2') return run(() => a.view('history'))
      if (k === '3') return run(() => a.view('search'))
      if (k === 'tab') return run(() => cycle(1))
    }
    const cycle = (dir: number) => {
      const i = app.tabs.findIndex((t) => t.id === app.selectedId)
      const n = (i + dir + app.tabs.length) % app.tabs.length
      app.selectTab(app.tabs[n].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}
