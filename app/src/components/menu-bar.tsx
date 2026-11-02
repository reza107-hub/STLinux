import { getCurrentWindow } from '@tauri-apps/api/window'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useActions } from '../lib/actions'
import { useApp } from '../lib/store'

type Item = { label: string; hint?: string; run: () => void; disabled?: boolean } | 'sep'

export function toggleTheme(): boolean {
  const dark = !document.documentElement.classList.contains('dark')
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('stlinux-theme', dark ? 'dark' : 'light')
  return dark
}

export default function MenuBar() {
  const a = useActions()
  const app = useApp()
  const [open, setOpen] = useState<number | null>(null)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const ref = useRef<HTMLDivElement>(null)
  const repo = a.path !== null

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const menus: { name: string; items: Item[] }[] = [
    {
      name: 'File',
      items: [
        { label: 'Clone / New...', hint: 'Ctrl+N', run: app.newTab },
        { label: 'Open...', hint: 'Ctrl+O', run: () => void a.openFolder() },
        { label: 'Close tab', hint: 'Ctrl+W', run: () => app.closeTab(app.selectedId) },
        'sep',
        { label: 'User and connections...', run: app.openUserTab },
        { label: 'Preferences...', hint: 'Ctrl+,', run: a.preferences },
        'sep',
        { label: 'Quit', hint: 'Ctrl+Q', run: () => void getCurrentWindow().close() },
      ],
    },
    {
      name: 'View',
      items: [
        { label: 'File Status', hint: 'Ctrl+1', run: () => a.view('status'), disabled: !repo },
        { label: 'History', hint: 'Ctrl+2', run: () => a.view('history'), disabled: !repo },
        { label: 'Search', hint: 'Ctrl+3', run: () => a.view('search'), disabled: !repo },
        'sep',
        { label: 'Refresh', hint: 'F5', run: a.refresh },
        { label: dark ? 'Switch to light theme' : 'Switch to dark theme', run: () => setDark(toggleTheme()) },
      ],
    },
    {
      name: 'Repository',
      items: [
        { label: 'Commit...', hint: 'Ctrl+Shift+C', run: a.commitAll, disabled: !repo },
        { label: 'Pull...', hint: 'Ctrl+Shift+L', run: a.pull, disabled: !repo },
        { label: 'Push...', hint: 'Ctrl+Shift+P', run: a.push, disabled: !repo },
        { label: 'Fetch', hint: 'Ctrl+Shift+F', run: a.fetch, disabled: !repo },
        'sep',
        { label: 'New branch...', run: a.branch, disabled: !repo },
        { label: 'Merge...', run: a.merge, disabled: !repo },
        { label: 'Add tag...', run: a.tag, disabled: !repo },
        { label: 'Stash...', hint: 'Ctrl+Shift+S', run: a.stash, disabled: !repo },
        { label: 'Discard all changes...', run: a.discardAll, disabled: !repo },
        { label: 'Git Flow...', run: a.flow, disabled: !repo },
        'sep',
        { label: 'Abort merge or rebase', run: a.abort, disabled: !repo },
        'sep',
        { label: 'Open terminal', run: a.terminal, disabled: !repo },
        { label: 'Open in file manager', run: a.files, disabled: !repo },
        { label: 'Repository settings...', hint: 'Ctrl+Shift+,', run: a.repoSettings, disabled: !repo },
      ],
    },
    { name: 'Help', items: [{ label: 'About STLinux', run: a.about }] },
  ]

  return (
    <div ref={ref} className="relative z-40 flex h-7 shrink-0 items-center border-b border-border bg-surface px-1">
      {menus.map((m, i) => (
        <div key={m.name} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
            className={'rounded px-2.5 py-1 hover:bg-hover hover:text-foreground-strong ' + (open === i ? 'bg-hover text-foreground-strong' : '')}
          >
            {m.name}
          </button>
          {open === i && (
            <div role="menu" className="absolute left-0 top-full mt-px min-w-60 rounded border border-border bg-surface-raised py-1 shadow-xl">
              {m.items.map((it, k) =>
                it === 'sep' ? (
                  <div key={k} className="my-1 h-px bg-border" />
                ) : (
                  <button
                    key={k}
                    type="button"
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null)
                      it.run()
                    }}
                    className="flex h-6 w-full items-center justify-between gap-6 px-3 text-left hover:bg-hover disabled:opacity-40"
                  >
                    <span>{it.label}</span>
                    {it.hint && <span className="text-muted">{it.hint}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() => setDark(toggleTheme())}
        className="ml-auto mr-2 flex size-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-foreground-strong"
      >
        {dark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </div>
  )
}
